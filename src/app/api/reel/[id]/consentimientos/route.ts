import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { carpetaDe, guarda } from '@/features/reel/services/servidor/almacen';
import { conSesion, UUID } from '@/features/reel/services/servidor/sesion';

export const dynamic = 'force-dynamic';

const datos = z.object({
  alias: z.string().trim().min(1).max(60),
  rol: z.enum(['empleado', 'cliente']),
  alcance: z.string().trim().min(1).max(200),
  vigenteHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Registra el consentimiento de una persona (no menores: el formato lo excluye). El documento firmado se
 * queda en el servidor; a Supabase va solo su alias, alcance, vigencia y la huella del documento.
 */
export async function POST(p: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  const ctx = await conSesion(p, true);
  if (ctx instanceof Response) return ctx;
  const form = await p.formData().catch(() => null);
  const doc = form?.get('documento');
  const d = datos.safeParse(Object.fromEntries([...(form?.entries() ?? [])].filter(([k]) => k !== 'documento')));
  if (!d.success || !(doc instanceof File) || doc.size === 0 || doc.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'faltan datos o el documento firmado' }, { status: 400 });
  const bytes = new Uint8Array(await doc.arrayBuffer());
  const huella = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const { data, error } = await ctx.supabase.from('reel_consentimientos').insert({
    proyecto_id: id, alias: d.data.alias, rol: d.data.rol, alcance: d.data.alcance, vigente_hasta: d.data.vigenteHasta, huella_documento: huella,
  }).select('id').single();
  if (error || !data) return NextResponse.json({ error: 'no se pudo registrar' }, { status: 500 });
  await guarda(`${carpetaDe(ctx.usuario.id, id)}/consentimientos`, `${String(data.id)}.bin`, bytes);
  return NextResponse.json({ id: data.id, huella });
}
