/**
 * Lo que una pantalla necesita saber de una organización, leído CON LA SESIÓN de quien mira (RLS). Recibe el cliente
 * inyectado: lo usa la app (sesión por cookies) y el laboratorio (sesión de una cuenta sintética).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EstadoProyecto, Rol } from '../../../../tools/sistema-integrado/dist/index.js';
import type { PerfilOrganizacion } from '../../../../tools/sistema-integrado/dist/agentes/index.js';
import { estadoDesdeFilas } from './estado.ts';

export interface Marca { nombre_corto?: string; color_primario?: string; color_acento?: string; lema?: string }

export interface Organizacion {
  id: string; nombre: string; sector: string; empleados: number; ubicacion: string; es_casa: boolean;
  despacho_id: string | null; perfil: Record<string, unknown>;
}

export interface Proyecto {
  id: string; nombre: string; ediciones: string[]; usa_ia: boolean; disena: boolean;
  diagnostico: Record<string, string>; diagnostico_completo: boolean; no_aplica: Record<string, string>;
}

export interface Contexto {
  userId: string;
  org: Organizacion;
  roles: Rol[];
  despacho: { nombre: string; marca: Marca } | null;
  proyecto: Proyecto | null;
  estado: EstadoProyecto | null;
  sistemasIA: { id: string; nombre: string; proposito: string; papel: string; proveedor: string | null; datos: string; estado_ciclo: string }[];
}

const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** Perfil para los agentes: puestos, nunca personas (AISIA de PRP-008). */
export function perfilDe(ctx: Pick<Contexto, 'org' | 'sistemasIA'>): PerfilOrganizacion {
  const p = ctx.org.perfil;
  return {
    nombre: ctx.org.nombre, sector: ctx.org.sector, empleados: ctx.org.empleados, ubicacion: ctx.org.ubicacion,
    procesos: lista(p.procesos), productos: lista(p.productos), puestos: lista(p.puestos),
    sistemasIA: ctx.sistemasIA.map((s) => ({ nombre: s.nombre, proposito: s.proposito, papel: s.papel, ...(s.proveedor ? { proveedor: s.proveedor } : {}) })),
    clientesTipo: lista(p.clientesTipo), proveedoresClave: lista(p.proveedoresClave), ...(typeof p.notas === 'string' ? { notas: p.notas } : {}),
  };
}

/** Términos propios de la empresa, para el detector de documento genérico (L7). */
export function terminosPropios(ctx: Pick<Contexto, 'org' | 'sistemasIA'>): string[] {
  const p = perfilDe(ctx);
  return [...p.procesos, ...p.productos, ...p.puestos, ...(p.clientesTipo ?? []), ...(p.proveedoresClave ?? []), ...p.sistemasIA.map((s) => s.nombre), p.ubicacion.split(',')[0] ?? ''];
}

export async function estadoDelProyecto(sb: SupabaseClient, proyecto: Proyecto): Promise<EstadoProyecto> {
  const [ev, vin, ap, soa, au, nc] = await Promise.all([
    sb.from('sgi_evidencia_estado').select('id, aprobada').eq('proyecto_id', proyecto.id),
    sb.from('sgi_evidencia_requisito').select('evidencia_id, requisito_id, sgi_evidencia!inner(proyecto_id)').eq('sgi_evidencia.proyecto_id', proyecto.id),
    sb.from('sgi_aprobacion').select('objeto_tipo, fase, decision, revocada_en').eq('proyecto_id', proyecto.id),
    sb.from('sgi_control_soa').select('requisito_id, aplica, justificacion').eq('proyecto_id', proyecto.id),
    sb.from('sgi_auditoria').select('tipo, estado').eq('proyecto_id', proyecto.id),
    sb.from('sgi_no_conformidad').select('estado').eq('proyecto_id', proyecto.id),
  ]);
  for (const r of [ev, vin, ap, soa, au, nc]) if (r.error) throw new Error(`no se pudo leer el proyecto: ${r.error.message}`);
  return estadoDesdeFilas({
    proyecto,
    evidencias: (ev.data ?? []).map((x) => ({ id: String(x.id), aprobada: Boolean(x.aprobada) })),
    vinculos: (vin.data ?? []).map((x) => ({ evidencia_id: String(x.evidencia_id), requisito_id: String(x.requisito_id) })),
    aprobaciones: (ap.data ?? []) as FilasAprobacion[],
    soa: (soa.data ?? []) as { requisito_id: string; aplica: boolean; justificacion: string }[],
    auditorias: (au.data ?? []) as { tipo: string; estado: string }[],
    ncs: (nc.data ?? []) as { estado: string }[],
  });
}
type FilasAprobacion = { objeto_tipo: string; fase: number | null; decision: string; revocada_en: string | null };

/** `null` si quien mira no es miembro (RLS no devuelve la organización). */
export async function cargaContexto(sb: SupabaseClient, orgId: string): Promise<Contexto | null> {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: org } = await sb.from('sgi_organizacion').select('id, nombre, sector, empleados, ubicacion, es_casa, despacho_id, perfil').eq('id', orgId).maybeSingle();
  if (!org) return null;
  const [mem, desp, proy, ia] = await Promise.all([
    sb.from('sgi_membresia').select('rol').eq('organizacion_id', orgId).eq('user_id', user.id),
    org.despacho_id ? sb.from('sgi_despacho').select('nombre, marca').eq('id', org.despacho_id).maybeSingle() : Promise.resolve({ data: null }),
    sb.from('sgi_proyecto').select('id, nombre, ediciones, usa_ia, disena, diagnostico, diagnostico_completo, no_aplica').eq('organizacion_id', orgId).order('creado_en').limit(1).maybeSingle(),
    sb.from('sgi_sistema_ia').select('id, nombre, proposito, papel, proveedor, datos, estado_ciclo').eq('organizacion_id', orgId).order('creado_en'),
  ]);
  const proyecto = (proy.data ?? null) as Proyecto | null;
  return {
    userId: user.id,
    org: org as Organizacion,
    roles: (mem.data ?? []).map((m) => m.rol as Rol),
    despacho: desp.data ? { nombre: String(desp.data.nombre), marca: (desp.data.marca ?? {}) as Marca } : null,
    proyecto,
    estado: proyecto ? await estadoDelProyecto(sb, proyecto) : null,
    sistemasIA: (ia.data ?? []) as Contexto['sistemasIA'],
  };
}
