/**
 * Los GTIN ANTERIORES de un articulo se siguen leyendo (decision del laboratorio, 2026-09-28): si
 * un articulo cambia de codigo (reimportacion del catalogo o vinculo con el codigo del proveedor),
 * las cajas que ya estan en el almacen con la etiqueta vieja se siguen escaneando, contando y
 * surtiendo en orden FEFO junto con las nuevas. Y un codigo anterior no se le da a OTRO articulo
 * sin decision humana.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aAammdd, abreConteo, altaConExpediente, aplicaImportacion, aRegistros, CATEGORIAS_EJEMPLO, codigosAnteriores, completaClave, ejecutaEscaneo, esErrorLectura, estadoVacio,
  filasDeExportacion, identificaGtin, integridadLocal, interpreta, leeEnConteo, leeFilas, parseaCsv, parseaLectura, planificaImportacion, sumaDiasIso, ventasDesdeFilas, vinculaGtin,
  type EstadoAlmacen, type PedidoEscaneo, type Zona,
} from '../dist/index.js'

const HOY = '2026-09-28'
const T = (h: number) => new Date(Date.UTC(2026, 8, 28, h)).toISOString()
const SITIO = 'SUC-CENTRO'
const GLN = completaClave('952123490002')
const cats = CATEGORIAS_EJEMPLO.map((c) => c.id)
const CAB = 'sku,descripcion,categoria,sitios,marca_propia,gtin,gtin_caja,unidades_por_caja,cajas_por_tarima,vida_util_dias'
const NUEVA = completaClave('1952111100099')
const meta = (id: string) => ({ id, archivo: `${id}.csv`, huella: 'sha256:prueba', operador: 'prueba', fecha: T(8) })

function importa(e: EstadoAlmacen, csv: string, id: string) {
  const f = leeFilas(aRegistros(parseaCsv(csv)), cats)
  const plan = planificaImportacion(f.filas, f.errores, e)
  return { plan, estado: aplicaImportacion(e, plan, meta(id)) }
}

/** Leche con caja INTERNA (la emite la casa), un lote en almacen con esa etiqueta, y luego el fabricante manda su ITF-14. */
function conCambio() {
  const e0 = estadoVacio({ prefijoEmpresa: '9521234', prefijoInterno: '04', sitios: [{ clave: SITIO, nombre: 'Sucursal Centro', tipo: 'sucursal', gln: GLN }], categorias: CATEGORIAS_EJEMPLO })
  const v1 = importa(e0, `${CAB}\nLEC,Leche 1 L,lacteos,${SITIO},NO,9521111000020,,12,60,20\nYOG,Yogurt 1 kg,lacteos,${SITIO},NO,9521111000013,19521111000010,12,50,35`, 'v1').estado
  const vieja = v1.articulos['LEC']!.gtinCaja!
  const alta = altaConExpediente(v1, { sitio: SITIO, sku: 'LEC', gtin: vieja, lote: 'L0900', caducidad: sumaDiasIso(HOY, 9), cantidad: 6, zona: 'almacen' }, 'recepcion', T(9), 'a1', 'op-aaaa0001')
  assert.ok(alta.resultado.ok)
  const v2 = importa(alta.estado, `${CAB}\nLEC,Leche 1 L,lacteos,${SITIO},NO,9521111000020,${NUEVA},12,60,20\nYOG,Yogurt 1 kg,lacteos,${SITIO},NO,9521111000013,19521111000010,12,50,35`, 'v2')
  return { vieja, plan: v2.plan, e: v2.estado }
}

const lee = (e: EstadoAlmacen, texto: string) => { const r = parseaLectura(texto); assert.ok(!esErrorLectura(r)); return interpreta(r.elementos, e, HOY) }
const caja = (gtin: string, lote: string, dias: number) => `(01)${gtin}(17)${aAammdd(sumaDiasIso(HOY, dias))}(10)${lote}`
const escanea = (e: EstadoAlmacen, zona: Zona, texto: string): PedidoEscaneo => ({ sitio: SITIO, zona, texto, rol: 'almacenista', operador: 'op-aaaa0001', hoy: HOY, cuando: T(10), id: `s-${texto.length}` })

test('al cambiar el GTIN de caja, el plan dice que el anterior se seguira leyendo, y el libro lo recuerda', () => {
  const { vieja, plan, e } = conCambio()
  const fila = plan.filas.find((f) => f.sku === 'LEC')!
  assert.equal(fila.estado, 'cambiado')
  assert.match(fila.motivos.join(' '), new RegExp(`anterior ${vieja} se seguirá leyendo`))
  assert.deepEqual(codigosAnteriores(e).map((x) => [x.gtin, x.sku, x.nivel, x.sustituidoPor]), [[vieja, 'LEC', 'caja', NUEVA]])
  assert.match(filasDeExportacion(e).find((f) => f[0] === 'LEC')!.at(-1)!, new RegExp(vieja), 'la exportación del catálogo los enseña')
})

