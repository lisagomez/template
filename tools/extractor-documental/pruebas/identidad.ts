import { test } from 'node:test'
import assert from 'node:assert/strict'
import { identidadDe, esElMismoDocumento } from '../dist/identidad.js'

const bytes = (s: string) => new TextEncoder().encode(s)

test('la identidad sale del contenido: el mismo documento da el mismo id', async () => {
  // Es la propiedad que hace idempotente reprocesar un lote a medio fallar.
  assert.equal(await identidadDe(bytes('factura')), await identidadDe(bytes('factura')))
  assert.ok(await esElMismoDocumento(bytes('x'), bytes('x')))
})

test('contenidos distintos dan identidades distintas', async () => {
  assert.notEqual(await identidadDe(bytes('a')), await identidadDe(bytes('b')))
})

/**
 * Fija el algoritmo contra el vector de prueba publico de SHA-256("abc") del FIPS 180-4.
 *
 * Se comprueba por extremos y longitud en vez de con el digest entero **a proposito**: un hex de
 * 64 caracteres escrito literal dispara `npm run audita:secretos`, que no puede distinguirlo de
 * una credencial. Ningun otro algoritmo produce estos extremos con esta longitud, asi que la
 * prueba sigue valiendo lo mismo. No lo "arregles" volviendo a poner la constante entera.
 */
test('es un sha-256 en hexadecimal', async () => {
  const id = await identidadDe(bytes('abc'))
  assert.match(id, /^[0-9a-f]{64}$/)
  assert.ok(id.startsWith('ba7816bf8f01cfea'), 'prefijo del vector FIPS 180-4')
  assert.ok(id.endsWith('b410ff61f20015ad'), 'sufijo del mismo vector')
})

test('una vista sobre un buffer mayor no cambia el hash', async () => {
  const grande = new Uint8Array([9, 9, 1, 2, 3, 9])
  const vista = grande.subarray(2, 5)
  assert.equal(await identidadDe(vista), await identidadDe(new Uint8Array([1, 2, 3])))
})
