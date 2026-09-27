'use client';

/**
 * La cola de aprobación para el CELULAR del dueño: cada pieza con su imagen o su video, botones
 * grandes y la huella de lo que se aprueba. Editar revoca (la vigencia se recalcula con la huella de
 * lo que hay ahora). Aprobar NO publica y NO sale a la red: todo se calcula aquí. Sin cuentas, vive en
 * esta sesión del navegador (aprobar desde otro teléfono queda bloqueado: PRP-006, fase 9).
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { csvDelMes, vigencia } from '../../../../tools/pymes-marketing/dist/aprobacion/index.js';
import { escenaDePromo, cuadroSvg } from '../../../../tools/pymes-marketing/dist/video/index.js';
import { useEstudio } from '../store/estudio.ts';
import { Pastilla } from './ui-estudio.tsx';

interface Item {
  readonly id: string;
  readonly titulo: string;
  readonly dia: string;
  readonly canal: string;
  readonly texto: string;
  readonly archivo: string;
  readonly contenido: string | Uint8Array;
  readonly imagen?: string;
  readonly video?: string;
  /** Cuadro final (la composición terminada) como portada del video: se juzga lo que se ve. */
  readonly portada?: string;
}

const dataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function useItems(): Item[] {
  const { calendario, carruseles, video, brief, marca } = useEstudio();
  return useMemo(() => {
    const piezas: Item[] = calendario.filter((f) => f.origen === null && f.estado !== 'falta-algo' && f.pieza).map((f) => ({ id: f.id, titulo: `${f.dia} · ${f.canal} · ${f.tema}`, dia: f.dia, canal: f.canal, texto: f.texto, archivo: `${f.id}.png`, contenido: f.pieza!, imagen: dataUrl(f.pieza!) }));
    const dia = brief?.desde ?? '';
    const carr: Item[] = carruseles.filter((c) => c.laminas.length).map((c) => ({ id: c.id, titulo: `Carrusel · ${c.titulo}`, dia, canal: 'instagram (carrusel)', texto: c.titulo, archivo: `${c.id}-1..${c.laminas.length}.png`, contenido: c.laminas.map((l) => l.svg).join('\n'), imagen: dataUrl(c.laminas[0]!.svg) }));
    const escena = video && marca ? escenaDePromo(marca, video.datos) : null;
    const portada = escena ? dataUrl(cuadroSvg(escena, escena.duracion - 1 / escena.fps)) : undefined;
    const vid: Item[] = video?.mp4 && video.url ? [{ id: `video-${video.datos.semilla}`, titulo: `Promo en video · ${video.datos.titular}`, dia, canal: 'reels / estado', texto: video.datos.titular, archivo: 'promo.mp4', contenido: video.mp4, video: video.url, portada }] : [];
    return [...vid, ...carr, ...piezas];
  }, [calendario, carruseles, video, brief, marca]);
}

