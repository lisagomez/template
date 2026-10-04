/**
 * La cadena de eventos de una incidencia: solo se agrega; cada evento lleva su secuencia, el hash
 * del anterior y su propio hash SHA-256 sobre el REGISTRO COMPLETO canonicalizado (claves
 * ordenadas, sin espacios). Es el diseño de la cadena de etiquetas GS1 (`tools/etiquetas-gs1/src/
 * cadena.ts`) llevado a incidencias: hashear solo `datos + anterior` dejaría cambiar el actor o la
 * fecha sin romper nada.
 *
 * Tamper-EVIDENT, no tamper-proof: quien escribe el almacén puede recalcular la cadena entera. La
 * tabla de eventos es de solo agregar en la base y el anclaje externo queda para producción. El
 * actor es un seudónimo o el id de un agente, nunca un nombre.
 */
import { createHash } from 'node:crypto'

export type Json = null | boolean | number | string | readonly Json[] | { readonly [k: string]: Json }

export type TipoEvento =
  | 'RECIBIDA' | 'ADJUNTO_LEIDO' | 'CATEGORIZADA' | 'VEREDICTO_GRAFO' | 'PLAN_PREPARADO'
  | 'VEREDICTO_SUPERVISOR' | 'ENVIADA_A_SALA' | 'APROBADA' | 'A_REVISION' | 'APLICADA_EN_SIMULADOR'
  | 'ANONIMIZADA' | 'EN_CUARENTENA' | 'EN_SANDBOX' | 'PROPUESTA' | 'PRIMERA_RESPUESTA'
  | 'ESPERA_CLIENTE' | 'RESPUESTA_CLIENTE' | 'CAMBIO_PRIORIDAD' | 'ESCALADA' | 'RESUELTA' | 'REABIERTA' | 'CERRADA'

export interface EventoIncidencia {
  readonly v: 1
  readonly incidencia: string
  readonly seq: number
  /** ISO con hora, UTC. */
  readonly fecha: string
  readonly tipo: TipoEvento
  /** Seudónimo de persona (`usr-…`) o id de agente (`agente:…`); nunca un nombre. */
  readonly actor: string
  readonly datos: { readonly [k: string]: Json }
  readonly anterior: string
  readonly hash: string
}

export type Borrador = Pick<EventoIncidencia, 'fecha' | 'tipo' | 'actor' | 'datos'>

/** JSON canónico: claves ordenadas en todos los niveles, sin espacios. */
export function canonico(v: Json): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map((x) => canonico(x as Json)).join(',')}]`
  const o = v as { readonly [k: string]: Json }
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonico(o[k] as Json)}`).join(',')}}`
}

export const sha256 = (texto: string): string => createHash('sha256').update(texto, 'utf8').digest('hex')

export const genesis = (incidencia: string): string => sha256(canonico({ genesis: incidencia }))

export function hashDeEvento(e: Omit<EventoIncidencia, 'hash'>): string {
  return sha256(canonico(e as unknown as Json))
}

/** El evento siguiente de la cadena (no la modifica: devuelve el nuevo). */
export function nuevoEvento(incidencia: string, cadena: readonly EventoIncidencia[], b: Borrador): EventoIncidencia {
  if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+ [A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/.test(b.actor)) throw new Error('el actor de un evento es un seudónimo, no un nombre')
  const previo = cadena.at(-1)
  const sinHash = { v: 1 as const, incidencia, seq: (previo?.seq ?? 0) + 1, fecha: b.fecha, tipo: b.tipo, actor: b.actor, datos: b.datos, anterior: previo?.hash ?? genesis(incidencia) }
  return { ...sinHash, hash: hashDeEvento(sinHash) }
}

export function agrega(incidencia: string, cadena: readonly EventoIncidencia[], b: Borrador): EventoIncidencia[] {
  return [...cadena, nuevoEvento(incidencia, cadena, b)]
}

export type MotivoRotura = 'hash' | 'enlace' | 'secuencia' | 'incidencia'

export type Verificacion =
  | { readonly ok: true; readonly n: number; readonly cabeza: string }
  | { readonly ok: false; readonly n: number; readonly rotura: { readonly seq: number; readonly motivo: MotivoRotura; readonly detalle: string } }

/** Recorre la cadena: secuencia contigua desde 1, enlace con el anterior y hash del registro completo. */
export function verificaCadena(incidencia: string, eventos: readonly EventoIncidencia[]): Verificacion {
  let anterior = genesis(incidencia)
  for (let i = 0; i < eventos.length; i++) {
    const e = eventos[i]!
    const rompe = (motivo: MotivoRotura, detalle: string): Verificacion => ({ ok: false, n: eventos.length, rotura: { seq: e.seq, motivo, detalle } })
    if (e.incidencia !== incidencia) return rompe('incidencia', `el evento es de ${e.incidencia}`)
    if (e.seq !== i + 1) return rompe('secuencia', `se esperaba la secuencia ${i + 1}`)
    if (e.anterior !== anterior) return rompe('enlace', 'no enlaza con el evento anterior')
    const { hash, ...resto } = e
    if (hashDeEvento(resto) !== hash) return rompe('hash', 'el registro no corresponde a su hash')
    anterior = hash
  }
  return { ok: true, n: eventos.length, cabeza: anterior }
}
