import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { proponeModelo, preparaCatalogos, revisaSql, aNombreDeColumna, tipoSqlDe } from '../dist/modelo.js'
import type { PlantillaDeRevision } from '../dist/plantilla.js'
import type { DescriptorDeEsquema } from '../dist/esquema.js'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

const plantilla = (campos: { clave: string; visible: boolean; orden: number }[]): PlantillaDeRevision => ({
  tipoDocumento: 'Factura de Proveedor',
  campos: campos.map((c) => ({ ...c, etiqueta: c.clave, editable: true })),
})

const DESCRIPTOR: DescriptorDeEsquema = {
  version: '1',
  tablas: [
    {
      nombre: 'proveedores',
      esCatalogo: true,
      columnas: [
        { nombre: 'id', tipo: 'bigint', nulable: false, esClavePrimaria: true },
        { nombre: 'nombre', tipo: 'text', nulable: false },
      ],
    },
  ],
}

const VACIO: DescriptorDeEsquema = { version: '1', tablas: [] }

// --- Nombres y tipos ----------------------------------------------------------------------------

test('los nombres de columna salen sin acentos ni espacios', () => {
  assert.equal(aNombreDeColumna('Número de Factura'), 'numero_de_factura')
  assert.equal(aNombreDeColumna('RFC  del   emisor'), 'rfc_del_emisor')
})

test('un nombre que empieza por digito se prefija en vez de quedar invalido', () => {
  assert.equal(aNombreDeColumna('2024 total'), 'c_2024_total')
})

test('un nombre que se queda vacio no produce una columna sin nombre', () => {
  assert.equal(aNombreDeColumna('¿?¡!'), 'campo')
})

test('sin muestras el tipo es text: adivinar estrecho rompe con el cuarto documento', () => {
  assert.equal(tipoSqlDe([]), 'text')
})

test('con muestras homogeneas se estrecha el tipo', () => {
  assert.equal(tipoSqlDe(['12', '3400']), 'bigint')
  assert.equal(tipoSqlDe(['12.50', '3400.00']), 'numeric')
  assert.equal(tipoSqlDe(['2026-01-31']), 'date')
})

test('una sola muestra que rompe el patron devuelve el tipo ancho', () => {
  assert.equal(tipoSqlDe(['12', '3400', 'N/A']), 'text')
})

// --- RF-17: los catalogos salen de los campos habilitados ---------------------------------------

test('los catalogos derivan solo de los campos habilitados, y en su orden', () => {
  const p = plantilla([
    { clave: 'total', visible: true, orden: 2 },
    { clave: 'folio', visible: true, orden: 1 },
    { clave: 'ruido del escaneo', visible: false, orden: 3 },
  ])
  assert.deepEqual(preparaCatalogos(p), ['folio', 'total'])
})

// --- RF-18: la propuesta ------------------------------------------------------------------------

test('propone la tabla nueva con su SQL', () => {
  const propuesta = proponeModelo(plantilla([{ clave: 'folio', visible: true, orden: 1 }]), VACIO)
  assert.equal(propuesta.entidades.length, 1)
  assert.equal(propuesta.entidades[0].tabla, 'factura_de_proveedor')
  assert.match(propuesta.sql, /CREATE TABLE IF NOT EXISTS factura_de_proveedor/)
})

test('la tabla nueva sale con RLS activa y su policy: sin eso cualquiera la lee', () => {
  const propuesta = proponeModelo(plantilla([{ clave: 'folio', visible: true, orden: 1 }]), VACIO)
  assert.match(propuesta.sql, /ENABLE ROW LEVEL SECURITY/)
  assert.match(propuesta.sql, /CREATE POLICY/)
  assert.match(propuesta.sql, /owner_id = auth\.uid\(\)/)
})

test('el SQL lleva escrito que es propuesta y que aplicarla es gate humano', () => {
  const propuesta = proponeModelo(plantilla([{ clave: 'folio', visible: true, orden: 1 }]), VACIO)
  assert.match(propuesta.sql, /PROPUESTA/)
  assert.match(propuesta.sql, /gate humano/)
})

test('un campo deshabilitado no entra en el modelo, y se avisa', () => {
  const propuesta = proponeModelo(
    plantilla([
      { clave: 'folio', visible: true, orden: 1 },
      { clave: 'basura', visible: false, orden: 2 },
    ]),
    VACIO,
  )
  assert.equal(propuesta.entidades[0].columnas.length, 1)
  assert.ok(propuesta.avisos.some((a) => a.includes('basura')))
})

