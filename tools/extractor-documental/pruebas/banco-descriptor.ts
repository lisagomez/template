/**
 * Los tres estados del descriptor, sobre una base REAL en vez de sobre tres ficheros JSON.
 *
 * La diferencia no es cosmetica. Un fixture puede afirmar lo que quiera: describe un esquema que
 * nadie ha creado, y por tanto prueba el parser del descriptor, no el circuito. Aqui el descriptor
 * sale de `pragma table_info`, asi que si la tabla no existe, el descriptor no la trae.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validaDescriptor, catalogos, detectaDesalineacion, buscaColumna, esquemaDeclarado } from '../dist/index.js'
import { siembra } from '../banco/semilla.ts'
import { descriptorDesdeLaBase, descriptorDesalineado, catalogoDe } from '../banco/descriptor.ts'

test('VACIO: un proyecto virgen da tablas: [] y el descriptor es valido igual', () => {
  const { base } = siembra({ sinNegocio: true })
  try {
    const descriptor = descriptorDesdeLaBase(base)
    assert.deepEqual(descriptor.tablas, [])
    assert.equal(validaDescriptor(descriptor).ok, true)
    // Lo que importa de §2.8: no es un caso especial, es este valor. `esquemaDeclarado` lo acepta
    // sin ninguna rama aparte.
    assert.doesNotThrow(() => esquemaDeclarado(descriptor))
    assert.deepEqual(catalogos(descriptor), [])
  } finally {
    base.cierra()
  }
})

test('POBLADO: el descriptor trae las tablas de negocio con sus columnas reales', () => {
  const { base } = siembra()
  try {
    const descriptor = descriptorDesdeLaBase(base)
    assert.equal(validaDescriptor(descriptor).ok, true)
    assert.deepEqual(
      descriptor.tablas.map((t) => t.nombre).sort(),
      ['facturas', 'productos', 'proveedores'],
    )
    const gtin = buscaColumna(descriptor, 'productos', 'gtin')
    assert.ok(gtin, 'productos.gtin tiene que estar en el descriptor')
    assert.equal(gtin.tipo, 'text')
    assert.equal(gtin.nulable, false)
  } finally {
    base.cierra()
  }
})

test('POBLADO: las tablas de la HERRAMIENTA no entran en el descriptor', () => {
  // Ofrecer `documentos.paginas` como destino de mapeo no significa nada: esas tablas son de la
  // herramienta, no del proyecto que la instala (§2.8).
  const { base } = siembra()
  try {
    const nombres = descriptorDesdeLaBase(base).tablas.map((t) => t.nombre)
    for (const interna of ['documentos', 'lotes', 'plantillas', 'lapidas']) {
      assert.ok(!nombres.includes(interna), `"${interna}" no debe estar en el descriptor`)
    }
  } finally {
    base.cierra()
  }
})

test('POBLADO: los catalogos vienen marcados y las claves foraneas se detectan', () => {
  const { base } = siembra()
  try {
    const descriptor = descriptorDesdeLaBase(base)
    assert.deepEqual(catalogos(descriptor).map((t) => t.nombre).sort(), ['productos', 'proveedores'])
    const fk = buscaColumna(descriptor, 'productos', 'proveedor_id')
    assert.deepEqual(fk?.referencia, { tabla: 'proveedores', columna: 'id' })
    assert.equal(buscaColumna(descriptor, 'proveedores', 'id')?.esClavePrimaria, true)
  } finally {
    base.cierra()
  }
})

test('DESALINEADO: se detecta la columna declarada que ya no existe, y falla legible', () => {
  const { base } = siembra()
  try {
    const real = descriptorDesdeLaBase(base)
    const declarado = descriptorDesalineado(base)
    // El descriptor desalineado sigue siendo VALIDO de forma: el problema no es su sintaxis, es que
    // afirma algo que la base ya no cumple. Confundir las dos cosas manda a buscar donde no es.
    assert.equal(validaDescriptor(declarado).ok, true)
    const problemas = detectaDesalineacion(declarado, real)
    assert.equal(problemas.length, 1)
    assert.deepEqual(problemas[0], {
      tabla: 'proveedores',
      columna: 'telefono_contacto',
      motivo: 'declarada pero no existe en la base',
    })
  } finally {
    base.cierra()
  }
})

test('DESALINEADO: el descriptor real contra si mismo no tiene desalineaciones', () => {
  const { base } = siembra()
  try {
    const real = descriptorDesdeLaBase(base)
    assert.deepEqual(detectaDesalineacion(real, real), [])
  } finally {
    base.cierra()
  }
})

test('el catalogo de proveedores sale de la base con la forma que consume la reconciliacion', () => {
  const { base } = siembra()
  try {
    const filas = catalogoDe(base, 'proveedores')
    assert.equal(filas.length, 8)
    assert.ok(filas.every((f) => f.id.length > 0 && f.etiqueta.length > 0))
    assert.ok(filas.some((f) => f.etiqueta.includes('ACME')))
  } finally {
    base.cierra()
  }
})

test('el catalogo de productos usa el GTIN como etiqueta', () => {
  const { base } = siembra()
  try {
    const filas = catalogoDe(base, 'productos')
    assert.equal(filas.length, 12)
    assert.ok(filas.every((f) => /^\d{13}$/.test(f.etiqueta)), 'la etiqueta de un producto es su GTIN')
  } finally {
    base.cierra()
  }
})

test('en una base virgen los catalogos vienen vacios sin lanzar', () => {
  const { base } = siembra({ sinNegocio: true })
  try {
    // Sin tabla hay CERO filas, no una excepcion: es el proyecto virgen, no un error de entorno.
    // Lanzar aqui obligaria a quien llama a preguntar "¿hay catalogos?" antes de cada uso, que es
    // el `if (tieneCatalogos)` que §2.8 existe para no tener.
    assert.deepEqual(catalogoDe(base, 'proveedores'), [])
    assert.deepEqual(catalogoDe(base, 'productos'), [])
    assert.deepEqual(descriptorDesdeLaBase(base).tablas, [])
  } finally {
    base.cierra()
  }
})
