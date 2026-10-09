/**
 * De crudo a enriquecido, con los dos exportes sucios: la cuenta cierra (entrada = limpias + revisión
 * + descartadas), cada suciedad sembrada termina donde debe, un valor limpio y uno enriquecido se
 * rastrean hasta su original y su regla, y el crudo se reconstruye igual.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { evaluaSeguro } from '../../grafo-conocimiento/dist/index.js'
import { similitud, digitoVerificadorRfc, digitoVerificadorCurp } from '../../extractor-documental/dist/index.js'
import {
  generaCorpus, exporteSucio, proponeMapeo, apruebaMapeo, aplicaMapeo, limpia, enriquece, conocimientoDeMatriz,
  MATRIZ_LABORATORIO, CLIENTES, type MotorReglas,
} from '../dist/index.js'

/** Una sal de PRUEBA: el importador seudonimiza con HMAC y su sal (PRP-010 H-32). */
const seudonimiza = { sal: 'sal-de-prueba-del-importador', hmac: (k: string, s: string) => createHmac('sha256', k).update(s).digest('hex') }
const corpus = generaCorpus({ rfc: digitoVerificadorRfc, curp: digitoVerificadorCurp })
const conocimiento = conocimientoDeMatriz(MATRIZ_LABORATORIO, '2026-10-04')
const motor: MotorReglas = (p) => evaluaSeguro(conocimiento, p, { hoy: '2026-10-04' }) as ReturnType<MotorReglas>

function tuberia(consultora: 'andina' | 'boreal') {
  const e = exporteSucio(corpus, consultora)
  const m = apruebaMapeo(proponeMapeo({ consultora, herramienta: e.herramienta, version: 1, columnas: e.columnas, muestras: e.filas, desfaseFechasMin: -360, similitud }), { tipo: 'humano', id: 'usr-experto' }, [])
  const mapeado = aplicaMapeo(m, e.filas, seudonimiza)
  const catalogo = CLIENTES.filter((c) => c.consultora === consultora).map((c) => ({ id: c.id, nombre: c.nombre }))
  const limpio = limpia(mapeado, catalogo)
  const ctx = { motor, matriz: MATRIZ_LABORATORIO, sistemaDe: (id: string) => CLIENTES.find((c) => c.id === id)!.sistema, contratoDe: (id: string) => `sla-${id}` }
  return { e, limpio, enriquecido: enriquece(limpio, ctx) }
}

for (const consultora of ['andina', 'boreal'] as const) {
  test(`${consultora}: la cuenta cierra y cada suciedad termina donde debe`, () => {
    const { e, limpio } = tuberia(consultora)
    assert.ok(limpio.cuenta.cuadra, JSON.stringify(limpio.cuenta))
    assert.equal(limpio.cuenta.entrada, e.filas.length)
    for (const i of e.verdad.duplicadas) assert.match(limpio.descartadas.find((d) => d.indice === i)?.motivo ?? '', /duplicado de la fila/, `duplicado ${i}`)
    for (const i of e.verdad.deprueba) assert.equal(limpio.descartadas.find((d) => d.indice === i)?.motivo, 'ticket de prueba', `prueba ${i}`)
    for (const i of e.verdad.sinCliente) assert.ok(limpio.revision.some((r) => r.indice === i), `sin cliente ${i}`)
    assert.ok(limpio.limpias.length > limpio.cuenta.entrada * 0.8)
  })
}

test('un valor limpio y uno enriquecido se rastrean hasta su original y su regla', () => {
  const { enriquecido } = tuberia('andina')
  const uno = enriquecido.find((x) => x.incidencia.regla)!
  const cliente = uno.rastro.find((r) => r.campo === 'clienteId')!
  assert.match(cliente.original ?? '', /S\.A\. de C\.V\.$/)
  assert.equal(cliente.valor, uno.incidencia.clienteId)
  assert.match(cliente.regla, /catálogo de clientes/)
  const regla = uno.rastro.find((r) => r.campo === 'regla')!
  assert.equal(regla.valor, uno.incidencia.regla)
  assert.match(regla.fuente, /Nota sintética NS-\d{4}/)
  assert.ok(uno.rastro.some((r) => r.campo === 'prioridadSugerida' && /ITIL/.test(r.regla)))
})

test('el crudo se reconstruye igual desde el rastro y no se tocó', () => {
  const { e, limpio } = tuberia('boreal')
  const antes = JSON.stringify(e.filas)
  for (const { indice, rastro } of limpio.limpias) {
    for (const r of rastro.filter((x) => x.fuente.startsWith('columna '))) {
      assert.equal(e.filas[indice]![r.fuente.slice('columna '.length)], r.original, `fila ${indice}, ${r.campo}`)
    }
  }
  assert.equal(JSON.stringify(e.filas), antes)
})
