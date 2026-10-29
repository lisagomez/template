/** El adaptador de PGlite (Postgres 17 en WebAssembly, en proceso): el validate corre las suites sin Docker. */
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import type { Base, Sesion } from './tipos.js'

type Consultable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }

// numeric → texto exacto, igual que en ./pg: las cifras se comparan al centavo en los dos motores.
const TIPOS = { parsers: { 1700: (v: string) => v, 20: (v: string) => v } }

export interface BasePglite extends Base { version(): Promise<string>; volcado(): Promise<Blob> }

/** Una base PGlite nueva, o la copia de un volcado (así una base sembrada se clona en lugar de volver a sembrarse). */
export async function basePglite(desde?: Blob): Promise<BasePglite> {
  const db = await PGlite.create({ extensions: { pgcrypto }, ...TIPOS, ...(desde ? { loadDataDir: desde } : {}) })
  const sesion = (c: Consultable): Sesion => ({
    async consulta<T>(sql: string, params?: readonly unknown[]) {
      return (await c.query(sql, params as unknown[] | undefined)).rows as T[]
    },
  })
  return {
    motor: 'pglite',
    ...sesion(db as unknown as Consultable),
    transaccion: <T>(fn: (s: Sesion) => Promise<T>) => db.transaction((tx) => fn(sesion(tx as unknown as Consultable))) as Promise<T>,
    async ejecuta(sql: string) { await db.exec(sql) },
    async cierra() { await db.close() },
    async version() { return ((await db.query('select version() v')).rows[0] as { v: string }).v },
    async volcado() { return (await db.dumpDataDir('none')) as Blob },
  }
}
