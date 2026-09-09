import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  plantillaInicial, reducePlantilla, camposVisibles, camposDeshabilitados,
} from '../dist/plantilla.js'

const base = () => plantillaInicial('factura', ['folio', 'total', 'proveedor'])
const AHORA = new Date('2026-09-07T12:00:00.000Z')

test('la plantilla inicial trae todo visible y en orden', () => {
  assert.equal(camposVisibles(base()).length, 3)
  assert.deepEqual(camposVisibles(base()).map((c) => c.clave), ['folio', 'total', 'proveedor'])
})

test('deshabilitar registra QUIEN y CUANDO', () => {
  // Sin esta traza, un campo apagado por comodidad desaparece de mil documentos y meses despues
  // nadie sabe si falta porque no venia o porque alguien lo apago un martes.
  const p = reducePlantilla(base(), { tipo: 'deshabilitar', clave: 'total', por: 'lisa' }, AHORA)
  const apagados = camposDeshabilitados(p)
  assert.equal(apagados.length, 1)
  assert.equal(apagados[0].deshabilitadoPor, 'lisa')
  assert.equal(apagados[0].deshabilitadoEn, AHORA.toISOString())
  assert.equal(camposVisibles(p).length, 2)
})

test('rehabilitar limpia la autoria anterior', () => {
  const apagado = reducePlantilla(base(), { tipo: 'deshabilitar', clave: 'total', por: 'lisa' }, AHORA)
  const encendido = reducePlantilla(apagado, { tipo: 'habilitar', clave: 'total' }, AHORA)
  const campo = encendido.campos.find((c) => c.clave === 'total')
  assert.equal(campo?.visible, true)
  assert.equal(campo?.deshabilitadoPor, undefined, 'una autoria vieja colgando mentiria en el siguiente apagado')
})

test('renombrar y reordenar', () => {
  let p = reducePlantilla(base(), { tipo: 'renombrar', clave: 'folio', etiqueta: 'N.o de folio' }, AHORA)
  p = reducePlantilla(p, { tipo: 'reordenar', clave: 'proveedor', orden: -1 }, AHORA)
  assert.equal(camposVisibles(p)[0].clave, 'proveedor')
  assert.equal(p.campos.find((c) => c.clave === 'folio')?.etiqueta, 'N.o de folio')
})

test('el reducer no muta la entrada', () => {
  const original = base()
  reducePlantilla(original, { tipo: 'deshabilitar', clave: 'total', por: 'lisa' }, AHORA)
  assert.equal(camposVisibles(original).length, 3, 'sin inmutabilidad, deshacer en la UI es imposible')
})

test('una accion sobre un campo inexistente revienta', () => {
  assert.throws(() => reducePlantilla(base(), { tipo: 'habilitar', clave: 'nope' }, AHORA), /no tiene ningun campo/)
})
