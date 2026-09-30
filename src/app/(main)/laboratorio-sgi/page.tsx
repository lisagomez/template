import { aprobadas, correLaboratorio, infoCorridas, TRAMPAS } from '@/features/laboratorio-sgi/services/laboratorio';
import rls from '../../../../public/laboratorio-sgi/rls.json';

export const dynamic = 'force-dynamic';

const ESTADO = { pasa: ['✓ pasa', 'bg-emerald-100 text-emerald-800'], falla: ['✗ falla', 'bg-red-100 text-red-800'], no_medido: ['· no medido', 'bg-gray-100 text-gray-700'] } as const;

export default async function LaboratorioSgi() {
  const rs = await correLaboratorio();
  const piezas = aprobadas(rs);
  const info = infoCorridas();
  const gasto = rs.reduce((s, r) => s + (r.costoUsd ?? 0), 0);
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold">Laboratorio del sistema integrado ISO 9001 + ISO/IEC 42001</h1>
        <p className="text-sm text-gray-600">Cada caso corre de verdad: los deterministas en cada visita; los de los agentes se verifican sobre corridas reales grabadas (modelo pineado por routing, datos sintéticos). Un «no medido» nunca aprueba una pieza.</p>
        <p className="mt-1 text-xs text-gray-500" data-prueba="gasto">Corridas grabadas: {info.corridas.length} · gasto medido US${gasto.toFixed(4)}{info.modelos ? ` · modelos: ${Object.entries(info.modelos).map(([k, v]) => `${k} → ${v}`).join(', ')}` : ''}</p>
      </header>
      <section className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5" data-prueba="piezas">
        {piezas.map((p) => (
          <div key={p.pieza} className={`rounded-xl p-3 ring-1 ${p.aprobada ? 'bg-emerald-50 ring-emerald-200' : 'bg-white ring-gray-200'}`}>
            <p className="text-sm font-semibold">{p.pieza}</p><p className="text-xs text-gray-600">{p.pasan}/{p.casos} pasan{p.noMedidos ? ` · ${p.noMedidos} no medidos` : ''}</p>
            <p className="text-xs font-medium">{p.aprobada ? 'aprobada para la app' : 'sin aprobar'}</p>
          </div>
        ))}
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 font-semibold">Las 10 trampas del spec</h2>
        <ul className="grid gap-1 text-sm md:grid-cols-2" data-prueba="trampas">{Object.entries(TRAMPAS).map(([n, t]) => {
          const cs = rs.filter((r) => r.trampa === Number(n));
          return <li key={n}>T{n} · {t}: {cs.map((c) => <span key={c.id} className={`ml-1 rounded px-1.5 py-0.5 text-xs ${ESTADO[c.estado][1]}`}>{c.id}</span>)}</li>;
        })}</ul>
      </section>
      <section className="overflow-x-auto rounded-2xl bg-white p-4 shadow-sm">
        <table className="w-full text-sm" data-prueba="casos">
          <thead><tr className="text-left text-xs text-gray-500"><th className="py-2">Caso</th><th>Pieza</th><th>Estado</th><th>Qué se comprobó</th><th>Costo</th></tr></thead>
          <tbody>{rs.map((r) => (
            <tr key={r.id} className="border-t align-top">
              <td className="py-2 pr-2"><span className="font-mono text-xs">{r.id}</span><br />{r.titulo}{r.trampa ? <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-900">T{r.trampa}</span> : null}</td>
              <td className="text-xs">{r.pieza}{r.llm ? ' (LLM)' : ''}</td>
              <td><span className={`rounded px-2 py-0.5 text-xs ${ESTADO[r.estado][1]}`}>{ESTADO[r.estado][0]}</span></td>
              <td className="text-xs text-gray-700">{r.evidencia.map((e, i) => <div key={i}>{e}</div>)}</td>
              <td className="text-xs tabular-nums">{r.costoUsd === null ? (r.llm ? '—' : 'sin LLM') : `US$${r.costoUsd.toFixed(4)}`}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-2 font-semibold">Aislamiento y roles contra la base real ({rls.base}, {rls.cuando.slice(0, 16).replace('T', ' ')})</h2>
        <ul className="grid gap-1 text-xs md:grid-cols-2" data-prueba="rls">{(rls.filas as [string, string, boolean][]).map(([q, e, ok], i) => <li key={i}>{ok ? '✓' : '✗'} {q} — {e}</li>)}</ul>
      </section>
    </main>
  );
}
