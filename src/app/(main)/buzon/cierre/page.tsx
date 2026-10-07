import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CierrePiloto } from '@/features/buzon-cfdi/components/cierre-piloto';
import { constanciaDeCierre, pendientesDeCaptura, piloto, soyMiembro } from '@/features/buzon-cfdi/services/servidor/buzon';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ESTADO = { activo: 'Activo', parado: 'Parado', cerrado: 'Cerrado' } as const;

/** Parar y cerrar el piloto (spec 015, fase 7). */
export default async function Pagina() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?siguiente=/buzon/cierre');
  if (!(await soyMiembro(supabase))) redirect('/buzon');
  const p = await piloto(supabase);
  const [pendientes, constancia] = await Promise.all([pendientesDeCaptura(supabase), constanciaDeCierre(supabase)]);
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <header className="space-y-1">
        <Link href="/buzon" className="text-sm underline">← Buzón</Link>
        <h1 className="text-2xl font-bold">Parar y cerrar el piloto</h1>
        <p className="text-sm text-gray-600" data-prueba="estado-piloto" data-estado={p.estado}>Estado: {ESTADO[p.estado]}
          {p.parado_en ? ` · parado el ${p.parado_en.slice(0, 10)}` : ''}{p.cerrado_en ? ` · cerrado el ${p.cerrado_en.slice(0, 10)}` : ''}</p>
      </header>
      {p.estado !== 'cerrado' && <p className="text-sm" data-prueba="pendientes-resumen">{pendientes.length} CFDI sin confirmar volverían a captura manual.</p>}
      <section className="rounded-xl bg-white p-4 shadow-sm"><CierrePiloto estado={p.estado} /></section>
      {constancia && (
        <section className="space-y-1 rounded-xl bg-white p-4 text-sm shadow-sm" data-prueba="constancia-cierre">
          <h2 className="font-semibold">Constancia del cierre</h2>
          <p>Borrado el {String(constancia.borrado_en).slice(0, 10)}: {constancia.pymes_borradas} pyme(s), {constancia.documentos_borrados} lectura(s) de documentos,
            {' '}{constancia.registros_de_horas_borrados} registro(s) de horas y {constancia.listados_borrados} listado(s) 69-B. Los originales nunca se guardaron aquí.</p>
        </section>
      )}
    </main>
  );
}
