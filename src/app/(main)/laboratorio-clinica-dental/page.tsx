import Link from 'next/link';
import { CLINICAS, verificaSello } from '../../../../tools/clinica-dental/dist/servidor.js';
import { esLaboratorio } from '@/features/clinica-dental/services/servidor/datos';
import { resumenGasto } from '@/features/clinica-dental/services/servidor/gasto';
import { runtime } from '@/features/clinica-dental/services/servidor/runtime';

export const dynamic = 'force-dynamic';

export default async function LaboratorioClinica() {
  if (!esLaboratorio()) return <p className="p-8">Solo laboratorio (CLINICA_LABORATORIO=1).</p>;
  const rt = await runtime();
  const libros = await Promise.all(CLINICAS.map(async (c) => ({ c, v: await rt.portal.ctx.libro.verifica(c.id, verificaSello(rt.llaves.selloPublica)) })));
  const gasto = await resumenGasto();
  return (
    <div lang="es-MX" className="mx-auto max-w-4xl space-y-6 p-4">
      <h1 className="text-2xl font-bold">Laboratorio · portal de clínicas dentales</h1>
      <p className="text-slate-700">Reloj del laboratorio: <strong>{new Date(rt.reloj()).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</strong>. Pacientes y clínicas sintéticos.</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {CLINICAS.map((c) => <li key={c.id}><Link className="block rounded-xl bg-white p-4 ring-1 ring-slate-200 hover:ring-slate-400" href={`/clinica/${c.id}`}>Portal de <strong>{c.nombre}</strong></Link></li>)}
        <li><Link className="block rounded-xl bg-white p-4 ring-1 ring-slate-200" href="/laboratorio-clinica-dental/buzon">Buzón de salida ({rt.buzon.enviados.length} correos)</Link></li>
        <li><Link className="block rounded-xl bg-white p-4 ring-1 ring-slate-200" href="/laboratorio-clinica-dental/telegram">Telegram simulado ({rt.telegram.historial.length} mensajes)</Link></li>
        <li><Link className="block rounded-xl bg-white p-4 ring-1 ring-slate-200" href="/laboratorio-clinica-dental/tablero">Unit economics</Link></li>
        <li><Link className="block rounded-xl bg-white p-4 ring-1 ring-slate-200" href="/laboratorio-clinica-dental/grafo">Grafo de atención</Link></li>
      </ul>
      <section className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
        <h2 className="font-semibold">Libro de eventos</h2>
        <ul className="mt-2 text-sm">{libros.map(({ c, v }) => <li key={c.id}>{c.nombre}: {v.ok ? `✓ ${v.n} eventos, cadena íntegra, ${v.sellado} sellados, raíz ${v.raiz.slice(0, 16)}…` : `✗ ${v.fallo} en el eslabón ${v.seq}: ${v.detalle}`}</li>)}</ul>
      </section>
      <section className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
        <h2 className="font-semibold">Gasto del asistente</h2>
        <p className="text-sm">US${gasto.gastadoUsd.toFixed(5)} en {gasto.llamadas} llamadas ({gasto.filasSinCosto} sin costo reportado) · tope US$1.</p>
      </section>
    </div>
  );
}
