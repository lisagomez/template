/**
 * La base de cada prueba: un Postgres NUEVO con las migraciones y la siembra ficticia. Con `AGORA_PG_URL` es un
 * Postgres real (una base copiada de una PLANTILLA sembrada, que se borra al cerrar); sin ella, PGlite en proceso
 * (la copia de un volcado sembrado). Sembrar una vez y clonar hace que cada comprobación tenga SU base sin pagar la
 * siembra cada vez. La plantilla lleva en el nombre la huella de las migraciones y del código que siembra: si
 * cambian, es otra.
 */
import { createHash, randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { migra, type Base } from '../dist/index.js'
import { basePglite, type BasePglite } from '../dist/base/pglite.js'
import { basePostgres } from '../dist/base/pg.js'
import { siembra } from '../dist/laboratorio/siembra.js'

export const SECRETO = 'secreto-de-tareas-del-laboratorio-0123456789abcdef'
export const URL_PG = process.env.AGORA_PG_URL ?? ''

export interface BaseDePrueba { base: Base & { version(): Promise<string> }; cierra(): Promise<void> }

const dir = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
function huellaDelCodigo(): string {
  const h = createHash('sha256')
  for (const d of ['../migraciones/', '../dist/', '../dist/laboratorio/', '../dist/base/']) {
    for (const f of readdirSync(dir(d)).filter((x) => /\.(sql|js)$/.test(x)).sort()) h.update(f).update(readFileSync(dir(d) + f))
  }
  return h.digest('hex').slice(0, 12)
}

export async function baseVacia(): Promise<BaseDePrueba> {
  if (!URL_PG) {
    const base = await basePglite()
    return { base, cierra: () => base.cierra() }
  }
  return copiaDe(null)
}

async function admin<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: URL_PG })
  await c.connect()
  try { return await fn(c) } finally { await c.end() }
}

async function copiaDe(plantilla: string | null): Promise<BaseDePrueba> {
  const nombre = `agora_prueba_${randomBytes(5).toString('hex')}`
  await admin((c) => c.query(`create database ${nombre}${plantilla ? ` template ${plantilla}` : ''}`))
  const u = new URL(URL_PG)
  u.pathname = `/${nombre}`
  const base = basePostgres(u.toString())
  return { base, async cierra() { await base.cierra(); await admin((c) => c.query(`drop database if exists ${nombre} with (force)`)) } }
}

let volcado: Blob | null = null
let plantillaPg: string | null = null

export async function baseSembrada(): Promise<BaseDePrueba> {
  if (!URL_PG) {
    if (!volcado) {
      const b = await basePglite()
      await migra(b)
      await siembra(b, { secreto: SECRETO })
      volcado = await (b as BasePglite).volcado()
      await b.cierra()
    }
    const base = await basePglite(volcado)
    return { base, cierra: () => base.cierra() }
  }
  if (!plantillaPg) {
    const nombre = `agora_plantilla_${huellaDelCodigo()}`
    const existe = await admin(async (c) => (await c.query('select 1 from pg_database where datname = $1', [nombre])).rowCount === 1)
    if (!existe) {
      const tmp = `${nombre}_en_obra_${randomBytes(3).toString('hex')}`
      await admin((c) => c.query(`create database ${tmp}`))
      const u = new URL(URL_PG)
      u.pathname = `/${tmp}`
      const b = basePostgres(u.toString())
      await migra(b)
      await siembra(b, { secreto: SECRETO })
      await b.cierra()
      await admin(async (c) => { await c.query(`alter database ${tmp} rename to ${nombre}`).catch(async () => { await c.query(`drop database if exists ${tmp} with (force)`) }) })
    }
    plantillaPg = nombre
  }
  return copiaDe(plantillaPg)
}
