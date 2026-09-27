/**
 * El dominio de ejemplo NO legal (PRP-005 Fase 6, TAR-11): una política de devoluciones ficticia.
 * Demuestra que ni el motor ni el redactor están atados a lo legal: vocabulario propio, frases
 * propias, cita interna, una política que cambió con fecha y una exclusión. Todo con oraciones
 * reales, sin payload armado a mano (TAR-12) y sin modelo.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validaConocimiento } from '../dist/index.js'
import { contenciones } from '../dist/gate-entrada.js'
import { estructuradorSinModelo, responde } from '../dist/lenguaje/index.js'

const c = validaConocimiento(JSON.parse(readFileSync(new URL('../ejemplos/politica-devoluciones.json', import.meta.url), 'utf8'))).conocimiento!
const pregunta = (texto: string) =>
  responde(texto, { conocimiento: c, jurisdiccion: 'MX', regimen: 'GENERAL', hoy: '2026-09-27', estructurador: estructuradorSinModelo(c, 'MX') })

test('el ejemplo es un conocimiento válido y su única contención está cubierta por una exclusión', () => {
  assert.deepEqual(validaConocimiento(c).problemas, [])
  assert.deepEqual(contenciones(c).map((x) => [x.corta, x.larga, x.cubierta]), [['ropa', 'ropa interior', true]])
})

test('RF-9: el conteo del ejemplo queda fijado', () => {
  assert.deepEqual({ dominios: c.dominios.length, categorias: c.categorias.length, reglas: c.reglas.length }, { dominios: 1, categorias: 3, reglas: 5 })
})

test('una oración real: procede, con su frase y sus requisitos, y sin decir de qué documento sale (cita interna)', async () => {
  const r = await pregunta('¿Puedo devolver unos zapatos que compré la semana pasada?')
  assert.equal(r.tipo, 'resultado')
  assert.match(r.texto, /procede la devolución\./)
  assert.match(r.texto, /Hasta 15 días desde la compra/)
  for (const fuga of ['Política de devoluciones', 'DEV-ROPA', 'ejemplo.invalid', 'Fuente:']) assert.ok(!r.texto.includes(fuga), fuga)
})

test('RF-13: la política cambió en 2026; un hecho de 2025 se juzga con la de entonces (30 días)', async () => {
  const r = await pregunta('Compré una playera el 10/05/2025, ¿la puedo devolver?')
  assert.equal(r.tipo, 'resultado')
  assert.match(r.texto, /Hasta 30 días desde la compra/)
  assert.doesNotMatch(r.texto, /no decía la fecha del hecho/)
})

test('RF-7: «ropa interior» no cae en ropa por la exclusión, y la respuesta es la de higiene', async () => {
  const r = await pregunta('Quiero devolver ropa interior que ya abrí')
  assert.equal(r.tipo === 'resultado' && r.resultado.conceptos[0]!.categoria, 'HIGIENE')
  assert.match(r.texto, /no procede la devolución\./)
  assert.match(r.texto, /Por higiene, no se aceptan abiertos/)
})

test('vocabulario propio: «requiere_revision» se dice con la frase de su dimensión', async () => {
  const r = await pregunta('¿Me aceptan la devolución de unos audifonos?')
  assert.match(r.texto, /la devolución requiere una revisión antes de aprobarse\./)
})

test('lo que no está en la política: no hay información suficiente, sin suponer nada', async () => {
  const r = await pregunta('¿Puedo devolver una bicicleta?')
  assert.equal(r.tipo === 'resultado' && r.resultado.conceptos[0]!.motivo, 'sin_regla')
  assert.match(r.texto, /no hay información suficiente/)
})
