/** La cadena sha256 de una incidencia: verde intacta; roja al alterar, borrar o reordenar un evento. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agrega, verificaCadena, nuevoEvento, type EventoIncidencia } from '../dist/index.js'

const INC = 'inc-0001'
export function cadenaDePrueba(): EventoIncidencia[] {
  let c: EventoIncidencia[] = []
  const pasos: Array<[EventoIncidencia['tipo'], string, Record<string, string>]> = [
    ['RECIBIDA', 'usr-1a2b3c4d5e6f', { canal: 'portal' }],
    ['CATEGORIZADA', 'agente:soporte-sap-a2a', { prioridad: 'P2', categoria: 'MM_PERIODO_CERRADO' }],
    ['PLAN_PREPARADO', 'agente:soporte-sap-a2a', { sha256: 'ab'.repeat(32) }],
    ['APROBADA', 'usr-9f8e7d6c5b4a', { taskId: 'tarea-1' }],
    ['APLICADA_EN_SIMULADOR', 'agente:soporte-sap-a2a', { despues: 'MM 1000: 2026-08, 2026-09, 2026-10' }],
  ]
  pasos.forEach(([tipo, actor, datos], i) => { c = agrega(INC, c, { fecha: `2026-10-04T10:0${i}:00Z`, tipo, actor, datos }) })
  return c
}

test('una cadena intacta verifica', () => {
  const v = verificaCadena(INC, cadenaDePrueba())
  assert.ok(v.ok && v.n === 5)
})

test('alterar un evento (el actor) rompe el hash', () => {
  const c = cadenaDePrueba()
  c[3] = { ...c[3]!, actor: 'usr-000000000000' }
  const v = verificaCadena(INC, c)
  assert.ok(!v.ok && v.rotura.motivo === 'hash' && v.rotura.seq === 4)
})

test('borrar un evento rompe la secuencia', () => {
  const c = cadenaDePrueba()
  c.splice(2, 1)
  const v = verificaCadena(INC, c)
  assert.ok(!v.ok && v.rotura.motivo === 'secuencia')
})

test('reordenar dos eventos rompe la cadena', () => {
  const c = cadenaDePrueba()
  ;[c[1], c[2]] = [c[2]!, c[1]!]
  const v = verificaCadena(INC, c)
  assert.ok(!v.ok && v.rotura.seq === 3)
})

test('recalcular el hash del alterado no basta: el siguiente ya no enlaza', () => {
  const c = cadenaDePrueba()
  const alterado = nuevoEvento(INC, c.slice(0, 1), { fecha: c[1]!.fecha, tipo: 'CATEGORIZADA', actor: c[1]!.actor, datos: { prioridad: 'P4' } })
  c[1] = alterado
  const v = verificaCadena(INC, c)
  assert.ok(!v.ok && v.rotura.motivo === 'enlace' && v.rotura.seq === 3)
})

test('el actor es un seudónimo, nunca un nombre', () => {
  assert.throws(() => agrega(INC, [], { fecha: '2026-10-04T10:00:00Z', tipo: 'RECIBIDA', actor: 'María López', datos: {} }), /seudónimo/)
})
