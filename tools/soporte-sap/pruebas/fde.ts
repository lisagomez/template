/** El playbook FDE: seis etapas con su capacidad, el HIL decide, y la frontera a medida / núcleo queda registrada. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PLAYBOOK_FDE, registroVacio, registra, decide, fronteraNucleo, habilidadesFde, DESCRIPCION_FDE } from '../dist/index.js'

test('seis etapas, cada una con su capacidad en la Agent Card', () => {
  assert.equal(PLAYBOOK_FDE.length, 6)
  const ids = habilidadesFde().map((h) => h.id)
  assert.deepEqual(ids, PLAYBOOK_FDE.map((e) => e.capacidad))
  assert.equal(new Set(ids).size, 6)
  assert.match(DESCRIPCION_FDE, /no aprueba/)
  assert.match(DESCRIPCION_FDE, /no toca los sistemas SAP del cliente/)
})

test('el FDE propone y solo un humano decide', () => {
  let r = registra(registroVacio(), { consultora: 'andina', etapa: 'solucion_a_medida', alcance: 'a_medida', que: 'CLI para cerrar periodos MM', motivo: 'Andina cierra periodos a mano cada mes' })
  assert.throws(() => decide(r, 0, 'aprobado', { tipo: 'agente' }), /solo un humano/)
  r = decide(r, 0, 'aprobado', { tipo: 'humano' })
  assert.equal(r.trabajos[0]?.estado, 'aprobado')
  assert.throws(() => decide(r, 0, 'rechazado', { tipo: 'humano' }), /ya está decidido/)
})

test('sin motivo no se registra; las etapas imponen su alcance', () => {
  assert.throws(() => registra(registroVacio(), { consultora: 'a', etapa: 'impacto', alcance: 'a_medida', que: 'x', motivo: ' ' }), /sin motivo/)
  assert.throws(() => registra(registroVacio(), { consultora: 'a', etapa: 'vuelta_al_nucleo', alcance: 'a_medida', que: 'x', motivo: 'm' }), /alcance «nucleo»/)
  assert.throws(() => registra(registroVacio(), { consultora: 'a', etapa: 'solucion_a_medida', alcance: 'nucleo', que: 'x', motivo: 'm' }), /alcance «a_medida»/)
})

test('la frontera: lo que quedó a medida y lo que se propuso al núcleo, por consultora', () => {
  let r = registra(registroVacio(), { consultora: 'andina', etapa: 'solucion_a_medida', alcance: 'a_medida', que: 'flujo de MIGO para Andina', motivo: 'su customizing de movimientos Z' })
  r = registra(r, { consultora: 'andina', etapa: 'vuelta_al_nucleo', alcance: 'nucleo', que: 'regla de periodo cerrado MM', motivo: 'aparece en las tres consultoras' })
  const f = fronteraNucleo(r)
  assert.deepEqual(f['andina']?.aMedida, ['flujo de MIGO para Andina (propuesto)'])
  assert.deepEqual(f['andina']?.alNucleo, ['regla de periodo cerrado MM (propuesto)'])
})
