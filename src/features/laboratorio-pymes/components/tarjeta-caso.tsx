'use client';

/** Una tarjeta por caso: qué entra, qué trampa pone, qué salió de verdad y el veredicto. */
import type { CasoCorrido, EstadoDeCaso } from '../services/tipos.ts';

const ESTILO: Record<EstadoDeCaso, string> = {
  pasa: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  falla: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  'no-medido': 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
};

export function EtiquetaEstado({ estado }: { estado: EstadoDeCaso }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTILO[estado]}`}>{estado === 'no-medido' ? 'no medido' : estado}</span>;
}

export function TarjetaCaso({ corrido }: { corrido: CasoCorrido }) {
  const { caso, resultado } = corrido;
  return (
    <article className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800" data-prueba={`caso-${caso.id}`} data-estado={resultado.estado}>
      <header className="flex flex-wrap items-center gap-2">
        <EtiquetaEstado estado={resultado.estado} />
        <h3 className="text-sm font-semibold">{caso.titulo}</h3>
        <span className="text-xs text-neutral-400">{caso.id} · {corrido.ms} ms</span>
        {caso.trampa ? <span className="rounded-full border border-violet-300 px-2 py-0.5 text-xs text-violet-700 dark:border-violet-800 dark:text-violet-300">trampa: {caso.trampa}</span> : null}
        {!corrido.coincide ? <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">esperaba «{caso.esperado}»</span> : null}
      </header>
      <p className="mt-2 text-xs text-neutral-500"><span className="font-medium text-neutral-600 dark:text-neutral-400">Entrada:</span> {caso.entrada}</p>
      <div className={resultado.pieza ? 'mt-3 grid gap-3 md:grid-cols-[1fr_180px]' : 'mt-3'}>
        <ul className="space-y-1 text-sm">
          {resultado.evidencia.filter(Boolean).map((e, i) => (
            <li key={i} className={`whitespace-pre-wrap break-words rounded bg-neutral-50 px-2 py-1 font-mono text-[12px] dark:bg-neutral-900 ${e.startsWith('✗') ? 'text-red-700 dark:text-red-300' : 'text-neutral-700 dark:text-neutral-300'}`}>{e}</li>
          ))}
        </ul>
        {resultado.pieza ? (
          // eslint-disable-next-line @next/next/no-img-element -- SVG generado aquí, en data URL: nada que optimizar ni que descargar
          <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(resultado.pieza)}`} alt="Pieza generada por el caso" className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800" />
        ) : null}
      </div>
      <p className="mt-2 text-sm"><span className="font-medium">Veredicto:</span> {resultado.veredicto}</p>
    </article>
  );
}
