/**
 * La foto del INVENTARIO en el momento de la recepcion (decision del laboratorio, 2026-09-28): cada
 * RECIBIDO guarda cuanto habia del lote y del articulo en el sitio antes de recibir y cuanto hay
 * despues (sin merma). La proyeccion la COMPRUEBA contra la cadena: una foto que no cuadra se delata
 * en la integridad del sitio, aunque la cadena y el estado sean coherentes entre si.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aAammdd, altaConExpediente, altaDeLote, CATEGORIAS_EJEMPLO, completaClave, ejecutaEscaneo, esErrorLectura, estadoVacio, integridadLocal, interpreta, parseaLectura, recibeConExpediente,
  registra, sumaDiasIso, transfiere, vistaSinCantidades, type EstadoAlmacen, type Evento, type Zona,
} from '../dist/index.js'

const HOY = '2026-09-28'
const T = (h: number) => new Date(Date.UTC(2026, 8, 28, h)).toISOString()
const S = 'SUC-CENTRO'
const P = 'SUC-PONIENTE'
const GLN = completaClave('952123490002')
const G = '19521111000010'
const VIEJO = completaClave('0040000000001')
const YOG = { sku: 'YOG', descripcion: 'Yogurt 1 kg', categoria: 'general', sitios: [S, P], marcaPropia: false, gtinCaja: G, reglaCaja: 'fabricante' as const, unidadesPorCaja: 12, notas: [] }
const OP = 'op-aaaa0001'
const caja = (lote: string, dias: number, cuenta = '') => `(01)${G}(17)${aAammdd(sumaDiasIso(HOY, dias))}(10)${lote}${cuenta}`
const lee = (e: EstadoAlmacen, texto: string) => { const r = parseaLectura(texto); assert.ok(!esErrorLectura(r)); return interpreta(r.elementos, e, HOY) }
const ultimo = (e: EstadoAlmacen, sitio = S): Evento => e.eventos![sitio]!.at(-1)!

/** Yogurt en almacen (30), piso (5), merma (2, no cuenta) y un lote con un GTIN viejo del mismo articulo (4). */
function base(): EstadoAlmacen {
  let e: EstadoAlmacen = { ...estadoVacio({ sitios: [{ clave: S, nombre: 'Centro', tipo: 'sucursal', gln: GLN }, { clave: P, nombre: 'Poniente', tipo: 'sucursal' }], categorias: CATEGORIAS_EJEMPLO }), articulos: { YOG } }
  const alta = (gtin: string, lote: string, dias: number, cantidad: number, zona: Zona) => {
    const r = altaConExpediente(e, { sitio: S, sku: 'YOG', gtin, lote, caducidad: sumaDiasIso(HOY, dias), cantidad, zona }, 'recepcion', T(8), `a-${lote}`, OP)
    assert.ok(r.resultado.ok)
    e = r.estado
  }
  alta(G, 'A100', 90, 30, 'almacen')
  alta(G, 'B050', 60, 5, 'piso')
  alta(G, 'M001', -3, 2, 'merma')
  alta(VIEJO, 'V010', 40, 4, 'almacen')
  return e
}

test('cada recepcion guarda cuanto habia y cuanto hay: del lote y del articulo (con sus GTIN viejos), sin merma', () => {
  const e = base()
  const r1 = recibeConExpediente(e, lee(e, caja('D200', 120, '')), S, T(9), 'r1', OP, 'caja')
  assert.ok(r1.resultado.ok && r1.resultado.valor.inventario)
  assert.deepEqual(r1.resultado.valor.inventario, { antes: { lote: 0, articulo: 39 }, despues: { lote: 1, articulo: 40 } }, '30 + 5 + 4 (GTIN viejo), sin los 2 de merma')
  assert.deepEqual(ultimo(r1.estado).datos['existencia'], { antes: { lote: 0, articulo: 39 }, despues: { lote: 1, articulo: 40 } }, 'y queda en el evento RECIBIDO')
  const tarima = `(02)${G}(37)24(17)${aAammdd(sumaDiasIso(HOY, 120))}(10)D200`
  const r2 = recibeConExpediente(r1.estado, lee(r1.estado, tarima), S, T(10), 'r2', OP, 'tarima')
  assert.ok(r2.resultado.ok)
  assert.deepEqual(r2.resultado.valor.inventario, { antes: { lote: 1, articulo: 40 }, despues: { lote: 25, articulo: 64 } }, 'la tarima suma sus 24 cajas')
  assert.ok(integridadLocal(r2.estado, S).ok, 'la foto cuadra con la cadena')
})

test('un rechazo no trae foto (no entra al inventario); una transferencia la trae en el destino', () => {
  const e = base()
  const rech = recibeConExpediente(e, lee(e, caja('Z001', -1)), S, T(9), 'r1', OP, 'caja')
  assert.ok(rech.resultado.ok && rech.resultado.valor.rechazada && !rech.resultado.valor.inventario)
  assert.equal(ultimo(rech.estado).datos['existencia'], undefined)
  const t = transfiere(e, { origen: S, destino: P, lote: { gtin: G, lote: 'A100', caducidad: sumaDiasIso(HOY, 90) }, cajas: 10 }, HOY, T(11), 't1', OP)
  assert.ok(t.resultado.ok)
  assert.deepEqual(ultimo(t.estado, P).datos['existencia'], { antes: { lote: 0, articulo: 0 }, despues: { lote: 10, articulo: 10 } })
  assert.ok(integridadLocal(t.estado, S).ok && integridadLocal(t.estado, P).ok)
})

test('una foto que no cuadra con la cadena se DELATA, aunque la cadena y el estado sean coherentes', () => {
  const e = base()
  const clave = { gtin: G, lote: 'D300', caducidad: sumaDiasIso(HOY, 120) }
  const a = altaDeLote(e, { sitio: S, sku: 'YOG', ...clave, cantidad: 12, zona: 'recibo' }, 'recepcion', T(9), 'mentira')
  const falso = registra(a.estado, S, { tipo: 'RECIBIDO', lote: clave, operador: OP, fecha: T(9), datos: { cajas: 12, zona: 'recibo', sku: 'YOG', origen: 'recepcion', existencia: { antes: { lote: 0, articulo: 0 }, despues: { lote: 12, articulo: 12 } }, cambios: [{ zona: 'recibo', cajas: 12 }] } })
  const i = integridadLocal(falso.estado, S)
  assert.equal(i.ok, false)
  assert.match(i.motivo ?? '', /foto del inventario que no cuadra/)
  assert.match(i.motivo ?? '', /la cadena da lote 0, artículo 39 → lote 12, artículo 51/)
})

test('en zona de recibo la vista lo trae; al almacenista NUNCA le llega (vistaSinCantidades la quita)', () => {
  const e = base()
  const r = ejecutaEscaneo(e, { sitio: S, zona: 'recibo', texto: caja('D400', 120), veces: 6, rol: 'recibo', operador: OP, hoy: HOY, cuando: T(9), id: 'e1' })
  assert.equal(r.vista.tipo, 'recibido')
  assert.deepEqual(r.vista.inventario, { antes: { lote: 0, articulo: 39 }, despues: { lote: 6, articulo: 45 } })
  const ciega = vistaSinCantidades(r.vista)
  assert.equal('inventario' in ciega, false)
  assert.ok(!/\b(39|45)\b/.test(JSON.stringify(ciega)))
})
