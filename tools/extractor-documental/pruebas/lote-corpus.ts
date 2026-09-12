import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { leeCorpus } from '../dist/lote-corpus.js'
import type { ArchivoDelCorpus } from '../dist/lote-corpus.js'
import type { MotorOcr } from '../dist/puertos.js'
import type { PaginaExtraida } from '../dist/tipos.js'
import { registroDeEsquemas, lectorDeTimbre11 } from '../dist/xml/index.js'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0))
const une = (...trozos: Uint8Array[]) => {
  const salida = new Uint8Array(trozos.reduce((n, t) => n + t.length, 0))
  let pos = 0
  for (const t of trozos) { salida.set(t, pos); pos += t.length }
  return salida
}

/** PDF con capa de texto, sin comprimir: lo que produce un generador de facturas. */
const PDF_TEXTO = (() => {
  const contenido = 'BT /F1 12 Tf (Factura A-1874 Emisor RFC: AAA010101AAA Total 1160.00 pesos mexicanos) Tj ET'
  return une(
    bytes('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n'),
    bytes(`4 0 obj\n<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`),
  )
})()

/** PDF escaneado: un JPEG incrustado y ninguna capa de texto. */
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00])
const PDF_ESCANEO = une(
  bytes(`%PDF-1.7\n5 0 obj\n<< /Subtype /Image /Width 10 /Height 10 /Filter /DCTDecode /Length ${JPEG.length} >>\nstream\n`),
  JPEG,
  bytes('\nendstream\nendobj\n%%EOF\n'),
)

const XML = new Uint8Array(readFileSync(join(raiz, 'pruebas', 'fixtures', 'cfdi-40-ingreso.xml')))

const motorFalso = (paginas: PaginaExtraida[], llamadas: Uint8Array[] = []): MotorOcr => ({
  modelo: 'falso-1.0',
  limites: { bytesMaximos: 1e9, paginasMaximas: 100, paginasPorAnotacion: 8 },
  async extrae(documento) { llamadas.push(documento); return paginas },
})

const LEIDO: PaginaExtraida[] = [{
  indice: 0,
  markdown: 'MINUTA 2026-06-02\nAsistentes: 4\nAcuerdo: comprar 12 sillas',
  campos: [
    { clave: 'fecha', valor: '2026-06-02', confianza: 0.9, procedencia: 'ocr', region: { pagina: 0, x: 0, y: 0, ancho: 0.5, alto: 0.1 } },
    { clave: 'sillas', valor: '12', confianza: 0.9, procedencia: 'ocr' },
    { clave: 'presupuesto', valor: '4500', confianza: 0.9, procedencia: 'ocr' },
  ],
}]

const archivo = (documentoId: string, nombre: string, bytes: Uint8Array): ArchivoDelCorpus => ({ documentoId, nombre, tipoDocumento: 'prueba', bytes })

test('cada documento va por la via que le corresponde, decidida por los bytes y no por el nombre', async () => {
  const llamadas: Uint8Array[] = []
  const resultado = await leeCorpus(
    [
      archivo('a', 'con-texto.pdf', PDF_TEXTO),
      archivo('b', 'renombrado.pdf', XML),
      archivo('c', 'escaneo.pdf', PDF_ESCANEO),
      archivo('d', 'foto.jpg', JPEG),
      archivo('e', 'notas.txt', bytes('esto no es nada')),
    ],
    {
      motor: motorFalso(LEIDO, llamadas),
      registro: registroDeEsquemas([lectorDeTimbre11]),
      patrones: [{ clave: 'rfc_emisor', expresion: /RFC:\s*([A-Z0-9]{12,13})/, formato: 'identificador' }],
    },
  )
  assert.deepEqual(resultado.lecturas.map((l) => l.ruta), ['capa-cero', 'xml', 'motor', 'motor', 'ninguna'])
  assert.deepEqual(resultado.porRuta, { 'capa-cero': 1, xml: 1, motor: 2, ninguna: 1 })
  // El escaneo y la foto llevan la MISMA imagen byte a byte: se lee una vez y la segunda se declara
  // reutilizada (spec 009). Antes eran dos llamadas identicas al motor.
  assert.equal(llamadas.length, 1, 'al motor fue una sola imagen: la otra era identica y se reutilizo')
  assert.ok(llamadas[0][0] === 0xff && llamadas[0][1] === 0xd8, 'el escaneo fue como JPEG, no como PDF')
  assert.deepEqual(resultado.lecturas[3].paginasReutilizadas, [0])
  assert.equal(resultado.paginasReutilizadas, 1)
  assert.equal(resultado.lecturas[0].campos[0]?.valor, 'AAA010101AAA')
  assert.ok(resultado.lecturas[1].campos.some((c) => c.clave === 'uuid'), 'el XML dio sus campos exactos')
  assert.match(resultado.lecturas[4].motivo, /no son PDF, imagen ni XML/)
  assert.equal(resultado.lecturas.length, 5, 'ninguno desaparece')
})

test('en la via del motor, un campo que no esta en la transcripcion NO entra al resultado: va al cotejo', async () => {
  const [lectura] = (await leeCorpus([archivo('d', 'foto.jpg', JPEG)], { motor: motorFalso(LEIDO) })).lecturas
  assert.deepEqual(lectura.campos.map((c) => c.clave), ['fecha', 'sillas'])
  assert.deepEqual(lectura.cotejo?.noCoinciden.map((c) => c.clave), ['presupuesto'])
})

