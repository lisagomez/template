import { test } from 'node:test'
import assert from 'node:assert/strict'
import { corrobora, exigeRevision } from '../dist/corroboracion.js'
import type { CampoExtraido } from '../dist/tipos.js'

const deOcr = (clave: string, valor: string, confianza = 0.95): CampoExtraido => ({
  clave, valor, confianza, procedencia: 'ocr', region: { pagina: 0, x: 0, y: 0, ancho: 1, alto: 1 },
})
// Un campo de codigo llega con confianza 1: un QR decodifica o no. Y no lleva region si vino de un
// escaner HID, que no produce imagen.
const deCodigo = (clave: string, valor: string): CampoExtraido => ({
  clave, valor, confianza: 1, procedencia: 'codigo',
})

test('cuando coinciden hay acuerdo y no hace falta revision', () => {
  const c = corrobora([deOcr('total', '1160.00')], [deCodigo('total', '1160.00')])
  assert.equal(c.acuerdos.length, 1)
  assert.equal(c.discrepancias.length, 0)
  assert.equal(exigeRevision(c), false)
})

/** El caso que justifica tener dos fuentes: el OCR se comio un separador decimal. */
test('11.600,00 frente a 1.160,00 es discrepancia y manda a revision', () => {
  const c = corrobora([deOcr('total', '11600.00')], [deCodigo('total', '1160.00')])
  assert.equal(c.discrepancias.length, 1)
  assert.deepEqual(c.discrepancias[0], { clave: 'total', segunOcr: '11600.00', segunCodigo: '1160.00' })
  assert.ok(exigeRevision(c))
})

test('una discrepancia manda a revision AUNQUE las dos fuentes vengan con confianza alta', () => {
  // Ninguna gana por decreto. El codigo no es mas fiable por decodificar limpio: una pegatina
  // falsa decodifica igual de limpio que la legitima.
  const c = corrobora([deOcr('rfc_emisor', 'AAA010101AAA', 1)], [deCodigo('rfc_emisor', 'BBB020202BBB')])
  assert.ok(exigeRevision(c))
})

test('los importes se comparan como numeros: "1,160.00" y "1160.00" no son discrepancia', () => {
  // Si esto contara como discrepancia, la cola se llenaria de ruido y dejaria de leerse.
  const c = corrobora([deOcr('total', '1,160.00')], [deCodigo('total', '1160.00')])
  assert.equal(c.acuerdos.length, 1)
  assert.equal(c.discrepancias.length, 0)
})

test('cobertura distinta no es conflicto: se declara quien aporto que', () => {
  const c = corrobora(
    [deOcr('total', '1160.00'), deOcr('domicilio', 'Calle 1')],
    [deCodigo('total', '1160.00'), deCodigo('uuid', '5FB2-822E')],
  )
  assert.deepEqual(c.soloOcr, ['domicilio'])
  assert.deepEqual(c.soloCodigo, ['uuid'])
  assert.equal(exigeRevision(c), false)
})

test('sin campos de codigo no hay nada que cotejar, y eso no es un problema', () => {
  const c = corrobora([deOcr('total', '1160.00')], [])
  assert.equal(exigeRevision(c), false)
  assert.deepEqual(c.soloOcr, ['total'])
})
