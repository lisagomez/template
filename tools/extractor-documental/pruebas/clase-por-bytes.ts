/** 0.8.0 · la clase de un archivo por sus bytes, no por su nombre: un nombre puede mentir. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasePorBytes, esXmlPorBytes } from '../dist/index.js'

const bytes = (s: string) => new TextEncoder().encode(s)

test('PDF, imagen, XML (con BOM y espacios), ZIP de Office y lo demás', () => {
  assert.equal(clasePorBytes(bytes('%PDF-1.7 ...')), 'pdf')
  assert.equal(clasePorBytes(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d])), 'imagen')
  assert.equal(clasePorBytes(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), 'imagen')
  assert.equal(clasePorBytes(bytes('<?xml version="1.0"?><cfdi:Comprobante/>')), 'xml')
  assert.equal(clasePorBytes(Uint8Array.from([0xef, 0xbb, 0xbf, 0x20, 0x0a, 0x3c, 0x61])), 'xml')
  assert.equal(clasePorBytes(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14])), 'zip')
  assert.equal(clasePorBytes(bytes('Nombre,Monto\nA,1')), 'desconocido')
  assert.equal(clasePorBytes(new Uint8Array()), 'desconocido')
})

test('esXmlPorBytes es la misma detección que usa leeCorpus', () => {
  assert.ok(esXmlPorBytes(bytes('  \n<raiz/>')))
  assert.equal(esXmlPorBytes(bytes('x<raiz/>')), false)
})
