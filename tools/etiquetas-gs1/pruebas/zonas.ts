/**
 * Escanear por zona y rol, la ronda del dia, el conteo ciclico por riesgo y la pieza suelta, en el
 * nucleo: cada escaneo hace la accion de su zona (y el rol que no toca se rechaza), la vista del
 * almacenista no lleva NINGUNA cantidad del sistema (se busca una cantidad testigo en todo lo que
 * recibe), la ronda es determinista y se cierra solo con el escaneo correcto, y la cadena y el
 * anclaje siguen verificando.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  abreConteo, aAammdd, altaConExpediente, aplicaConteo, avanceDeRonda, CATEGORIAS_EJEMPLO, cadenaDe, centralVacio, cierraRonda, completaClave, concilia, deshazMovimiento, diaDelSitio,
  eligeConteoCiclico, ejecutaEscaneo, esErrorLectura, estadoDeTareas, estadoVacio, generaRonda, identificaPieza, interpreta, leeEnConteo, parseaLectura, preparaAncla, proponCaducidad,
  proyecta, recibeAncla, registraHallazgo, registraLlave, salida, sumaDiasIso, ubica, verificaCadena, verificaSitio, vistaSinCantidades, vistaConteoSinCantidades,
  type EstadoAlmacen, type PedidoEscaneo, type RondaDia, type Zona,
} from '../dist/index.js'
import { firmaAncla, generaLlaves, idLlave, verificador } from '../dist/firma.js'

const HOY = '2026-09-27'
const T = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 27, h, m)).toISOString()
const GLN = completaClave('952123490002')
const SITIO = 'SUC-CENTRO'
const ALMA = 'op-aaaa0001'
const OTRO = 'op-bbbb0002'
const SUPER = 'op-cccc0003'
const TESTIGO = 137
const art = (sku: string, descripcion: string, n: string) => ({ sku, descripcion, categoria: 'general', sitios: [SITIO], marcaPropia: false, gtinUnidad: `0${completaClave(`95211110${n}00`)}`, reglaUnidad: 'fabricante' as const, gtinCaja: completaClave(`195211110${n}00`), reglaCaja: 'fabricante' as const, unidadesPorCaja: 12, notas: [] })
const ARTS = { YOG: art('YOG', 'Yogurt 1 kg', '01'), PAN: art('PAN', 'Pan de caja', '02'), GOM: art('GOM', 'Gomitas 1 kg', '03'), CHO: art('CHO', 'Chocolate 100 g', '04') }
const G = (sku: keyof typeof ARTS) => ARTS[sku].gtinCaja
const casa = (sku: keyof typeof ARTS, lote: string, dias: number) => `(01)${G(sku)}(17)${aAammdd(sumaDiasIso(HOY, dias))}(10)${lote}`
const ubic = (z: string) => `(414)${GLN}(254)${z}`

/** Un sitio con un lote de cada color, racks, algo en recibo desde hace horas y la cantidad testigo. */
function sitio(): EstadoAlmacen {
  let e: EstadoAlmacen = { ...estadoVacio({ sitios: [{ clave: SITIO, nombre: 'Sucursal Centro', tipo: 'sucursal', gln: GLN }], categorias: CATEGORIAS_EJEMPLO }), articulos: ARTS }
  const alta = (sku: keyof typeof ARTS, lote: string, dias: number, cantidad: number, zona: Zona, hora: number, posicion?: string) => {
    const r = altaConExpediente(e, { sitio: SITIO, sku, gtin: G(sku), lote, caducidad: sumaDiasIso(HOY, dias), cantidad, zona }, 'recepcion', T(hora), `a-${lote}`, SUPER)
    assert.ok(r.resultado.ok, r.resultado.ok ? '' : r.resultado.motivo)
    e = r.estado
    if (posicion) { const u = ubica(e, SITIO, { gtin: G(sku), lote, caducidad: sumaDiasIso(HOY, dias) }, posicion, T(hora), SUPER); assert.ok(u.resultado.ok); e = u.estado }
  }
  alta('YOG', 'V100', 200, TESTIGO, 'almacen', 1, 'B-01-1')
  alta('YOG', 'V050', 100, 30, 'almacen', 1, 'B-02-1')
  alta('YOG', 'R010', 5, 4, 'piso', 1)
  alta('PAN', 'X001', -2, 3, 'piso', 1)
  alta('GOM', 'N100', 10, 6, 'piso', 1)
  alta('GOM', 'N300', 90, 12, 'recibo', 2)
  alta('CHO', 'C200', 60, 20, 'almacen', 2, 'A-01-1')
  return e
}

