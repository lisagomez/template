/**
 * Zonas dentro del sitio: etiqueta de ubicacion (414)+(254), y movimientos recibo → almacen →
 * piso → merma con la etiqueta de la caja o de la tarima.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aHri, altaDeLote, CATEGORIAS_EJEMPLO, completaClave, disenaEtiqueta, estadoVacio, esErrorLectura, interpreta, leeUbicacion, mueve,
  parseaLectura, PERFIL_EJEMPLO, porZona, revisa, simboloUbicacion, tableroSitio, validaEtiqueta, categoriaPorId, type EstadoAlmacen,
} from '../dist/index.js'

const HOY = '2026-09-25'
const GLN = completaClave('952123490001')
const SITIOS = [{ clave: 'SUC-CENTRO', nombre: 'Sucursal Centro', tipo: 'sucursal' as const, gln: GLN }]
const YOG = { sku: 'YOG-001', descripcion: 'Yogurt natural 1 kg', categoria: 'lacteos', sitios: ['SUC-CENTRO'], marcaPropia: false, gtinUnidad: '09521111000013', reglaUnidad: 'fabricante' as const, gtinCaja: '19521111000010', reglaCaja: 'fabricante' as const, unidadesPorCaja: 12, notas: [] }

function base(): EstadoAlmacen {
  let e: EstadoAlmacen = { ...estadoVacio({ sitios: SITIOS, categorias: CATEGORIAS_EJEMPLO }), articulos: { 'YOG-001': YOG } }
  const alta = (lote: string, caducidad: string, cantidad: number, zona: 'recibo' | 'almacen' | 'piso', sscc?: string) => {
    e = altaDeLote(e, { sitio: 'SUC-CENTRO', sku: 'YOG-001', gtin: '19521111000010', lote, caducidad, cantidad, zona, ...(sscc ? { sscc } : {}) }, 'recepcion', 't', `${lote}-${zona}-${sscc ?? ''}`).estado
  }
  alta('L4471', '2026-10-30', 10, 'recibo')
  alta('L4502', '2026-10-03', 4, 'almacen')
  alta('L0899', '2026-09-20', 2, 'almacen')
  alta('L7000', '2026-11-15', 50, 'recibo', '095212340000000013')
  return e
}
const lee = (e: EstadoAlmacen, t: string) => { const r = parseaLectura(t); assert.ok(!esErrorLectura(r)); return interpreta(r.elementos, e, HOY) }
const mover = (e: EstadoAlmacen, texto: string, destino: 'recibo' | 'almacen' | 'piso' | 'merma', veces = 1) =>
  mueve(e, { sitio: 'SUC-CENTRO', destino, lectura: lee(e, texto), veces, operador: 'prueba' }, 't', `m-${destino}-${texto.length}-${veces}`, HOY)

test('etiqueta de ubicacion: (414) GLN + (254) zona es GS1 valido; (254) sin (414) no', () => {
  const s = simboloUbicacion(GLN, 'almacen')
  assert.equal(aHri(s), `(414)${GLN}(254)ALMACEN`)
  assert.deepEqual(validaEtiqueta([s], { anioActual: 2026 }).filter((h) => h.severidad === 'error'), [])
  assert.ok(validaEtiqueta([[{ ai: '254', valor: 'ALMACEN' }]], { anioActual: 2026 }).some((h) => h.codigo === 'falta-asociacion'))
  const d = disenaEtiqueta({ simbolos: [s], titulo: 'ALMACÉN', lineas: [], unidad: 'ubicacion' }, PERFIL_EJEMPLO)
  const r = revisa({ simbolos: [s], diseno: d, perfil: PERFIL_EJEMPLO, categoria: categoriaPorId(CATEGORIAS_EJEMPLO, 'general'), hoy: HOY })
  const grosor = r.puntos.find((p) => p.id === 'grosor')!
  assert.equal(grosor.estado, 'ok', grosor.titulo)
  assert.match(grosor.explicacion, /Tabla 9/)
})

test('leer una ubicacion: sitio por GLN y zona por (254); GLN ajeno o sin zona, error', () => {
  const r = parseaLectura(`(414)${GLN}(254)PISO`)
  assert.ok(!esErrorLectura(r))
  const u = leeUbicacion(r.elementos, SITIOS)
  assert.ok(u && !('error' in u) && u.zona === 'piso' && u.sitio.clave === 'SUC-CENTRO')
  const otro = parseaLectura(`(414)${completaClave('952123490099')}(254)PISO`)
  assert.ok(!esErrorLectura(otro) && 'error' in leeUbicacion(otro.elementos, SITIOS)!)
  const caja = parseaLectura('(01)19521111000010(17)261030(10)L4471')
  assert.ok(!esErrorLectura(caja) && leeUbicacion(caja.elementos, SITIOS) === undefined)
})

test('mover: recibo → almacen → piso con la etiqueta de la caja; las cajas se toman de la zona anterior', () => {
  let e = base()
  const caja = '(01)19521111000010(17)261030(10)L4471'
  let r = mover(e, caja, 'almacen', 3)
  assert.ok(r.resultado.ok, !r.resultado.ok ? r.resultado.motivo : '')
  e = r.estado
  assert.deepEqual(porZona(e.existencias, 'SUC-CENTRO'), { recibo: 57, almacen: 9, piso: 0, merma: 0 })
  r = mover(e, caja, 'piso', 2)
  assert.ok(r.resultado.ok)
  assert.deepEqual(r.resultado.ok && r.resultado.movimiento.de, ['almacen'])
  e = r.estado
  assert.equal(porZona(e.existencias, 'SUC-CENTRO').piso, 2)
  assert.equal(e.movimientos?.length, 2)
  assert.ok(lee(e, caja).ubicaciones.some((u) => u.zona === 'piso' && u.cajas === 2))
})

test('mover a piso: FEFO avisa si en almacen hay un lote que vence antes; vencido no sube a piso, va a merma', () => {
  const e = base()
  const r = mover(e, '(01)19521111000010(17)261030(10)L4471', 'piso')
  assert.ok(r.resultado.ok)
  assert.match(r.resultado.ok ? r.resultado.avisos.join(' ') : '', /FEFO: en Almacén hay el lote L4502/)
  const vencido = mover(e, '(01)19521111000010(17)260920(10)L0899', 'piso')
  assert.deepEqual(vencido.resultado, { ok: false, motivo: 'está vencido: no sube a piso de venta; muévelo a merma' })
  const merma = mover(e, '(01)19521111000010(17)260920(10)L0899', 'merma', 2)
  assert.ok(merma.resultado.ok)
  const t = tableroSitio(merma.estado, 'SUC-CENTRO', HOY)
  assert.equal(t.cajasEnMerma, 2)
  assert.equal(t.vencidos.length, 0, 'lo que ya esta en merma no vuelve a salir en vencidos')
})

test('mover una tarima por su SSCC la lleva entera; sin existencias suficientes no se mueve nada', () => {
  const e = base()
  const r = mover(e, '(00)095212340000000013', 'almacen')
  assert.ok(r.resultado.ok && r.resultado.movimiento.cajas === 50 && r.resultado.movimiento.sscc === '095212340000000013')
  const demasiadas = mover(e, '(01)19521111000010(17)261003(10)L4502', 'piso', 9)
  assert.deepEqual(demasiadas.resultado, { ok: false, motivo: 'solo hay 4 caja(s) de ese lote fuera de Piso de venta en SUC-CENTRO' })
  assert.equal(demasiadas.estado, e)
})

test('tablero por zona: retirar del anaquel lo que esta en piso y vence; resurtido desde almacen', () => {
  let e = base()
  e = mover(e, '(01)19521111000010(17)261003(10)L4502', 'piso', 1).estado
  e = altaDeLote(e, { sitio: 'SUC-CENTRO', sku: 'YOG-001', gtin: '19521111000010', lote: 'L4600', caducidad: '2026-09-30', cantidad: 3, zona: 'piso' }, 'recepcion', 't', 'l4600').estado
  const t = tableroSitio(e, 'SUC-CENTRO', HOY)
  // L4600 vence en 5 dias y esta en piso: se quita del anaquel. L4502 (8 dias) sigue a la venta.
  assert.deepEqual(t.anaquel.map((f) => [f.existencia.lote, f.zona]), [['L4600', 'piso']])
  assert.deepEqual(t.resurtido[0]!.lotes.map((l) => l.existencia.lote), ['L4502', 'L4471', 'L7000'])
})
