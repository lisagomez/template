'use client';

/**
 * /etiquetas/expediente — la historia completa de un lote en todos los sitios, con su prueba:
 * cada evento con su hash y el enlace al anterior del lote, el veredicto de la cadena de cada
 * sitio, la inclusion del evento en la raiz anclada de su dia y los enlaces de transferencia.
 */
import { useEffect, useState } from 'react';
import { idLote, TEXTO_SEMAFORO, textoDias, type ClaveLote } from '../services/nucleo.ts';
import { accion } from '../services/cliente.ts';
import { COLOR_EVENTO, COLOR_SEMAFORO, describeEvento, fechaCorta, fechaHora, gtinLegible, hashCorto, TEXTO_EVENTO } from '../services/presenta.ts';
import type { Expediente, LoteConExpediente } from '../services/tipos-expediente.ts';
import type { Etiquetas } from '../hooks/use-etiquetas.ts';
import { AccionesLote } from './acciones-lote.tsx';
import { boton, campo, tarjeta } from './marco.tsx';
import { Foto, FotoArticulo } from './foto.tsx';
import type { Evento } from '../services/nucleo.ts';

function inicial(): ClaveLote | null {
  const q = new URLSearchParams(window.location.search);
  const gtin = q.get('gtin'); const lote = q.get('lote'); const caducidad = q.get('cad');
  return gtin && lote && caducidad ? { gtin, lote, caducidad } : null;
}

function descarga(x: Expediente) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(x, null, 1)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = `expediente-${x.lote.gtin}-${x.lote.lote}.json`; a.click();
  URL.revokeObjectURL(url);
}