const pedido = (zona: Zona, texto: string, extra: Partial<PedidoEscaneo> = {}): PedidoEscaneo => ({ sitio: SITIO, zona, texto, rol: 'almacenista', operador: ALMA, hoy: HOY, cuando: T(9), id: `s-${Math.random().toString(36).slice(2, 8)}`, hora: '09:00', ...extra })
const cajasEn = (e: EstadoAlmacen, lote: string, zona: Zona) => e.existencias.filter((x) => x.lote === lote && (x.zona ?? 'recibo') === zona).reduce((s, x) => s + x.cantidad, 0)

test('la etiqueta de la zona cambia el contexto; y el rol que no opera ahi se RECHAZA (el servidor es la frontera)', () => {
  const e = sitio()
  const z = ejecutaEscaneo(e, pedido('almacen', ubic('PISO')))
  assert.deepEqual([z.vista.tipo, z.vista.zona], ['zona', { sitio: SITIO, zona: 'piso' }])
  const rack = ejecutaEscaneo(e, pedido('almacen', ubic('ALMACEN-B-04-2')))
  assert.deepEqual(rack.vista.zona, { sitio: SITIO, zona: 'almacen', posicion: 'B-04-2' })
  assert.equal(ejecutaEscaneo(e, pedido('recibo', casa('GOM', 'N999', 90))).vista.tipo, 'error', 'el almacenista no recibe')
  assert.match(ejecutaEscaneo(e, pedido('almacen', ubic('RECIBO'))).vista.titulo, /no opera en recibo/)
  const rec = ejecutaEscaneo(e, pedido('piso', casa('YOG', 'R010', 5), { rol: 'recibo' }))
  assert.equal(rec.vista.tipo, 'error', 'recibo no retira de piso')
  assert.equal(rec.estado, e, 'y no cambia nada')
})

test('RECIBO: con (17)(10) se recibe con un escaneo; con el EAN del proveedor pide la foto', () => {
  const e = sitio()
  const r = ejecutaEscaneo(e, pedido('recibo', casa('GOM', 'N999', 90), { rol: 'recibo', operador: 'op-dddd0004' }))
  assert.deepEqual([r.vista.tipo, r.eventos[0]?.tipo, cajasEn(r.estado, 'N999', 'recibo')], ['recibido', 'RECIBIDO', 1])
  const f = ejecutaEscaneo(e, pedido('recibo', ARTS.GOM.gtinUnidad.slice(1), { rol: 'recibo' }))
  assert.deepEqual([f.vista.tipo, f.vista.articulo?.nivel, f.eventos.length], ['recibir-con-foto', 'unidad', 0])
})

test('ALMACEN: lo de recibo entra y se ubica en el rack; lo que ya esta dice «baja primero ese» (FEFO)', () => {
  const e = sitio()
  const m = ejecutaEscaneo(e, pedido('almacen', casa('GOM', 'N300', 90), { posicion: 'C-03-1' }))
  assert.deepEqual([m.vista.tipo, m.eventos.map((x) => x.tipo), cajasEn(m.estado, 'N300', 'almacen')], ['movido', ['MOVIDO', 'UBICADO'], 1])
  assert.equal(m.estado.existencias.find((x) => x.lote === 'N300' && x.zona === 'almacen')?.posicion, 'C-03-1')
  const info = ejecutaEscaneo(e, pedido('almacen', casa('YOG', 'V100', 200)))
  assert.deepEqual([info.vista.tipo, info.vista.fefo?.lote, info.vista.fefo?.ubicacion, info.vista.sonido], ['info', 'V050', 'ALMACEN-B-02-1', 'aviso'])
  assert.match(info.vista.detalle.join(' '), /baja primero el lote V050/)
  assert.equal(ejecutaEscaneo(e, pedido('almacen', casa('YOG', 'V050', 100))).vista.fefo, undefined, 'el que vence primero no tiene «otro antes»')
})

