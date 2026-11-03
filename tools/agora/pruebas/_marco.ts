/**
 * El marco de las suites de Ágora: cada comprobación es CONDUCTA (el intento con el rol real falla o pasa) o
 * ESTRUCTURA (el permiso, la política o la restricción que lo impide existe). Cada SABOTAJE siembra un defecto en
 * una base nueva y exige que su comprobación caiga: una suite que no se pone roja cuando debe no cuenta.
 */
import assert from 'node:assert/strict'
import { como, firmaTarea, NegativaDeLaBase, type Base, type Sesion } from '../dist/index.js'
import { agente, persona, GOLFO, BAJIO, nodo, item, FUENTE_TC } from '../dist/laboratorio/datos.js'
import { baseSembrada, SECRETO, type BaseDePrueba } from './_base.ts'

export { agente, persona, nodo, item, GOLFO, BAJIO, SECRETO }

/**
 * El tipo de cambio de HOY. La serie de la siembra termina el 2026-10-28 y el gasto toma el publicado en los cinco
 * días previos: desde el 2026-11-03 (hora de Ciudad de México) todo gasto registrado «ahora» costaba `null` MXN, y
 * la comprobación del coordinador que lo cobra se puso roja. Lo que registra gasto hoy siembra antes este.
 */
export async function tipoDeCambioDeHoy(base: Base): Promise<void> {
  await base.consulta(`insert into agora.tipo_cambio (fecha, moneda, valor_mxn, fuente, serie, fuente_url, publicado, nota)
    select d, 'USD', 18.9634, $1, $2, $3, d, $4 from (select (now() at time zone 'America/Mexico_City')::date d) x on conflict do nothing`,
    [FUENTE_TC.fuente, FUENTE_TC.serie, FUENTE_TC.url, 'ficticio: el de hoy, para que el gasto del periodo abierto tenga MXN'])
}

/**
 * Gasto de modelo de HOY (periodo abierto) con el tipo de cambio de hoy. La siembra vive en octubre de 2026
 * (`HOY_DEL_PROTOTIPO`) y el «gasto del mes» cuenta solo el periodo abierto: las comprobaciones de topes de gasto
 * que se apoyaban en ella se pusieron rojas el 2026-11-01, al cambiar el mes. Cada una siembra ahora el suyo.
 */
export async function gastaHoy(base: Base, clave: string, cat: string, usd: number): Promise<void> {
  await tipoDeCambioDeHoy(base)
  await base.consulta(`insert into agora.gasto_modelo (org_id, agente_id, ejecutado_por, categoria_id, proveedor, modelo, costo_usd)
    values ($1, $2, $3, $4, 'modelo determinista del laboratorio', 'agora-determinista-0.1', $5)`, [GOLFO, agente(clave), agente('coordinador'), nodo(cat), usd])
}

export interface Ctx {
  base: Base
  comoPersona<T>(clave: string, fn: (s: Sesion) => Promise<T>): Promise<T>
  comoAgente<T>(clave: string, fn: (s: Sesion) => Promise<T>, o?: { secreto?: string; exp?: number; org?: string }): Promise<T>
  comoPuerta<T>(fn: (s: Sesion) => Promise<T>): Promise<T>
  token(clave: string, o?: { secreto?: string; exp?: number; org?: string }): string
}

export function ctx(base: Base): Ctx {
  const orgDe = (clave: string) => (clave.startsWith('bj-') ? BAJIO : GOLFO)
  const token = (clave: string, o: { secreto?: string; exp?: number; org?: string } = {}) =>
    firmaTarea(o.secreto ?? SECRETO, { org: o.org ?? orgDe(clave), agente: agente(clave), ...(o.exp ? { exp: o.exp } : {}) })
  return {
    base,
    token,
    comoPersona: (clave, fn) => como(base, { tipo: 'persona', id: persona(clave) }, fn),
    comoAgente: (clave, fn, o) => como(base, { tipo: 'agente', token: token(clave, o) }, fn),
    comoPuerta: (fn) => como(base, { tipo: 'puerta' }, fn),
  }
}

export interface Comprobacion { fase: string; nombre: string; tipo: 'conducta' | 'estructura'; corre: (c: Ctx) => Promise<void> }
export interface Sabotaje { fase: string; nombre: string; sql: string; caza: RegExp }

/** La base rechaza (con el código o el texto esperado). Si no rechaza, la comprobación falla. */
export async function rechaza(p: Promise<unknown>, motivo: RegExp | string): Promise<void> {
  try {
    await p
  } catch (e) {
    const texto = e instanceof NegativaDeLaBase ? `${e.codigo} ${e.message}` : (e as Error).message
    if (typeof motivo === 'string' ? texto.includes(motivo) : motivo.test(texto)) return
    throw new Error(`rechazó por otra razón: ${texto}`)
  }
  throw new Error(`la base NO rechazó (se esperaba ${motivo})`)
}

export const cuenta = async (s: Sesion, sql: string, p: unknown[] = []) => Number((await s.consulta<{ n: string | number }>(`select count(*) n from (${sql}) x`, p))[0]!.n)
export { assert }

export async function corre(c: Ctx, comprobaciones: readonly Comprobacion[]): Promise<Array<{ nombre: string; ok: boolean; error?: string }>> {
  const r: Array<{ nombre: string; ok: boolean; error?: string }> = []
  for (const k of comprobaciones) {
    try {
      await k.corre(c)
      r.push({ nombre: k.nombre, ok: true })
    } catch (e) {
      r.push({ nombre: k.nombre, ok: false, error: (e as Error).message.split('\n')[0] })
    }
  }
  return r
}

/** Una base nueva y sembrada, con un sabotaje opcional encima. */
export async function preparada(sabotaje = ''): Promise<BaseDePrueba & { c: Ctx }> {
  const b = await baseSembrada()
  if (sabotaje) await b.base.ejecuta(sabotaje)
  return { ...b, c: ctx(b.base) }
}
