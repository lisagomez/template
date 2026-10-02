import { join } from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { carpetaDe, guarda, leeJson } from '@/features/reel/services/servidor/almacen';
import { reprocesa } from '@/features/reel/services/servidor/reproceso';
import { conSesion, UUID } from '@/features/reel/services/servidor/sesion';
import type { DecisionesLocales } from '@/features/reel/types';

export const dynamic = 'force-dynamic';

const ajuste = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('corte'), segundo: z.number().min(0).max(90), hasta: z.number().min(0).max(90) }).refine((a) => a.hasta > a.segundo, 'el tramo termina antes de empezar'),
  z.object({ tipo: z.literal('texto'), segundo: z.number().min(0).max(90), nota: z.string().trim().min(1).max(80) }),
  z.object({ tipo: z.literal('cubrir'), indice: z.number().int().min(0).max(50) }),
  z.object({ tipo: z.literal('cara-consentida'), pista: z.number().int().min(1).max(50) }),
  z.object({ tipo: z.literal('corte-revisado'), clave: z.string().regex(/^\d{1,3}\.\d-\d{1,3}\.\d$/, 'corte inválido') }),
]);

/** Un ajuste del dueño en la sala → versión nueva (y lo aprobado queda revocado). */
export async function POST(p: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  const ctx = await conSesion(p, true);
  if (ctx instanceof Response) return ctx;
  const a = ajuste.safeParse(await p.json().catch(() => null));
  if (!a.success) return NextResponse.json({ error: a.error.issues[0]?.message ?? 'ajuste inválido' }, { status: 400 });
  const { data: v } = await ctx.supabase.from('reel_versiones').select('id').eq('proyecto_id', id).order('numero', { ascending: false }).limit(1).maybeSingle();
  if (!v) return NextResponse.json({ error: 'no encontrado' }, { status: 404 });
  const carpeta = carpetaDe(ctx.usuario.id, id);
  const d = (await leeJson<DecisionesLocales>(join(carpeta, 'decisiones.json'))) ?? { marcas: [], conConsentimiento: [], cubiertos: [] };
  const x = a.data;
  if (x.tipo === 'corte' || x.tipo === 'texto') {
    const marca = x.tipo === 'corte' ? { tipo: 'corte' as const, segundo: x.segundo, hasta: x.hasta } : { tipo: 'texto' as const, segundo: x.segundo, nota: x.nota };
    d.marcas.push(marca);
    await ctx.supabase.from('reel_marcas').insert({ proyecto_id: id, version_id: v.id, tipo: marca.tipo, segundo: marca.segundo, hasta: 'hasta' in marca ? marca.hasta : null, nota: 'nota' in marca ? marca.nota : null });
  }
  if (x.tipo === 'cubrir' && !d.cubiertos.includes(x.indice)) d.cubiertos.push(x.indice);
  if (x.tipo === 'corte-revisado' && !(d.revisados ?? []).includes(x.clave)) d.revisados = [...(d.revisados ?? []), x.clave];
  if (x.tipo === 'cara-consentida') {
    const { count } = await ctx.supabase.from('reel_consentimientos').select('id', { count: 'exact', head: true }).eq('proyecto_id', id).is('revocado_en', null).neq('rol', 'dueno');
    if ((count ?? 0) <= d.conConsentimiento.length) return NextResponse.json({ error: 'Registra primero el consentimiento de esa persona' }, { status: 409 });
    if (!d.conConsentimiento.includes(x.pista)) d.conConsentimiento.push(x.pista);
  }
  await guarda(carpeta, 'decisiones.json', JSON.stringify(d));
  try {
    return NextResponse.json(await reprocesa(ctx.supabase, ctx.usuario.id, id));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error && e.message === 'ocupado' ? 'hay otro reel en proceso' : 'no se pudo reprocesar' }, { status: 500 });
  }
}