test('sin motor, un escaneo se declara no leido con su motivo; no es un error del lote', async () => {
  const [lectura] = (await leeCorpus([archivo('c', 'escaneo.pdf', PDF_ESCANEO)])).lecturas
  assert.equal(lectura.ruta, 'ninguna')
  assert.match(lectura.motivo, /no hay motor/)
})

test('un fallo del motor en un documento se declara EN ese documento y el lote sigue', async () => {
  const motor: MotorOcr = { ...motorFalso(LEIDO), async extrae() { throw new Error('Node corto la peticion') } }
  const resultado = await leeCorpus([archivo('d', 'foto.jpg', JPEG), archivo('a', 'x.pdf', PDF_TEXTO)], { motor })
  assert.equal(resultado.lecturas[0].ruta, 'ninguna')
  assert.match(resultado.lecturas[0].motivo, /fallo al leer: Node corto/)
  assert.equal(resultado.lecturas[1].ruta, 'capa-cero')
})

test('un XML que no es CFDI se declara con el motivo del lector', async () => {
  const [lectura] = (await leeCorpus([archivo('x', 'otro.xml', bytes('<?xml version="1.0"?><Pedido/>'))])).lecturas
  assert.equal(lectura.ruta, 'ninguna')
  assert.match(lectura.motivo, /no es un CFDI/)
})

test('con varios en vuelo el orden de salida es el de entrada y cada documento lleva su tiempo', async () => {
  let reloj = 0
  const motor: MotorOcr = { ...motorFalso(LEIDO), async extrae() { reloj += 100; return LEIDO } }
  const resultado = await leeCorpus(
    // Tres imagenes DISTINTAS (un byte de cola cada una): identicas se reutilizarian y no medirian nada.
    [archivo('1', 'a.jpg', une(JPEG, bytes('1'))), archivo('2', 'b.jpg', une(JPEG, bytes('2'))), archivo('3', 'c.jpg', une(JPEG, bytes('3')))],
    { motor, enVuelo: 2, ahora: () => reloj },
  )
  assert.deepEqual(resultado.lecturas.map((l) => l.documentoId), ['1', '2', '3'])
  assert.ok(resultado.lecturas.every((l) => l.milisegundos >= 0))
  assert.ok(resultado.milisegundos >= 300)
})

test('las claves que el proyecto declara identificadores salen marcadas por cualquier via, sin pisar una marca previa', async () => {
  const resultado = await leeCorpus(
    [archivo('d', 'foto.jpg', JPEG), archivo('b', 'cfdi.xml', XML)],
    { motor: motorFalso(LEIDO), registro: registroDeEsquemas([lectorDeTimbre11]), identificadores: new Set(['sillas', 'total']) },
  )
  assert.equal(resultado.lecturas[0].campos.find((c) => c.clave === 'sillas')?.formato, 'identificador')
  assert.equal(resultado.lecturas[0].campos.find((c) => c.clave === 'fecha')?.formato, undefined)
  assert.equal(resultado.lecturas[1].campos.find((c) => c.clave === 'uuid')?.formato, 'identificador', 'la marca del lector XML se respeta')
})

test('un motor que solo transcribe (campos vacios) da campos por patron, con procedencia ocr y confianza 0, sin cotejo', async () => {
  const transcriptor = motorFalso([{ indice: 0, markdown: 'MINUTA\nFecha: 2026-06-02\nAsistentes: 4', campos: [] }])
  const [lectura] = (await leeCorpus([archivo('d', 'foto.jpg', JPEG)], {
    motor: transcriptor,
    patrones: [{ clave: 'fecha', expresion: /Fecha:\s*(\S+)/ }, { clave: 'asistentes', expresion: /Asistentes:\s*(\d+)/ }],
  })).lecturas
  assert.equal(lectura.ruta, 'motor')
  assert.deepEqual(lectura.campos.map((c) => [c.clave, c.procedencia, c.confianza]), [['fecha', 'ocr', 0], ['asistentes', 'ocr', 0]])
  assert.equal(lectura.cotejo, undefined, 'no hay segunda lectura que cotejar')
  assert.match(lectura.motivo, /sin confianza declarada/)
})

test('el mismo contenido subido dos veces se lee las dos veces, y la segunda se declara copia de la primera', async () => {
  const resultado = await leeCorpus([archivo('a', 'x.pdf', PDF_TEXTO), archivo('b', 'y.pdf', PDF_TEXTO), archivo('c', 'z.xml', XML)])
  assert.equal(resultado.lecturas[0].duplicadoDe, undefined)
  assert.equal(resultado.lecturas[1].duplicadoDe, 'a')
  assert.equal(resultado.lecturas[1].ruta, 'capa-cero', 'se lee igual: declarar, no descartar')
  assert.equal(resultado.lecturas[0].identidad, resultado.lecturas[1].identidad)
  assert.notEqual(resultado.lecturas[2].identidad, resultado.lecturas[0].identidad)
  assert.match(resultado.lecturas[0].identidad, /^[0-9a-f]{64}$/)
})
