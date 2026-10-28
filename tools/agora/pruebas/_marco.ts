/**
 * El marco de las suites de Ágora: cada comprobación es CONDUCTA (el intento con el rol real falla o pasa) o
 * ESTRUCTURA (el permiso, la política o la restricción que lo impide existe). Cada SABOTAJE siembra un defecto en
 * una base nueva y exige que su comprobación caiga: una suite que no se pone roja cuando debe no cuenta.
 */
import assert from 'node:assert/strict'
import { como, firmaTarea, NegativaDeLaBase, type Base, type Sesion } from '../dist/index.js'
import { agente, persona, GOLFO, BAJIO, nodo, item } from '../dist/laboratorio/datos.js'
import { baseSembrada, SECRETO, type BaseDePrueba } from './_base.ts'

export { agente, persona, nodo, item, GOLFO, BAJIO, SECRETO }

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
