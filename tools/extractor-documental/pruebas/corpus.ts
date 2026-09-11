import { test } from 'node:test'
import assert from 'node:assert/strict'
import { infiereModelo, nombreDeEntidad } from '../dist/corpus.js'
import type { DocumentoDelCorpus } from '../dist/corpus.js'
import type { CampoExtraido } from '../dist/tipos.js'
import type { DescriptorDeEsquema } from '../dist/esquema.js'

const VACIO: DescriptorDeEsquema = { version: '1', tablas: [] }

const campo = (clave: string, valor: string, formato?: 'identificador' | 'texto'): CampoExtraido => ({
  clave,
  valor,
  confianza: 0.5,
  procedencia: 'ocr',
  ...(formato === undefined ? {} : { formato }),
})

const factura = (id: string, rfc: string, nombre: string, folio: string, extra: CampoExtraido[] = []): DocumentoDelCorpus => ({
  documentoId: id,
  tipoDocumento: 'factura',
  campos: [campo('rfc_emisor', rfc, 'identificador'), campo('nombre_emisor', nombre), campo('folio', folio, 'identificador'), campo('total', '100.00'), ...extra],
})

// Corpus sintetico: dos emisores, uno con tres facturas y otro con dos. Nada de esto es real.
const CORPUS: DocumentoDelCorpus[] = [
  factura('f1', 'AAA010101AAA', 'Acme SA', 'A-1'),
  factura('f2', 'AAA010101AAA', 'Acme SA', 'A-2'),
  factura('f3', 'AAA010101AAA', 'Acme SA', 'A-3'),
  factura('f4', 'BBB020202BBB', 'Beta SC', 'B-1'),
  factura('f5', 'BBB020202BBB', 'Beta SC', 'B-2'),
]

// --- Nombres ----------------------------------------------------------------------------------

test('el nombre de la entidad sale de la clave sin el prefijo de identificador', () => {
  assert.equal(nombreDeEntidad('rfc_emisor'), 'emisor')
  assert.equal(nombreDeEntidad('proveedor_id'), 'proveedor')
  assert.equal(nombreDeEntidad('curp'), 'curp', 'si no queda nada, la clave tal cual')
})

// --- Regla 1: la entidad la funda un identificador que se repite ------------------------------

test('un identificador que se repite entre documentos funda una entidad; el que no, se queda en el documento', () => {
  const { entidades, propuesta } = infiereModelo(CORPUS, VACIO)
  assert.deepEqual(entidades.map((e) => e.tabla), ['emisor'], 'folio no se repite: no es entidad')
  const [emisor] = entidades
  assert.equal(emisor.documentos, 5)
  assert.equal(emisor.distintos, 2)
  assert.equal(emisor.unicos, 0)
  const factura = propuesta.entidades.find((e) => e.tabla === 'factura')
  assert.ok(factura !== undefined)
  assert.ok(factura.columnas.some((c) => c.nombre === 'folio'), 'folio sigue siendo columna de la factura')
  assert.ok(factura.columnas.some((c) => c.nombre === 'emisor_id' && c.referencia?.tabla === 'emisor'))
  assert.ok(!factura.columnas.some((c) => c.nombre === 'rfc_emisor'), 'el rfc se mudo a la entidad')
})

test('un texto que se repite NO funda entidad: se declara como duda para que alguien lo marque', () => {
  const corpus = CORPUS.map((d) => ({ ...d, campos: d.campos.map((c) => (c.clave === 'rfc_emisor' ? { ...c, formato: undefined } : c)) }))
  const { entidades, dudas } = infiereModelo(corpus, VACIO)
  assert.equal(entidades.length, 0)
  const duda = dudas.find((d) => d.sobre === 'rfc_emisor')
  assert.ok(duda !== undefined, 'la repeticion se declara')
  assert.match(duda.motivo, /identificador/)
})

test('un valor de plantilla copiada no funda una entidad aunque se repita en todos los documentos', () => {
  const corpus = CORPUS.map((d) => ({ ...d, campos: [...d.campos, campo('cliente', '...', 'identificador')] }))
  const { entidades } = infiereModelo(corpus, VACIO)
  assert.deepEqual(entidades.map((e) => e.tabla), ['emisor'])
})

