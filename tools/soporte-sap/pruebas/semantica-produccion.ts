/**
 * La capa semántica contra el ESQUEMA DEL PRODUCTO: los modelos de staging de dbt, tal como los compila
 * el target `produccion`, corren con el rol de métricas (lee lo que necesita y nada más), materializan
 * en `ss_semantica` y no pueden crear nada en `public`. Un modelo saboteado que lea texto se cae.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { baseSoporte, comoServicio, falla, tokenDe, ORG } from './_base.ts'
import { HERRAMIENTA } from './_ayuda.ts'

const METRICAS = tokenDe(ORG.L, 'soporte_sap_metricas')
const STAGING = join(HERRAMIENTA, 'semantica', 'modelos', 'staging')

/** Lo que dbt compila con `--vars '{laboratorio: false}'`: la macro `entrada` resuelve a `public.<tabla>`. */
const compila = (sql: string) => sql.replace(/\{\{\s*entrada\('([a-z_]+)'\)\s*\}\}/g, 'public.$1').replace(/^--.*$/gm, '')

test('cada modelo de staging corre con el rol de métricas sobre el esquema del producto', async () => {
  const db = await baseSoporte()
  const modelos = readdirSync(STAGING).filter((f) => f.endsWith('.sql'))
  assert.equal(modelos.length, 5)
  for (const m of modelos) {
    const sql = compila(readFileSync(join(STAGING, m), 'utf8'))
    assert.doesNotMatch(sql, /\{\{/, `${m}: quedó Jinja sin compilar`)
    assert.equal(await falla(() => comoServicio(db, METRICAS, sql)), null, `${m} no corre con el rol de métricas`)
  }
})

test('sabotaje: un modelo que lee texto se cae con el rol de métricas', async () => {
  const db = await baseSoporte()
  const sql = compila(readFileSync(join(STAGING, 'stg_incidencia.sql'), 'utf8')).replace('prioridad,', 'prioridad, descripcion,')
  assert.match(await falla(() => comoServicio(db, METRICAS, sql)) ?? 'PASÓ', /permission denied/)
})

test('el job materializa en ss_semantica y no puede crear nada en public', async () => {
  const db = await baseSoporte()
  assert.equal(await falla(() => comoServicio(db, METRICAS, 'create view ss_semantica.prueba as select 1 as x')), null)
  assert.match(await falla(() => comoServicio(db, METRICAS, 'create view public.prueba as select 1 as x')) ?? 'PASÓ', /permission denied/)
})