test('la etiqueta VIEJA se sigue leyendo: el articulo, el nivel, el aviso, y el escaneo y el conteo la aceptan', () => {
  const { vieja, e } = conCambio()
  const l = lee(e, caja(vieja, 'L0900', 9))
  assert.equal(l.articulo?.sku, 'LEC')
  assert.equal(l.nivel, 'caja')
  assert.equal(l.codigoAnterior?.sustituidoPor, NUEVA)
  assert.ok(l.avisos.some((a) => a.includes('código ANTERIOR')))
  assert.equal(lee(e, caja(NUEVA, 'L0950', 12)).articulo?.sku, 'LEC', 'el vigente también')
  const r = ejecutaEscaneo(e, escanea(e, 'piso', caja(vieja, 'L0900', 9)))
  assert.equal(r.vista.tipo, 'movido', 'la caja con la etiqueta vieja sube a piso')
  assert.ok(r.vista.detalle.some((d) => d.includes('código ANTERIOR')), 'y se dice que la etiqueta es vieja')
  const c = abreConteo(e, { sitio: SITIO, zonas: ['almacen'], tolerancia: 0 }, 'CNT-1', T(11), 'op-cccc0003', integridadLocal(e, SITIO))
  assert.ok(c.resultado.ok)
  const k = leeEnConteo(c.estado, 'CNT-1', { zona: 'almacen', lectura: lee(c.estado, caja(vieja, 'L0900', 9)), veces: 6 }, T(12), 'op-aaaa0001')
  assert.ok(k.resultado.ok, k.resultado.ok ? '' : k.resultado.motivo)
})

test('FEFO por ARTICULO: el lote con la etiqueta vieja que vence antes se baja primero que el nuevo', () => {
  const { vieja, e } = conCambio()
  const nuevo = altaConExpediente(e, { sitio: SITIO, sku: 'LEC', gtin: NUEVA, lote: 'L0950', caducidad: sumaDiasIso(HOY, 15), cantidad: 6, zona: 'almacen' }, 'recepcion', T(10), 'a2', 'op-aaaa0001')
  assert.ok(nuevo.resultado.ok)
  const r = ejecutaEscaneo(nuevo.estado, escanea(nuevo.estado, 'almacen', caja(NUEVA, 'L0950', 15)))
  assert.equal(r.vista.fefo?.lote, 'L0900', 'baja primero el de la etiqueta vieja, que vence antes')
  void vieja
})

test('un codigo anterior NO se le da a otro articulo: ni por el catalogo ni por vinculo; el vigente de alguien gana', () => {
  const { vieja, e } = conCambio()
  const f = leeFilas(aRegistros(parseaCsv(`${CAB}\nYOG,Yogurt 1 kg,lacteos,${SITIO},NO,9521111000013,${vieja},12,50,35`)), cats)
  const p = planificaImportacion(f.filas, f.errores, e).filas.find((x) => x.sku === 'YOG')!
  assert.equal(p.estado, 'conflicto')
  assert.match(p.motivos.join(' '), /fue de LEC/)
  const v = vinculaGtin(e, { sku: 'YOG', gtin: vieja, nivel: 'caja' }, 'op-cccc0003', T(12), 'v1')
  assert.ok(!v.resultado.ok && /fue de LEC/.test(v.resultado.motivo))
  // Si por una decision de catalogo otro articulo lo tiene HOY, es de ese (el vigente gana).
  const forzado = { ...e, articulos: { ...e.articulos, YOG: { ...e.articulos['YOG']!, gtinCaja: vieja } } }
  assert.equal(identificaGtin(forzado, vieja)?.articulo.sku, 'YOG')
  assert.equal(identificaGtin(forzado, vieja)?.anterior, undefined)
})

test('el vinculo con el codigo del proveedor tambien deja el interno como anterior; y las ventas del codigo viejo son del articulo', () => {
  const e0 = estadoVacio({ prefijoEmpresa: '9521234', prefijoInterno: '04', sitios: [{ clave: SITIO, nombre: 'Centro', tipo: 'sucursal', gln: GLN }], categorias: CATEGORIAS_EJEMPLO })
  const v1 = importa(e0, `${CAB}\nLEC,Leche 1 L,lacteos,${SITIO},NO,9521111000020,,12,60,20`, 'v1').estado
  const interno = v1.articulos['LEC']!.gtinCaja!
  const v = vinculaGtin(v1, { sku: 'LEC', gtin: NUEVA, nivel: 'caja' }, 'op-cccc0003', T(9), 'v1')
  assert.ok(v.resultado.ok)
  assert.equal(identificaGtin(v.estado, interno)?.articulo.sku, 'LEC')
  const ventas = ventasDesdeFilas([{ sku: 'LEC', claveUnidad: 'XBX', cantidad: 28 }], { sitio: SITIO, hoy: HOY, articulos: v.estado.articulos, asignaciones: v.estado.asignaciones })
  assert.equal(ventas.promedioDiario(SITIO, interno), 1, 'el código viejo vende lo del artículo')
})
