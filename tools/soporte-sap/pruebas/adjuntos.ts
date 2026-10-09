/**
 * Los adjuntos en la base (PRP-010 H-23). Antes el cliente y su consultora subían directo al bucket de originales y
 * registraban el adjunto, así que un archivo que dice ser PNG y es otra cosa quedaba guardado sin pasar por
 * `clasePorBytes`; y los adjuntos se contaban por lote, sin tope por incidencia. Ahora solo la ingesta (que valida los
 * bytes) escribe, y la base no admite más de 10 adjuntos por incidencia.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PGlite } from '@electric-sql/pglite'
import { baseSoporte, como, comoServicio, tokenDe, falla, ORG, USR, INC } from './_base.ts'

const ingesta = (db: PGlite, sql: string) => comoServicio(db, tokenDe(ORG.CA, 'soporte_sap_ingesta'), sql)
const huella = (n: number) => n.toString(16).padStart(64, '0')
const adjunto = (n: number) => `insert into ss_adjunto (incidencia_id, consultora_id, cliente_id, sha256, ruta, tipo_mime, bytes, via)
  values ('${INC.a1}', '${ORG.CA}', '${ORG.A1}', '${huella(n)}', '${ORG.CA}/${ORG.A1}/${INC.a1}/${huella(n)}', 'image/png', 100, 'sin_extraccion')`
const objeto = (n: number) => `insert into storage.objects (bucket_id, name) values ('ss-originales', '${ORG.CA}/${ORG.A1}/${INC.a1}/${huella(n)}')`

test('H-23 · ni el cliente ni su consultora suben al bucket ni registran un adjunto: solo la ingesta, que valida los bytes', async () => {
  const db = await baseSoporte()
  for (const quien of [USR.ua1, USR.ca]) {
    assert.ok(await falla(() => como(db, quien, objeto(900))), `${quien} no sube al bucket de originales, ni a la carpeta de su propio cliente`)
    assert.ok(await falla(() => como(db, quien, adjunto(900))), `${quien} no registra un adjunto`)
  }
  assert.equal(await falla(() => ingesta(db, objeto(901))), null, 'control: la ingesta sí sube')
  assert.equal(await falla(() => ingesta(db, adjunto(901))), null, 'control: la ingesta sí registra el adjunto')
})

test('H-23 · la base no admite más de 10 adjuntos por incidencia, vengan en el lote que vengan', async () => {
  const db = await baseSoporte()
  const ya = Number((await db.query<{ n: number }>(`select count(*)::int as n from ss_adjunto where incidencia_id = '${INC.a1}'`)).rows[0]!.n)
  for (let k = ya; k < 10; k++) await ingesta(db, adjunto(k + 1))
  assert.match(await falla(() => ingesta(db, adjunto(99))) ?? 'PASÓ', /ya tiene 10 adjuntos/)
})
