import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { decisionesTrasRetirar, documentoDeConsentimiento, vigenciaDeDocumento, TRANSCRIPCION_CONSERVADA, type VigenciaDeDocumento } from '../../../../../../tools/reel/dist/index.js';
import { borraArchivo, carpetaDe, guarda, leeJson } from '@/features/reel/services/servidor/almacen';
import { reprocesa } from '@/features/reel/services/servidor/reproceso';
import { conSesion, UUID } from '@/features/reel/services/servidor/sesion';
import type { DecisionesLocales } from '@/features/reel/types';

export const dynamic = 'force-dynamic';

const datos = z.object({
  alias: z.string().trim().min(1).max(60),
  rol: z.enum(['empleado', 'cliente']),
  alcance: z.string().trim().min(1).max(200),
  vigenteHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const retiro = z.object({ consentimiento: z.string().regex(UUID) });

/** El aviso de la AISIA firmada (§7, derecho a borrar): lo publicado no se recupera, y el clip original no se edita.
 *  Sin `export`: un `route.ts` de Next solo exporta handlers y configuración. */
const AVISO_AL_RETIRAR = 'Consentimiento retirado: su documento y la transcripción guardada con él se borraron, y lo aprobado quedó revocado. Si ya publicaste el reel, bájalo de tus redes: lo publicado no se puede recuperar. Su voz y su imagen siguen en el clip original hasta que borres el proyecto.';

/**
 * Registra el consentimiento de una persona (no menores: el formato lo excluye). El documento firmado se
 * queda en el servidor; a Supabase va solo su alias, alcance, vigencia y la huella del documento. Después
 * se rehace la versión: un consentimiento cambia lo que bloquea.
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
  const carpeta = carpetaDe(ctx.usuario.id, id);
  await guarda(carpeta, documentoDeConsentimiento(String(data.id)), bytes);
  // Para que el job de retención borre el documento al vencer sin tocar Supabase (nada personal: fecha y huella).
  const vigencia: VigenciaDeDocumento = { consentimiento: String(data.id), vigenteHasta: d.data.vigenteHasta, huella };
  await guarda(carpeta, vigenciaDeDocumento(String(data.id)), JSON.stringify(vigencia));
  try {
    return NextResponse.json({ id: data.id, huella, version: await reprocesa(ctx.supabase, ctx.usuario.id, id) });
  } catch {
    return NextResponse.json({ id: data.id, huella, error: 'Quedó registrado, pero no se pudo preparar la versión nueva: haz cualquier ajuste para reintentarlo' }, { status: 500 });
  }
}

/**
 * Retira un consentimiento (derecho a borrar, AISIA §7). La fila no se borra: queda constancia de que existió
 * y de cuándo se retiró (el esquema solo deja escribir `revocado_en`). Se borra el documento del servidor, se
 * revoca lo aprobado ANTES de reprocesar (si el reproceso falla, no queda aprobada una versión con alguien que
 * se retiró), lo que dependía de esa persona se revisa de nuevo y se rehace la versión.
 */
export async function PATCH(p: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  const ctx = await conSesion(p, true);
  if (ctx instanceof Response) return ctx;
  const r = retiro.safeParse(await p.json().catch(() => null));
  if (!r.success) return NextResponse.json({ error: 'consentimiento inválido' }, { status: 400 });
  const { data, error } = await ctx.supabase.from('reel_consentimientos').update({ revocado_en: new Date().toISOString() })
    .eq('id', r.data.consentimiento).eq('proyecto_id', id).is('revocado_en', null).select('id').maybeSingle();
  if (error) return NextResponse.json({ error: 'no se pudo retirar' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'no existe o ya estaba retirado' }, { status: 404 });
  const carpeta = carpetaDe(ctx.usuario.id, id);
  await borraArchivo(join(carpeta, documentoDeConsentimiento(r.data.consentimiento)));
  await borraArchivo(join(carpeta, vigenciaDeDocumento(r.data.consentimiento))); // la constancia del retiro es la fila
  await borraArchivo(join(carpeta, TRANSCRIPCION_CONSERVADA)); // lleva sus palabras: se va con su consentimiento
  await ctx.supabase.from('reel_aprobaciones').update({ revocada_en: new Date().toISOString() }).eq('proyecto_id', id).is('revocada_en', null);
  const registro = await leeJson<{ brutoBorradoEn?: string | null }>(join(carpeta, 'registro.json'));
  await guarda(carpeta, 'registro.json', JSON.stringify({ aprobadoEn: null, brutoBorradoEn: registro?.brutoBorradoEn ?? null }));
  await ctx.supabase.from('reel_proyectos').update({ aprobado_en: null, estado: 'bloqueado', motivo_bloqueo: 'Se retiró un consentimiento: hay que rehacer la versión' }).eq('id', id);
  const d = (await leeJson<DecisionesLocales>(join(carpeta, 'decisiones.json'))) ?? { marcas: [], conConsentimiento: [], cubiertos: [] };
  await guarda(carpeta, 'decisiones.json', JSON.stringify(decisionesTrasRetirar(d)));
  try {
    return NextResponse.json({ aviso: AVISO_AL_RETIRAR, version: await reprocesa(ctx.supabase, ctx.usuario.id, id) });
  } catch {
    return NextResponse.json({ aviso: AVISO_AL_RETIRAR, error: 'La versión nueva no se pudo preparar: haz cualquier ajuste para reintentarlo' }, { status: 500 });
  }
}
