'use client';

/**
 * /etiquetas/riesgo — el agente de riesgo: no avisa por fecha sino por lo que NO se va a vender a
 * tiempo (dias de inventario contra dias vendibles, en orden FEFO). Recomienda; una persona
 * ejecuta o descarta, y las dos cosas quedan en la cadena del sitio.
 */
import { useEffect, useState } from 'react';
import { TEXTO_SEMAFORO, type Evento } from '../services/nucleo.ts';
import { accion } from '../services/cliente.ts';
import { COLOR_SEMAFORO, fechaCorta, fechaHora, hashCorto } from '../services/presenta.ts';
import { enlaceExpediente, type Riesgos } from '../services/tipos-expediente.ts';
import type { Etiquetas } from '../hooks/use-etiquetas.ts';
import { boton, botonPrimario, campo, tarjeta } from './marco.tsx';

const ACCION: Record<string, string> = { transferir: 'Transferir', promocion: 'Promoción escalonada', exhibicion: 'Exhibición especial' };
type Informe = { fuente: string; informe: { sitio: string; emitidas: number; riesgos: number; bloqueo?: string }[] };

function Metricas({ ev }: { ev: Evento }) {
  const d = ev.datos;
  const sem = typeof d['semaforo'] === 'string' ? (d['semaforo'] as keyof typeof TEXTO_SEMAFORO) : undefined;
  return (
    <dl className="grid grid-cols-2 gap-x-3 text-xs sm:grid-cols-4">
      <div><dt className="text-neutral-500">Días de inventario</dt><dd className="text-base font-bold">{d['diasInventario'] === null ? '∞' : String(d['diasInventario'])}</dd></div>
      <div><dt className="text-neutral-500">Días vendibles</dt><dd className="text-base font-bold">{String(d['diasVendibles'])}</dd></div>
      <div><dt className="text-neutral-500">Venta / día</dt><dd className="text-base font-bold">{d['venta'] === null ? '0' : String(d['venta'])} cj</dd></div>
      <div><dt className="text-neutral-500">En riesgo</dt><dd className="text-base font-bold">{String(d['cajasEnRiesgo'])} cj</dd></div>
      {sem ? <div className="col-span-2 mt-1 sm:col-span-4"><span className={`rounded px-1.5 py-0.5 font-semibold ${COLOR_SEMAFORO[sem]}`}>{TEXTO_SEMAFORO[sem].etiqueta}</span> <span className="text-neutral-500">hoy, con {String(d['diasRestantes'])} días para caducar</span></div> : null}
    </dl>
  );
}

function Tarjeta({ r, alDecidir }: { r: Riesgos['recomendaciones'][number]; alDecidir?: (hash: string, sitio: string, decision: 'ejecutar' | 'descartar', motivo: string) => void }) {
  const [motivo, setMotivo] = useState('');
  const ev = r.evento;
  const accionR = String(ev.datos['accion']);
  return (
    <li className="space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800" data-prueba="recomendacion" data-estado={r.estado} data-lote={ev.lote.lote}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="rounded bg-sky-700 px-2 py-0.5 text-xs font-bold text-white">{ACCION[accionR] ?? accionR}</span>
        <a className="font-semibold underline-offset-2 hover:underline" href={enlaceExpediente(ev.lote)}>lote {ev.lote.lote}</a>
        <span className="text-sm">{ev.sitio}</span>
        <span className="text-xs text-neutral-500">caduca {fechaCorta(ev.lote.caducidad)} · {fechaHora(ev.fecha)} · #{ev.seq} {hashCorto(ev.hash)}</span>
      </div>
      <p className="text-sm">{String(ev.datos['texto'])}</p>
      <Metricas ev={ev} />
      {r.estado === 'pendiente' && alDecidir ? (
        <div className="flex flex-wrap items-end gap-2">
          <button type="button" className={botonPrimario} onClick={() => alDecidir(ev.hash, ev.sitio, 'ejecutar', motivo)} data-prueba="ejecutar">Ejecutar</button>
          <label className="min-w-0 flex-1 text-xs">Motivo para descartar<input className={campo} value={motivo} onChange={(v) => setMotivo(v.target.value)} maxLength={200} data-prueba="motivo-descarte" /></label>
          <button type="button" className={boton} onClick={() => alDecidir(ev.hash, ev.sitio, 'descartar', motivo)} disabled={motivo.trim().length < 3} data-prueba="descartar">Descartar</button>
        </div>
      ) : null}
      {r.decision ? (
        <p className={`rounded px-2 py-1 text-sm ${r.estado === 'ejecutada' ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200'}`} data-prueba="decision">
          {r.estado === 'ejecutada' ? '✓ Ejecutada' : '✗ Descartada'} por {r.decision.operador} el {fechaHora(r.decision.fecha)}{r.decision.datos['motivo'] ? ` · «${String(r.decision.datos['motivo'])}»` : ''}{r.decision.datos['transferencia'] ? ` · transferencia ${hashCorto(String(r.decision.datos['transferencia']))}` : ''} · en la cadena como #{r.decision.seq}
        </p>
      ) : null}
    </li>
  );
}