test('PISO: lo vigente sube (con aviso FEFO); ROJO y VENCIDO se retiran con UN escaneo; naranja es promocion', () => {
  const e = sitio()
  const sube = ejecutaEscaneo(e, pedido('piso', casa('YOG', 'V100', 200)))
  assert.deepEqual([sube.vista.tipo, sube.vista.color, cajasEn(sube.estado, 'V100', 'piso')], ['movido', 'aviso', 1])
  assert.match(sube.vista.detalle.join(' '), /FEFO: .*V050/)
  const rojo = ejecutaEscaneo(e, pedido('piso', casa('YOG', 'R010', 5)))
  assert.deepEqual([rojo.vista.tipo, rojo.vista.color, cajasEn(rojo.estado, 'R010', 'piso'), cajasEn(rojo.estado, 'R010', 'almacen')], ['retirado', 'retiro', 0, 4])
  const vencido = ejecutaEscaneo(e, pedido('piso', casa('PAN', 'X001', -2)))
  assert.deepEqual([vencido.vista.color, cajasEn(vencido.estado, 'X001', 'merma')], ['vencido', 3])
  assert.deepEqual([ejecutaEscaneo(e, pedido('piso', casa('GOM', 'N100', 10))).vista.color, ejecutaEscaneo(e, pedido('piso', casa('GOM', 'N100', 10))).eventos.length], ['promocion', 0])
  const noSube = ejecutaEscaneo(ejecutaEscaneo(e, pedido('piso', casa('YOG', 'R010', 5))).estado, pedido('piso', casa('YOG', 'R010', 5)))
  assert.equal(noSube.vista.tipo, 'error', 'lo que se retiró por rojo no vuelve a subir')
})

test('MERMA: la baja pide motivo (salvo lo vencido) y queda en la cadena con el', () => {
  const e = sitio()
  assert.match(ejecutaEscaneo(e, pedido('merma', casa('CHO', 'C200', 60))).vista.titulo, /motivo/)
  const m = ejecutaEscaneo(e, pedido('merma', casa('CHO', 'C200', 60), { motivo: 'empaque roto' }))
  assert.deepEqual([m.vista.tipo, m.eventos[0]?.datos['motivo'], cajasEn(m.estado, 'C200', 'merma')], ['merma', 'empaque roto', 1])
})

test('el ALMACENISTA no recibe NINGUNA cantidad del sistema: la testigo (137) no aparece en ninguna vista, ni en los errores', () => {
  let e = sitio()
  const textos = [casa('YOG', 'V100', 200), casa('YOG', 'V050', 100), casa('YOG', 'R010', 5), casa('GOM', 'N300', 90), ARTS.YOG.gtinUnidad.slice(1), ubic('ALMACEN-B-01-1'), 'basura']
  const vistas = []
  for (const zona of ['almacen', 'piso', 'merma'] as const) for (const t of textos) {
    const r = ejecutaEscaneo(e, pedido(zona, t, { motivo: 'dañado', veces: 500 }))
    vistas.push(vistaSinCantidades(r.vista))
  }
  e = ejecutaEscaneo(e, pedido('piso', casa('YOG', 'V100', 200), { todas: true })).estado
  vistas.push(vistaSinCantidades(ejecutaEscaneo(e, pedido('piso', casa('YOG', 'V100', 200), { veces: 500 })).vista))
  const todo = JSON.stringify(vistas)
  assert.ok(!todo.includes(String(TESTIGO)), 'la cantidad testigo se filtró a la vista del almacenista')
  assert.ok(!/\b\d+ caja\(s\)(?! escaneada)/.test(todo), 'ninguna cifra de cajas que no sea la que él escaneó')
  assert.ok(vistas.some((v) => v.tipo === 'error' && /no quedan cajas suficientes/.test(v.detalle.join(' '))), 'el error de «solo hay N» llega sin la N')
})

