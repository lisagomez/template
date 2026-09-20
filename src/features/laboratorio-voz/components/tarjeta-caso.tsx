'use client';

/** Una tarjeta por caso: que es, en que estado esta, como probarlo, el panel de prueba y el veredicto. */
import { useState } from 'react';
import { calculaEstado } from '../services/estado-casos.ts';
import type { Caso, Piezas, Veredicto } from '../types/index.ts';
import type { ContextoPanel } from './paneles/contexto.ts';
import { PanelCaso } from './paneles/index.tsx';
import { PanelVeredicto } from './panel-veredicto.tsx';
import { Semaforo } from './semaforo.tsx';
import { Aviso } from './ui.tsx';

export function TarjetaCaso({ caso, piezas, contexto, veredictos, ocupadoVeredicto, guardaVeredicto, abiertaAlInicio = false }: { caso: Caso; piezas: Piezas | undefined; contexto: ContextoPanel; veredictos: Veredicto[]; ocupadoVeredicto: boolean; guardaVeredicto: ContextoPanel['guardaVeredicto']; abiertaAlInicio?: boolean }) {
  const [abierta, setAbierta] = useState(abiertaAlInicio);
  const { estado, razon } = calculaEstado(caso, piezas);
  const ultimo = veredictos.at(-1);
  return (
    <article id={`caso-${caso.id}`} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950" data-prueba={`caso-${caso.id}`} data-estado={estado}>
      <button type="button" onClick={() => setAbierta((a) => !a)} className="flex w-full items-start justify-between gap-3 text-left">
        <div>
          <p className="text-xs text-neutral-400">Caso {caso.id}</p>
          <h3 className="text-base font-semibold leading-tight">{caso.titulo}</h3>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{caso.queEs}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Semaforo estado={estado} />
          {ultimo ? <span className="text-[10px] text-neutral-400">{ultimo.resultado === 'funciono' ? '✓ funcionó' : ultimo.resultado === 'a-medias' ? '~ a medias' : '✗ no funcionó'}</span> : null}
          <span className="text-xs text-neutral-400">{abierta ? 'cerrar ▲' : 'probar ▼'}</span>
        </div>
      </button>
      {abierta ? (
        <div className="mt-4 space-y-4 border-t border-neutral-100 pt-4 dark:border-neutral-800">
          <Aviso tipo={estado === 'puerta' ? 'info' : estado === 'reglas' ? 'honesto' : 'ok'}>
            <strong>Estado real: </strong>
            {razon}
          </Aviso>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Cómo probarlo</p>
              <ol className="mt-1 list-inside list-decimal space-y-1 text-sm">
                {caso.pasos.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ol>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Qué debería pasar</p>
              <p className="mt-1 text-sm">{caso.esperado}</p>
              {caso.notaHonesta ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Ojo: {caso.notaHonesta}</p> : null}
            </div>
          </div>
          <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900" data-prueba={`panel-${caso.id}`}>
            <PanelCaso caso={caso} estado={estado} contexto={contexto} />
          </div>
          <PanelVeredicto caso={caso.id} estado={estado} previos={veredictos} token={contexto.token} ocupado={ocupadoVeredicto} guarda={guardaVeredicto} />
        </div>
      ) : null}
    </article>
  );
}