// --- Regla 2: atributos por dependencia funcional ---------------------------------------------

test('el campo que siempre acompana al mismo identificador es atributo de la entidad, con su evidencia contada', () => {
  const [emisor] = infiereModelo(CORPUS, VACIO).entidades
  const nombre = emisor.atributos.find((a) => a.clave === 'nombre_emisor')
  assert.ok(nombre !== undefined)
  assert.equal(nombre.grupos, 2, 'se comprobo en los dos grupos con dos o mas facturas')
  assert.ok(!emisor.atributos.some((a) => a.clave === 'folio'), 'folio varia dentro del grupo: no es atributo')
})

test('una dependencia que se cumple en unos grupos y en otros no es una DUDA con los documentos que la rompen', () => {
  const corpus = [...CORPUS.slice(0, 4), factura("f5", "BBB020202BBB", "Beta SC de CV", "B-2")]
  const { entidades, dudas, propuesta } = infiereModelo(corpus, VACIO)
  const [emisor] = entidades
  assert.ok(!emisor.atributos.some((a) => a.clave === 'nombre_emisor'), 'no se fuerza')
  const duda = dudas.find((d) => d.sobre === 'nombre_emisor → emisor')
  assert.ok(duda !== undefined)
  assert.deepEqual([...duda.documentos].sort(), ['f4', 'f5'])
  const tablaFactura = propuesta.entidades.find((e) => e.tabla === 'factura')
  assert.ok(tablaFactura?.columnas.some((c) => c.nombre === 'nombre_emisor'), 'se queda en el documento')
})

test('un valor constante en todo el corpus se avisa y no se cuelga de ninguna entidad', () => {
  const corpus = CORPUS.map((d) => ({ ...d, campos: [...d.campos, campo('moneda', 'MXN')] }))
  const { entidades, propuesta } = infiereModelo(corpus, VACIO)
  assert.ok(!entidades[0].atributos.some((a) => a.clave === 'moneda'))
  assert.ok(propuesta.avisos.some((a) => /"moneda" vale lo mismo/.test(a)))
})

// --- Cardinalidad observada -------------------------------------------------------------------

test('la relacion documento → entidad se propone N:1 y, si un documento tiene varios valores, se declara la duda', () => {
  const corpus = [...CORPUS, factura('f6', 'AAA010101AAA', 'Acme SA', 'A-4', [campo('rfc_emisor', 'BBB020202BBB', 'identificador')])]
  const { propuesta, dudas } = infiereModelo(corpus, VACIO)
  const relacion = propuesta.relaciones.find((r) => r.hacia === 'emisor')
  assert.ok(relacion !== undefined)
  assert.equal(relacion.cardinalidad, '*')
  assert.equal(relacion.haciaPreexistente, false)
  const duda = dudas.find((d) => d.sobre === 'emisor' && /varios valores/.test(d.motivo))
  assert.ok(duda !== undefined)
  assert.deepEqual(duda.documentos, ['f6'])
})

test('un identificador con un solo valor en todo el corpus se declara: puede ser entidad de un miembro o constante', () => {
  const corpus = CORPUS.filter((d) => d.documentoId.startsWith('f') && ['f1', 'f2', 'f3'].includes(d.documentoId))
  const { dudas } = infiereModelo(corpus, VACIO)
  assert.ok(dudas.some((d) => d.sobre === 'emisor' && /UN solo valor/.test(d.motivo)))
})

test('dos tipos de documento que comparten el identificador comparten la entidad', () => {
  const pago: DocumentoDelCorpus = { documentoId: 'p1', tipoDocumento: 'pago', campos: [campo('rfc_emisor', 'AAA010101AAA', 'identificador'), campo('monto', '50.00')] }
  const { entidades, propuesta } = infiereModelo([...CORPUS, pago], VACIO)
  assert.deepEqual([...entidades[0].desde].sort(), ['factura', 'pago'])
  assert.equal(propuesta.relaciones.filter((r) => r.hacia === 'emisor').length, 2)
  assert.deepEqual(propuesta.entidades.map((e) => e.tabla), ['emisor', 'factura', 'pago'], 'la entidad va antes que quien la referencia')
})