test('RONDA: se genera del estado (determinista), en orden de recorrido, y sin cantidades en las instrucciones', () => {
  const e = sitio()
  const a = generaRonda(e, SITIO, HOY, { ahora: T(8) })
  assert.deepEqual(generaRonda(e, SITIO, HOY, { ahora: T(8) }), a, 'el mismo estado da la misma ronda')
  const tipos = a.tareas.map((t) => `${t.tipo}:${t.lote?.lote ?? t.ubicacion}`)
  for (const esperada of ['retirar:R010', 'retirar:X001', 'promover:N100', 'ubicar:N300', 'resurtir:C200']) assert.ok(tipos.includes(esperada), esperada)
  assert.ok(a.tareas.some((t) => t.tipo === 'contar'), 'y las ubicaciones del conteo cíclico')
  const zonas = a.tareas.map((t) => (t.tipo === 'resurtir' ? 1 : { recibo: 0, almacen: 1, piso: 2, merma: 3 }[t.zona]))
  assert.deepEqual(zonas, [...zonas].sort((x, y) => x - y), 'ordenada por recorrido: recibo → almacén (racks) → piso')
  assert.ok(!JSON.stringify(a.tareas.map((t) => t.instruccion)).includes(String(TESTIGO)))
  assert.equal(a.tareas.find((t) => t.tipo === 'retirar' && t.lote?.lote === 'X001')?.destino, 'merma')
  assert.equal(a.tareas.find((t) => t.tipo === 'retirar' && t.lote?.lote === 'R010')?.destino, 'almacen')
})

test('una tarea se cierra SOLO con el escaneo correcto, con su TAREA_CERRADA y el seudonimo; deshacer la reabre', () => {
  const e = sitio()
  const ronda = generaRonda(e, SITIO, HOY, { ahora: T(8) })
  const resurtir = ronda.tareas.find((t) => t.tipo === 'resurtir' && t.lote?.lote === 'C200')!
  const otro = ejecutaEscaneo(e, pedido('almacen', casa('YOG', 'V100', 200)), ronda)
  assert.equal(estadoDeTareas(otro.estado, ronda, '09:00').find((t) => t.id === resurtir.id)?.estado, 'pendiente', 'otro lote no la cierra')
  const bien = ejecutaEscaneo(e, pedido('piso', casa('CHO', 'C200', 60)), ronda)
  const cierre = bien.eventos.find((x) => x.tipo === 'TAREA_CERRADA')!
  assert.deepEqual([cierre.datos['tarea'], cierre.datos['ronda'], cierre.operador, cierre.datos['accion']], [resurtir.id, ronda.id, ALMA, bien.eventos[0]!.hash])
  const hecha = estadoDeTareas(bien.estado, ronda, '09:00').find((t) => t.id === resurtir.id)!
  assert.deepEqual([hecha.estado, hecha.evidencia?.operador], ['hecha', ALMA])
  const d = deshazMovimiento(bien.estado, SITIO, bien.vista.deshacer!, ALMA, T(9, 5), 'dsh')
  assert.ok(d.resultado.ok, d.resultado.ok ? '' : d.resultado.motivo)
  assert.equal(d.resultado.eventos[0]?.tipo, 'CORRECCION', 'deshacer es una CORRECCION, no un borrado')
  assert.deepEqual([cajasEn(d.estado, 'C200', 'piso'), cajasEn(d.estado, 'C200', 'almacen')], [0, 20])
  assert.equal(estadoDeTareas(d.estado, ronda, '09:00').find((t) => t.id === resurtir.id)?.estado, 'pendiente', 'deshecho, la tarea se reabre')
  assert.ok(!deshazMovimiento(bien.estado, SITIO, bien.vista.deshacer!, OTRO, T(9, 5), 'x').resultado.ok, 'solo el propio')
})

