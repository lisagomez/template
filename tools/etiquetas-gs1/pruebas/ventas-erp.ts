/**
 * Ventas del ERP para el agente: la consulta que se manda, la conversion a cajas por dia, lo que
 * el ERP no sabe (undefined) contra lo que sabe que no se vendio (0), y filas mal formadas.
 * Contra el ERP real (esquema, RLS y rol de solo lectura) corre `migraciones/prueba-ventas-erp.mjs`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cargaVentasErp, completaClave, ESTADOS_VENTA, leeFilasVentas, SQL_VENTAS_ERP, ventasDesdeFilas, type Articulo } from '../dist/index.js'

const G_GOM = completaClave('1952111100005')
const G_CHO = completaClave('1952111100006')
const G_ATU = completaClave('1952111100007')
const art = (sku: string, gtinCaja: string, unidadesPorCaja: number): Articulo => ({ sku, descripcion: sku, categoria: 'dulceria', sitios: [], marcaPropia: false, gtinCaja, reglaCaja: 'fabricante', unidadesPorCaja, notas: [] })
const ARTICULOS = { 'GOM-020': art('GOM-020', G_GOM, 10), 'CHO-021': art('CHO-021', G_CHO, 48), 'ATU-003': art('ATU-003', G_ATU, 48) }

test('ventas del ERP: la consulta es solo lectura, con ventana de dias completos y los estados que cuentan', async () => {
  let pedido: { sql: string; parametros: readonly unknown[] } | undefined
  const r = await cargaVentasErp(async (sql, parametros) => { pedido = { sql, parametros }; return [] }, { sitio: 'SUC-PONIENTE', hoy: '2026-09-26', articulos: ARTICULOS })
  assert.equal(pedido!.sql, SQL_VENTAS_ERP)
  assert.match(SQL_VENTAS_ERP, /^select /)
  assert.doesNotMatch(SQL_VENTAS_ERP, /\b(insert|update|delete|truncate|alter|drop|create|grant)\b/i)
  assert.deepEqual(pedido!.parametros, ['2026-08-29', '2026-09-26', ['confirmado', 'facturado']])
  assert.deepEqual(r.ventana, { desde: '2026-08-29', hasta: '2026-09-26' })
  assert.deepEqual([...ESTADOS_VENTA], ['confirmado', 'facturado'])
})

test('ventas del ERP: piezas a cajas, caja (XBX) tal cual, cero es cero y lo que el ERP no tiene es undefined', () => {
  const f = ventasDesdeFilas([
    { sku: 'GOM-020', claveUnidad: 'H87', cantidad: 420 },  // 420 piezas / 10 por caja / 28 dias
    { sku: 'CHO-021', claveUnidad: 'XBX', cantidad: 14 },   // 14 cajas / 28 dias
    { sku: 'ATU-003', claveUnidad: 'H87', cantidad: 0 },    // el ERP lo tiene y no se vendio
  ], { sitio: 'SUC-PONIENTE', hoy: '2026-09-26', articulos: ARTICULOS })
  assert.equal(f.promedioDiario('SUC-PONIENTE', G_GOM), 1.5)
  assert.equal(f.promedioDiario('SUC-PONIENTE', G_CHO), 0.5)
  assert.equal(f.promedioDiario('SUC-PONIENTE', G_ATU), 0, 'se sabe que no se vendió')
  assert.equal(f.promedioDiario('SUC-CENTRO', G_GOM), undefined, 'el tenant es UN sitio: a los demás no les sabe venta')
  assert.equal(f.promedioDiario('SUC-PONIENTE', '19521111000010'), undefined, 'un artículo que el ERP no tiene no es venta cero')
  assert.equal(f.nombre, 'erp:SUC-PONIENTE')
})

test('ventas del ERP: lo que regresa la base no se confia; una fila mal formada se descarta', () => {
  const r = leeFilasVentas([
    { sku: 'GOM-020', clave_unidad: 'H87', cantidad: '420.0000' },
    { sku: '', clave_unidad: 'H87', cantidad: '1' },
    { sku: 'X', clave_unidad: 7, cantidad: '1' },
    { sku: 'Y', clave_unidad: null, cantidad: '-3' },
    { sku: 'Z', clave_unidad: null, cantidad: 'mucho' },
    'no soy una fila',
  ])
  assert.deepEqual(r, { filas: [{ sku: 'GOM-020', claveUnidad: 'H87', cantidad: 420 }], descartadas: 5 })
})
