/**
 * El estimado: cada cifra dice su naturaleza y su fuente; una derivada que depende (aunque sea de
 * lejos) de un supuesto lo dice; un insumo sin medir no se vuelve cero sino «no medido».
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { consumoMensual, maquinaPara, celda, medida, supuesta, type Insumos } from '../dist/index.js'
import { HERRAMIENTA } from './_ayuda.ts'

const medidos = JSON.parse(readFileSync(join(HERRAMIENTA, 'medicion/estimado.json'), 'utf8')) as { medido: string; insumos: Insumos }

test('el estimado medido trae cada insumo con su naturaleza y su fuente', () => {
  for (const [k, c] of Object.entries(medidos.insumos)) {
    assert.ok(['medida', 'supuesta'].includes(c.naturaleza), k)
    assert.ok(c.fuente.length > 10, `${k} sin fuente`)
    if (c.naturaleza === 'supuesta') assert.match(c.fuente, /SUPUESTO/, `${k}: un supuesto se dice`)
  }
  assert.equal(medidos.insumos.bytesBdPorIncidencia.naturaleza, 'medida')
  assert.equal(medidos.insumos.tokensPorIncidencia.naturaleza, 'supuesta', 'sin LLM real, los tokens son supuesto')
})

test('toda cifra derivada lleva su fórmula y dice si depende de un supuesto, aunque sea de lejos', () => {
  const c = consumoMensual(medidos.insumos, 64)
  for (const [k, x] of Object.entries(c)) {
    assert.equal(x.naturaleza, 'derivada', k)
    assert.ok(x.fuente.includes('×'), `${k} sin fórmula visible`)
  }
  assert.ok(c.cpuOcr.insumos?.includes('supuesta'), 'el OCR depende de la fracción supuesta de imágenes')
  assert.ok(maquinaPara(medidos.insumos, c).vcpu.insumos?.includes('supuesta'), 'la hora pico es un supuesto')
})

test('un insumo sin medir no se vuelve cero: la cifra dice «no medido»', () => {
  const sinOcr: Insumos = { ...medidos.insumos, segundosOcrPorPagina: { valor: null, unidad: 's/página', naturaleza: 'medida', fuente: 'no medido' } }
  const c = consumoMensual(sinOcr, 24)
  assert.equal(c.cpuOcr.valor, null)
  assert.match(celda(c.cpuOcr), /no medido/)
  assert.equal(maquinaPara(sinOcr, c).vcpu.valor, null)
})

test('la máquina se pide en vCPU, RAM y disco, nunca en planes de un proveedor', () => {
  const x: Insumos = { ...medidos.insumos, segundosOcrPorPagina: medida(110, 's/página', 'motor autohospedado sin GPU'), documentosPorIncidencia: supuesta(1.2, 'documentos', 'SUPUESTO') }
  const m = maquinaPara(x, consumoMensual(x, 218))
  assert.deepEqual([m.vcpu.unidad, m.ramGb.unidad, m.discoGb.unidad], ['vCPU', 'GB', 'GB'])
  assert.ok((m.vcpu.valor ?? 0) >= 2)
})
