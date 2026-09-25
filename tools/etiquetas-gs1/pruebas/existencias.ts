/**
 * Lectura → inventario: que dice una lectura, cuando se acepta una recepcion (nada vencido ni
 * por debajo de la vida minima: la leccion de los WMS) y que el alta de un lote SUMA.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  altaDeLote, CATEGORIAS_EJEMPLO, etiquetaCalibracion, estadoVacio, interpreta, parseaLectura, esErrorLectura, perfilParaVistaLocal, PERFIL_EJEMPLO, recibe,
  type EstadoAlmacen,
} from '../dist/index.js'

const HOY = '2026-09-25'
const base = (): EstadoAlmacen => ({
  ...estadoVacio({ sitios: [{ clave: 'CEDIS-NTE', nombre: 'CEDIS Norte', tipo: 'cedis' }], categorias: CATEGORIAS_EJEMPLO }),
  articulos: { 'YOG-001': { sku: 'YOG-001', descripcion: 'Yogurt natural 1 kg', categoria: 'lacteos', sitios: ['CEDIS-NTE'], marcaPropia: false, gtinUnidad: '09521111000013', reglaUnidad: 'fabricante', gtinCaja: '19521111000010', reglaCaja: 'fabricante', unidadesPorCaja: 12, notas: [] } },
})
const lee = (e: EstadoAlmacen, t: string) => { const r = parseaLectura(t); assert.ok(!esErrorLectura(r)); return interpreta(r.elementos, e, HOY) }

test('recepcion: con vida suficiente entra; vencido o por debajo del minimo, no', () => {
  const e = base()
  const ok = recibe(e, lee(e, '(01)19521111000010(17)261030(10)L1'), 'CEDIS-NTE', 't', 'r1')
  assert.equal(ok.resultado.ok, true)
  const vencido = recibe(e, lee(e, '(01)19521111000010(17)260920(10)L1'), 'CEDIS-NTE', 't', 'r2')
  assert.deepEqual(vencido.resultado, { ok: false, motivo: 'el lote está vencido: no se recibe' })
  const corto = recibe(e, lee(e, '(01)19521111000010(17)261003(10)L1'), 'CEDIS-NTE', 't', 'r3')
  assert.equal(corto.resultado.ok, false)
  assert.match(!corto.resultado.ok ? corto.resultado.motivo : '', /al menos 15/)
  assert.deepEqual(lee(e, '(01)19521111000010(17)260920(10)L1').avisos, ['Está vencido: no se recibe ni se surte.'])
})

test('recepcion: la misma tarima (SSCC) no se cuenta dos veces', () => {
  let e = base()
  const t = '(02)19521111000010(37)50(17)261030(10)L1'
  const conSscc = { ...lee(e, t), sscc: '095212340000000013' }
  e = recibe(e, conSscc, 'CEDIS-NTE', 't', 'r1').estado
  assert.equal(e.existencias[0]!.cantidad, 50)
  assert.equal(recibe(e, conSscc, 'CEDIS-NTE', 't', 'r2').resultado.ok, false)
})

test('alta de lote: mismo GTIN, lote y caducidad SUMA; con SSCC es su propia existencia', () => {
  let e = base()
  const a = { sitio: 'CEDIS-NTE', sku: 'YOG-001', gtin: '19521111000010', lote: 'L4471', caducidad: '2026-10-30', cantidad: 1 }
  for (let i = 0; i < 4; i++) e = altaDeLote(e, a, 'etiquetado', 't', `e${i}`).estado
  assert.equal(e.existencias.length, 1)
  assert.equal(e.existencias[0]!.cantidad, 4)
  e = altaDeLote(e, { ...a, cantidad: 50, sscc: '095212340000000013' }, 'etiquetado', 't', 'e9').estado
  assert.equal(e.existencias.length, 2)
})

test('vista local: ^LS y ^LT se pliegan en ^LH (zebrash los ignora), sin bajar de 0', () => {
  const p = perfilParaVistaLocal({ ...PERFIL_EJEMPLO, origenX: 40, origenY: 0, corrimientoIzq: 16, corrimientoSup: 24 })
  assert.deepEqual([p.origenX, p.origenY, p.corrimientoIzq, p.corrimientoSup], [24, 24, 0, 0])
  const q = perfilParaVistaLocal({ ...PERFIL_EJEMPLO, corrimientoSup: -30 })
  assert.equal(q.origenY, 0)
  const real = { ...PERFIL_EJEMPLO, origenX: 40, corrimientoSup: 24 }
  const vista = etiquetaCalibracion(perfilParaVistaLocal(real), real)
  assert.match(vista, /\^LH40,24/)
  assert.match(vista, /LH 40,0 {2}LS 0 {2}LT 24/)
})
