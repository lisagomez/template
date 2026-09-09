import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificaArchivo, clasificaLote, tipoDe, troceaPaginas } from '../dist/archivos.js'
import type { LimitesDelMotor } from '../dist/tipos.js'

const LIMITES: LimitesDelMotor = { bytesMaximos: 50_000_000, paginasMaximas: 1000, paginasPorAnotacion: 8 }

test('acepta PDF e imagenes por MIME y por extension', () => {
  assert.equal(tipoDe({ nombre: 'a.pdf', bytes: 1 }), 'pdf')
  assert.equal(tipoDe({ nombre: 'foto.JPG', bytes: 1 }), 'imagen')
  // Al arrastrar una carpeta el navegador a menudo no da MIME: la extension tiene que bastar.
  assert.equal(tipoDe({ nombre: 'escaneo.tiff', tipoMime: '', bytes: 1 }), 'imagen')
})

test('rechaza nombrando el archivo y el motivo, nunca en silencio', () => {
  const r = clasificaArchivo({ nombre: 'notas.docx', bytes: 10 })
  assert.equal(r.aceptado, false)
  assert.match(r.aceptado === false ? r.motivo : '', /no soportado/)
  assert.equal(r.nombre, 'notas.docx')
})

test('un archivo vacio se rechaza', () => {
  const r = clasificaArchivo({ nombre: 'a.pdf', bytes: 0 })
  assert.equal(r.aceptado, false)
})

test('el limite de tamano viene del motor, no de una constante', () => {
  const grande = { nombre: 'a.pdf', bytes: 60_000_000 }
  assert.equal(clasificaArchivo(grande, LIMITES).aceptado, false)
  assert.equal(clasificaArchivo(grande).aceptado, true, 'sin limites declarados no se inventa uno')
})

test('el lote separa aceptados de rechazados', () => {
  const { aceptados, rechazados } = clasificaLote(
    [{ nombre: 'a.pdf', bytes: 5 }, { nombre: 'b.zip', bytes: 5 }, { nombre: 'c.png', bytes: 5 }],
    LIMITES,
  )
  assert.equal(aceptados.length, 2)
  assert.equal(rechazados.length, 1)
})

test('trocear por el limite de anotacion: 40 paginas son 5 llamadas de 8', () => {
  const trozos = troceaPaginas(40, LIMITES.paginasPorAnotacion)
  assert.equal(trozos.length, 5)
  assert.deepEqual(trozos[0], [0, 1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(trozos[4], [32, 33, 34, 35, 36, 37, 38, 39])
})

test('trocear el resto parcial y el caso vacio', () => {
  assert.equal(troceaPaginas(9, 8).length, 2)
  assert.deepEqual(troceaPaginas(9, 8)[1], [8])
  assert.deepEqual(troceaPaginas(0, 8), [])
  assert.throws(() => troceaPaginas(10, 0), RangeError)
})
