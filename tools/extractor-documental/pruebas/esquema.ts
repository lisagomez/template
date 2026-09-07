import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  esquemaVacio, esquemaDeclarado, validaDescriptor, buscaTabla, buscaColumna, catalogos, detectaDesalineacion,
} from '../dist/esquema.js'
import type { DescriptorDeEsquema } from '../dist/esquema.js'
import { resuelveValor } from '../dist/reconciliacion.js'
import type { FilaDeCatalogo } from '../dist/reconciliacion.js'

const aqui = dirname(fileURLToPath(import.meta.url))
const fixture = (n: string): DescriptorDeEsquema =>
  JSON.parse(readFileSync(join(aqui, 'fixtures', n), 'utf8')) as DescriptorDeEsquema

const VACIO = fixture('descriptor-vacio.json')
const POBLADO = fixture('descriptor-con-catalogos.json')
const DESALINEADO = fixture('descriptor-desalineado.json')

test('los tres fixtures son descriptores validos', () => {
  for (const [n, d] of [['vacio', VACIO], ['poblado', POBLADO], ['desalineado', DESALINEADO]] as const) {
    const r = validaDescriptor(d)
    assert.ok(r.ok, `${n}: ${r.errores.join(' · ')}`)
  }
})

/**
 * LA prueba de este modulo. Un proyecto virgen no es un caso especial: es `tablas: []`.
 * Si algun dia aparece un `if (tieneCatalogos)`, esta prueba deja de significar nada — por eso
 * recorre las MISMAS funciones con los dos fixtures, sin ramificar.
 */
test('el descriptor vacio recorre el mismo codigo que el poblado', () => {
  for (const descriptor of [VACIO, POBLADO]) {
    assert.equal(validaDescriptor(descriptor).ok, true)
    assert.ok(Array.isArray(catalogos(descriptor)))
    assert.doesNotThrow(() => buscaTabla(descriptor, 'proveedores'))
    assert.doesNotThrow(() => buscaColumna(descriptor, 'proveedores', 'razon_social'))
    assert.doesNotThrow(() => detectaDesalineacion(descriptor, POBLADO))

    // Y el flujo real: resolver un valor contra los catalogos que haya (cero o tres).
    const filas: FilaDeCatalogo[] = catalogos(descriptor).map((t) => ({ id: t.nombre, etiqueta: t.nombre }))
    const r = resuelveValor('proveedores', filas, { umbral: 0.6, margenDeAmbiguedad: 0.08 })
    assert.ok(['resuelto', 'ambiguo', 'sin_resolver'].includes(r.estado))
  }
})

test('el vacio da cero catalogos sin romperse; el poblado da dos', () => {
  assert.equal(catalogos(VACIO).length, 0)
  assert.equal(catalogos(POBLADO).length, 2)
  assert.equal(esquemaVacio().tablas.length, 0)
})

test('buscar en el vacio devuelve null, no una excepcion', () => {
  assert.equal(buscaTabla(VACIO, 'proveedores'), null)
  assert.equal(buscaColumna(VACIO, 'proveedores', 'id'), null)
})

test('se leen columnas y claves foraneas del poblado', () => {
  assert.equal(buscaColumna(POBLADO, 'proveedores', 'razon_social')?.tipo, 'text')
  assert.deepEqual(buscaColumna(POBLADO, 'facturas', 'proveedor_id')?.referencia, {
    tabla: 'proveedores', columna: 'id',
  })
})

/**
 * Mapear contra una columna borrada hace dos migraciones produce una propuesta que parece correcta
 * y revienta al aplicarse. Se detecta ANTES de proponer nada.
 */
test('la desalineacion se detecta: tabla que no existe, columna renombrada y tipo cambiado', () => {
  const problemas = detectaDesalineacion(DESALINEADO, POBLADO)
  const motivos = problemas.map((p) => `${p.tabla}.${p.columna ?? '*'}: ${p.motivo}`)

  assert.ok(motivos.some((m) => m.startsWith('almacenes.*') && m.includes('no existe')))
  assert.ok(motivos.some((m) => m.startsWith('proveedores.nombre_comercial') && m.includes('no existe')))
  assert.ok(motivos.some((m) => m.startsWith('proveedores.rfc') && m.includes('tipo declarado (varchar)')))
})

test('un descriptor alineado consigo mismo no reporta nada', () => {
  assert.deepEqual(detectaDesalineacion(POBLADO, POBLADO), [])
  assert.deepEqual(detectaDesalineacion(VACIO, POBLADO), [], 'no declarar nada nunca esta desalineado')
})

test('la validacion rechaza basura y explica que falta', () => {
  assert.equal(validaDescriptor(null).ok, false)
  assert.equal(validaDescriptor({ version: '1' }).ok, false)
  assert.match(validaDescriptor({ version: '1' }).errores.join(' '), /tablas: \[\]/)
  assert.equal(validaDescriptor({ version: '1', tablas: [{ nombre: 'a', columnas: [] }] }).ok, false)
})

test('esquemaDeclarado implementa el puerto sin consultar nada', async () => {
  const puerto = esquemaDeclarado(POBLADO)
  assert.deepEqual(await puerto.describe(), POBLADO)
  // Y el vacio va por el mismo sitio: no hay constructor distinto para un proyecto virgen.
  assert.deepEqual(await esquemaDeclarado(VACIO).describe(), VACIO)
})

test('un descriptor invalido revienta al CONSTRUIR, no a mitad de una revision', () => {
  const roto = { version: '1' } as unknown as DescriptorDeEsquema
  assert.throws(() => esquemaDeclarado(roto), /Descriptor de esquema invalido/)
})
