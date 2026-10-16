import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CLINICAS, NOMBRE_CATEGORIA, pesos, CATEGORIAS } from '../../../../../tools/clinica-dental/dist/index.js';

export default async function Portada({ params }: { params: Promise<{ clinica: string }> }) {
  const { clinica: id } = await params;
  const c = CLINICAS.find((x) => x.id === id);
  if (!c) notFound();
  const base = `/clinica/${c.id}`;
  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-10">
        <p className="text-sm font-medium text-[color:var(--c1)]">Portal del paciente</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{c.nombre}</h1>
        <p className="mt-2 max-w-prose text-slate-700">{c.lema}. Agenda en línea, recibe tus recordatorios por correo o Telegram y pregúntale al asistente lo que necesites saber de la clínica.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`${base}/agenda`} className="inline-flex min-h-11 items-center rounded-lg bg-[color:var(--c1)] px-5 font-semibold text-white hover:opacity-90">Agendar cita</Link>
          <Link href={`${base}/registro`} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-5 font-semibold hover:bg-slate-50">Soy paciente nuevo</Link>
        </div>
        {c.promociones[0] ? <p className="mt-6 rounded-lg bg-[color:var(--c0)] p-3 text-sm"><strong>Promoción:</strong> {c.promociones[0].texto}</p> : null}
      </section>
      <section aria-labelledby="servicios">
        <h2 id="servicios" className="text-xl font-semibold">Servicios y precios</h2>
        <p className="text-sm text-slate-600">Precios en pesos mexicanos, con IVA. Duración aproximada de la cita.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {CATEGORIAS.filter((k) => c.servicios.some((s) => s.categoria === k)).map((k) => (
            <article key={k} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
              <h3 className="font-semibold">{NOMBRE_CATEGORIA[k]}</h3>
              <ul className="mt-2 divide-y divide-slate-100">
                {c.servicios.filter((s) => s.categoria === k).map((s) => (
                  <li key={s.id} className="flex items-start justify-between gap-3 py-2">
                    <span><span className="font-medium">{s.nombre}</span><span className="block text-sm text-slate-600">{s.enQueConsiste}</span></span>
                    <span className="shrink-0 text-right text-sm"><span className="font-semibold">{pesos(s.precioMxn)}</span><span className="block text-slate-600">{s.duracionMin} min</span></span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
      <section aria-labelledby="llegar" className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
        <h2 id="llegar" className="text-xl font-semibold">Cómo llegar</h2>
        <p className="mt-1 text-slate-700">{c.direccion}. {c.comoLlegar}</p>
        <p className="mt-2 text-sm text-slate-600">{c.politicas.cancelacion}</p>
      </section>
    </div>
  );
}