// --- Nada se pierde ---------------------------------------------------------------------------

test('un documento sin campos no desaparece: se cuenta y se declara', () => {
  const corpus = [...CORPUS, { documentoId: 'vacio', tipoDocumento: 'factura', campos: [] }]
  const { documentos, dudas } = infiereModelo(corpus, VACIO)
  assert.equal(documentos.length, 6)
  assert.deepEqual(documentos.find((d) => d.documentoId === 'vacio'), { documentoId: 'vacio', tipoDocumento: 'factura', campos: 0 })
  assert.ok(dudas.some((d) => d.sobre === 'vacio'))
})

test('un documentoId repetido es un error de quien llama, no un documento que se pisa en silencio', () => {
  assert.throws(() => infiereModelo([...CORPUS, factura('f1', 'CCC', 'Otro', 'C-1')], VACIO), /documentoId repetido/)
})

// --- La propuesta pasa por la barrera y no toca lo preexistente -------------------------------

test('el SQL crea la entidad antes que el documento, con clave foranea y RLS en las dos', () => {
  const { sql } = infiereModelo(CORPUS, VACIO).propuesta
  assert.ok(sql.indexOf('CREATE TABLE IF NOT EXISTS emisor') < sql.indexOf('CREATE TABLE IF NOT EXISTS factura'))
  assert.match(sql, /emisor_id bigint REFERENCES emisor\(id\)/)
  assert.match(sql, /rfc_emisor text NOT NULL/)
  assert.equal((sql.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length, 2)
  assert.doesNotMatch(sql, /\b(DROP|TRUNCATE|DELETE|UPDATE)\b/i)
  assert.match(sql, /^-- PROPUESTA\. No la aplica nadie por ti/)
})

test('una entidad que ya existe en el proyecto se referencia y NO se crea (RF-31)', () => {
  const descriptor: DescriptorDeEsquema = {
    version: '1',
    tablas: [{ nombre: 'emisor', esCatalogo: true, columnas: [{ nombre: 'clave', tipo: 'bigint', nulable: false, esClavePrimaria: true }] }],
  }
  const { propuesta } = infiereModelo(CORPUS, descriptor)
  assert.doesNotMatch(propuesta.sql, /CREATE TABLE IF NOT EXISTS emisor\b/)
  assert.match(propuesta.sql, /emisor_id bigint REFERENCES emisor\(clave\)/, 'referencia a SU clave primaria, no a un id supuesto')
  const relacion = propuesta.relaciones.find((r) => r.hacia === 'emisor')
  assert.equal(relacion?.haciaPreexistente, true)
  assert.ok(propuesta.avisos.some((a) => /"emisor" ya existe/.test(a)))
})

test('la propuesta es un objeto con SQL como texto: aqui no existe nada que lo ejecute', () => {
  const salida = infiereModelo(CORPUS, VACIO)
  assert.equal(typeof salida.propuesta.sql, 'string')
  const claves = Object.keys(salida.propuesta)
  assert.deepEqual(claves.sort(), ['avisos', 'catalogosDerivados', 'entidades', 'relaciones', 'sql'])
})

test('un identificador mal leido no se repite: cuenta como unico, y el recuento lo delata', () => {
  const corpus = [...CORPUS, factura('f6', 'AAA0101O1AAA', 'Acme SA', 'A-4')]
  const [emisor] = infiereModelo(corpus, VACIO).entidades
  assert.equal(emisor.distintos, 3)
  assert.equal(emisor.unicos, 1, 'la O por el 0 no funda nada y se ve')
})

// --- Copias del mismo documento y claves equivalentes --------------------------------------------

test('el mismo documento en dos formas (XML y PDF) es UN documento: con claveDeDocumento no funda una entidad con su folio', () => {
  const xml: DocumentoDelCorpus = { documentoId: 'f1.xml', tipoDocumento: 'factura', campos: [campo('uuid', 'U-1', 'identificador'), campo('rfc_emisor', 'AAA010101AAA', 'identificador'), campo('total', '100.00')] }
  const pdf: DocumentoDelCorpus = { documentoId: 'f1.pdf', tipoDocumento: 'factura', campos: [campo('uuid', 'U-1', 'identificador'), campo('rfc_emisor', 'AAA010101AAA', 'identificador'), campo('total', '100.00')] }
  const otra: DocumentoDelCorpus = { documentoId: 'f2.xml', tipoDocumento: 'factura', campos: [campo('uuid', 'U-2', 'identificador'), campo('rfc_emisor', 'AAA010101AAA', 'identificador'), campo('total', '50.00')] }
  const sin = infiereModelo([xml, pdf, otra], VACIO)
  assert.ok(sin.entidades.some((e) => e.clave === 'uuid'), 'sin la clave, el uuid repetido funda una entidad falsa')
  const con = infiereModelo([xml, pdf, otra], VACIO, { claveDeDocumento: 'uuid' })
  assert.ok(!con.entidades.some((e) => e.clave === 'uuid'))
  assert.deepEqual(con.fusiones, [{ documentoId: 'f1.xml', copias: ['f1.pdf'] }])
  assert.equal(con.documentos.find((d) => d.documentoId === 'f1.pdf')?.fusionadoEn, 'f1.xml', 'la copia no desaparece: se dice donde quedo')
  assert.equal(con.documentos.length, 3)
})

test('dos copias que discrepan en un valor son una duda con las dos copias, y manda la primera lectura', () => {
  const xml: DocumentoDelCorpus = { documentoId: 'f1.xml', tipoDocumento: 'factura', campos: [{ ...campo('uuid', 'U-1', 'identificador'), procedencia: 'xml' }, { ...campo('total', '1160.00'), procedencia: 'xml' }] }
  const pdf: DocumentoDelCorpus = { documentoId: 'f1.pdf', tipoDocumento: 'factura', campos: [campo('uuid', 'U-1', 'identificador'), campo('total', '116.00')] }
  const { dudas, fusiones } = infiereModelo([xml, pdf], VACIO, { claveDeDocumento: 'uuid' })
  const duda = dudas.find((d) => d.sobre === 'f1.xml · total')
  assert.ok(duda !== undefined)
  assert.deepEqual(duda.documentos, ['f1.xml', 'f1.pdf'])
  assert.match(duda.motivo, /discrepan/)
  assert.equal(fusiones.length, 1)
})

test('dos identificadores que se determinan mutuamente son UNA entidad: el segundo entra como atributo', () => {
  const corpus = CORPUS.map((d) => ({
    ...d,
    campos: [...d.campos, campo('no_certificado_emisor', d.campos[0].valor === 'AAA010101AAA' ? 'CERT-A' : 'CERT-B', 'identificador')],
  }))
  const { entidades, propuesta } = infiereModelo(corpus, VACIO)
  assert.deepEqual(entidades.map((e) => e.tabla), ['emisor'], 'el certificado no funda su propia tabla')
  assert.deepEqual(entidades[0].equivalentes, ['no_certificado_emisor'])
  assert.ok(entidades[0].atributos.some((a) => a.clave === 'no_certificado_emisor'))
  assert.ok(!propuesta.entidades.some((e) => e.tabla === 'certificado_emisor'))
})

test('un identificador cuya mayoria de valores aparece una sola vez se declara: puede ser el del propio documento', () => {
  const corpus = [...CORPUS, factura('f6', 'CCC030303CC3', 'Gamma', 'C-1'), factura('f7', 'DDD040404DD4', 'Delta', 'D-1'), factura('f8', 'EEE050505EE5', 'Epsilon', 'E-1')]
  const { dudas } = infiereModelo(corpus, VACIO)
  const duda = dudas.find((d) => d.sobre === 'emisor' && /claveDeDocumento/.test(d.motivo))
  assert.ok(duda !== undefined)
  assert.match(duda.motivo, /3 de 5 valores/)
})
