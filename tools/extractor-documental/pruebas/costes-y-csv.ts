import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimaCoste, sumaEstimaciones } from '../dist/costes.js'
import { aCsv, neutralizaFormula, registraExportacion, BOM_UTF8 } from '../dist/csv.js'

const TARIFA = { usdPorMilPaginas: 4, usdPorMilPaginasAnotadas: 5, descuentoPorLote: 0.5 }

test('5.000 paginas se ven ANTES de gastarlas', () => {
  const e = estimaCoste(5000, TARIFA)
  assert.equal(e.costeUsd, 20)
  assert.match(e.mensaje, /20\.00 USD/)
})

test('anotaciones y descuento por lotes se aplican', () => {
  assert.equal(estimaCoste(1000, TARIFA, { conAnotaciones: true }).costeUsd, 5)
  assert.equal(estimaCoste(1000, TARIFA, { porLotes: true }).costeUsd, 2)
})

/**
 * La regla heredada de contabilidad.ts: un cero inventado da un presupuesto que PARECE completo y
 * no lo esta, que es peor que un hueco declarado.
 */
test('sin tarifa declarada el coste es null, NUNCA cero', () => {
  const e = estimaCoste(5000, { usdPorMilPaginas: null })
  assert.equal(e.costeUsd, null)
  assert.notEqual(e.costeUsd, 0)
  assert.match(e.mensaje, /DESCONOCIDO/)
})

test('una suma con un hueco es un total desconocido, no un total parcial', () => {
  const total = sumaEstimaciones([estimaCoste(1000, TARIFA), estimaCoste(1000, { usdPorMilPaginas: null })])
  assert.equal(total.paginas, 2000)
  assert.equal(total.costeUsd, null)
  assert.match(total.mensaje, /DESCONOCIDO/)
})

test('cero paginas cuesta cero, y lo negativo revienta', () => {
  assert.equal(estimaCoste(0, TARIFA).costeUsd, 0)
  assert.throws(() => estimaCoste(-1, TARIFA), RangeError)
  assert.throws(() => estimaCoste(1.5, TARIFA), RangeError)
})

// --- CSV ---

const COLUMNAS = [{ clave: 'folio', etiqueta: 'Folio' }, { clave: 'total', etiqueta: 'Total' }]

test('el CSV lleva BOM o Excel destroza los acentos', () => {
  const csv = aCsv([{ folio: 'A-1', total: '1160.00' }], COLUMNAS)
  assert.ok(csv.startsWith(BOM_UTF8))
  assert.ok(aCsv([], COLUMNAS, false).startsWith('Folio,Total'))
})

/**
 * El remate del ataque de la pegatina: cuela el texto en un documento y espera a que alguien
 * exporte. Excel EJECUTA una celda que empieza por = + - o @.
 */
test('una celda que Excel ejecutaria se neutraliza', () => {
  assert.equal(neutralizaFormula('=1+1'), "'=1+1")
  assert.equal(neutralizaFormula('+cmd'), "'+cmd")
  assert.equal(neutralizaFormula('-2'), "'-2")
  assert.equal(neutralizaFormula('@SUM(A1)'), "'@SUM(A1)")
  assert.equal(neutralizaFormula('ACME S.A.'), 'ACME S.A.', 'lo normal no se toca')

  const csv = aCsv([{ folio: '=HYPERLINK("http://malo")', total: '1' }], COLUMNAS)
  assert.ok(csv.includes("'=HYPERLINK"), 'la formula viaja inerte y sigue siendo legible')
})

test('comillas, comas y saltos se escapan', () => {
  const csv = aCsv([{ folio: 'a,b', total: 'di "hola"\nfin' }], COLUMNAS, false)
  assert.ok(csv.includes('"a,b"'))
  assert.ok(csv.includes('"di ""hola""\nfin"'))
})

test('las columnas y su orden los da la plantilla, no lo extraido', () => {
  const csv = aCsv([{ total: '1', folio: 'A', sobrante: 'x' }], COLUMNAS, false)
  assert.equal(csv.split('\r\n')[1], 'A,1', 'sale lo elegido, en su orden')
  assert.ok(!csv.includes('sobrante'))
  assert.throws(() => aCsv([], []), /sin columnas/)
})

test('exportar queda registrado: saca datos de terceros del sistema', () => {
  const r = registraExportacion('lisa', 42, new Date('2026-09-07T10:00:00.000Z'))
  assert.equal(r.quien, 'lisa')
  assert.equal(r.filas, 42)
  assert.equal(r.formato, 'csv')
})
