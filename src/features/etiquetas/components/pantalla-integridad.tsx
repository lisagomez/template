'use client';

/**
 * /etiquetas/integridad — lo que ve quien audita desde el central: por sucursal, la cadena, la
 * proyeccion (estado = cadena), las raices ancladas y firmadas, los testigos de cabeza y lo que
 * queda sin anclar. La llave del sitio NUNCA se muestra: presente o no, su largo y la huella de
 * la llave publica.
 */
import { useEffect, useState } from 'react';
import { accion } from '../services/cliente.ts';
import { fechaCorta, fechaHora, hashCorto } from '../services/presenta.ts';
import type { Integridad, IntegridadSitio } from '../services/tipos-expediente.ts';
import type { Etiquetas } from '../hooks/use-etiquetas.ts';
import { botonPrimario, tarjeta } from './marco.tsx';

const Marca = ({ ok }: { ok: boolean }) => <span className={ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}>{ok ? '✓' : '✗'}</span>;

function Sitio({ s }: { s: IntegridadSitio }) {
  const anclasOk = s.anclas.every((a) => a.ok);
  return (
    <article className={`${tarjeta} space-y-2 border-2 ${s.ok ? 'border-emerald-500' : 'border-red-600'}`} data-prueba="integridad-sitio" data-sitio={s.sitio} data-ok={s.ok}>
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{s.nombre}</h2>
        <span className={`rounded px-2 py-0.5 text-sm font-black ${s.ok ? 'bg-emerald-600 text-white' : 'bg-red-700 text-white'}`}>{s.ok ? '✓ Íntegra' : '✗ Manipulada'}</span>
      </header>
      <ul className="space-y-1 text-sm">
        <li><Marca ok={s.cadena.ok} /> Cadena: {s.eventos} evento(s){s.cadena.rotura ? ` — se rompe en #${s.cadena.rotura.seq}: ${s.cadena.rotura.detalle}` : ' encadenados'}</li>
        <li><Marca ok={s.proyeccion.ok} /> Estado = proyección de la cadena{s.proyeccion.motivo ? ` — ${s.proyeccion.motivo}` : ''}</li>
        <li><Marca ok={anclasOk} /> Raíces ancladas: {s.anclasTotales}{s.ultimaAncla ? ` · última del ${fechaCorta(s.ultimaAncla.periodo)} hasta #${s.ultimaAncla.hastaSeq}, raíz ${hashCorto(s.ultimaAncla.raiz)}` : ' · ninguna todavía'}</li>
        {s.anclas.filter((a) => !a.ok).map((a) => <li key={a.periodo} className="pl-4 font-semibold text-red-700 dark:text-red-300" data-prueba="ancla-mala">ancla del {fechaCorta(a.periodo)} (#{a.desdeSeq}-#{a.hastaSeq}): {a.motivo}</li>)}
        <li><Marca ok={s.testigos.length === 0} /> Testigos de cabeza{s.testigos.length ? `: ${s.testigos.map((t) => t.motivo).join(' · ')}` : ': todo lo que el central vio sigue en el almacén'}</li>
        <li className="text-neutral-600 dark:text-neutral-300">Sin anclar: {s.sinAnclar} evento(s) (ventana de riesgo hasta el próximo anclaje)</li>
        <li className="text-neutral-600 dark:text-neutral-300" data-prueba="llave">Llave del sitio ({s.llave.variable}): {s.llave.presente ? `presente, ${s.llave.largo} caracteres${s.llave.valida ? ` · pública ${s.llave.huella}` : ' · NO es una llave Ed25519 válida'}` : 'ausente: el sitio no puede anclar'}</li>
      </ul>
      {s.primerFallo ? <p className="rounded bg-red-50 px-2 py-1 text-sm font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">Primer fallo: {s.primerFallo}</p> : null}
    </article>
  );
}

export function PantallaIntegridad({ e }: { e: Etiquetas }) {
  const [x, setX] = useState<Integridad | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    void accion<Integridad>({ accion: 'integridad' }).then(setX, (err: unknown) => setAviso(err instanceof Error ? err.message : String(err)));
  }, [vuelta]);
  const ancla = () => void e.ejecuta<{ anclas: { sitio: string; ok: boolean; motivo?: string; eventos?: number }[] }>({ accion: 'ancla' }).then(
    (r) => { setAviso(r.anclas.map((a) => `${a.sitio}: ${a.ok ? `${a.eventos ?? 0} evento(s) anclado(s)` : a.motivo}`).join(' · ')); setVuelta((n) => n + 1); },
    (err: unknown) => setAviso(err instanceof Error ? err.message : String(err)),
  );
  return (
    <div className="space-y-4">
      <div className={`${tarjeta} flex flex-wrap items-center gap-3`}>
        <button type="button" className={botonPrimario} onClick={ancla} data-prueba="anclar">Anclar ahora</button>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">Cada noche el agente de cada sitio calcula la raíz de Merkle de sus eventos, la firma con la llave del sitio y la manda al central, que la acepta solo si la firma es válida y continúa la anterior.</p>
      </div>
      {aviso ? <p className="text-sm" role="status" data-prueba="aviso-integridad">{aviso}</p> : null}
      {x ? (
        <>
          <p className={`rounded-lg px-3 py-2 text-sm font-semibold ${x.ok ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200'}`} data-prueba="veredicto-global">
            {x.ok ? 'Todas las sucursales verifican contra sus anclas.' : `${x.sitios.filter((s) => !s.ok).map((s) => s.nombre).join(', ') || 'Un enlace entre sitios'} no verifica: ver el primer fallo.`}
          </p>
          <div className="grid gap-4 md:grid-cols-2">{x.sitios.map((s) => <Sitio key={s.sitio} s={s} />)}</div>
          <section className={`${tarjeta} space-y-1 text-sm`}>
            <h2 className="text-lg font-semibold">Transferencias entre sitios</h2>
            {x.transferencias.length === 0 ? <p>✓ Cada recepción por transferencia apunta a su salida en el sitio de origen, con el mismo lote y las mismas cajas.</p> : x.transferencias.map((t) => <p key={`${t.sitio}${t.seq}`} className="font-semibold text-red-700 dark:text-red-300">✗ {t.sitio} #{t.seq}: {t.detalle}</p>)}
          </section>
          <section className={`${tarjeta} space-y-1 text-sm`} data-prueba="incidentes">
            <h2 className="text-lg font-semibold">Incidentes ({x.incidentes.length})</h2>
            {x.incidentes.length === 0 ? <p className="text-neutral-500">Ninguno.</p> : <ul className="space-y-1">{[...x.incidentes].reverse().map((i) => <li key={i.id}><b>{i.sitio}</b> · {fechaHora(i.fecha)} · {i.origen}: {i.motivo}</li>)}</ul>}
          </section>
        </>
      ) : <p className="text-sm text-neutral-500">Verificando…</p>}
    </div>
  );
}
