'use server';
/**
 * Acciones del sistema integrado. Cada una: sesión obligatoria, entrada validada con Zod, lectura con la sesión de quien
 * actúa (RLS) y, donde aplica, el MOTOR consultado antes para dar un mensaje claro. La base es la autoridad final:
 * rol, huella y puerta se vuelven a comprobar en SQL. Nada se aprueba solo; ningún agente cierra nada.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { autorizaCierre, puedeAprobar, type Rol, type TipoAprobable } from '../../../../tools/sistema-integrado/dist/index.js';
import type { Fase } from '../../../../tools/sistema-integrado/dist/catalogo/index.js';
import { cargaContexto, type Contexto } from './contexto.ts';
import { modeloDe } from './llm.ts';
import {
  correYMaterializa, deProyecto, entradaAuditoria, entradaCapacitacion, entradaContexto, entradaDiagnostico, entradaDocumental,
  entradaKpis, entradaPortafolio, entradaProveedores, entradaRiesgos, type EnfoqueRiesgos,
} from './agentes.ts';
import { fotografia, type Foto } from './fotos.ts';

const uuid = z.string().uuid();
const volver = (ruta: string, aviso: string, tipo: 'ok' | 'error' = 'ok'): never =>
  redirect(`${ruta}${ruta.includes('?') ? '&' : '?'}${tipo === 'ok' ? 'aviso' : 'error'}=${encodeURIComponent(aviso.slice(0, 400))}`);

async function sesion(orgId: string) {
  if (!uuid.safeParse(orgId).success) redirect('/sgi');
  const sb = await createClient();
  const ctx = await cargaContexto(sb, orgId);
  if (!ctx) redirect('/sgi');
  return { sb, ctx };
}

/** Los mensajes de la base llegan técnicos: aquí se dicen en claro. */
function enClaro(m: string): string {
  if (/row-level security|42501/i.test(m) && !/sgi:/.test(m)) return 'No tienes permiso para eso con tus roles en esta organización.';
  const sgi = /sgi: (.*)/.exec(m);
  return sgi ? sgi[1]!.replace(/[«»]/g, '"') : m;
}

const modelo = (clase: 'agente-sgi-redaccion' | 'agente-sgi-evaluacion') => modeloDe(clase, process.env.OPENROUTER_API_KEY);