export function PantallaRiesgo({ e }: { e: Etiquetas }) {
  const [datos, setDatos] = useState<Riesgos | null>(null);
  const [informe, setInforme] = useState<Informe | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    void accion<Riesgos>({ accion: 'riesgo' }).then(setDatos, (err: unknown) => setAviso(err instanceof Error ? err.message : String(err)));
  }, [vuelta]);

  const corre = () => void e.ejecuta<Informe>({ accion: 'agente' }).then((r) => { setInforme(r); setVuelta((n) => n + 1); }, (err: unknown) => setAviso(String(err)));
  const decide = (recomendacion: string, sitio: string, decision: 'ejecutar' | 'descartar', motivo: string) => void e.ejecuta<{ ok: boolean; motivo?: string }>({ accion: 'decision', sitio, recomendacion, decision, ...(motivo.trim() ? { motivo: motivo.trim() } : {}) }).then(
    (r) => { setAviso(r.ok ? (decision === 'ejecutar' ? 'Ejecutada y registrada en la cadena.' : 'Descartada y registrada en la cadena.') : r.motivo ?? 'no se pudo'); setVuelta((n) => n + 1); },
    (err: unknown) => setAviso(err instanceof Error ? err.message : String(err)),
  );

  const pendientes = datos?.recomendaciones.filter((r) => r.estado === 'pendiente') ?? [];
  const decididas = datos?.recomendaciones.filter((r) => r.estado !== 'pendiente') ?? [];
  return (
    <div className="space-y-4">
      <div className={`${tarjeta} flex flex-wrap items-center gap-3`}>
        <button type="button" className={botonPrimario} onClick={corre} data-prueba="correr-agente">Correr el agente ahora</button>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">Corre cada día. Fuente de ventas: <b>{datos?.fuente === 'ficticias' ? 'ficticias (demostración)' : datos?.fuente ?? '…'}</b>. Antes de recomendar verifica la integridad de cada sitio; si está rota, no actúa y abre un incidente.</p>
      </div>
      {informe ? (
        <ul className={`${tarjeta} space-y-1 text-sm`} data-prueba="informe-agente">
          {informe.informe.map((i) => <li key={i.sitio} className={i.bloqueo ? 'font-semibold text-red-700 dark:text-red-300' : ''}>{i.sitio}: {i.bloqueo ? `NO actuó — ${i.bloqueo}` : `${i.riesgos} lote(s) en riesgo, ${i.emitidas} recomendación(es) nueva(s)`}</li>)}
        </ul>
      ) : null}
      {aviso ? <p className="text-sm" role="status" data-prueba="aviso-riesgo">{aviso}</p> : null}
      <section className={`${tarjeta} space-y-2`}>
        <h2 className="text-lg font-semibold">Por decidir ({pendientes.length})</h2>
        {pendientes.length === 0 ? <p className="text-sm text-neutral-500">Nada pendiente.</p> : <ul className="space-y-2">{pendientes.map((r) => <Tarjeta key={r.evento.hash} r={r} alDecidir={decide} />)}</ul>}
      </section>
      <section className={`${tarjeta} space-y-2`}>
        <h2 className="text-lg font-semibold">Decididas ({decididas.length})</h2>
        {decididas.length === 0 ? <p className="text-sm text-neutral-500">Todavía nadie ha ejecutado ni descartado una recomendación.</p> : <ul className="space-y-2">{decididas.map((r) => <Tarjeta key={r.evento.hash} r={r} />)}</ul>}
      </section>
      <section className={`${tarjeta} space-y-2`}>
        <h2 className="text-lg font-semibold">Cálculo de hoy</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm" data-prueba="tabla-riesgo">
            <thead className="text-xs text-neutral-500"><tr><th>Sitio</th><th>Lote</th><th>Existencia</th><th>Venta/día</th><th>Días inv.</th><th>Días vendibles</th><th>Semáforo</th><th>Recomienda</th></tr></thead>
            <tbody>{(datos?.riesgos ?? []).map((r) => (
              <tr key={`${r.sitio}${r.lote.lote}`} className="border-t border-neutral-200 dark:border-neutral-800">
                <td>{r.sitio}</td><td>{r.descripcion} <span className="font-mono text-xs">{r.lote.lote}</span></td><td>{r.cajas} cj</td><td>{r.venta ?? 0}</td>
                <td className="font-bold">{r.diasInventario ?? '∞'}</td><td>{r.diasVendibles}</td><td><span className={`rounded px-1.5 text-xs font-semibold ${COLOR_SEMAFORO[r.semaforo]}`}>{TEXTO_SEMAFORO[r.semaforo].etiqueta}</span></td><td>{ACCION[r.recomendacion.accion]}{r.recomendacion.destino ? ` → ${r.recomendacion.destino}` : ''}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
