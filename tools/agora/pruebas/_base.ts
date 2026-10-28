/**
 * La base de cada prueba: un Postgres NUEVO con las migraciones y la siembra ficticia. Con `AGORA_PG_URL` es un
 * Postgres real (una base recién creada en ese servidor, que se borra al cerrar); sin ella, PGlite en proceso.
 * Las mismas pruebas corren en los dos: el validate usa PGlite, la evidencia de la fase usa Docker.
 */
import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { migra, type Base } from '../dist/index.js'
import { basePglite } from '../dist/base/pglite.js'
import { basePostgres } from '../dist/base/pg.js'
import { siembra } from '../dist/laboratorio/siembra.js'

export const SECRETO = 'secreto-de-tareas-del-laboratorio-0123456789abcdef'
export const URL_PG = process.env.AGORA_PG_URL ?? ''

export interface BaseDePrueba { base: Base & { version(): Promise<string> }; cierra(): Promise<void> }

export async function baseVacia(): Promise<BaseDePrueba> {
  if (!URL_PG) {
    const base = await basePglite()
    return { base, cierra: () => base.cierra() }
  }
  const nombre = `agora_prueba_${randomBytes(5).toString('hex')}`
  const admin = new pg.Client({ connectionString: URL_PG })
  await admin.connect()
  await admin.query(`create database ${nombre}`)
  await admin.end()
  const u = new URL(URL_PG)
  u.pathname = `/${nombre}`
  const base = basePostgres(u.toString())
  return {
    base,
    async cierra() {
      await base.cierra()
      const a = new pg.Client({ connectionString: URL_PG })
      await a.connect()
      await a.query(`drop database if exists ${nombre} with (force)`)
      await a.end()
    },
  }
}

export async function baseSembrada(): Promise<BaseDePrueba> {
  const b = await baseVacia()
  await migra(b.base)
  await siembra(b.base, { secreto: SECRETO })
  return b
}
