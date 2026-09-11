import { test } from 'node:test'
import assert from 'node:assert/strict'
import { camposPorPatron } from '../dist/patrones.js'
import type { Patron } from '../dist/patrones.js'

const TEXTO = 'Emisor RFC: AAA010101AAA\nReceptor RFC: XAXX010101000\nFolio fiscal: 11111111-2222-3333-4444-555555555555\nTotal $ 1,160.00\n'

const PATRONES: Patron[] = [
  { clave: 'rfc_emisor', expresion: /Emisor RFC:\s*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/, formato: 'identificador' },
  { clave: 'uuid', expresion: /[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i, formato: 'identificador' },
  { clave: 'total', expresion: /Total\s*\$?\s*([\d,]+\.\d{2})/ },
  { clave: 'rfc', expresion: /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/g },
  { clave: 'no_esta', expresion: /Descuento\s+(\d+)/ },
]

test('cada patron produce un campo determinista con su formato; el grupo 1 manda cuando lo hay', () => {
  const campos = camposPorPatron(TEXTO, PATRONES)
  const porClave = new Map(campos.map((c) => [c.clave, c]))
  assert.equal(porClave.get('rfc_emisor')?.valor, 'AAA010101AAA')
  assert.equal(porClave.get('rfc_emisor')?.formato, 'identificador')
  assert.equal(porClave.get('rfc_emisor')?.procedencia, 'codigo')
  assert.equal(porClave.get('rfc_emisor')?.confianza, 1)
  assert.equal(porClave.get('total')?.valor, '1,160.00')
  assert.equal(porClave.get('total')?.formato, undefined)
})

test('con bandera g salen TODAS las apariciones distintas; sin ella, la primera', () => {
  const campos = camposPorPatron(TEXTO, PATRONES)
  assert.deepEqual(campos.filter((c) => c.clave === 'rfc').map((c) => c.valor), ['AAA010101AAA', 'XAXX010101000'])
  assert.equal(campos.filter((c) => c.clave === 'uuid').length, 1)
})

test('un patron que no casa no produce campo: un hueco se ve, un vacio con confianza 1 pasaria por dato', () => {
  const campos = camposPorPatron(TEXTO, PATRONES)
  assert.ok(!campos.some((c) => c.clave === 'no_esta'))
  assert.deepEqual(camposPorPatron('', PATRONES), [])
})

test('el patron original no se muta: aplicarlo dos veces da lo mismo', () => {
  const patron: Patron = { clave: 'rfc', expresion: /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/g }
  const primera = camposPorPatron(TEXTO, [patron])
  const segunda = camposPorPatron(TEXTO, [patron])
  assert.deepEqual(primera, segunda)
  assert.equal(patron.expresion.lastIndex, 0)
})
