/**
 * Inventario fisico: conteo ciego conciliado contra la cadena, reconteo por otra persona,
 * autorizacion, evento CONTEO con su acta, lo movido durante el conteo y la puerta de integridad.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aAammdd, abreConteo, altaConExpediente, aplicaConteo, cadenaDe, CATEGORIAS_EJEMPLO, cierraRonda, cierreDe, completaClave, concilia, conteoDe, esErrorLectura,
  estadoVacio, expedienteDe, faltantesRepetidos, integridadLocal, interpreta, leeEnConteo, mueveConExpediente, parseaLectura, salida, verificaCadena,
  type EstadoAlmacen, type Evento, type Zona,
} from '../dist/index.js'

const HOY = '2026-09-26'
const t = (m: number) => new Date(Date.UTC(2026, 8, 26, 14, m)).toISOString()
const INICIO = Date.UTC(Number(HOY.slice(0, 4)), Number(HOY.slice(5, 7)) - 1, Number(HOY.slice(8, 10)))
const mas = (n: number) => new Date(INICIO + n * 86_400_000).toISOString().slice(0, 10)
const S = 'SUC-ORIENTE'
const G_YOG = '19521111000010'
const G_DUL = completaClave('1952111100002')
const [A, B, JEFE] = ['op-aaaa0001', 'op-bbbb0002', 'op-cccc0003']
const art = (sku: string, categoria: string, gtinCaja: string) => ({ sku, descripcion: sku, categoria, sitios: [S], marcaPropia: false, gtinCaja, reglaCaja: 'fabricante' as const, unidadesPorCaja: 12, notas: [] })

function paso<T>(p: { estado: EstadoAlmacen; resultado: { ok: true; valor: T; eventos: readonly Evento[] } | { ok: false; motivo: string } }) {
  assert.ok(p.resultado.ok, p.resultado.ok ? '' : p.resultado.motivo)
  return { estado: p.estado, valor: p.resultado.valor, eventos: p.resultado.eventos }
}
const lee = (e: EstadoAlmacen, texto: string) => { const r = parseaLectura(texto); assert.ok(!esErrorLectura(r)); return interpreta(r.elementos, e, HOY) }
const caja = (g: string, dias: number, lote: string) => `(01)${g}(17)${aAammdd(mas(dias))}(10)${lote}`

/** Oriente: 12 yogures en piso, 8 gomitas en rack B-01-1 y 2 gomitas de otro lote en piso. */
function base(): EstadoAlmacen {
  let e: EstadoAlmacen = { ...estadoVacio({ sitios: [{ clave: S, nombre: 'Oriente', tipo: 'sucursal' }], categorias: CATEGORIAS_EJEMPLO }), articulos: { YOG: art('YOG', 'lacteos', G_YOG), DUL: art('DUL', 'dulceria', G_DUL) } }
  e = paso(altaConExpediente(e, { sitio: S, sku: 'YOG', gtin: G_YOG, lote: 'L1', caducidad: mas(20), cantidad: 12, zona: 'piso' }, 'recepcion', t(0), 'a1', A)).estado
  e = paso(altaConExpediente(e, { sitio: S, sku: 'DUL', gtin: G_DUL, lote: 'L2', caducidad: mas(90), cantidad: 8 }, 'recepcion', t(1), 'a2', A)).estado
  e = paso(mueveConExpediente(e, { sitio: S, destino: 'almacen', lectura: lee(e, caja(G_DUL, 90, 'L2')), veces: 8, operador: A }, t(2), 'm1', HOY, 'B-01-1')).estado
  e = paso(altaConExpediente(e, { sitio: S, sku: 'DUL', gtin: G_DUL, lote: 'L3', caducidad: mas(60), cantidad: 2, zona: 'piso' }, 'recepcion', t(3), 'a3', A)).estado
  return e
}
const ZONAS: Zona[] = ['almacen', 'piso']
const abre = (e: EstadoAlmacen, folio: string, tolerancia = 1) => paso(abreConteo(e, { sitio: S, zonas: ZONAS, tolerancia }, folio, t(10), A, integridadLocal(e, S)))
const cuenta = (e: EstadoAlmacen, folio: string, zona: Zona, texto: string, veces: number, quien: string, posicion?: string) =>
  leeEnConteo(e, folio, { zona, ...(posicion ? { posicion } : {}), lectura: lee(e, texto), veces }, t(20), quien)

