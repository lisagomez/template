import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ESTADO_INICIAL, esTerminal, esFallo, esperaHumano, puedeTransitar, transita, siguientes,
} from '../dist/estados.js'

test('el camino feliz llega a validado', () => {
  let e = ESTADO_INICIAL
  for (const paso of ['en_cola', 'procesando', 'extraido', 'en_revision', 'validado'] as const) {
    e = transita(e, paso)
  }
  assert.equal(e, 'validado')
  assert.ok(esTerminal(e))
})

test('revision_humana NO es un fallo, y de ahi se sale', () => {
  // Es la propiedad que impide que alguien suba el umbral hasta vaciar la cola de revision.
  assert.equal(esFallo('revision_humana'), false)
  assert.ok(esperaHumano('revision_humana'))
  assert.ok(puedeTransitar('revision_humana', 'validado'))
  assert.ok(puedeTransitar('revision_humana', 'rechazado'))
  assert.equal(esTerminal('revision_humana'), false)
})

test('solo el fallo tecnico es fallo, y se reintenta', () => {
  assert.ok(esFallo('fallido'))
  assert.ok(puedeTransitar('fallido', 'en_cola'))
  assert.equal(esTerminal('fallido'), false)
})

test('una transicion invalida revienta en vez de devolver el estado anterior', () => {
  assert.throws(() => transita('pendiente', 'validado'), /Transicion invalida/)
})

test('de un estado terminal no sale nada', () => {
  assert.deepEqual(siguientes('validado'), [])
  assert.deepEqual(siguientes('rechazado'), [])
})
