import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AltaPyme } from '@/features/buzon-cfdi/components/alta-pyme';
import { ConsentimientoPyme } from '@/features/buzon-cfdi/components/consentimiento-pyme';
import { ImportaLista69B } from '@/features/buzon-cfdi/components/importa-lista-69b';
import { cifrasDelDespacho, listaVigente, soyMiembro } from '@/features/buzon-cfdi/services/servidor/buzon';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** El buzón de CFDI recibidos del despacho (spec 015): sus pymes y el consentimiento escrito de cada una. */
export default async function Pagina() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?siguiente=/buzon');
  if (!(await soyMiembro(supabase))) {
    return <main className="mx-auto max-w-lg px-4 py-6"><p data-prueba="no-miembro">Tu cuenta no es miembro de este despacho. Las altas las hace el operador.</p></main>;
  }
  const [{ data: pymes }, { data: vigentes }, { data: documentos }, lista, medicion] = await Promise.all([
    supabase.from('buzon_pymes').select('id, rfc, nombre').order('nombre'),
    supabase.from('buzon_consentimientos').select('pyme_id, firmado_en').is('revocado_en', null),
    supabase.from('buzon_documentos').select('pyme_id, estado'),
    listaVigente(supabase),
    cifrasDelDespacho(supabase),
  ]);
  const consiente = new Map((vigentes ?? []).map((c) => [String(c.pyme_id), String(c.firmado_en)]));
  const porRevisar = (id: string) => (documentos ?? []).filter((d) => String(d.pyme_id) === id && d.estado === 'en_revision').length;
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold">Buzón de CFDI recibidos</h1>
        <p className="text-sm text-gray-600">Piloto en la máquina del despacho: ningún documento sale de ella.</p>
      </header>
      <ul className="space-y-2" data-prueba="pymes">
        {(pymes ?? []).map((p) => (
          <li key={String(p.id)} className="space-y-2 rounded-xl bg-white p-4 shadow-sm" data-prueba="pyme">
            <div className="flex items-baseline justify-between gap-2">
              <Link href={`/buzon/${String(p.id)}`} className="font-medium underline">{String(p.nombre)}</Link>
              <span className="text-sm text-gray-600">{String(p.rfc)} · {porRevisar(String(p.id))} por revisar</span>
            </div>
            <ConsentimientoPyme pymeId={String(p.id)} vigenteDesde={consiente.get(String(p.id)) ?? null} />
          </li>
        ))}
        {!pymes?.length && <li className="text-sm text-gray-600">Aún no hay pymes en el buzón.</li>}
      </ul>
      <AltaPyme />
      <ImportaLista69B vigente={lista} />
      <section className="space-y-1 rounded-xl bg-white p-4 text-sm shadow-sm" data-prueba="cifras">
        <h2 className="font-semibold">Cifras para el laboratorio</h2>
        <p>Solo salen el seudónimo de cada pyme y números: horas, CFDI recibidos y proporción pendiente al cierre del mes del piloto.</p>
        <p data-prueba="cifras-resumen">{medicion.filas.length} fila(s) · {medicion.pymesCompletas} pyme(s) con los dos meses completos.</p>
        {medicion.filas.length > 0 && <a href="/api/buzon/cifras" className="inline-block rounded-lg border px-3 py-1" data-prueba="cifras-descargar">Descargar las cifras (CSV)</a>}
      </section>
    </main>
  );
}