test('conteo que cuadra: ciego, sin reconteo, y aun asi deja su CONTEO con el acta en la cadena', () => {
  let e = abre(base(), 'C1').estado
  const leido = paso(cuenta(e, 'C1', 'piso', caja(G_YOG, 20, 'L1'), 12, A))
  assert.deepEqual(Object.keys(leido.valor).sort(), ['cajas', 'fecha', 'lote', 'operador', 'ronda', 'seq', 'sku', 'zona'], 'la lectura no dice cuánto espera el sistema')
  e = leido.estado
  e = paso(cuenta(e, 'C1', 'almacen', caja(G_DUL, 90, 'L2'), 8, A, 'B-01-1')).estado
  e = paso(cuenta(e, 'C1', 'piso', caja(G_DUL, 60, 'L3'), 2, A)).estado
  const cierre = paso(cierraRonda(e, 'C1'))
  assert.deepEqual([conteoDe(cierre.estado, 'C1')!.estado, cierre.valor.recontar.length], ['por-aplicar', 0])
  const ap = paso(aplicaConteo(cierre.estado, 'C1', undefined, t(40), A, integridadLocal(cierre.estado, S)))
  assert.deepEqual(ap.eventos.map((x) => [x.tipo, x.lote.lote, x.datos['cambios']]), [['CONTEO', 'L1', []], ['CONTEO', 'L2', []], ['CONTEO', 'L3', []]])
  assert.ok(ap.eventos.every((x) => x.datos['acta'] === ap.valor.acta && /^sha256:/.test(ap.valor.acta)))
  assert.deepEqual(integridadLocal(ap.estado, S), { ok: true, diferencias: [] })
})

test('conteo con diferencias: reconteo ciego por OTRA persona, autoriza quien no conto, y el ajuste es un evento', () => {
  let e = abre(base(), 'C2').estado
  e = paso(cuenta(e, 'C2', 'piso', caja(G_YOG, 20, 'L1'), 10, A)).estado                 // faltan 2
  e = paso(cuenta(e, 'C2', 'almacen', caja(G_DUL, 90, 'L2'), 8, A, 'C-02-1')).estado     // cuadra, en otro rack
  e = paso(cuenta(e, 'C2', 'almacen', caja(G_DUL, 90, 'L9'), 3, A, 'C-02-1')).estado     // lote que la cadena no conoce
  // L3 (2 cajas en piso) no se encuentra.
  const r1 = paso(cierraRonda(e, 'C2'))
  e = r1.estado
  assert.deepEqual(r1.valor.recontar.map((x) => `${x.lote.lote}@${x.zona}`).sort(), ['L1@piso', 'L3@piso', 'L9@almacen'])
  assert.ok(!JSON.stringify(r1.valor).includes('esperado'), 'el reconteo también es ciego')
  assert.match((cuenta(e, 'C2', 'piso', caja(G_YOG, 20, 'L1'), 10, A).resultado as { motivo: string }).motivo, /otra persona/)
  e = paso(cuenta(e, 'C2', 'piso', caja(G_YOG, 20, 'L1'), 10, B)).estado
  e = paso(cuenta(e, 'C2', 'almacen', caja(G_DUL, 90, 'L9'), 3, B, 'C-02-1')).estado
  e = paso(cierraRonda(e, 'C2')).estado
  const final = concilia(e, conteoDe(e, 'C2')!)
  assert.deepEqual(final.map((r) => [r.lote.lote, r.zona, r.esperado, r.contado, r.diferencia, r.clase, r.ronda]), [
    ['L1', 'piso', 12, 10, -2, 'faltante', 2], ['L2', 'almacen', 8, 8, 0, 'cuadra', 1], ['L3', 'piso', 2, 0, -2, 'faltante', 2], ['L9', 'almacen', 0, 3, 3, 'desconocido', 2],
  ])
  assert.match((aplicaConteo(e, 'C2', undefined, t(40), JEFE, integridadLocal(e, S)).resultado as { motivo: string }).motivo, /las autoriza una persona/)
  assert.match((aplicaConteo(e, 'C2', B, t(40), JEFE, integridadLocal(e, S)).resultado as { motivo: string }).motivo, /alguien que no contó/)
  const ap = paso(aplicaConteo(e, 'C2', JEFE, t(40), JEFE, integridadLocal(e, S)))
  assert.deepEqual(ap.eventos.map((x) => `${x.tipo}:${x.lote.lote}`), ['CONTEO:L1', 'CONTEO:L2', 'UBICADO:L2', 'CONTEO:L3', 'CONTEO:L9', 'UBICADO:L9'])
  const cajas = (l: string) => ap.estado.existencias.filter((x) => x.lote === l).map((x) => [x.zona, x.cantidad, x.posicion ?? null, x.origen])
  assert.deepEqual([cajas('L1'), cajas('L2'), cajas('L3'), cajas('L9')], [[['piso', 10, null, 'recepcion']], [['almacen', 8, 'C-02-1', 'recepcion']], [], [['almacen', 3, 'C-02-1', 'conteo']]])
  assert.equal(ap.eventos[0]!.datos['autoriza'], JEFE)
  const sellada = conteoDe(ap.estado, 'C2')!.aplicado!.renglones.find((r) => r.lote.lote === 'L9')!
  assert.equal(sellada.clase, 'desconocido', 'lo aplicado se muestra como se selló, no recalculado sobre la cadena ya ajustada')
  assert.deepEqual(integridadLocal(ap.estado, S), { ok: true, diferencias: [] }, 'el estado sigue siendo la proyección de la cadena')
  assert.equal(verificaCadena(S, cadenaDe(ap.estado, S)).ok, true)
  const exp = expedienteDe(ap.estado.eventos!, { gtin: G_DUL, lote: 'L3', caducidad: mas(60) })
  assert.deepEqual(cierreDe(exp, 0), { cerrado: true, por: 'CONTEO' }, 'lo que no aparece cierra su expediente por conteo')
})