test('una tarea que YA NO APLICA se cierra sola con su motivo; lo pendiente se ATRASA pasada su hora', () => {
  const e = sitio()
  const ronda = generaRonda(e, SITIO, HOY, { ahora: T(8) })
  const vendido = salida(e, { sitio: SITIO, tipo: 'MERMA', lote: { gtin: G('PAN'), lote: 'X001', caducidad: sumaDiasIso(HOY, -2) }, cajas: 3, motivo: 'se tiró' }, HOY, T(9), SUPER)
  assert.ok(vendido.resultado.ok)
  const t = estadoDeTareas(vendido.estado, ronda, '09:00').find((x) => x.tipo === 'retirar' && x.lote?.lote === 'X001')!
  assert.deepEqual([t.estado, t.motivo], ['ya-no-aplica', 'el lote ya no está en piso (se vendió o se movió)'])
  assert.equal(estadoDeTareas(e, ronda, '10:30').find((x) => x.tipo === 'retirar' && x.lote?.lote === 'R010')?.estado, 'atrasada')
  assert.ok(avanceDeRonda(estadoDeTareas(vendido.estado, ronda, '09:00')).every((z) => z.total > 0))
})

test('CONTEO CICLICO por riesgo: pocas ubicaciones, con razones sin cantidades, y determinista', () => {
  const e = sitio()
  const u = eligeConteoCiclico(e, SITIO, HOY, 3)
  assert.deepEqual(u, eligeConteoCiclico(e, SITIO, HOY, 3))
  assert.equal(u[0]?.ubicacion, 'PISO', 'piso tiene lo vencido y lo rojo')
  assert.ok(u[0]!.razones.includes('hay lotes vencidos') && u.every((x) => x.razones.includes('nunca se ha contado')))
  assert.ok(!JSON.stringify(u).includes(String(TESTIGO)))
  assert.ok(u.length <= 3)
})

test('el almacenista cuenta A CIEGAS solo sus ubicaciones; recuenta OTRA persona; autoriza el supervisor, nunca quien conto', () => {
  let e = sitio()
  const abre = abreConteo(e, { sitio: SITIO, zonas: ['almacen'], tolerancia: 0, ubicaciones: ['ALMACEN-B-01-1'] }, 'CNT-SUC-CENTRO-20260927090000', T(9), SUPER, { ok: true })
  assert.ok(abre.resultado.ok)
  e = abre.estado
  const folio = 'CNT-SUC-CENTRO-20260927090000'
  const lee = (texto: string, veces: number, posicion: string, quien: string) => { const r = parseaLectura(texto); assert.ok(!esErrorLectura(r)); return leeEnConteo(e, folio, { zona: 'almacen', posicion, lectura: interpreta(r.elementos, e, HOY), veces }, T(9, 10), quien) }
  assert.ok(!lee(casa('YOG', 'V050', 100), 1, 'B-02-1', ALMA).resultado.ok, 'otra ubicación no es de este conteo')
  const l1 = lee(casa('YOG', 'V100', 200), 130, 'B-01-1', ALMA)
  assert.ok(l1.resultado.ok)
  assert.ok(!JSON.stringify(l1.resultado.ok ? l1.resultado.valor : {}).includes(String(TESTIGO)), 'la lectura devuelve lo leído, no lo esperado')
  e = l1.estado
  assert.deepEqual(concilia(e, e.conteos![0]!).map((r) => [r.lote.lote, r.esperado, r.contado]), [['V100', TESTIGO, 130]], 'concilia solo su ubicación (V050 de otro rack no entra)')
  e = cierraRonda(e, folio).estado
  assert.equal(e.conteos![0]!.estado, 'reconteo')
  assert.ok(!lee(casa('YOG', 'V100', 200), TESTIGO, 'B-01-1', ALMA).resultado.ok, 'el reconteo no lo hace quien contó')
  e = lee(casa('YOG', 'V100', 200), TESTIGO, 'B-01-1', OTRO).estado
  e = cierraRonda(e, folio).estado
  assert.ok(!aplicaConteo(e, folio, ALMA, T(10), SUPER, { ok: true }).resultado.ok, 'no autoriza quien contó')
  const ap = aplicaConteo(e, folio, 'Supervisora Centro', T(10), SUPER, { ok: true })
  assert.ok(ap.resultado.ok, ap.resultado.ok ? '' : ap.resultado.motivo)
  const vista = vistaConteoSinCantidades(ap.estado.conteos![0]!)
  assert.ok(!JSON.stringify(vista).includes(String(TESTIGO)), 'la vista del conteo para el almacenista tampoco lleva lo esperado')
})

