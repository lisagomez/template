'use client';

/**
 * El panel: «Espera tu clic». Solo lo que la matriz dice que te toca decidir a TI (propuestas, pólizas, firmas de un
 * alta) y las alertas para tu rol (topes al 80 %, desviaciones de presupuesto, deriva de una tarjeta). Aprobar se
 * hace con un clic sobre la huella, en su hilo: aquí está el camino, no el atajo.
 */
import { useRouter } from 'next/navigation';
import { useAgora } from './contexto';

const ICONO: Record<string, string> = { propuesta: '◆', poliza: '▤', alta: '✎', aviso: '!' };
const TONO: Record<string, string> = { propuesta: 'text-amber-700', poliza: 'text-violet-700', alta: 'text-blue-700', aviso: 'text-rose-700' };

export function EsperaTuClic() {
  const datos = useAgora();
  const router = useRouter();
  if (datos.apagada) return null;
  const decidir = datos.espera.filter((x) => x.tipo !== 'aviso');
  const avisos = datos.espera.filter((x) => x.tipo === 'aviso');
  return (
    <div data-agora-espera data-pendientes={decidir.length} data-avisos={avisos.length}>
      <h4 className="capa-titulo-seccion">Por decidir (la matriz te lo asigna)</h4>
      <p className="mb-1 text-[11px] text-slate-500">Para {datos.yo.nombre.split(' ')[0]}: {decidir.length ? `${decidir.length} por decidir` : 'nada por decidir'}{avisos.length ? ` · ${avisos.length} alerta(s)` : ''}</p>
      <ul className="space-y-1">
        {[...decidir, ...avisos].slice(0, 8).map((x) => (
          <li key={`${x.tipo}-${x.id}`}>
            <a href={x.ir} onClick={(e) => { e.preventDefault(); router.push(x.ir) }} data-espera={x.tipo}
              className="flex gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[12px] leading-snug hover:border-slate-300 hover:bg-slate-50">
              <span aria-hidden className={`font-bold ${TONO[x.tipo]}`}>{ICONO[x.tipo]}</span>
              <span className="min-w-0"><span className="block font-medium text-slate-800">{x.titulo}</span><span className="block truncate text-slate-500">{x.detalle}</span></span>
            </a>
          </li>
        ))}
      </ul>
      {decidir.length + avisos.length > 8 ? <p className="mt-1 text-[11px] text-slate-500">y {decidir.length + avisos.length - 8} más</p> : null}
    </div>
  );
}
