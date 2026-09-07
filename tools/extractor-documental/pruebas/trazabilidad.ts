import { test } from 'node:test'
import assert from 'node:assert/strict'
import { identidadDeLectura, identidadDe } from '../dist/identidad.js'
import { resuelveValor, resuelveIdentificador } from '../dist/reconciliacion.js'
import type { LecturaDeCodigo } from '../dist/identidad.js'
import type { FilaDeCatalogo } from '../dist/reconciliacion.js'

const guia = (instante: string, puesto?: string): LecturaDeCodigo => ({
  clase: 'evento', carga: '449044304130', instanteDispositivo: instante, puesto,
})

/**
 * EL defecto que este cambio corrige. Escanear la misma guia dos veces son DOS eventos: salida de
 * almacen y llegada. Deduplicar por el codigo descartaria el segundo en silencio, y perder un
 * evento es exactamente lo que vuelve inutil un sistema de trazabilidad.
 */
test('dos lecturas del mismo codigo como EVENTO tienen identidades distintas', async () => {
  const salida = await identidadDeLectura(guia('2026-09-07T08:00:00.000Z', 'almacen-1'))
  const llegada = await identidadDeLectura(guia('2026-09-07T18:30:00.000Z', 'destino'))
  assert.notEqual(salida, llegada)
})

test('el mismo evento reenviado SI es el mismo: identidad reproducible', async () => {
  const l = guia('2026-09-07T08:00:00.000Z', 'almacen-1')
  assert.equal(await identidadDeLectura(l), await identidadDeLectura({ ...l }))
})

test('el mismo codigo en dos puestos a la misma hora son dos eventos', async () => {
  const a = await identidadDeLectura(guia('2026-09-07T08:00:00.000Z', 'muelle-1'))
  const b = await identidadDeLectura(guia('2026-09-07T08:00:00.000Z', 'muelle-2'))
  assert.notEqual(a, b)
})

test('un DOCUMENTO si deduplica por contenido: la regla vieja sigue valiendo donde valia', async () => {
  const doc = (i: string): LecturaDeCodigo => ({ clase: 'documento', carga: 'FACTURA-A', instanteDispositivo: i })
  assert.equal(
    await identidadDeLectura(doc('2026-09-07T08:00:00.000Z')),
    await identidadDeLectura(doc('2026-09-09T22:00:00.000Z')),
    'la misma factura subida dos dias distintos es la misma factura',
  )
})

test('una ETIQUETA deduplica por GTIN + lote + serie, no por la carga', async () => {
  const et = (claves: Record<string, string>): LecturaDeCodigo => ({
    clase: 'etiqueta', carga: 'lo-que-sea', instanteDispositivo: '2026-09-07T08:00:00.000Z', claves,
  })
  const base = { gtin: '07612345678900', lote: 'A', serie: '1' }
  assert.equal(await identidadDeLectura(et(base)), await identidadDeLectura(et({ ...base })))
  assert.notEqual(await identidadDeLectura(et(base)), await identidadDeLectura(et({ ...base, serie: '2' })))
  // El orden en que vengan las claves no puede cambiar la identidad.
  assert.equal(
    await identidadDeLectura(et({ gtin: 'G', lote: 'L' })),
    await identidadDeLectura(et({ lote: 'L', gtin: 'G' })),
  )
})

test('identidadDe sigue existiendo y sirviendo para el contenido de un fichero', async () => {
  const b = new TextEncoder().encode('pdf')
  assert.equal(await identidadDe(b), await identidadDe(b))
})

/**
 * El segundo defecto. Dos GTIN que difieren en un digito se parecen ~95% y son productos
 * distintos: emparejarlos por similitud mete stock en el SKU equivocado.
 */
const productos: FilaDeCatalogo[] = [
  { id: 'p1', etiqueta: '07612345678900' },
  { id: 'p2', etiqueta: '07612345678917' },
]

test('resuelveValor RECHAZA un identificador en vez de compararlo por parecido', () => {
  assert.throws(
    () => resuelveValor('07612345678900', productos, { umbral: 0.6, margenDeAmbiguedad: 0.08, formato: 'identificador' }),
    /no se resuelve por similitud/,
  )
})

test('POR QUE la barrera: la via difusa empareja un GTIN que NO esta con otro producto', () => {
  // Medido, no supuesto: dos GTIN que difieren en un digito se parecen 0,87; en dos digitos, 0,80.
  // Un FNSKU a un caracter, 0,82. Un RFC a un caracter, 0,85. Todos por encima de cualquier umbral
  // razonable.
  //
  // El escenario peligroso NO es que haya empate: es que el GTIN correcto **no este en el
  // catalogo**. Entonces el segundo mejor gana solo, y la herramienta afirma con estado `resuelto`
  // que la caja es de otro producto. Eso mete stock en el SKU equivocado sin un solo error.
  // Con un solo producto parecido en el catalogo no hay empate que levante sospecha: gana solo.
  const unSoloProducto: FilaDeCatalogo[] = [{ id: 'p1', etiqueta: '07612345678900' }]
  const noEstaEnCatalogo = '07612345678901'
  const r = resuelveValor(noEstaEnCatalogo, unSoloProducto, { umbral: 0.6, margenDeAmbiguedad: 0.08 })
  assert.equal(r.estado, 'resuelto', 'sin segundo candidato, la via difusa no duda')
  assert.equal(r.elegida?.id, 'p1', 'lo empareja con un producto DISTINTO, y con seguridad')
  assert.ok(r.candidatos[0].similitud > 0.85)

  // Por eso la barrera no es un consejo: marcar el campo como identificador lo impide.
  assert.throws(
    () => resuelveValor(noEstaEnCatalogo, unSoloProducto, { umbral: 0.6, margenDeAmbiguedad: 0.08, formato: 'identificador' }),
    TypeError,
  )
  // Y la via exacta responde lo correcto: no esta.
  assert.equal(resuelveIdentificador(noEstaEnCatalogo, unSoloProducto).estado, 'sin_resolver')
})

test('resuelveIdentificador va por igualdad exacta y no ofrece parecidos', () => {
  const r = resuelveIdentificador('07612345678900', productos)
  assert.equal(r.estado, 'resuelto')
  assert.equal(r.elegida?.id, 'p1')

  const nada = resuelveIdentificador('07612345678999', productos)
  assert.equal(nada.estado, 'sin_resolver')
  assert.deepEqual(nada.candidatos, [], 'ofrecer "el mas parecido" para un GTIN es invitar al error')
})

test('normaliza espacios y mayusculas, pero no toca los caracteres del identificador', () => {
  const filas: FilaDeCatalogo[] = [{ id: 'x', etiqueta: 'AAA010101AAA' }]
  assert.equal(resuelveIdentificador(' aaa010101aaa ', filas).estado, 'resuelto')
})

test('un catalogo con el mismo identificador dos veces es ambiguo, y lo decide una persona', () => {
  const dobles: FilaDeCatalogo[] = [{ id: 'a', etiqueta: 'X1' }, { id: 'b', etiqueta: 'X1' }]
  const r = resuelveIdentificador('X1', dobles)
  assert.equal(r.estado, 'ambiguo')
  assert.equal(r.elegida, null)
})
