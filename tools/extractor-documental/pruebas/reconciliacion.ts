import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normaliza, similitud, resuelveValor, proponeAlta } from '../dist/reconciliacion.js'
import type { FilaDeCatalogo } from '../dist/reconciliacion.js'

const OPC = { umbral: 0.6, margenDeAmbiguedad: 0.08 }

const proveedores: FilaDeCatalogo[] = [
  { id: '1874', etiqueta: 'ACME S.A. de C.V.' },
  { id: '2001', etiqueta: 'Distribuidora Munoz' },
  { id: '3110', etiqueta: 'Ferreteria del Norte' },
]

test('normaliza quita diacriticos, puntuacion y sufijos societarios', () => {
  assert.equal(normaliza('ACME S.A. de C.V.'), 'acme')
  // "Muñoz" y "Munoz" son la misma empresa escrita por dos personas distintas.
  assert.equal(normaliza('Distribuidora Muñoz'), normaliza('Distribuidora Munoz'))
})

test('el caso que este modulo existe para evitar: ACME SA no es un proveedor nuevo', () => {
  const r = resuelveValor('ACME SA', proveedores, OPC)
  assert.equal(r.estado, 'resuelto')
  assert.equal(r.elegida?.id, '1874')
})

test('sin coincidencia: sin_resolver, y elegida es null', () => {
  const r = resuelveValor('Panaderia Central', proveedores, OPC)
  assert.equal(r.estado, 'sin_resolver')
  assert.equal(r.elegida, null)
  assert.deepEqual(r.candidatos, [])
})

test('dos filas casi iguales dan ambiguo, NO el mejor', () => {
  // Ofrecer "el mejor" aqui es como el sello de goma se cuela: quien revisa acepta lo prerelleno.
  const gemelos: FilaDeCatalogo[] = [
    { id: 'a', etiqueta: 'Comercial del Valle' },
    { id: 'b', etiqueta: 'Comercial del Valle' },
  ]
  const r = resuelveValor('Comercial del Valle', gemelos, OPC)
  assert.equal(r.estado, 'ambiguo')
  assert.equal(r.elegida, null)
  assert.equal(r.candidatos.length, 2)
})

test('el umbral es OBLIGATORIO y validado: no hay default defendible sin medir', () => {
  assert.throws(() => resuelveValor('x', proveedores, { umbral: 1.5, margenDeAmbiguedad: 0.1 }), RangeError)
  assert.throws(() => resuelveValor('x', proveedores, { umbral: 0.5, margenDeAmbiguedad: -1 }), RangeError)
})

test('similitud: identicos 1, ajenos bajo', () => {
  assert.equal(similitud('ACME', 'ACME'), 1)
  assert.ok(similitud('ACME', 'Ferreteria del Norte') < 0.3)
})

test('un catalogo vacio no revienta: da sin_resolver', () => {
  assert.equal(resuelveValor('lo que sea', [], OPC).estado, 'sin_resolver')
})

test('proponer alta lleva los candidatos parecidos, y nunca ocurre sobre un resuelto', () => {
  const sinResolver = resuelveValor('Panaderia Central', proveedores, OPC)
  const alta = proponeAlta('proveedores', 'Panaderia Central', sinResolver)
  assert.equal(alta.catalogo, 'proveedores')
  assert.equal(alta.valor, 'Panaderia Central')

  const resuelto = resuelveValor('ACME SA', proveedores, OPC)
  assert.throws(() => proponeAlta('proveedores', 'ACME SA', resuelto), /ya se resolvio/)
})