function Veredicto({ x }: { x: Expediente }) {
  const anclados = x.eventos.filter((v) => v.anclado?.verificado).length;
  const sinAnclar = x.eventos.filter((v) => !v.anclado).length;
  const rotas = Object.entries(x.cadenas).filter(([, v]) => !v.ok);
  return (
    <div className={`rounded-xl p-3 ${x.ok ? 'bg-emerald-600 text-white' : 'bg-red-700 text-white'}`} data-prueba="veredicto-expediente" data-ok={x.ok}>
      <p className="text-lg font-black">{x.ok ? '✓ Expediente íntegro' : '✗ El expediente NO se sostiene'}</p>
      <p className="text-sm">
        {x.eventos.length} evento(s) en {Object.keys(x.cadenas).length} sitio(s). Cadena de cada sitio: {Object.entries(x.cadenas).map(([s, v]) => `${s} ${v.ok ? '✓' : '✗'}`).join(' · ')}.
        {' '}{anclados} anclado(s) y probado(s) por inclusión en la raíz firmada de su día{sinAnclar ? `; ${sinAnclar} todavía sin anclar (ventana de riesgo hasta el próximo anclaje)` : ''}.
      </p>
      {rotas.map(([s, v]) => !v.ok ? <p key={s} className="text-sm font-semibold">{s}: se rompe en el evento #{v.rotura.seq} — {v.rotura.detalle}</p> : null)}
      {x.enlaces.map((f) => <p key={`${f.sitio}${f.seq}`} className="text-sm font-semibold">{f.sitio} #{f.seq}: {f.detalle}</p>)}
    </div>
  );
}

/** Las fotos que un evento cita por su huella: la revision, la recepcion por foto o la correccion. */
function fotosDelEvento(ev: Evento): { completa?: string; recortes?: string[] } | undefined {
  const d = ev.datos as Record<string, unknown>;
  const f = d['fotos'] ?? (d['lectura'] as { fotos?: unknown } | undefined)?.fotos ?? (d['evidencia'] as { fotos?: unknown } | undefined)?.fotos;
  return f && typeof f === 'object' ? (f as { completa?: string; recortes?: string[] }) : undefined;
}

function LeidoContraConfirmado({ ev }: { ev: Evento }) {
  const l = ev.datos['lectura'] as { propuesta?: { fecha?: string; lote?: string; estado?: string }; confirmada?: { caducidad?: string; lote?: string }; corregida?: { fecha?: boolean; lote?: boolean }; motor?: string } | undefined;
  if (!l?.confirmada) return null;
  return (
    <table className="mt-1 text-xs" data-prueba="leido-confirmado">
      <thead className="text-neutral-500"><tr><th className="pr-3 text-left" /><th className="pr-3 text-left">Caducidad</th><th className="text-left">Lote</th></tr></thead>
      <tbody>
        <tr><td className="pr-3">Leyó la máquina ({l.motor ?? '?'})</td><td className="pr-3 font-mono">{l.propuesta?.fecha ?? `— (${l.propuesta?.estado ?? 'sin propuesta'})`}</td><td className="font-mono">{l.propuesta?.lote ?? '—'}</td></tr>
        <tr className="font-semibold"><td className="pr-3">Confirmó la persona</td><td className={`pr-3 font-mono ${l.corregida?.fecha ? 'text-violet-700 dark:text-violet-300' : ''}`}>{l.confirmada.caducidad}{l.corregida?.fecha ? ' (corregida)' : ''}</td><td className={`font-mono ${l.corregida?.lote ? 'text-violet-700 dark:text-violet-300' : ''}`}>{l.confirmada.lote}{l.corregida?.lote ? ' (corregido)' : ''}</td></tr>
      </tbody>
    </table>
  );
}

function Linea({ x }: { x: Expediente }) {
  return (
    <ol className="relative space-y-2 border-l-2 border-neutral-300 pl-4 dark:border-neutral-700" data-prueba="linea-tiempo">
      {x.eventos.map(({ evento: ev, anclado }) => (
        <li key={ev.hash} className="relative" data-prueba="evento" data-tipo={ev.tipo}>
          <span className={`absolute -left-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-white dark:border-neutral-950 ${anclado?.verificado ? 'bg-emerald-600' : anclado ? 'bg-red-600' : 'bg-amber-400'}`} aria-hidden />
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
            <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${COLOR_EVENTO[ev.tipo] ?? 'bg-neutral-100 dark:bg-neutral-800'}`}>{TEXTO_EVENTO[ev.tipo]}</span>
            <span className="font-medium">{ev.sitio} #{ev.seq}</span>
            <span className="text-xs text-neutral-500">{fechaHora(ev.fecha)} · {ev.operador}</span>
          </div>
          <p className="text-sm">{describeEvento(ev)}</p>
          {ev.tipo === 'RECIBIDO' ? <LeidoContraConfirmado ev={ev} /> : null}
          {fotosDelEvento(ev)?.completa ? (
            <div className="mt-1 flex flex-wrap gap-2" data-prueba="fotos-evento">
              <figure className="text-[11px] text-neutral-500"><Foto huella={fotosDelEvento(ev)!.completa!} alt="Foto completa" className="h-24 w-36 rounded bg-neutral-900" /><figcaption>foto {hashCorto(fotosDelEvento(ev)!.completa!)}</figcaption></figure>
              {[...new Set(fotosDelEvento(ev)!.recortes ?? [])].slice(0, 2).map((h) => <figure key={h} className="text-[11px] text-neutral-500"><Foto huella={h} alt="Lo que leyó el motor" className="h-24 w-48 rounded bg-neutral-900" /><figcaption>recorte leído {hashCorto(h)}</figcaption></figure>)}
            </div>
          ) : null}
          <p className="break-all font-mono text-[11px] text-neutral-500">
            hash {hashCorto(ev.hash)} · lote anterior {ev.anteriorLote ? hashCorto(ev.anteriorLote) : '— (primero del lote en este sitio)'} · {anclado ? `anclado ${fechaCorta(anclado.periodo)} ${anclado.verificado ? '✓' : '✗'} (hoja ${anclado.indice + 1} de ${anclado.tamano}, ruta de ${anclado.ruta.length})` : 'sin anclar'}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function PantallaExpediente({ e }: { e: Etiquetas }) {
  const est = e.estado!;
  const [lotes, setLotes] = useState<LoteConExpediente[] | null>(null);
  const [filtro, setFiltro] = useState('');
  const [elegido, setElegido] = useState<ClaveLote | null>(inicial);
  const [x, setX] = useState<Expediente | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    void accion<{ lotes: LoteConExpediente[] }>({ accion: 'lotes' }).then((r) => setLotes(r.lotes), (err: unknown) => setError(String(err)));
  }, [vuelta]);
  useEffect(() => {
    if (!elegido) return;
    void accion<Expediente>({ accion: 'expediente', ...elegido }).then((r) => { setX(r); setError(null); }, (err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [elegido, vuelta]);

  const f = filtro.trim().toLowerCase();
  const visibles = (lotes ?? []).filter((l) => !f || `${l.descripcion} ${l.lote.lote} ${l.lote.gtin} ${l.sitios.join(' ')}`.toLowerCase().includes(f));
  const actual = x && elegido && idLote(x.lote) === idLote(elegido) ? x : null;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <section className={`${tarjeta} space-y-2 self-start`}>
        <label className="block text-sm">Buscar lote<input className={campo} value={filtro} onChange={(v) => setFiltro(v.target.value)} placeholder="lote, producto, GTIN o sitio" data-prueba="buscar-lote" /></label>
        {lotes === null ? <p className="text-sm text-neutral-500">Cargando lotes…</p> : null}
        <ul className="max-h-[28rem] divide-y divide-neutral-200 overflow-y-auto text-sm dark:divide-neutral-800" data-prueba="lista-lotes">
          {visibles.map((l) => (
            <li key={idLote(l.lote)}>
              <button type="button" onClick={() => setElegido(l.lote)} className={`w-full px-1 py-1.5 text-left ${elegido && idLote(elegido) === idLote(l.lote) ? 'bg-blue-50 dark:bg-blue-950' : 'hover:bg-neutral-50 dark:hover:bg-neutral-900'}`} data-lote={l.lote.lote}>
                <span className="font-medium">{l.descripcion}</span> <span className="font-mono text-xs">lote {l.lote.lote}</span>
                <span className="block text-xs text-neutral-500">cad. {fechaCorta(l.lote.caducidad)} · {l.eventos} evento(s) · {l.sitios.join(', ')} · último: {TEXTO_EVENTO[l.ultimo.tipo].toLowerCase()}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="min-w-0 space-y-3">
        {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200" role="alert">{error}</p> : null}
        {!elegido ? <p className={`${tarjeta} text-sm text-neutral-500`}>Elige un lote para ver su expediente.</p> : null}
        {actual ? (
          <article className={`${tarjeta} space-y-3`} data-prueba="expediente">
            <header className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 gap-3">
                <FotoArticulo est={est} sku={actual.sku} className="h-16 w-16 rounded-lg" />
                <div className="min-w-0">
                <h2 className="text-xl font-bold">{actual.descripcion}</h2>
                <p className="font-mono text-sm">GTIN {gtinLegible(actual.lote.gtin)} · lote {actual.lote.lote} · caduca {fechaCorta(actual.lote.caducidad)}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {actual.semaforo ? <span className={`rounded px-2 py-1 text-sm font-bold ${COLOR_SEMAFORO[actual.semaforo.estado]}`} title={TEXTO_SEMAFORO[actual.semaforo.estado].accion}>{TEXTO_SEMAFORO[actual.semaforo.estado].etiqueta} · {textoDias(actual.semaforo.dias)}</span> : null}
                <button type="button" className={boton} onClick={() => descarga(actual)} data-prueba="descargar-expediente">Descargar con pruebas (JSON)</button>
              </div>
            </header>
            <Veredicto x={actual} />
            <Linea x={actual} />
            <div className="text-sm" data-prueba="existencias-lote">
              <h3 className="font-semibold">Dónde está hoy</h3>
              {actual.existencias.length === 0 ? <p className="text-neutral-500">Ya no hay existencias: el expediente está cerrado.</p> : (
                <ul className="list-inside list-disc">{actual.existencias.map((z) => <li key={z.id}>{z.sitio} · {z.zona ?? 'recibo'}{z.posicion ? ` · rack ${z.posicion}` : ''} · {z.cantidad} caja(s){z.sscc ? ` · tarima ${z.sscc}` : ''}</li>)}</ul>
              )}
            </div>
            {actual.devoluciones.map((d) => (
              <div key={d.folio} className="rounded-lg border border-red-300 p-3 text-sm dark:border-red-900" data-prueba="devolucion-expediente">
                <p className="font-semibold">Devolución al proveedor {d.folio}</p>
                <p>{d.cajas} caja(s) · {d.regla} · le quedaban {d.diasRestantes} días · evidencia: evento {d.sitio} #{d.evento.seq} ({hashCorto(d.evento.hash)})</p>
              </div>
            ))}
            <AccionesLote e={e} x={actual} sitios={est.configuracion.sitios} alTerminar={() => setVuelta((n) => n + 1)} />
          </article>
        ) : elegido && !error ? <p className="text-sm text-neutral-500">Cargando expediente…</p> : null}
      </section>
    </div>
  );
}
