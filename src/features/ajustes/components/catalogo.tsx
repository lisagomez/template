'use client';

/** Los motores instalados con las cifras medidas en ESTA maquina. Sin medicion, guiones: nada se inventa. */
import { formateaCifras } from '../services/presenta.ts';
import type { EntradaCatalogo, EstadoAjustes } from '../services/tipos.ts';

export function Catalogo({ catalogo, medicion, motorActual }: { catalogo: EntradaCatalogo[]; medicion: EstadoAjustes['medicion']; motorActual: string }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800" data-prueba="catalogo">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
          <tr>
            <th className="px-3 py-2">Motor</th>
            <th className="px-3 py-2">Errores (WER)</th>
            <th className="px-3 py-2">Latencia p50</th>
            <th className="px-3 py-2">p95</th>
            <th className="hidden px-3 py-2 sm:table-cell">Carga</th>
            <th className="hidden px-3 py-2 md:table-cell">Nota</th>
          </tr>
        </thead>
        <tbody>
          {catalogo.map((e) => {
            const c = formateaCifras(e);
            return (
              <tr key={e.nombre} className={e.nombre === motorActual ? 'bg-emerald-50 dark:bg-emerald-950' : ''} data-prueba="motor" data-motor={e.nombre} data-medido={e.medido ? '1' : '0'}>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{e.nombre}{e.nombre === motorActual ? <span className="ml-2 rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100">en uso</span> : null}</td>
                <td className="px-3 py-2 tabular-nums">{c.wer}</td>
                <td className="px-3 py-2 tabular-nums">{c.p50}</td>
                <td className="px-3 py-2 tabular-nums">{c.p95}</td>
                <td className="hidden px-3 py-2 tabular-nums sm:table-cell">{c.carga}</td>
                <td className="hidden px-3 py-2 text-xs text-neutral-500 md:table-cell">{e.nota ?? ''}</td>
              </tr>
            );
          })}
          {catalogo.length === 0 ? <tr><td colSpan={6} className="px-3 py-4 text-center text-neutral-500">No hay motores en la carpeta de modelos.</td></tr> : null}
        </tbody>
      </table>
      <p className="border-t border-neutral-200 px-3 py-2 text-xs text-neutral-500 dark:border-neutral-800" data-prueba="medicion">
        {medicion
          ? `Medido el ${medicion.fecha} en ${medicion.maquina?.cpu ?? 'esta máquina'} (${medicion.maquina?.dispositivo ?? 'cpu'}, ${medicion.maquina?.nucleos ?? '?'} núcleos) sobre ${medicion.corpus?.nombre ?? 'un corpus'}, ${medicion.corpus?.tomas ?? '?'} tomas. Cifras de esta máquina: la tabla de otra no se hereda.`
          : 'Sin medición en esta máquina: las cifras aparecerán cuando se corra la medición (npm run mide en tools/dictado).'}
      </p>
    </div>
  );
}
