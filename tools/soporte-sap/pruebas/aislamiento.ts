/**
 * Aislamiento de tres niveles (laboratorio, consultora, cliente), con el bucket de originales y el
 * del sandbox, probado con el rol real y no asumido. Cada comprobación es una fila de
 * `_aislamiento.ts`; aquí se exige que todas pasen.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { baseSoporte } from './_base.ts'
import { revisaAislamiento } from './_aislamiento.ts'

test('aislamiento de tres niveles: cada intento cruzado, rechazado', async () => {
  const filas = await revisaAislamiento(await baseSoporte())
  const malas = filas.filter((f) => !f[2]).map((f) => `${f[0]} — esperado: ${f[1]}, visto: ${f[3]}`)
  assert.deepEqual(malas, [])
  assert.ok(filas.length >= 30, `${filas.length} comprobaciones`)
})
