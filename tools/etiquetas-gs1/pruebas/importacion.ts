/**
 * Catalogo desde CSV y Excel ficticios (prefijo 952, el de demostracion de GS1): validar lo
 * que trae codigo, asignar con la regla mixta, y reimportar con cambios sin duplicar nada.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readSheet } from 'read-excel-file/node'
import {
  aCsv, aplicaImportacion, aRegistros, estadoVacio, filasDeExportacion, leeFilas, parseaCsv, planificaImportacion, registrosDeCeldas,
  CATEGORIAS_EJEMPLO, digitoCorrecto, type EstadoAlmacen, type PlanImportacion,
} from '../dist/index.js'

const SITIOS = [
  { clave: 'CEDIS-NTE', nombre: 'CEDIS Norte', tipo: 'cedis' as const },
  { clave: 'SUC-CENTRO', nombre: 'Sucursal Centro', tipo: 'sucursal' as const },
  { clave: 'SUC-PONIENTE', nombre: 'Sucursal Poniente', tipo: 'sucursal' as const },
  { clave: 'SUC-ORIENTE', nombre: 'Sucursal Oriente', tipo: 'sucursal' as const },
]
const vacio = (): EstadoAlmacen => estadoVacio({ prefijoEmpresa: '9521234', prefijoInterno: '04', sitios: SITIOS })
const cats = CATEGORIAS_EJEMPLO.map((c) => c.id)
const leeCsv = async (n: string) => leeFilas(aRegistros(parseaCsv(await readFile(new URL(`../fixtures/${n}`, import.meta.url), 'utf8'))), cats)
const plan = (f: Awaited<ReturnType<typeof leeCsv>>, e: EstadoAlmacen) => planificaImportacion(f.filas, f.errores, e)
const meta = (id: string) => ({ id, archivo: id, huella: 'sha256:prueba', operador: 'prueba', fecha: '2026-09-25T10:00:00.000Z' })

function tabla(p: PlanImportacion): string {
  const l = p.filas.map((f) => {
    const a = f.articulo
    const cod = a ? `pieza ${a.gtinUnidad} (${a.reglaUnidad}) · caja ${a.gtinCaja} (${a.reglaCaja})` : f.motivos.join('; ')
    return `  ${String(f.fila).padStart(2)} ${f.sku.padEnd(8)} ${f.estado.padEnd(10)} ${cod}${f.cambios.length ? ' · ' + f.cambios.join('; ') : ''}`
  })
  return [...l, ...p.errores.map((e) => `  ${String(e.fila).padStart(2)} ${'—'.padEnd(8)} ${'error'.padEnd(10)} ${e.mensaje}`), '  resumen: ' + JSON.stringify(p.resumen)].join('\n')
}

const porSku = (p: PlanImportacion) => Object.fromEntries(p.filas.map((f) => [f.sku, f]))

test('importacion v1 (CSV): validados, invalidos, conflictos y asignados, cada uno con su regla', async () => {
  const p = plan(await leeCsv('catalogo-v1.csv'), vacio())
  console.log('\nCSV catalogo-v1:\n' + tabla(p))
  const s = porSku(p)
  assert.equal(s['YOG-001']!.articulo!.reglaUnidad, 'fabricante')
  assert.equal(s['YOG-001']!.articulo!.reglaCaja, 'fabricante')
  assert.equal(s['LEC-002']!.articulo!.reglaCaja, 'interno')
  assert.match(s['LEC-002']!.articulo!.notas.join(' '), /Pide al fabricante el GTIN-14 de la caja/)
  assert.equal(s['ATU-003']!.estado, 'invalido')
  assert.match(s['ATU-003']!.motivos[0]!, /debería ser 7/)
  assert.equal(s['ARR-008']!.estado, 'invalido')
  assert.match(s['ARR-008']!.motivos[0]!, /notación científica/)
  assert.deepEqual([s['PAN-004']!.articulo!.reglaUnidad, s['PAN-004']!.articulo!.reglaCaja], ['propio', 'derivado-caja'])
  assert.equal(s['PAN-004']!.articulo!.gtinUnidad, '09521234000013')
  assert.equal(s['PAN-004']!.articulo!.gtinCaja, '19521234000010')
  assert.deepEqual([s['SAL-005']!.articulo!.reglaUnidad, s['SAL-005']!.articulo!.reglaCaja], ['propio', 'igual-unidad'])
  assert.equal(s['QSO-006']!.articulo!.reglaUnidad, 'interno')
  assert.ok(s['QSO-006']!.articulo!.gtinUnidad!.startsWith('004'))
  assert.equal(s['MPD-009']!.estado, 'conflicto')
  assert.match(s['MPD-009']!.motivos[0]!, /prefijo ajeno/)
  assert.equal(s['DUP-010']!.estado, 'conflicto')
  assert.equal(s['HLD-011']!.articulo!.reglaUnidad, 'propio-existente')
  assert.equal(s['JUG-013']!.estado, 'conflicto')
  assert.equal(p.errores[0]!.fila, 13)
  for (const f of p.filas) for (const n of f.nuevas) assert.ok(digitoCorrecto(n.gtin), n.gtin)
  assert.equal(p.resumen['asignado:propio'], 2)
  assert.equal(p.resumen['asignado:interno'], 2)
})

test('importacion v1 (Excel): mismas filas, con los GTIN guardados como numero, dan el MISMO plan', async () => {
  const hoja = await readSheet(new URL('../fixtures/catalogo-v1.xlsx', import.meta.url).pathname)
  const fx = leeFilas(registrosDeCeldas(hoja), cats)
  const px = plan(fx, vacio())
  const pc = plan(await leeCsv('catalogo-v1.csv'), vacio())
  console.log('\nExcel catalogo-v1.xlsx:\n' + tabla(px))
  assert.deepEqual(px.filas.map((f) => [f.sku, f.estado, f.articulo?.gtinUnidad, f.articulo?.gtinCaja]), pc.filas.map((f) => [f.sku, f.estado, f.articulo?.gtinUnidad, f.articulo?.gtinCaja]))
  assert.deepEqual(px.resumen, pc.resumen)
})

test('reimportacion: el mismo archivo no cambia nada; v2 muestra el diff y no duplica ningun GTIN', async () => {
  const e1 = aplicaImportacion(vacio(), plan(await leeCsv('catalogo-v1.csv'), vacio()), meta('v1'))
  const mismo = plan(await leeCsv('catalogo-v1.csv'), e1)
  const aplicados = mismo.filas.filter((f) => f.articulo)
  assert.ok(aplicados.every((f) => f.estado === 'sin-cambio'), 'reimportar v1 debe dar todo sin cambio')
  assert.equal(Object.keys(mismo.resumen).filter((k) => k.startsWith('asignado:')).length, 0)
  const e1b = aplicaImportacion(e1, mismo, meta('v1-otra-vez'))
  assert.equal(e1b.asignaciones.length, e1.asignaciones.length)

  const p2 = plan(await leeCsv('catalogo-v2.csv'), e1b)
  console.log('\nCSV catalogo-v2 contra lo ya cargado (diff):\n' + tabla(p2))
  const s = porSku(p2)
  assert.equal(s['YOG-001']!.estado, 'sin-cambio')
  assert.equal(s['PAN-004']!.estado, 'sin-cambio')
  assert.equal(s['PAN-004']!.articulo!.gtinUnidad, e1.articulos['PAN-004']!.gtinUnidad)
  assert.equal(s['LEC-002']!.estado, 'cambiado')
  assert.equal(s['QSO-006']!.estado, 'cambiado')
  assert.equal(s['QSO-006']!.nuevas[0]!.anterior, e1.articulos['QSO-006']!.gtinUnidad)
  assert.equal(s['ATU-003']!.estado, 'nuevo')
  assert.equal(s['NEW-014']!.estado, 'nuevo')
  const e2 = aplicaImportacion(e1b, p2, meta('v2'))
  const todos = Object.values(e2.articulos).flatMap((a) => (a.gtinCaja === a.gtinUnidad ? [a.gtinUnidad] : [a.gtinUnidad, a.gtinCaja])).filter(Boolean)
  assert.equal(new Set(todos).size, todos.length, 'un GTIN en dos articulos')
  const emitidos = e2.asignaciones.filter((a) => a.regla === 'propio' || a.regla === 'interno' || a.regla === 'derivado-caja').map((a) => a.gtin)
  assert.equal(new Set(emitidos).size, emitidos.length, 'la casa emitio dos veces el mismo numero')
  assert.ok(e2.emitidos.includes(e1.articulos['QSO-006']!.gtinUnidad!), 'el interno retirado sigue reservado: no se reusa')
  const csv = aCsv(filasDeExportacion(e2))
  assert.equal(parseaCsv(csv).length - 1, Object.keys(e2.articulos).length)
  console.log(`\n  articulos ${Object.keys(e2.articulos).length} · asignaciones en bitacora ${e2.asignaciones.length} · numeros emitidos distintos ${new Set(emitidos).size}/${emitidos.length} · importaciones ${e2.importaciones.length}`)
})
