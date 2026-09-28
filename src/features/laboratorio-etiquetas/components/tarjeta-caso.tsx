'use client';

/** Una tarjeta por caso: qué entra, qué trampa pone, qué salió de verdad, la pieza contra su referencia y el veredicto. */
import type { CasoCorrido, EstadoDeCaso } from '../services/tipos.ts';

const ESTILO: Record<EstadoDeCaso, string> = {
  pasa: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  falla: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  'no-medido': 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
};
const REQUIERE = { motor: 'requiere el motor local', 'corpus-real': 'requiere el corpus real' } as const;

function Pieza({ svg, referencia }: { svg: string; referencia?: string }) {
  return (
    <div className="flex flex-wrap gap-3" data-prueba="pieza-caso">
      <figure className="space-y-1">
        <figcaption className="text-xs text-neutral-500">Actual</figcaption>
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG generado aquí, en data URL: nada que optimizar ni que descargar */}
        <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt="Etiqueta generada por el caso" width={260} className="rounded border border-neutral-200 bg-white dark:border-neutral-800" />
      </figure>
      {referencia ? (
        <figure className="space-y-1">
          <figcaption className="text-xs text-neutral-500">Referencia aprobada</figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG de referencia servido desde public/ */}
          <img src={referencia} alt="Etiqueta de referencia" width={260} className="rounded border border-neutral-200 bg-white dark:border-neutral-800" />
        </figure>
      ) : null}
    </div>
  );
}

export function TarjetaCaso({ corrido }: { corrido: CasoCorrido }) {
  const { caso, resultado } = corrido;
  return (
    <article className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800" data-prueba={`caso-${caso.id}`} data-estado={resultado.estado}>
      <header className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTILO[resultado.estado]}`}>{resultado.estado === 'no-medido' ? 'no medido' : resultado.estado}</span>
        <h3 className="text-sm font-semibold">{caso.titulo}</h3>
        <span className="text-xs text-neutral-400">{caso.id} · {corrido.ms} ms</span>
        {caso.trampa ? <span className="rounded-full border border-violet-300 px-2 py-0.5 text-xs text-violet-700 dark:border-violet-800 dark:text-violet-300">trampa: {caso.trampa}</span> : null}
        {caso.requiere ? <span className="rounded-full border border-sky-300 px-2 py-0.5 text-xs text-sky-700 dark:border-sky-800 dark:text-sky-300">{REQUIERE[caso.requiere]}</span> : null}
        {!corrido.coincide ? <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">esperaba «{caso.esperado}»</span> : null}
      </header>
      <p className="mt-2 text-xs text-neutral-500"><span className="font-medium text-neutral-600 dark:text-neutral-400">Entrada:</span> {caso.entrada}</p>
      <ul className="mt-3 space-y-1 text-sm">
        {resultado.evidencia.filter(Boolean).map((e, i) => (
          <li key={i} className={`whitespace-pre-wrap break-words rounded bg-neutral-50 px-2 py-1 font-mono text-[12px] dark:bg-neutral-900 ${e.startsWith('✗') ? 'text-red-700 dark:text-red-300' : 'text-neutral-700 dark:text-neutral-300'}`}>{e}</li>
        ))}
      </ul>
      {resultado.pieza ? <div className="mt-3"><Pieza svg={resultado.pieza} {...(resultado.referencia ? { referencia: resultado.referencia } : {})} /></div> : null}
      <p className="mt-2 text-sm"><span className="font-medium">Veredicto:</span> {resultado.veredicto}</p>
    </article>
  );
}
