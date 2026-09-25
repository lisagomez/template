'use client';

/**
 * /etiquetas/caducidades — por sitio: lo vencido, lo que hay que retirar, lo que vence esta
 * semana y este mes, y el orden FEFO para surtir (los vencidos y los de retiro NO entran).
 */
import { useState } from 'react';
import { tableroSitio, TEXTO_SEMAFORO, textoDias, type FilaTablero, type EstadoSemaforo } from '../services/nucleo.ts';
import { COLOR_SEMAFORO, fechaCorta } from '../services/presenta.ts';
import type { Etiquetas } from '../hooks/use-etiquetas.ts';
import { comoEstado } from './pantalla-lector.tsx';
import { tarjeta } from './marco.tsx';

function Lista({ titulo, filas, vacio }: { titulo: string; filas: readonly FilaTablero[]; vacio: string }) {
  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold">{titulo} <span className="text-neutral-500">({filas.length})</span></h3>
      {filas.length === 0 ? <p className="text-xs text-neutral-500">{vacio}</p> : (
        <ul className="divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
          {filas.map((f) => (
            <li key={f.existencia.id} className="flex flex-col gap-0.5 py-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <span className="min-w-0"><span className="font-medium">{f.descripcion}</span> <span className="font-mono text-xs text-neutral-500">lote {f.existencia.lote}</span></span>
              <span className="flex shrink-0 flex-wrap items-center gap-1.5 text-xs"><span>{f.existencia.cantidad} cj · {fechaCorta(f.existencia.caducidad)}</span><span className={`rounded px-1.5 py-0.5 font-semibold ${COLOR_SEMAFORO[f.estado]}`}>{textoDias(f.dias)}</span></span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PantallaTablero({ e }: { e: Etiquetas }) {
  const est = e.estado!;
  const sitios = est.configuracion.sitios;
  const [elegidos, setElegidos] = useState<string[]>(sitios.slice(0, 2).map((s) => s.clave));
  const alterna = (c: string) => setElegidos((v) => (v.includes(c) ? v.filter((x) => x !== c) : [...v, c]));
  const almacen = comoEstado(est);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Sitios">
        {sitios.map((s) => <button key={s.clave} type="button" aria-pressed={elegidos.includes(s.clave)} onClick={() => alterna(s.clave)} className={`rounded-full border px-3 py-1 text-sm ${elegidos.includes(s.clave) ? 'border-blue-700 bg-blue-700 text-white' : 'border-neutral-300 dark:border-neutral-700'}`}>{s.nombre}</button>)}
        <span className="text-xs text-neutral-500">Hoy: {fechaCorta(est.hoy)} · «esta semana» = próximos 7 días · «este mes» = de 8 a 30 días</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {elegidos.map((clave) => {
          const t = tableroSitio(almacen, clave, est.hoy);
          const sitio = sitios.find((s) => s.clave === clave);
          return (
            <article key={clave} className={`${tarjeta} space-y-4`} data-prueba="tablero-sitio" data-sitio={clave}>
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold">{sitio?.nombre ?? clave} <span className="text-xs font-normal uppercase text-neutral-500">{sitio?.tipo}</span></h2>
                <div className="flex gap-1">
                  {(['vencido', 'retiro', 'alerta', 'vigente'] as EstadoSemaforo[]).map((s) => <span key={s} className={`rounded px-2 py-0.5 text-xs font-semibold ${COLOR_SEMAFORO[s]}`} title={TEXTO_SEMAFORO[s].accion}>{t.totales[s]} {TEXTO_SEMAFORO[s].etiqueta.toLowerCase()}</span>)}
                </div>
              </header>
              <Lista titulo="Vencido: no surtir, dar de baja" filas={t.vencidos} vacio="Nada vencido." />
              <Lista titulo="Retirar de venta" filas={t.retiro} vacio="Nada en días de retiro." />
              <Lista titulo="Vence esta semana" filas={t.semana} vacio="Nada vence en los próximos 7 días." />
              <Lista titulo="Vence este mes" filas={t.mes} vacio="Nada vence de 8 a 30 días." />
              <section>
                <h3 className="mb-1 text-sm font-semibold">Orden FEFO para surtir</h3>
                {t.fefo.length === 0 ? <p className="text-xs text-neutral-500">Sin existencias surtibles.</p> : (
                  <ol className="space-y-2 text-sm">
                    {t.fefo.map((g) => (
                      <li key={g.sku} className="rounded-lg bg-neutral-50 p-2 dark:bg-neutral-900">
                        <p className="font-medium">{g.descripcion}</p>
                        <ol className="mt-1 flex flex-wrap gap-1.5">
                          {g.lotes.map((l) => <li key={l.existencia.id} className="rounded border border-neutral-300 px-2 py-0.5 font-mono text-xs dark:border-neutral-700">{l.orden}º {l.existencia.lote} · {fechaCorta(l.existencia.caducidad)} · {l.existencia.cantidad} cj</li>)}
                        </ol>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </article>
          );
        })}
      </div>
    </div>
  );
}