test('PIEZA SUELTA: la foto de su fecha identifica el lote; si no cuadra con ninguno, HALLAZGO en la cadena', () => {
  const e = sitio()
  const p = (texto: string) => proponCaducidad([{ motor: 'prueba-1.0', ms: 1, lineas: [{ texto }] }], { hoy: HOY })
  const ok = identificaPieza(e, SITIO, 'GOM', p(`CAD ${sumaDiasIso(HOY, 10).split('-').reverse().join('/').replace(/^(\d\d)\/(\d\d)\/20(\d\d)$/, '$1/$2/$3')}`), HOY)
  assert.deepEqual([ok.estado, ok.candidatos[0]?.lote.lote, ok.candidatos[0]?.semaforo], ['identificado', 'N100', 'promocion'])
  const no = identificaPieza(e, SITIO, 'GOM', p('CAD 13/02/28 L7777'), HOY)
  assert.equal(no.estado, 'no-cuadra')
  const h = registraHallazgo(e, { sitio: SITIO, sku: 'GOM', zona: 'piso', fotos: { completa: `sha256:${'e'.repeat(64)}`, recortes: [] }, propuesta: p('CAD 13/02/28 L7777') }, T(11), 'HAL-1', ALMA)
  assert.ok(h.resultado.ok)
  const ev = h.resultado.eventos[0]!
  assert.deepEqual([ev.tipo, ev.lote.lote, ev.lote.caducidad, ev.datos['cambios']], ['HALLAZGO', 'L7777', '2028-02-13', []])
  assert.deepEqual(proyecta(SITIO, cadenaDe(h.estado, SITIO)).renglones.length, proyecta(SITIO, cadenaDe(e, SITIO)).renglones.length, 'un hallazgo no mueve inventario')
})

test('la CADENA y el ANCLAJE verifican despues de un dia de escaneos, cierres, deshacer y hallazgos', () => {
  let e = sitio()
  const ronda: RondaDia = generaRonda(e, SITIO, HOY, { ahora: T(8) })
  for (const [zona, texto] of [['almacen', casa('GOM', 'N300', 90)], ['piso', casa('CHO', 'C200', 60)], ['piso', casa('YOG', 'R010', 5)], ['piso', casa('PAN', 'X001', -2)], ['piso', casa('GOM', 'N100', 10)]] as const) {
    e = ejecutaEscaneo(e, pedido(zona, texto), ronda).estado
  }
  const cadena = cadenaDe(e, SITIO)
  assert.ok(cadena.filter((x) => x.tipo === 'TAREA_CERRADA').length >= 4)
  assert.ok(verificaCadena(SITIO, cadena).ok)
  const llaves = generaLlaves()
  const id = idLlave(llaves.publica)
  const verifica = verificador({ [id]: llaves.publica })
  const c0 = registraLlave(centralVacio(), SITIO, { id, publica: llaves.publica, registrada: T(0) }, T(0))
  const r = recibeAncla(c0, firmaAncla(preparaAncla(SITIO, cadena, [], HOY, T(23))!, llaves.privada), verifica, T(23))
  assert.ok(r.ok, r.motivo)
  assert.equal(verificaSitio(SITIO, cadena, r.central.anclas[SITIO]!, id, verifica).ok, true)
  const proy = proyecta(SITIO, cadena)
  assert.equal(proy.incoherencias.length, 0)
  const avance = avanceDeRonda(estadoDeTareas(e, ronda, '09:00'))
  assert.ok(avance.some((z) => z.hechas > 0))
  const dia = diaDelSitio(e, SITIO, HOY, '10:30', T(10, 30), ronda)
  assert.ok(dia.ronda && dia.avisos.length >= 0)
})
