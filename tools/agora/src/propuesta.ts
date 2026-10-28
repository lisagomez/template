/**
 * Una propuesta: el cambio que un agente (o una persona sin el rol para hacerlo directo) pide, como DATO canónico
 * con su huella. La base guarda el texto canónico y recalcula la huella; aprobar es firmar ESA huella; aplicar es
 * aplicar ESE texto. Si el ítem cambió entre tanto (`antes` ya no es el valor), no se aplica: se propone de nuevo.
 */
import { z } from 'zod'
import { canoniza, sha256 } from './huella.js'
import type { Sesion } from './base/tipos.js'

export const CLASES = ['editar', 'crear_item', 'mover_fecha', 'asignar', 'asignar_externo', 'cambiar_monto', 'presupuesto', 'tope_gasto', 'tope_cuota', 'estructura', 'reprogramar'] as const
export type Clase = (typeof CLASES)[number]

/** Los campos que cada clase toca (el mismo catálogo que `agora_priv.campos_de`). */
export const CAMPOS_DE: Readonly<Record<string, readonly string[]>> = {
  editar: ['nombre', 'progreso', 'etiquetas', 'prioridad', 'vinculo', 'estado'],
  mover_fecha: ['inicio', 'fin'], reprogramar: ['inicio', 'fin'],
  asignar: ['responsable_persona', 'responsable_agente'], asignar_externo: ['responsable_agente'],
  cambiar_monto: ['monto_mxn'],
}
/** Lo que A2 aplica solo y se deshace con un clic durante 24 h: sin dinero, sin fechas, sin terceros. */
export const REVERSIBLES_A2 = ['nombre', 'progreso', 'etiquetas', 'prioridad'] as const

const Valor = z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())])
export const EsquemaCambio = z.strictObject({ item: z.uuid(), campo: z.string(), antes: Valor, despues: Valor })
export const EsquemaNuevo = z.strictObject({
  clave: z.string().regex(/^[a-z0-9-]{1,40}$/), nombre: z.string().min(2).max(200), grupo: z.string().max(60).optional(),
  inicio: z.iso.date().optional(), fin: z.iso.date().optional(), prioridad: z.enum(['alta', 'media', 'baja']).optional(),
  responsable_persona: z.uuid().optional(), responsable_agente: z.uuid().optional(), etiquetas: z.array(z.string()).optional(),
  monto_mxn: z.number().nonnegative().optional(), depende_de: z.array(z.string()).optional(),
})
export const EsquemaPayload = z.strictObject({
  version: z.literal(1), clase: z.enum(CLASES), categoria: z.uuid(),
  cambios: z.array(EsquemaCambio).optional(), nuevos: z.array(EsquemaNuevo).optional(),
  periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(), importe_mxn: z.number().nonnegative().optional(), motivo: z.string().max(400).optional(),
  agente: z.uuid().optional(), tope: z.enum(['gasto', 'mensajes', 'propuestas']).optional(), antes: z.number().optional(), despues: z.number().optional(),
})
export type Payload = z.infer<typeof EsquemaPayload>
export type Cambio = z.infer<typeof EsquemaCambio>
export type Nuevo = z.infer<typeof EsquemaNuevo>

export interface PropuestaArmada { payload: Payload; canon: string; sha256: string }

export function arma(p: Payload): PropuestaArmada {
  const payload = EsquemaPayload.parse(p)
  const canon = canoniza(payload)
  return { payload, canon, sha256: sha256(canon) }
}

export interface DatosDePropuesta {
  org: string; resumen: string; payload: Payload; nivel?: 'A0' | 'A1' | 'A2' | 'A3'
  autorAgente?: string; autorPersona?: string; solicitadaPor?: string | null; clave?: string; taskId?: string; threadId?: string
}

/** Inserta la propuesta con la sesión de quien la hace (un agente o una persona): la base decide si cabe. */
export async function propone(s: Sesion, d: DatosDePropuesta): Promise<{ id: string; sha256: string }> {
  const a = arma(d.payload)
  const [fila] = await s.consulta<{ id: string; sha256: string }>(
    `insert into agora.propuesta (org_id, categoria_id, clase, autor_agente, autor_persona, solicitada_por, resumen, payload_canon, sha256, nivel, clave, task_id, thread_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     on conflict (clave) do nothing returning id, sha256`,
    [d.org, a.payload.categoria, a.payload.clase, d.autorAgente ?? null, d.autorPersona ?? null, d.solicitadaPor ?? null, d.resumen, a.canon, a.sha256,
      d.nivel ?? 'A1', d.clave ?? null, d.taskId ?? null, d.threadId ?? null])
  if (fila) return fila
  // Ya existía con esa clave (un reintento): se devuelve la misma, no se crea otra.
  const [previa] = await s.consulta<{ id: string; sha256: string }>('select id, sha256 from agora.propuesta where clave = $1', [d.clave])
  if (!previa) throw new Error('la propuesta no se creó y no hay una previa con esa clave')
  return previa
}

/** Una persona decide sobre la huella que VE. La base exige que sea la de la propuesta y que su rol llene la matriz. */
export async function decide(s: Sesion, d: { org: string; propuesta: string; sha256: string; persona: string; decision: 'aprobar' | 'rechazar' | 'a_revision'; motivo?: string }) {
  const [fila] = await s.consulta<{ id: string; rol_usado: string }>(
    `insert into agora.aprobacion (org_id, propuesta_id, decision, sha256, decidida_por, motivo) values ($1, $2, $3, $4, $5, $6) returning id, rol_usado`,
    [d.org, d.propuesta, d.decision, d.sha256, d.persona, d.motivo ?? null])
  return fila!
}

export async function aplica(s: Sesion, propuesta: string): Promise<{ ok: boolean; ya?: boolean; cambios?: number; nuevos?: Record<string, string> }> {
  const [fila] = await s.consulta<{ r: { ok: boolean; ya?: boolean; cambios?: number; nuevos?: Record<string, string> } }>('select agora.aplica_propuesta($1) r', [propuesta])
  return fila!.r
}
