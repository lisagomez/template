/**
 * El recorte que vendoriza un consumidor público (PRP de Hermes «el grafo lee el paquete», Fase 0):
 * solo sus dominios, de una versión registrada, y un pin que se puede rehacer.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { validaConocimiento } from '../../grafo-conocimiento/dist/index.js'
import { ensambla } from '../ensambla.mjs'
import { recorta } from '../recorta.mjs'

const registro = JSON.parse(readFileSync(new URL('../versiones.json', import.meta.url), 'utf8'))
const NOMBRE = '@tu-scope/conocimiento'
const paquete = ensambla()
const todos = paquete.dominios.map((d: { clave: string }) => d.clave)
const sha256 = (texto: string) => `sha256:${createHash('sha256').update(texto).digest('hex')}`

test('con todos sus dominios, el recorte es el paquete entero y el pin fija las dos huellas', () => {
  const { recorte, texto, pin } = recorta(paquete, todos, registro, NOMBRE)
  assert.deepEqual(recorte, JSON.parse(JSON.stringify(paquete)))
  assert.equal(pin.sha256_recorte, sha256(texto))
  assert.equal(pin.sha256_paquete, sha256(JSON.stringify(paquete)))
  assert.deepEqual(pin.dominios, [...todos].sort())
  assert.equal(pin.version, paquete.version)
})

test('el pin se rehace: misma versión y mismos dominios, en cualquier orden, dan las mismas huellas', () => {
  const a = recorta(paquete, todos, registro, NOMBRE).pin
  const b = recorta(ensambla(), [...todos].reverse(), registro, NOMBRE).pin
  assert.deepEqual(a, b)
})

test('un subconjunto deja fuera los dominios que no se pidieron, y sigue pasando el contrato', () => {
  const { recorte, pin } = recorta(paquete, ['mx-drones-de-reparto'], registro, NOMBRE)
  assert.deepEqual(recorte.dominios.map((d: { clave: string }) => d.clave), ['mx-drones-de-reparto'])
  assert.ok(recorte.reglas.length < paquete.reglas.length)
  assert.ok(recorte.reglas.every((r: { jurisdiccion: string; dimension: string }) => `${r.jurisdiccion}/${r.dimension}` === 'MX/regulatorio'))
  assert.notEqual(validaConocimiento(recorte).conocimiento, null)
  assert.notEqual(pin.sha256_recorte, recorta(paquete, todos, registro, NOMBRE).pin.sha256_recorte)
})

test('se niega ante un dominio que no existe, o sin dominios', () => {
  assert.throws(() => recorta(paquete, ['mx-no-existe'], registro, NOMBRE), /dominios desconocidos/)
  assert.throws(() => recorta(paquete, [], registro, NOMBRE), /sin dominios/)
})

test('se niega si el árbol no es exactamente la versión registrada', () => {
  assert.throws(() => recorta({ ...paquete, version: '9.9.9' }, todos, registro, NOMBRE), /no está en versiones.json/)
  const tocado = JSON.parse(JSON.stringify(paquete))
  tocado.reglas[0].titulo += ' (editado en su sitio)'
  assert.throws(() => recorta(tocado, todos, registro, NOMBRE), /cambió sin subir de versión/)
})
