/**
 * Rollos: costo por etiqueta, estimacion (dulceria de ejemplo), etiquetas de un ZPL y
 * presupuesto contra gasto. Lo que no tiene precio no se suma como cero.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CONSUMIBLES_VACIOS, costoPorEtiqueta, ESCENARIO_DULCERIA, estima, etiquetasDeZpl, resumenPresupuesto, ROLLOS_REFERENCIA,
  type Consumibles, type Consumo,
} from '../dist/index.js'

const rollo = (id: string) => ROLLOS_REFERENCIA.find((r) => r.id === id)!
const cerca = (a: number, b: number, tol = 0.005) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`)

test('costo por etiqueta = precio del paquete / rollos / etiquetas por rollo', () => {
  cerca(costoPorEtiqueta(rollo('zp2000d-4x2-1240')), 2569 / 6 / 1240, 1e-9)
  cerca(costoPorEtiqueta(rollo('zp1000d-4x6-430')), 228 / 430, 1e-9)
  for (const r of ROLLOS_REFERENCIA) assert.ok(r.fuente?.startsWith('https://') && r.fechaPrecio === '2026-09-25', `${r.id} sin fuente`)
})

test('estimacion de la dulceria de ejemplo: 10,431.8 etiquetas y $2,306.96 al mes con 3 % de merma', () => {
  const e = estima(ESCENARIO_DULCERIA, ROLLOS_REFERENCIA)
  cerca(e.etiquetasMes, (3600 + 288 + 6240) * 1.03, 1e-6)
  cerca(e.costoMes, 2306.96)
  cerca(e.costoAnio, 27683.58, 0.05)
  assert.equal(e.sinPrecio, 0)
  cerca(e.lineas[0]!.rollos, 3708 / 1240, 1e-9)
})

test('una linea con un rollo que no esta en el catalogo no se valora en cero: se cuenta aparte', () => {
  const e = estima({ ...ESCENARIO_DULCERIA, lineas: [...ESCENARIO_DULCERIA.lineas, { concepto: 'Otra', rollo: 'no-existe', etiquetasMes: 1000 }] }, ROLLOS_REFERENCIA)
  assert.equal(e.lineas.at(-1)!.costo, null)
  assert.equal(e.sinPrecio, 1)
  cerca(e.costoMes, 2306.96)
})

test('etiquetas de un ZPL: cada ^XA por su ^PQ', () => {
  assert.equal(etiquetasDeZpl('^XA^FDa^FS^XZ'), 1)
  assert.equal(etiquetasDeZpl('^XA^FDa^FS^PQ3,0,1,Y^XZ'), 3)
  assert.equal(etiquetasDeZpl('^XA^PQ2,0,1,Y^XZ\n^XA^PQ2,0,1,Y^XZ\n^XA^XZ'), 5)
})

test('presupuesto: aviso por proyeccion aunque vaya al 40 %, excedido, sin costo asignado aparte, sin presupuesto', () => {
  const consumo = (sitio: string, impresora: string, etiquetas: number, rolloId?: string): Consumo => ({ id: `${sitio}-${impresora}-${etiquetas}`, fecha: '2026-09-05T10:00:00.000Z', sitio, impresora, etiquetas, origen: 'impresion', operador: 'prueba', ...(rolloId ? { rollo: rolloId } : {}) })
  const c: Consumibles = {
    ...CONSUMIBLES_VACIOS, rollos: ROLLOS_REFERENCIA, rolloPorImpresora: { z1: 'zp2000d-2x1-2340', z2: 'zp1000d-4x6-430' },
    presupuestos: [{ sitio: 'A', mes: '2026-09', monto: 1000 }, { sitio: 'B', mes: '2026-09', monto: 100 }],
    consumos: [consumo('A', 'z1', 3000, 'zp2000d-2x1-2340'), consumo('A', 'z9', 500), consumo('B', 'z2', 430, 'zp1000d-4x6-430'), consumo('A', 'z1', 99, 'zp2000d-2x1-2340')].map((x, i) => (i === 3 ? { ...x, fecha: '2026-08-30T10:00:00.000Z' } : x)),
    compras: [{ id: 'k', fecha: '2026-09-02T09:00:00.000Z', sitio: 'A', rollo: 'zp2000d-2x1-2340', rollos: 6, costoTotal: 1899, operador: 'prueba' }],
  }
  const [a, b, sinP] = resumenPresupuesto(c, ['A', 'B', 'C'], '2026-09', '2026-09-10')
  cerca(a!.gasto, 3000 * 1899 / 6 / 2340)
  assert.equal(a!.etiquetasSinCosto, 500)
  assert.equal(a!.etiquetas, 3500)
  cerca(a!.proyeccion, a!.gasto / 10 * 30)
  assert.equal(a!.estado, 'aviso')
  assert.ok(a!.proporcion! < 0.5)
  assert.equal(a!.compras, 1899)
  assert.equal(b!.estado, 'excedido')
  assert.equal(sinP!.estado, 'sin-presupuesto')
  const soloSinPrecio = resumenPresupuesto({ ...c, presupuestos: [{ sitio: 'A', mes: '2026-09', monto: 1_000_000 }] }, ['A'], '2026-09', '2026-09-10')[0]!
  assert.equal(soloSinPrecio.estado, 'incompleto', 'con impresiones sin precio no se puede decir «en rango»')
  const [agosto] = resumenPresupuesto(c, ['A'], '2026-08', '2026-09-10')
  cerca(agosto!.proyeccion, agosto!.gasto, 1e-9)
})