test('conteo: lo que se vende DESPUES de leer se suma encima y no aparece como faltante', () => {
  let e = abre(base(), 'C3').estado
  e = paso(cuenta(e, 'C3', 'piso', caja(G_YOG, 20, 'L1'), 12, A)).estado
  e = paso(salida(e, { sitio: S, tipo: 'VENDIDO', lote: { gtin: G_YOG, lote: 'L1', caducidad: mas(20) }, cajas: 2 }, HOY, t(25), B)).estado
  e = paso(cuenta(e, 'C3', 'almacen', caja(G_DUL, 90, 'L2'), 8, A, 'B-01-1')).estado
  e = paso(cuenta(e, 'C3', 'piso', caja(G_DUL, 60, 'L3'), 2, A)).estado
  e = paso(cierraRonda(e, 'C3')).estado
  assert.ok(concilia(e, conteoDe(e, 'C3')!).every((r) => r.clase === 'cuadra'))
  const ap = paso(aplicaConteo(e, 'C3', undefined, t(40), A, integridadLocal(e, S)))
  assert.equal(ap.estado.existencias.find((x) => x.lote === 'L1')!.cantidad, 10, 'la venta de después sigue ahí')
})

test('conteo: con la cadena rota o el estado tocado NO se abre (contar legalizaria la manipulacion)', () => {
  const e = base()
  const tocado = { ...e, existencias: e.existencias.map((x) => (x.lote === 'L1' ? { ...x, cantidad: x.cantidad + 5 } : x)) }
  const r = abreConteo(tocado, { sitio: S, zonas: ZONAS, tolerancia: 1 }, 'C4', t(10), A, integridadLocal(tocado, S))
  assert.equal(r.resultado.ok, false)
  assert.match((r.resultado as { motivo: string }).motivo, /no se abre el conteo: .*la cadena dice 12 caja\(s\) y el estado guardado 17/)
  assert.equal(r.estado, tocado)
})

test('faltantes que se repiten en la misma ubicacion en dos conteos: patron para incidente', () => {
  let e = base()
  for (const [folio, cajas] of [['C5', 11], ['C6', 10]] as const) {
    e = abre(e, folio, 5).estado
    e = paso(cuenta(e, folio, 'piso', caja(G_YOG, 20, 'L1'), cajas, A)).estado
    e = paso(cuenta(e, folio, 'almacen', caja(G_DUL, 90, 'L2'), 8, A, 'B-01-1')).estado
    e = paso(cuenta(e, folio, 'piso', caja(G_DUL, 60, 'L3'), 2, A)).estado
    e = paso(cierraRonda(e, folio)).estado
    e = paso(aplicaConteo(e, folio, undefined, t(40), A, integridadLocal(e, S))).estado
  }
  assert.deepEqual(faltantesRepetidos(e, S), [{ ubicacion: 'piso', folios: ['C5', 'C6'], cajas: 2 }])
})
