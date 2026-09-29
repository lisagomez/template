import Link from 'next/link';
import { join } from 'node:path';
import { notFound, redirect } from 'next/navigation';
import { agrupaHallazgos, type HallazgoPantalla, type Observacion, type PistaCara } from '../../../../../tools/reel/dist/index.js';
import { Sala } from '@/features/reel/components/sala';
import { carpetaDe, leeJson } from '@/features/reel/services/servidor/almacen';
import { UUID } from '@/features/reel/services/servidor/sesion';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface ResultadoLocal { observaciones: Observacion[]; master?: { qa: Observacion[] }; pistas?: PistaCara[]; sujetoId?: number | null; hallazgos?: HallazgoPantalla[] }

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?siguiente=/reel/${id}`);
  const { data: p } = await supabase.from('reel_proyectos').select('id, titulo, estado').eq('id', id).maybeSingle();
  if (!p) notFound();
  const { data: v } = await supabase.from('reel_versiones').select('numero, huella').eq('proyecto_id', id).order('numero', { ascending: false }).limit(1).maybeSingle();
  const { data: registro } = await supabase.from('reel_aprobaciones').select('decision, version, huella, creado_en, revocada_en, nota').eq('proyecto_id', id).order('creado_en', { ascending: false });
  const r = await leeJson<ResultadoLocal>(join(carpetaDe(user.id, id), 'resultado.json'));
  const obs = [...(r?.observaciones ?? []), ...(r?.master?.qa ?? [])];
  return (
    <main className="mx-auto max-w-lg space-y-3 px-4 py-6">
      <Link href="/reel" className="text-sm text-emerald-700">← Tus reels</Link>
      <h1 className="text-2xl font-bold">{String(p.titulo)}</h1>
      <Sala d={{
        id, titulo: String(p.titulo), estado: String(p.estado), version: v ? Number(v.numero) : null, huella: v ? String(v.huella) : null,
        bloqueos: obs.filter((o) => o.nivel === 'bloquea').map((o) => o.mensaje), avisos: obs.filter((o) => o.nivel === 'aviso').map((o) => o.mensaje),
        carasExtra: (r?.pistas ?? []).filter((x) => x.id !== r?.sujetoId).map((x) => x.id),
        datos: agrupaHallazgos(r?.hallazgos ?? []).map((g, i) => ({ indice: i, texto: `${g.tipo} «${g.muestra}» (s ${g.desde.toFixed(0)}–${g.hasta.toFixed(0)})` })),
        registro: (registro ?? []).map((x) => ({ decision: String(x.decision), version: Number(x.version), huella: String(x.huella), creado_en: String(x.creado_en), revocada_en: x.revocada_en ? String(x.revocada_en) : null, nota: x.nota ? String(x.nota) : null })),
        correo: user.email ?? '',
      }} />
    </main>
  );
}
