import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leeCapaCero, extraeConCapaCero, extraeTextoDeContenido, pareceTexto } from '../dist/capa-cero.js'
import type { MotorOcr } from '../dist/puertos.js'
import type { PaginaExtraida } from '../dist/tipos.js'

const bytes = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0))

function une(...trozos: Uint8Array[]): Uint8Array {
  const total = trozos.reduce((n, t) => n + t.length, 0)
  const salida = new Uint8Array(total)
  let i = 0
  for (const t of trozos) {
    salida.set(t, i)
    i += t.length
  }
  return salida
}

async function desinfla(datos: Uint8Array): Promise<Uint8Array> {
  const flujo = new Blob([datos as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(flujo).arrayBuffer())
}

/** PDF minimo pero con la forma real: cabecera, objeto con diccionario, flujo y trailer. */
async function pdfCon(contenido: string, opciones: { comprimido?: boolean; extra?: string } = {}) {
  const cuerpo = opciones.comprimido ? await desinfla(bytes(contenido)) : bytes(contenido)
  const filtro = opciones.comprimido ? ' /Filter /FlateDecode' : ''
  return une(
    bytes(`%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n${opciones.extra ?? ''}`),
    bytes(`4 0 obj\n<< /Length ${cuerpo.length}${filtro} >>\nstream\n`),
    cuerpo,
    bytes('\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'),
  )
}

const FACTURA = 'BT /F1 12 Tf 72 720 Td (Factura A-1874) Tj 0 -14 Td (Proveedor: ACME S.A.) Tj ET'

/** Motor de mentira que solo cuenta cuantas veces lo llamaron. Es toda la prueba de TAR-9. */
function motorQueCuenta(): MotorOcr & { llamadas: number } {
  return {
    llamadas: 0,
    modelo: 'motor-de-prueba-v1',
    limites: { bytesMaximos: 1000, paginasMaximas: 10, paginasPorAnotacion: 8 },
    async extrae(): Promise<PaginaExtraida[]> {
      this.llamadas++
      return [{ indice: 0, markdown: 'texto del motor', campos: [] }]
    },
  }
}

test('lee la capa de texto de un PDF sin comprimir', async () => {
  const resultado = await leeCapaCero(await pdfCon(FACTURA))
  assert.equal(resultado.hayTexto, true)
  assert.equal(resultado.motivo, null)
  assert.match(resultado.paginas.join('\n'), /Factura A-1874/)
  assert.match(resultado.paginas.join('\n'), /ACME S\.A\./)
})

test('lee la capa de texto de un PDF con FlateDecode', async () => {
  const resultado = await leeCapaCero(await pdfCon(FACTURA, { comprimido: true }))
  assert.equal(resultado.hayTexto, true)
  assert.match(resultado.paginas.join('\n'), /Factura A-1874/)
})

test('un escaneo no tiene capa de texto, y lo dice', async () => {
  // Un JPEG incrustado: el caso normal de un documento escaneado.
  const escaneo = une(
    bytes('%PDF-1.7\n5 0 obj\n<< /Subtype /Image /Filter /DCTDecode /Length 8 >>\nstream\n'),
    Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]),
    bytes('\nendstream\nendobj\n%%EOF\n'),
  )
  const resultado = await leeCapaCero(escaneo)
  assert.equal(resultado.hayTexto, false)
  assert.match(resultado.motivo ?? '', /escaneo|imagen/)
})

test('un PDF cifrado se descarta sin intentar descifrarlo', async () => {
  const resultado = await leeCapaCero(await pdfCon(FACTURA, { extra: '2 0 obj\n<< /Encrypt 3 0 R >>\nendobj\n' }))
  assert.equal(resultado.hayTexto, false)
  assert.match(resultado.motivo ?? '', /cifrado/)
})

test('lo que no es PDF no entra por aqui', async () => {
  const resultado = await leeCapaCero(bytes('\x89PNG\r\n\x1a\n'))
  assert.equal(resultado.hayTexto, false)
  assert.match(resultado.motivo ?? '', /no es un PDF/)
})

// --- El corazon de TAR-9: contar las llamadas -------------------------------------------------

test('un PDF con texto nativo se resuelve SIN llamar al motor', async () => {
  const motor = motorQueCuenta()
  const salida = await extraeConCapaCero(motor, await pdfCon(FACTURA))
  assert.equal(motor.llamadas, 0, 'se llamo al motor teniendo el texto delante')
  assert.equal(salida.porCapaCero, true)
  assert.match(salida.paginas[0].markdown, /Factura A-1874/)
})

test('un escaneo SI llama al motor, y el motivo queda dicho', async () => {
  const motor = motorQueCuenta()
  const escaneo = une(bytes('%PDF-1.7\n5 0 obj\n<< /Length 0 >>\nstream\n'), bytes('\nendstream\n%%EOF\n'))
  const salida = await extraeConCapaCero(motor, escaneo)
  assert.equal(motor.llamadas, 1)
  assert.equal(salida.porCapaCero, false)
  assert.ok(salida.motivo && salida.motivo.length > 0, 'gastar una llamada sin decir por que es lo que se evita')
})

test('pedir anotaciones llama al motor AUNQUE el PDF traiga texto', async () => {
  // El matiz que decide la correccion: la capa 0 da texto, no campos con confianza y region.
  // Devolver campos vacios "porque habia texto" seria dar por extraida una factura sin un dato.
  const motor = motorQueCuenta()
  const salida = await extraeConCapaCero(motor, await pdfCon(FACTURA), { esquemaDeAnotacion: { total: 'number' } })
  assert.equal(motor.llamadas, 1)
  assert.equal(salida.porCapaCero, false)
  assert.match(salida.motivo ?? '', /anotaciones/)
})

test('la via de capa 0 no inventa campos ni confianza', async () => {
  const motor = motorQueCuenta()
  const salida = await extraeConCapaCero(motor, await pdfCon(FACTURA))
  assert.deepEqual(salida.paginas[0].campos, [], 'un campo que nadie extrajo no tiene confianza 1: no tiene confianza')
})

// --- La barrera contra el falso positivo ------------------------------------------------------

test('basura que se descomprime no pasa por texto', () => {
  assert.equal(pareceTexto('\b'), false)
})

test('un texto demasiado corto no cuenta como capa', () => {
  assert.equal(pareceTexto('ok'), false)
})

test('el espanol con acentos si cuenta como texto', () => {
  assert.equal(pareceTexto('Facturación de energía eléctrica del añejo'), true)
})

// --- El extractor de operadores ---------------------------------------------------------------

test('TJ con array y kerning conserva las partes', () => {
  assert.match(extraeTextoDeContenido('[(AC) -20 (ME)] TJ'), /ACME/)
})

test('las cadenas hexadecimales se decodifican', () => {
  assert.match(extraeTextoDeContenido('<48656C6C6F> Tj'), /Hello/)
})

test('el hexadecimal con BOM se lee como UTF-16BE', () => {
  assert.match(extraeTextoDeContenido('<FEFF00480069> Tj'), /Hi/)
})

test('los escapes de una cadena literal se respetan', () => {
  assert.match(extraeTextoDeContenido('(Total \\(IVA\\): 100) Tj'), /Total \(IVA\): 100/)
})

test('Td separa renglones, para que una factura no salga en una sola linea', () => {
  const texto = extraeTextoDeContenido('BT (linea uno) Tj 0 -14 Td (linea dos) Tj ET')
  assert.ok(texto.includes('\n'), 'sin salto de linea la factura deja de ser legible al revisarla')
})