function Tarjeta({ item }: { item: Item }) {
  const { aprobaciones, decide } = useEstudio();
  const a = aprobaciones[item.id];
  const [medida, setMedida] = useState<{ huella: string; v: 'vigente' | 'revocada' } | null>(null);
  const [nota, setNota] = useState(''), [pidiendo, setPidiendo] = useState(false);
  useEffect(() => {
    let vivo = true;
    if (a) void vigencia(a, item.contenido).then((v) => { if (vivo) setMedida({ huella: a.huella, v }); });
    return () => { vivo = false; };
  }, [a, item.contenido]);
  const estado = a && medida?.huella === a.huella ? medida.v : null;
  return (
    <article className="space-y-2 rounded-2xl border border-neutral-200 p-3 dark:border-neutral-800" data-prueba="item-aprobar" data-estado={a ? `${a.estado}:${estado ?? ''}` : 'pendiente'}>
      <p className="text-sm font-semibold">{item.titulo}</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- pieza generada en este navegador */}
      {item.video ? <video src={item.video} poster={item.portada} controls muted playsInline preload="none" className="w-full rounded-xl" /> : item.imagen ? <img src={item.imagen} alt={item.titulo} className="w-full rounded-xl" /> : null}
      {a ? (
        <p className="text-xs" data-prueba="huella">
          <Pastilla tono={a.estado === 'aprobada' && estado === 'vigente' ? 'bien' : estado === 'revocada' ? 'problema' : 'revisar'}>{a.estado === 'aprobada' ? (estado === 'revocada' ? 'revocada: la pieza cambió' : 'aprobada: la subes tú') : 'cambio pedido'}</Pastilla>
          <span className="ml-2 font-mono">huella {a.huella.slice(0, 12)}… · v{a.version}</span>{a.nota ? ` · «${a.nota}»` : ''}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="rounded-xl bg-emerald-600 py-3 text-base font-semibold text-white active:bg-emerald-700" onClick={() => void decide(item.id, item.contenido, 'aprobada')}>Aprobar</button>
        <button type="button" className="rounded-xl border border-neutral-300 py-3 text-base font-semibold dark:border-neutral-700" onClick={() => setPidiendo(!pidiendo)}>Pedir cambio</button>
      </div>
      {pidiendo ? (
        <div className="flex gap-2">
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="¿Qué cambio?" className="min-w-0 flex-1 rounded-xl border border-neutral-300 p-3 text-base dark:border-neutral-700 dark:bg-neutral-950" />
          <button type="button" disabled={!nota.trim()} className="rounded-xl bg-neutral-900 px-4 text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900" onClick={() => { void decide(item.id, item.contenido, 'cambio-pedido', nota); setPidiendo(false); setNota(''); }}>Enviar</button>
        </div>
      ) : null}
    </article>
  );
}

function descargaCsv(csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a');
  a.href = url; a.download = 'mes-aprobado.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function AprobarEnCelular() {
  const items = useItems();
  const { aprobaciones, hoy, cargaEjemplo, ocupado } = useEstudio();
  const [vigentes, setVigentes] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let vivo = true;
    void Promise.all(items.map(async (i) => [i.id, aprobaciones[i.id] ? (await vigencia(aprobaciones[i.id]!, i.contenido)) === 'vigente' : false] as const)).then((r) => vivo && setVigentes(Object.fromEntries(r)));
    return () => { vivo = false; };
  }, [items, aprobaciones]);
  const aprobadas = items.filter((i) => aprobaciones[i.id]?.estado === 'aprobada' && vigentes[i.id]).length;
  const csv = csvDelMes(items.map((i) => ({ dia: i.dia, canal: i.canal, texto: i.texto, archivo: i.archivo, aprobacion: aprobaciones[i.id] ?? null, vigente: Boolean(vigentes[i.id]) })), hoy);
  return (
    <main className="mx-auto max-w-md space-y-3 px-3 pb-24 pt-4">
      <header className="pr-28">
        <p className="text-xs uppercase tracking-widest text-neutral-500">Aprobar</p>
        <h1 className="text-2xl font-bold">Tu contenido del mes</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Aprobar no publica nada: te deja la lista para que tú la subas. Si una pieza cambia después, su aprobación se revoca sola.</p>
      </header>
      {items.length === 0 ? (
        <div className="space-y-2 text-sm">
          <p>No hay piezas en esta sesión. Ármalas en el <Link className="underline" href="/estudio">estudio</Link> o mira el ejemplo.</p>
          <button type="button" className="rounded-xl bg-neutral-900 px-4 py-3 text-white dark:bg-white dark:text-neutral-900" disabled={ocupado} onClick={() => void cargaEjemplo()}>Ver con un negocio de ejemplo</button>
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-10 flex items-center justify-between rounded-xl bg-white/90 p-2 text-sm backdrop-blur dark:bg-neutral-950/90" data-prueba="resumen-aprobacion">
            <span>{aprobadas} de {items.length} aprobadas</span>
            <button type="button" className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700" disabled={!aprobadas} onClick={() => descargaCsv(csv)}>CSV del mes</button>
          </div>
          {items.map((i) => <Tarjeta key={i.id} item={i} />)}
        </>
      )}
    </main>
  );
}