// ───────── modo pyme / experto ─────────
export async function cambiarModo(datos: FormData) {
  const modo = datos.get('modo') === 'pyme' ? 'pyme' : 'experto';
  (await cookies()).set('sgi_modo', modo, { path: '/sgi', sameSite: 'lax', httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  const destino = z.string().startsWith('/sgi').max(300).safeParse(datos.get('volver'));
  redirect(destino.success ? destino.data : '/sgi');
}

// ───────── diagnóstico ─────────
export async function guardarDiagnostico(orgId: string, datos: FormData) {
  const { sb, ctx } = await sesion(orgId);
  if (!ctx.proyecto) volver(`/sgi/${orgId}`, 'Sin proyecto', 'error');
  const respuestas: Record<string, string> = { ...ctx.proyecto!.diagnostico };
  for (const [k, v] of datos.entries()) {
    if (k.startsWith('r:') && ['si', 'parcial', 'no', 'no-se'].includes(String(v))) respuestas[k.slice(2)] = String(v);
  }
  const completo = datos.get('completo') === 'si';
  const r = await sb.from('sgi_proyecto').update({ diagnostico: respuestas, ...(completo ? { diagnostico_completo: true } : {}) }).eq('id', ctx.proyecto!.id);
  if (r.error) volver(`/sgi/${orgId}/diagnostico`, enClaro(r.error.message), 'error');
  revalidatePath(`/sgi/${orgId}`, 'layout');
  volver(`/sgi/${orgId}/diagnostico`, completo ? 'Diagnóstico guardado y marcado como completo.' : 'Respuestas guardadas.');
}

// ───────── agentes (siempre proponen) ─────────
async function trasCorrida(orgId: string, destino: string, c: Awaited<ReturnType<typeof correYMaterializa>>) {
  revalidatePath(`/sgi/${orgId}`, 'layout');
  const version = c.creados.find((x) => x.tabla === 'sgi_documento_version');
  if (c.ok && version) volver(`/sgi/${orgId}/documentos/${version.id}`, c.mensaje);
  volver(destino, c.mensaje, c.ok ? 'ok' : 'error');
}

export async function generarInformeGap(orgId: string) {
  const { sb, ctx } = await sesion(orgId);
  if (!deProyecto(ctx)) volver(`/sgi/${orgId}`, 'Sin proyecto', 'error');
  const c = await correYMaterializa(sb, ctx as never, 'diagnostico', entradaDiagnostico(ctx as never), modelo('agente-sgi-evaluacion'));
  await trasCorrida(orgId, `/sgi/${orgId}/diagnostico`, c);
}

const pedidoDoc = z.object({
  tipo: z.enum(['politica', 'procedimiento', 'formato', 'plan_proyecto', 'plan_capacitacion', 'alcance', 'contexto', 'informe']),
  titulo: z.string().trim().min(3).max(200),
  requisitos: z.string().max(2000).transform((s) => s.split(/[\s,]+/).filter(Boolean)),
  instruccion: z.string().trim().max(1000).optional(),
});
export async function redactarDocumento(orgId: string, datos: FormData) {
  const { sb, ctx } = await sesion(orgId);
  const p = pedidoDoc.safeParse({ tipo: datos.get('tipo'), titulo: datos.get('titulo'), requisitos: datos.get('requisitos') ?? '', instruccion: datos.get('instruccion') || undefined });
  if (!p.success || !deProyecto(ctx)) volver(`/sgi/${orgId}/documentos`, p.success ? 'Sin proyecto' : (p.error.issues[0]?.message ?? 'Datos inválidos'), 'error');
  const pedido = p.data!;
  const c = await correYMaterializa(sb, ctx as never, 'documental', entradaDocumental(ctx as never, pedido), modelo('agente-sgi-redaccion'), { tipoDocumento: pedido.tipo, tituloDocumento: pedido.titulo });
  await trasCorrida(orgId, `/sgi/${orgId}/documentos`, c);
}

export async function proponer(orgId: string, datos: FormData) {
  const { sb, ctx } = await sesion(orgId);
  if (!deProyecto(ctx)) volver(`/sgi/${orgId}`, 'Sin proyecto', 'error');
  const que = z.enum(['contexto', 'riesgos', 'impacto', 'soa', 'capacitacion', 'proveedores', 'kpis', 'reporte']).safeParse(datos.get('que'));
  const destino = z.string().startsWith(`/sgi/${orgId}`).max(300).safeParse(datos.get('volver'));
  const ruta = destino.success ? destino.data : `/sgi/${orgId}`;
  if (!que.success) volver(ruta, 'Petición inválida', 'error');
  const c2 = ctx as never;
  let c;
  switch (que.data!) {
    case 'contexto': c = await correYMaterializa(sb, c2, 'contexto', entradaContexto(c2), modelo('agente-sgi-redaccion')); break;
    case 'riesgos': case 'impacto': case 'soa': {
      const previos = await sb.from('sgi_riesgo').select('descripcion').eq('proyecto_id', ctx.proyecto!.id);
      const enfoque: EnfoqueRiesgos = que.data === 'soa' ? 'soa' : que.data === 'impacto' ? 'impacto' : 'riesgos';
      c = await correYMaterializa(sb, c2, 'riesgos', entradaRiesgos(c2, enfoque, (previos.data ?? []).map((x) => String(x.descripcion))), modelo('agente-sgi-evaluacion'));
      break;
    }
    case 'capacitacion': c = await correYMaterializa(sb, c2, 'capacitacion', entradaCapacitacion(c2), modelo('agente-sgi-redaccion')); break;
    case 'proveedores': {
      const prov = await sb.from('sgi_proveedor').select('nombre, tipo, suministra').eq('organizacion_id', orgId);
      c = await correYMaterializa(sb, c2, 'proveedores', entradaProveedores(c2, (prov.data ?? []) as never), modelo('agente-sgi-redaccion'));
      break;
    }
    case 'kpis': c = await correYMaterializa(sb, c2, 'kpis', entradaKpis(c2), modelo('agente-sgi-redaccion')); break;
    case 'reporte': c = await correYMaterializa(sb, c2, 'portafolio', entradaPortafolio(c2), modelo('agente-sgi-redaccion')); break;
  }
  await trasCorrida(orgId, ruta, c!);
}

export async function agenteAuditoria(orgId: string, datos: FormData) {
  const { sb, ctx } = await sesion(orgId);
  const auditoriaId = uuid.safeParse(datos.get('auditoria'));
  if (!deProyecto(ctx) || !auditoriaId.success) volver(`/sgi/${orgId}/auditoria`, 'Petición inválida', 'error');
  const au = await sb.from('sgi_auditoria').select('alcance').eq('id', auditoriaId.data!).single();
  const notas = z.string().trim().max(4000).safeParse(datos.get('notas') ?? '');
  const c = await correYMaterializa(sb, ctx as never, 'auditoria', entradaAuditoria(ctx as never, String(au.data?.alcance ?? ''), notas.success && notas.data ? notas.data : undefined), modelo('agente-sgi-evaluacion'), { auditoriaId: auditoriaId.data! });
  await trasCorrida(orgId, `/sgi/${orgId}/auditoria`, c);
}

// ───────── documentos: revisión, foto, aprobación, cierre de fase ─────────
export async function enviarARevision(orgId: string, datos: FormData) {
  const { sb } = await sesion(orgId);
  const v = uuid.safeParse(datos.get('version'));
  if (!v.success) volver(`/sgi/${orgId}/documentos`, 'Versión inválida', 'error');
  const r = await sb.from('sgi_documento_version').update({ estado: 'en_revision' }).eq('id', v.data!).eq('generico', false).select('id');
  revalidatePath(`/sgi/${orgId}`, 'layout');
  if (r.error || !r.data?.length) volver(`/sgi/${orgId}/documentos/${v.data!}`, r.error ? enClaro(r.error.message) : 'Un documento genérico no pasa a revisión: agrégale los datos de la empresa y genera otra versión.', 'error');
  volver(`/sgi/${orgId}/documentos/${v.data!}`, 'Enviado a revisión.');
}

export async function fotografiar(orgId: string, datos: FormData) {
  const { sb, ctx } = await sesion(orgId);
  const f = z.enum(['riesgos', 'soa', 'evaluacion_impacto', 'objetivos', 'contexto', 'competencias']).safeParse(datos.get('foto'));
  if (!f.success) volver(`/sgi/${orgId}`, 'Petición inválida', 'error');
  const r = await fotografia(sb, ctx as Contexto, f.data as Foto);
  revalidatePath(`/sgi/${orgId}`, 'layout');
  if ('error' in r) volver(`/sgi/${orgId}`, enClaro(r.error), 'error');
  volver(`/sgi/${orgId}/documentos/${(r as { versionId: string }).versionId}`, 'Versión lista para revisión: la aprueba quien tiene el rol.');
}

const aprobacion = z.object({
  objeto_tipo: z.enum(['politica', 'soa', 'evaluacion_impacto', 'objetivos', 'riesgos', 'plan_proyecto', 'procedimiento', 'documento_general', 'evidencia', 'plan_capacitacion', 'proveedor', 'hallazgo', 'eficacia_accion']),
  objeto_id: z.string().uuid(),
  huella: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  rol: z.enum(['consultor', 'admin_pyme', 'alta_direccion', 'dueno_proceso', 'auditor_interno']),
  decision: z.enum(['aprobado', 'rechazado']),
  motivo: z.string().trim().max(1000).optional(),
  volver: z.string().startsWith('/sgi/').max(300),
});
export async function aprobar(orgId: string, datos: FormData) {
  const { sb, ctx } = await sesion(orgId);
  const a = aprobacion.safeParse(Object.fromEntries([...datos.entries()].map(([k, v]) => [k, v === '' ? undefined : String(v)])));
  if (!a.success) volver(`/sgi/${orgId}`, a.error.issues[0]?.message ?? 'Datos inválidos', 'error');
  const d = a.data!;
  if (!ctx.roles.includes(d.rol as Rol)) volver(d.volver, `No tienes el rol «${d.rol}» en esta organización.`, 'error');
  if (!puedeAprobar(d.objeto_tipo as TipoAprobable, d.rol as Rol)) volver(d.volver, `Con el rol «${d.rol}» no se aprueba esto. Lo aprueba: ${quienAprueba(d.objeto_tipo)}.`, 'error');
  if (d.decision === 'rechazado' && !d.motivo) volver(d.volver, 'Para rechazar hay que decir por qué.', 'error');
  const r = await sb.from('sgi_aprobacion').insert({ organizacion_id: orgId, objeto_tipo: d.objeto_tipo, objeto_id: d.objeto_id, huella: d.huella, decision: d.decision, motivo: d.motivo ?? null, rol: d.rol });
  revalidatePath(`/sgi/${orgId}`, 'layout');
  if (r.error) volver(d.volver, enClaro(r.error.message), 'error');
  volver(d.volver, d.decision === 'aprobado' ? 'Aprobado: queda registro de quién, cuándo, con qué rol y qué versión exacta.' : 'Rechazado, con su motivo.');
}

function quienAprueba(tipo: string): string {
  const roles: Record<string, string> = { politica: 'alta dirección', soa: 'alta dirección', evaluacion_impacto: 'alta dirección', objetivos: 'alta dirección', riesgos: 'alta dirección o admin', plan_proyecto: 'alta dirección o admin', procedimiento: 'admin o dueño de proceso', documento_general: 'admin o alta dirección', evidencia: 'admin, dueño de proceso o alta dirección', plan_capacitacion: 'admin', proveedor: 'admin', hallazgo: 'auditor interno', eficacia_accion: 'auditor interno o admin' };
  return roles[tipo] ?? 'el rol correspondiente';
}

export async function cerrarFase(orgId: string, datos: FormData) {
  const { sb, ctx } = await sesion(orgId);
  const fase = z.coerce.number().int().min(0).max(8).safeParse(datos.get('fase'));
  const rol = z.enum(['admin_pyme', 'alta_direccion', 'dueno_proceso', 'auditor_interno', 'consultor']).safeParse(datos.get('rol'));
  if (!fase.success || !rol.success || !ctx.estado || !ctx.proyecto) volver(`/sgi/${orgId}`, 'Petición inválida', 'error');
  const ok = autorizaCierre(ctx.estado!, fase.data as Fase, rol.data as Rol);
  if (!ok.ok) volver(`/sgi/${orgId}`, ok.motivo, 'error');
  if (!ctx.roles.includes(rol.data as Rol)) volver(`/sgi/${orgId}`, 'No tienes ese rol en esta organización.', 'error');
  const r = await sb.from('sgi_aprobacion').insert({ organizacion_id: orgId, proyecto_id: ctx.proyecto!.id, objeto_tipo: 'cierre_fase', fase: fase.data, decision: 'aprobado', rol: rol.data });
  revalidatePath(`/sgi/${orgId}`, 'layout');
  if (r.error) volver(`/sgi/${orgId}`, enClaro(r.error.message), 'error');
  volver(`/sgi/${orgId}`, `Fase ${fase.data} cerrada.`);
}

// ───────── evidencias ─────────
const evidencia = z.object({
  titulo: z.string().trim().min(3).max(200),
  tipo: z.enum(['documento', 'registro', 'acta', 'foto', 'otro']),
  contenido: z.string().trim().max(20000),
  requisitos: z.array(z.string().regex(/^SGI-/)).min(1, 'Liga la evidencia a al menos un requisito'),
});
export async function subirEvidencia(orgId: string, datos: FormData) {
  const { sb, ctx } = await sesion(orgId);
  const e = evidencia.safeParse({ titulo: datos.get('titulo'), tipo: datos.get('tipo'), contenido: datos.get('contenido') ?? '', requisitos: datos.getAll('requisitos').map(String) });
  if (!e.success || !ctx.proyecto) volver(`/sgi/${orgId}/evidencias`, e.success ? 'Sin proyecto' : (e.error.issues[0]?.message ?? 'Datos inválidos'), 'error');
  const ev = await sb.from('sgi_evidencia').insert({ organizacion_id: orgId, proyecto_id: ctx.proyecto!.id, titulo: e.data!.titulo, tipo: e.data!.tipo, contenido: e.data!.contenido }).select('id').single();
  if (ev.error) volver(`/sgi/${orgId}/evidencias`, enClaro(ev.error.message), 'error');
  const v = await sb.from('sgi_evidencia_requisito').insert(e.data!.requisitos.map((r) => ({ evidencia_id: ev.data!.id, requisito_id: r, organizacion_id: orgId })));
  revalidatePath(`/sgi/${orgId}`, 'layout');
  if (v.error) volver(`/sgi/${orgId}/evidencias`, enClaro(v.error.message), 'error');
  volver(`/sgi/${orgId}/evidencias`, 'Evidencia registrada: cuenta en el avance cuando la aprueba quien tiene el rol.');
}

// ───────── mejora: NC y acciones ─────────
export async function crearNc(orgId: string, datos: FormData) {
  const { sb, ctx } = await sesion(orgId);
  const h = uuid.safeParse(datos.get('hallazgo'));
  if (!h.success || !ctx.proyecto) volver(`/sgi/${orgId}/auditoria`, 'Petición inválida', 'error');
  const hal = await sb.from('sgi_hallazgo').select('requisito_id, descripcion, estado').eq('id', h.data!).single();
  if (hal.data?.estado !== 'firmado') volver(`/sgi/${orgId}/auditoria`, 'Primero el auditor firma el hallazgo.', 'error');
  const r = await sb.from('sgi_no_conformidad').insert({ organizacion_id: orgId, proyecto_id: ctx.proyecto!.id, hallazgo_id: h.data, requisito_id: hal.data!.requisito_id, descripcion: String(hal.data!.descripcion).slice(0, 2000) });
  revalidatePath(`/sgi/${orgId}`, 'layout');
  if (r.error) volver(`/sgi/${orgId}/auditoria`, enClaro(r.error.message), 'error');
  volver(`/sgi/${orgId}/auditoria`, 'No conformidad abierta.');
}

export async function agregarAccion(orgId: string, datos: FormData) {
  const { sb } = await sesion(orgId);
  const a = z.object({ nc: z.string().uuid(), accion: z.string().trim().min(5).max(1000), responsable: z.string().trim().max(80), vence: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
    .safeParse({ nc: datos.get('nc'), accion: datos.get('accion'), responsable: datos.get('responsable') ?? '', vence: datos.get('vence') || undefined });
  if (!a.success) volver(`/sgi/${orgId}/auditoria`, a.error.issues[0]?.message ?? 'Datos inválidos', 'error');
  const r = await sb.from('sgi_accion_correctiva').insert({ no_conformidad_id: a.data!.nc, organizacion_id: orgId, accion: a.data!.accion, responsable_puesto: a.data!.responsable, vence: a.data!.vence ?? null });
  if (!r.error) await sb.from('sgi_no_conformidad').update({ estado: 'en_tratamiento' }).eq('id', a.data!.nc).eq('estado', 'abierta');
  revalidatePath(`/sgi/${orgId}`, 'layout');
  if (r.error) volver(`/sgi/${orgId}/auditoria`, enClaro(r.error.message), 'error');
  volver(`/sgi/${orgId}/auditoria`, 'Acción correctiva registrada.');
}

export async function marcarHecha(orgId: string, datos: FormData) {
  const { sb } = await sesion(orgId);
  const a = uuid.safeParse(datos.get('accion'));
  if (!a.success) volver(`/sgi/${orgId}/auditoria`, 'Petición inválida', 'error');
  const r = await sb.from('sgi_accion_correctiva').update({ estado: 'hecha' }).eq('id', a.data!).select('id');
  revalidatePath(`/sgi/${orgId}`, 'layout');
  if (r.error) volver(`/sgi/${orgId}/auditoria`, enClaro(r.error.message), 'error');
  volver(`/sgi/${orgId}/auditoria`, 'Acción marcada como hecha: falta que se verifique su eficacia.');
}

export async function nuevaAuditoria(orgId: string, datos: FormData) {
  const { sb, ctx } = await sesion(orgId);
  const a = z.object({ tipo: z.enum(['interna', 'simulacro']), alcance: z.string().trim().min(2).max(1000), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
    .safeParse({ tipo: datos.get('tipo'), alcance: datos.get('alcance'), fecha: datos.get('fecha') });
  if (!a.success || !ctx.proyecto) volver(`/sgi/${orgId}/auditoria`, a.success ? 'Sin proyecto' : (a.error.issues[0]?.message ?? 'Datos inválidos'), 'error');
  const r = await sb.from('sgi_auditoria').insert({ organizacion_id: orgId, proyecto_id: ctx.proyecto!.id, ...a.data });
  revalidatePath(`/sgi/${orgId}`, 'layout');
  if (r.error) volver(`/sgi/${orgId}/auditoria`, enClaro(r.error.message), 'error');
  volver(`/sgi/${orgId}/auditoria`, 'Auditoría programada.');
}

// ───────── consultor: marca blanca ─────────
export async function guardarMarca(datos: FormData) {
  const sb = await createClient();
  const m = z.object({
    despacho: z.string().uuid(), nombre_corto: z.string().trim().min(2).max(40), lema: z.string().trim().max(120),
    color_primario: z.string().regex(/^#[0-9a-fA-F]{6}$/), color_acento: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }).safeParse(Object.fromEntries(datos.entries()));
  if (!m.success) volver('/sgi/consultor', m.error.issues[0]?.message ?? 'Datos inválidos', 'error');
  const { despacho, ...marca } = m.data!;
  const r = await sb.from('sgi_despacho').update({ marca }).eq('id', despacho).select('id');
  revalidatePath('/sgi', 'layout');
  if (r.error || !r.data?.length) volver('/sgi/consultor', r.error ? enClaro(r.error.message) : 'Solo los miembros del despacho cambian su marca.', 'error');
  volver('/sgi/consultor', 'Marca guardada: tus clientes la ven en su sistema.');
}

export async function marcarRealizada(orgId: string, datos: FormData) {
  const { sb } = await sesion(orgId);
  const a = uuid.safeParse(datos.get('auditoria'));
  if (!a.success) volver(`/sgi/${orgId}/auditoria`, 'Petición inválida', 'error');
  const r = await sb.from('sgi_auditoria').update({ estado: 'realizada' }).eq('id', a.data!).select('id');
  revalidatePath(`/sgi/${orgId}`, 'layout');
  if (r.error || !r.data?.length) volver(`/sgi/${orgId}/auditoria`, r.error ? enClaro(r.error.message) : 'No se encontró la auditoría.', 'error');
  volver(`/sgi/${orgId}/auditoria`, 'Auditoría marcada como realizada.');
}
