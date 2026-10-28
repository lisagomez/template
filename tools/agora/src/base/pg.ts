/** El adaptador de Postgres real (node-postgres). La conexión es la del laboratorio; el rol lo fija `como`. */
import pg from 'pg'
import type { Base, Sesion } from './tipos.js'

// numeric → texto exacto (no float): las cifras se comparan al centavo.
pg.types.setTypeParser(1700, (v) => v)
pg.types.setTypeParser(20, (v) => v)

export function basePostgres(url: string, maximo = 5): Base & { version(): Promise<string> } {
  const pool = new pg.Pool({ connectionString: url, max: maximo })
  const sesion = (c: pg.PoolClient | pg.Pool): Sesion => ({
    async consulta<T>(sql: string, params?: readonly unknown[]) {
      return (await c.query(sql, params as unknown[] | undefined)).rows as T[]
    },
  })
  return {
    motor: 'postgres',
    ...sesion(pool),
    async transaccion<T>(fn: (s: Sesion) => Promise<T>) {
      const c = await pool.connect()
      try {
        await c.query('begin')
        const r = await fn(sesion(c))
        await c.query('commit')
        return r
      } catch (e) {
        await c.query('rollback').catch(() => undefined)
        throw e
      } finally {
        c.release()
      }
    },
    async ejecuta(sql: string) { await pool.query(sql) },
    async cierra() { await pool.end() },
    async version() { return ((await pool.query('select version() v')).rows[0] as { v: string }).v },
  }
}
