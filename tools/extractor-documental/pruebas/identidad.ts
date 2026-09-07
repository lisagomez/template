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

test('es un sha-256 en hexadecimal', async () => {
  const id = await identidadDe(bytes('abc'))
  assert.match(id, /^[0-9a-f]{64}$/)
  assert.equal(id, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('una vista sobre un buffer mayor no cambia el hash', async () => {
  const grande = new Uint8Array([9, 9, 1, 2, 3, 9])
  const vista = grande.subarray(2, 5)
  assert.equal(await identidadDe(vista), await identidadDe(new Uint8Array([1, 2, 3])))
})
