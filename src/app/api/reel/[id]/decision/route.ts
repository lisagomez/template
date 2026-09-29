import { join } from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validaAprobacion, type Observacion } from '../../../../../../tools/reel/dist/index.js';
import { carpetaDe, guarda, leeJson } from '@/features/reel/services/servidor/almacen';
import { conSesion, UUID } from '@/features/reel/services/servidor/sesion';

export const dynamic = 'force-dynamic';

const cuerpo = z.object({
  version: z.number().int().min(1),
  huella: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  decision: z.enum(['aprobada', 'cambio-pedido']),
  nota: z.string().trim().max(500).optional(),
});

/** Aprobar o pedir cambio sobre la versión EXACTA que el dueño vio (su huella). Aprobar ≠ publicar. */
export async function POST(p: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  const ctx = await conSesion(p, true);
  if (ctx instanceof Response) return ctx;
  const d = cuerpo.safeParse(await p.json().catch(() => null));
  if (!d.success) return NextResponse.json({ error: 'decisión inválida' }, { status: 400 });
  const { data: v } = await ctx.supabase.from('reel_versiones').select('id, numero, huella').eq('proyecto_id', id).order('numero', { ascending: false }).limit(1).maybeSingle();
  if (!v) return NextResponse.json({ error: 'no hay versión que decidir' }, { status: 404 });
  const carpeta = carpetaDe(ctx.usuario.id, id);
  const r = await leeJson<{ observaciones: Observacion[]; master?: { qa: Observacion[] } }>(join(carpeta, 'resultado.json'));
  const motivo = validaAprobacion({ numero: Number(v.numero), huella: String(v.huella), bloqueos: [...(r?.observaciones ?? []), ...(r?.master?.qa ?? [])] }, d.data);
  if (motivo) return NextResponse.json({ error: motivo }, { status: 409 });
  const { data: registro, error } = await ctx.supabase.from('reel_aprobaciones').insert({
    proyecto_id: id, version_id: v.id, decision: d.data.decision, nota: d.data.nota ?? null, huella: d.data.huella, version: d.data.version,
  }).select('id, aprobado_por, decision, huella, version, creado_en').single();
  if (error || !registro) return NextResponse.json({ error: 'no se pudo registrar' }, { status: 500 });
  if (d.data.decision === 'aprobada') {
    const cuando = String(registro.creado_en);
    await ctx.supabase.from('reel_proyectos').update({ estado: 'aprobado', aprobado_en: cuando }).eq('id', id);
    await guarda(carpeta, 'registro.json', JSON.stringify({ aprobadoEn: cuando, brutoBorradoEn: null }));
  }
  return NextResponse.json({ registro: { ...registro, correo: ctx.usuario.email } });
}
