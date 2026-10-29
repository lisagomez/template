/** Aplica las migraciones de `migraciones/` en orden de nombre. Son idempotentes: aplicarlas otra vez no cambia nada. */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Base } from './tipos.js'

export const DIR_MIGRACIONES = fileURLToPath(new URL('../../migraciones/', import.meta.url))

export function migraciones(dir = DIR_MIGRACIONES): Array<{ nombre: string; sql: string }> {
  return readdirSync(dir).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort().map((nombre) => ({ nombre, sql: readFileSync(`${dir}${nombre}`, 'utf8') }))
}

export async function migra(base: Base, dir = DIR_MIGRACIONES): Promise<string[]> {
  const hechas: string[] = []
  for (const m of migraciones(dir)) {
    try {
      await base.ejecuta(m.sql)
    } catch (e) {
      throw new Error(`migración ${m.nombre}: ${(e as Error).message}`)
    }
    hechas.push(m.nombre)
  }
  return hechas
}
