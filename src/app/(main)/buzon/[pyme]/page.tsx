import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { IngestaDocumentos } from '@/features/buzon-cfdi/components/ingesta-documentos';
import { RegistroHoras } from '@/features/buzon-cfdi/components/registro-horas';
import { RevisionDocumento } from '@/features/buzon-cfdi/components/revision-documento';
import { banderasDe, documentosDe, horasDe, piloto, soyMiembro } from '@/features/buzon-cfdi/services/servidor/buzon';
import { UUID_DB } from '@/features/buzon-cfdi/types';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** El buzón de una pyme: la ingesta, la revisión CFDI por CFDI y la exportación de los confirmados. */
export default async function Pagina({ params }: { params: Promise<{ pyme: string }> }) {
  const { pyme: id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?siguiente=/buzon/${encodeURIComponent(id)}`);
  if (!UUID_DB.test(id) || !(await soyMiembro(supabase))) notFound();
  const { data: pyme } = await supabase.from('buzon_pymes').select('id, rfc, nombre').eq('id', id).maybeSingle();
  if (!pyme) notFound();
  const [{ data: vigente }, documentos, horas, estado] = await Promise.all([
    supabase.from('buzon_consentimientos').select('id').eq('pyme_id', id).is('revocado_en', null).maybeSingle(),
    documentosDe(supabase, id),
    horasDe(supabase, id),
    piloto(supabase),
  ]);
  const confirmados = documentos.filter((d) => d.estado === 'confirmado').length;
  const emisor = (d: (typeof documentos)[number]) => d.campos.find((c) => c.clave === 'rfc_emisor')?.valor.trim().toUpperCase() ?? '';
  const banderas = await banderasDe(supabase, documentos.map(emisor));
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <header className="space-y-1">
        <Link href="/buzon" className="text-sm underline">← Buzón</Link>
        <h1 className="text-2xl font-bold">{String(pyme.nombre)}</h1>
        <p className="text-sm text-gray-600">{String(pyme.rfc)} · {documentos.length} documento(s) · {confirmados} confirmado(s)</p>
      </header>
      <IngestaDocumentos pymeId={id} consiente={Boolean(vigente)} activo={estado.estado === 'activo'} />
      {vigente && <RegistroHoras pymeId={id} registros={horas} />}
      {confirmados > 0 && <a href={`/api/buzon/exporta?pyme=${id}`} className="inline-block rounded-lg border px-4 py-2 text-sm" data-prueba="exportar">Exportar los confirmados (CSV)</a>}
      <section className="space-y-3" data-prueba="documentos">
        {documentos.map((d) => <RevisionDocumento key={d.id} doc={d} bandera={banderas.get(emisor(d)) ?? null} />)}
      </section>
    </main>
  );
}