test('un campo mapeado a un catalogo existente propone la clave foranea', () => {
  const propuesta = proponeModelo(
    plantilla([{ clave: 'proveedor', visible: true, orden: 1 }]),
    DESCRIPTOR,
    { mapeos: { proveedor: { tabla: 'proveedores', columna: 'id' } } },
  )
  assert.match(propuesta.sql, /proveedores_id bigint REFERENCES proveedores\(id\)/)
  assert.equal(propuesta.relaciones[0].hacia, 'proveedores')
  assert.equal(propuesta.relaciones[0].haciaPreexistente, true)
})

test('un mapeo a una tabla que no esta en el descriptor avisa en vez de inventarsela', () => {
  const propuesta = proponeModelo(
    plantilla([{ clave: 'proveedor', visible: true, orden: 1 }]),
    VACIO,
    { mapeos: { proveedor: { tabla: 'proveedores', columna: 'id' } } },
  )
  assert.equal(propuesta.relaciones[0].haciaPreexistente, false)
  assert.ok(propuesta.avisos.some((a) => a.includes('no esta en el descriptor')))
})

// --- RF-31 · DoF-9: la barrera --------------------------------------------------------------------

test('si el tipo de documento ya existe como tabla, NO se emite una sola sentencia sobre ella', () => {
  const conFactura: DescriptorDeEsquema = {
    version: '1',
    tablas: [...DESCRIPTOR.tablas, { nombre: 'factura_de_proveedor', columnas: [{ nombre: 'id', tipo: 'bigint', nulable: false }] }],
  }
  const propuesta = proponeModelo(plantilla([{ clave: 'folio', visible: true, orden: 1 }]), conFactura)
  assert.deepEqual(propuesta.entidades, [], 'lo preexistente se referencia, no se propone')
  assert.doesNotMatch(propuesta.sql, /factura_de_proveedor/)
  assert.ok(propuesta.avisos.some((a) => a.includes('ya existe')))
})

test('la barrera lanza ante un ALTER sobre una tabla que la propuesta no crea', () => {
  assert.throws(
    () => revisaSql('ALTER TABLE proveedores ADD COLUMN x text;', DESCRIPTOR, new Set(['factura'])),
    /altera "proveedores"/,
  )
})

test('la barrera DEJA pasar el ALTER de RLS de una tabla que la propuesta si crea', () => {
  assert.doesNotThrow(() =>
    revisaSql('CREATE TABLE IF NOT EXISTS factura (id bigint);\nALTER TABLE factura ENABLE ROW LEVEL SECURITY;', DESCRIPTOR, new Set(['factura'])),
  )
})

test('la barrera lanza ante DROP, TRUNCATE, DELETE, UPDATE, GRANT y REVOKE', () => {
  for (const sentencia of [
    'DROP TABLE proveedores;',
    'TRUNCATE proveedores;',
    'DELETE FROM proveedores;',
    'UPDATE proveedores SET nombre = 1;',
    'GRANT ALL ON proveedores TO anon;',
    'REVOKE ALL ON proveedores FROM anon;',
  ]) {
    assert.throws(() => revisaSql(sentencia, DESCRIPTOR, new Set()), /RF-31/, `deberia rechazar: ${sentencia}`)
  }
})

test('la barrera lanza si se intenta crear una tabla que ya existe', () => {
  assert.throws(
    () => revisaSql('CREATE TABLE IF NOT EXISTS proveedores (id bigint);', DESCRIPTOR, new Set(['proveedores'])),
    /ya existe en el descriptor/,
  )
})

// --- RF-19: no existe la ruta de ejecucion ---------------------------------------------------------

test('el generador no tiene ninguna via para EJECUTAR el SQL que emite', () => {
  // DoF-5 dice "se emite en SQL y no se aplica sin aprobacion humana". La unica forma de
  // garantizarlo de verdad es que la ruta no exista: sin cliente, sin `execute`, sin `query`.
  const codigo = readFileSync(join(raiz, 'src', 'modelo.ts'), 'utf8')
  for (const patron of [/\bexecute\s*\(/, /\bquery\s*\(/, /\brpc\s*\(/, /\.from\s*\(/, /from ['"]pg/]) {
    assert.doesNotMatch(codigo, patron, `modelo.ts tiene una via de ejecucion (${patron}): RF-19 exige que no exista`)
  }
})

test('la propuesta es una cadena, no un objeto ejecutable', () => {
  const propuesta = proponeModelo(plantilla([{ clave: 'folio', visible: true, orden: 1 }]), VACIO)
  assert.equal(typeof propuesta.sql, 'string')
})

test('sin campos habilitados no hay nada que crear, y lo dice', () => {
  const propuesta = proponeModelo(plantilla([{ clave: 'x', visible: false, orden: 1 }]), VACIO)
  assert.match(propuesta.sql, /Nada que crear|CREATE TABLE/)
})
