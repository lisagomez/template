'use client';

/**
 * La revision antes de imprimir: cada punto con su explicacion llana y, si lo hay, el arreglo
 * de un clic. El semaforo de vida restante se pinta con su color.
 */
import type { Arreglo, ResultadoRevision } from '../services/nucleo.ts';
import { COLOR_SEMAFORO, PUNTO_REVISION } from '../services/presenta.ts';
import { TEXTO_SEMAFORO } from '../services/nucleo.ts';

function textoArreglo(a: Arreglo): string {
  switch (a.tipo) {
    case 'corrige-digito': return 'Corregir dígito';
    case 'quita-caracteres': return `Dejar «${a.valor}»`;
    case 'lote-al-final': return 'Mover lote al final';
    case 'parte-simbolo': return 'Partir en dos códigos';
    case 'ajusta-grosor': return `Usar ${a.puntos} puntos`;
  }
}

export function PanelRevision({ revision, arregla }: { revision: ResultadoRevision; arregla: (a: Arreglo) => void }) {
  return (
    <section aria-labelledby="t-revision">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="t-revision" className="text-base font-semibold">Revisión antes de imprimir</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${revision.bloquea ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`} data-prueba="veredicto">{revision.bloquea ? 'No se puede imprimir' : 'Lista para imprimir'}</span>
      </div>
      <ul className="space-y-2" data-prueba="revision">
        {revision.puntos.map((p, i) => (
          <li key={`${p.id}-${i}`} className="grid grid-cols-[14px_1fr] gap-2" data-punto={p.id} data-estado={p.estado}>
            <span className={`mt-1.5 h-3 w-3 rounded-full ${PUNTO_REVISION[p.estado]}`} aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {p.semaforo ? <span className={`mr-1.5 rounded px-1.5 py-0.5 text-xs font-bold ${COLOR_SEMAFORO[p.semaforo]}`} data-prueba="semaforo">{TEXTO_SEMAFORO[p.semaforo].etiqueta}</span> : null}
                {p.titulo}
              </p>
              <p className="text-xs text-neutral-600 dark:text-neutral-400">{p.explicacion}</p>
              {p.arreglo ? <button type="button" className="mt-1 rounded-md bg-blue-700 px-2 py-0.5 text-xs font-semibold text-white hover:bg-blue-800" onClick={() => arregla(p.arreglo!)} data-prueba={`arreglo-${p.arreglo.tipo}`}>{textoArreglo(p.arreglo)}</button> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
