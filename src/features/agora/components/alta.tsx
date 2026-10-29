/**
 * El alta de la organización, paso por paso: cada paso nombra UNA sola decisión, dice qué decidió la base y por qué vía
 * se cambia. No escribe nada: el dinero, la estructura y los agentes se cambian por propuesta, freno o doble firma.
 */
import Link from 'next/link';
import type { PasoDelAlta } from '../services/alta';

export function AltaDeLaOrganizacion({ pasos, paso }: { pasos: PasoDelAlta[]; paso: number }) {
  const i = Math.min(Math.max(paso, 1), pasos.length);
  const p = pasos[i - 1]!;
  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6" data-agora-pantalla="alta">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Alta de la organización · paso {i} de {pasos.length}</p>
        <ol className="mt-2 flex gap-1.5" aria-label="Pasos del alta">
          {pasos.map((x, k) => (
            <li key={x.id} className={`h-1.5 flex-1 rounded-full ${k + 1 === i ? 'bg-[#2a5db0]' : x.hecho ? 'bg-slate-400' : 'bg-slate-200'}`} aria-current={k + 1 === i ? 'step' : undefined} title={x.decision} />
          ))}
        </ol>
      </header>
      <section className="rounded-xl border border-slate-200 bg-white p-5" data-paso={p.id} data-hecho={p.hecho ? 'si' : 'no'}>
        <h1 className="text-lg font-semibold text-slate-900">{p.decision}</h1>
        <p className={`mt-1 text-[12px] font-medium ${p.hecho ? 'text-emerald-700' : 'text-amber-700'}`}>{p.hecho ? 'Ya decidido' : 'Falta decidirlo'}</p>
        <ul className="mt-3 space-y-1 text-sm text-slate-800">{p.vigente.map((v) => <li key={v}>· {v}</li>)}</ul>
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-700"><b>Cómo se cambia:</b> {p.como}</p>
        {p.ir ? <Link href={p.ir} className="mt-3 inline-block text-sm font-medium text-[#2a5db0] hover:underline">Ir a donde se decide →</Link> : null}
      </section>
      <nav className="flex justify-between" aria-label="Navegar el alta">
        {i > 1 ? <Link href={`/agora/alta?paso=${i - 1}`} className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">← Anterior</Link> : <span />}
        {i < pasos.length ? <Link href={`/agora/alta?paso=${i + 1}`} className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Siguiente decisión →</Link>
          : <Link href="/agora" className="rounded bg-[#2a5db0] px-3 py-1.5 text-sm font-medium text-white">Listo: ir a la organización</Link>}
      </nav>
    </div>
  );
}
