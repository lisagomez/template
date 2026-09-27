/**
 * El expediente del lote de punta a punta: regla de 2/3 con devolucion, semaforo de cinco estados
 * con su accion y su bloqueo, proyeccion = estado, CORRECCION en vez de edicion, transferencia
 * enlazada entre dos sitios, el agente de riesgo y los seudonimos borrables.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  aAammdd, altaConExpediente, cadenaDe, CATEGORIAS_EJEMPLO, categoriaPorId, cierreDe, completaClave, corrige, corridaAgente, decide, esErrorLectura, estadoSemaforo,
  estadoVacio, evaluaRiesgo, expedienteDe, idLote, integridadLocal, interpreta, leeUbicacion, minimoRecepcion, mueveConExpediente, nuevoEvento, parseaLectura,
  recibeConExpediente, recomendaciones, salida, simboloUbicacion, TEXTO_SEMAFORO, transfiere, ventasFicticias, verificaCadena, verificaTransferencias,
  type ClaveLote, type EstadoAlmacen, type Evento, type Zona,
} from '../dist/index.js'
import { seudonimosEnArchivo } from '../dist/almacenes/seudonimos.js'

const HOY = '2026-09-26'
const t = (h: number, d = 26) => new Date(Date.UTC(2026, 8, d, h)).toISOString()
const INICIO = Date.UTC(Number(HOY.slice(0, 4)), Number(HOY.slice(5, 7)) - 1, Number(HOY.slice(8, 10)))
const mas = (n: number) => new Date(INICIO + n * 86_400_000).toISOString().slice(0, 10)
const GLN = completaClave('952123490001')
const SITIOS = [
  { clave: 'CEDIS-NTE', nombre: 'CEDIS Norte', tipo: 'cedis' as const },
  { clave: 'SUC-CENTRO', nombre: 'Sucursal Centro', tipo: 'sucursal' as const, gln: GLN },
  { clave: 'SUC-PONIENTE', nombre: 'Sucursal Poniente', tipo: 'sucursal' as const },
]
const G_DUL = completaClave('1952111100002')
const G_YOG = '19521111000010'
const art = (sku: string, descripcion: string, categoria: string, gtinCaja: string, vidaUtilDias?: number) => ({
  sku, descripcion, categoria, sitios: SITIOS.map((s) => s.clave), marcaPropia: false, gtinCaja, reglaCaja: 'fabricante' as const, unidadesPorCaja: 12, notas: [], ...(vidaUtilDias ? { vidaUtilDias } : {}),
})
const base = (): EstadoAlmacen => ({
  ...estadoVacio({ sitios: SITIOS, categorias: CATEGORIAS_EJEMPLO }),
  articulos: { 'DUL-001': art('DUL-001', 'Gomitas surtidas 1 kg', 'dulceria', G_DUL, 90), 'YOG-001': art('YOG-001', 'Yogurt natural 1 kg', 'lacteos', G_YOG) },
})
const lectura = (e: EstadoAlmacen, texto: string) => { const r = parseaLectura(texto); assert.ok(!esErrorLectura(r)); return interpreta(r.elementos, e, HOY) }
const OP = 'op-0a1b2c3d'

function ok<T>(p: { estado: EstadoAlmacen; resultado: { ok: true; valor: T; eventos: readonly Evento[] } | { ok: false; motivo: string } }): { estado: EstadoAlmacen; valor: T; eventos: readonly Evento[] } {
  assert.ok(p.resultado.ok, p.resultado.ok ? '' : p.resultado.motivo)
  return { estado: p.estado, valor: p.resultado.valor, eventos: p.resultado.eventos }
}

test('regla de 2/3: con 90 dias de vida util, 59 se RECHAZA con devolucion y evidencia; 60 entra', () => {
  assert.equal(minimoRecepcion(categoriaPorId(CATEGORIAS_EJEMPLO, 'dulceria'), 90).dias, 60)
  assert.equal(minimoRecepcion(categoriaPorId(CATEGORIAS_EJEMPLO, 'dulceria')).regla, 'absoluto')
  const e0 = base()
  const texto = `(02)${G_DUL}(37)40(17)${aAammdd(mas(59))}(10)L0915`
  const r = ok(recibeConExpediente(e0, lectura(e0, texto), 'SUC-CENTRO', t(9), 'r1', OP, texto))
  const dev = r.valor.rechazada!
  assert.equal(dev.regla, 'regla de 2/3: con 90 días de vida útil debe llegar con al menos 60')
  assert.deepEqual([dev.cajas, dev.diasRestantes, dev.minimoDias, dev.lectura], [40, 59, 60, texto])
  const ev = cadenaDe(r.estado, 'SUC-CENTRO')[0]!
  assert.deepEqual([ev.tipo, ev.hash, ev.datos['devolucion']], ['RECHAZADO', dev.evento.hash, dev.folio])
  assert.equal(r.estado.existencias.length, 0, 'lo rechazado no entra al inventario')
  assert.deepEqual(cierreDe(expedienteDe(r.estado.eventos!, ev.lote), 0), { cerrado: true, por: 'RECHAZADO' })
  const texto60 = `(02)${G_DUL}(37)40(17)${aAammdd(mas(60))}(10)L0916`
  const bien = ok(recibeConExpediente(e0, lectura(e0, texto60), 'SUC-CENTRO', t(9), 'r2', OP, texto60))
  assert.equal(bien.valor.existencia!.cantidad, 40)
  assert.equal(bien.eventos[0]!.tipo, 'RECIBIDO')
})

test('semaforo de cinco estados, cada uno con su accion; el rojo bloquea la venta normal', () => {
  const dul = categoriaPorId(CATEGORIAS_EJEMPLO, 'dulceria')
  assert.deepEqual([40, 30, 15, 14, 7, 6, 0, -1].map((d) => estadoSemaforo(d, dul)), ['vigente', 'alerta', 'alerta', 'promocion', 'promocion', 'retiro', 'retiro', 'vencido'])
  const acciones = Object.values(TEXTO_SEMAFORO).map((x) => x.accion)
  assert.equal(new Set(acciones).size, 5)
  assert.match(TEXTO_SEMAFORO.alerta.accion, /transferencia/)
  assert.match(TEXTO_SEMAFORO.promocion.accion, /exhibición/)
  assert.match(TEXTO_SEMAFORO.retiro.accion, /bloquear/)
  let e = base()
  const lote = (dias: number, l: string): ClaveLote => ({ gtin: G_DUL, lote: l, caducidad: mas(dias) })
  for (const [d, l] of [[3, 'LR'], [-2, 'LV'], [20, 'LA']] as const) e = ok(altaConExpediente(e, { sitio: 'SUC-CENTRO', sku: 'DUL-001', ...lote(d, l), cantidad: 10, zona: 'piso' }, 'recepcion', t(8), `a-${l}`, OP)).estado
  const venta = (l: ClaveLote, extra = {}) => salida(e, { sitio: 'SUC-CENTRO', tipo: 'VENDIDO', lote: l, cajas: 1, ...extra }, HOY, t(10), OP).resultado
  assert.equal(venta(lote(20, 'LA')).ok, true)
  assert.deepEqual(venta(lote(3, 'LR')), { ok: false, motivo: 'bloqueado para venta normal (rojo): solo liquidación, donación o merma' })
  assert.match((venta(lote(3, 'LR'), { canal: 'liquidacion' }) as { motivo: string }).motivo, /lo decide una persona/)
  assert.equal(venta(lote(3, 'LR'), { canal: 'liquidacion', autoriza: 'op-99aa88bb' }).ok, true)
  assert.match((venta(lote(-2, 'LV')) as { motivo: string }).motivo, /vencido/)
  const dona = (extra = {}) => salida(e, { sitio: 'SUC-CENTRO', tipo: 'DONADO', lote: lote(3, 'LR'), cajas: 2, ...extra }, HOY, t(10), OP).resultado
  assert.match((dona() as { motivo: string }).motivo, /donar lo decide una persona/)
  assert.equal(dona({ autoriza: 'op-99aa88bb' }).ok, true)
  assert.equal(salida(e, { sitio: 'SUC-CENTRO', tipo: 'MERMA', lote: lote(-2, 'LV'), cajas: 10 }, HOY, t(10), OP).resultado.ok, true)
})

/** Recibe en CEDIS, ubica en rack, baja a piso, vende: el flujo completo con su cadena. */
function flujo(): { e: EstadoAlmacen; lote: ClaveLote } {
  let e = base()
  const texto = `(02)${G_DUL}(37)48(17)${aAammdd(mas(80))}(10)SUC03-L4471`
  e = ok(recibeConExpediente(e, lectura(e, texto), 'SUC-CENTRO', t(8), 'r1', OP, texto)).estado
  const lote = { gtin: G_DUL, lote: 'SUC03-L4471', caducidad: mas(80) }
  const caja = `(01)${G_DUL}(17)${aAammdd(mas(80))}(10)SUC03-L4471`
  e = ok(mueveConExpediente(e, { sitio: 'SUC-CENTRO', destino: 'almacen', lectura: lectura(e, caja), veces: 40, operador: OP }, t(9), 'm1', HOY, 'B-04-2')).estado
  e = ok(mueveConExpediente(e, { sitio: 'SUC-CENTRO', destino: 'piso', lectura: lectura(e, caja), veces: 12, operador: OP }, t(10), 'm2', HOY)).estado
  e = ok(salida(e, { sitio: 'SUC-CENTRO', tipo: 'VENDIDO', lote, cajas: 5 }, HOY, t(18), OP)).estado
  return { e, lote }
}

test('proyeccion: el estado reconstruido desde la cadena ES el estado guardado; tocarlo por fuera se delata', () => {
  const { e, lote } = flujo()
  assert.deepEqual(cadenaDe(e, 'SUC-CENTRO').map((x) => x.tipo), ['RECIBIDO', 'MOVIDO', 'UBICADO', 'MOVIDO', 'VENDIDO'])
  assert.deepEqual(integridadLocal(e, 'SUC-CENTRO'), { ok: true, diferencias: [] })
  const porZona = (z: Zona) => e.existencias.filter((x) => x.zona === z).reduce((s, x) => s + x.cantidad, 0)
  assert.deepEqual([porZona('recibo'), porZona('almacen'), porZona('piso')], [8, 28, 7])
  assert.equal(e.existencias.find((x) => x.zona === 'almacen')!.posicion, 'B-04-2')
  // Alguien sube 5 cajas en el almacen editando el estado, sin evento.
  const tocado = { ...e, existencias: e.existencias.map((x) => (x.zona === 'almacen' ? { ...x, cantidad: x.cantidad + 5 } : x)) }
  const i = integridadLocal(tocado, 'SUC-CENTRO')
  assert.equal(i.ok, false)
  assert.equal(i.diferencias[0]!.detalle, `${lote.gtin} lote SUC03-L4471 (cad. ${lote.caducidad}) en almacen: la cadena dice 28 caja(s) y el estado guardado 33`)
  const reubicado = { ...e, existencias: e.existencias.map((x) => (x.zona === 'almacen' ? { ...x, posicion: 'C-01-1' } : x)) }
  assert.match(integridadLocal(reubicado, 'SUC-CENTRO').motivo ?? '', /la cadena lo ubica en B-04-2 y el estado guardado en C-01-1/)
})

test('ubicacion rack-nivel-posicion: la etiqueta (414)+(254) lleva la posicion y se lee de vuelta', () => {
  const s = simboloUbicacion(GLN, 'almacen', 'B-04-2')
  assert.deepEqual(s[1], { ai: '254', valor: 'ALMACEN-B-04-2' })
  const r = parseaLectura(`(414)${GLN}(254)ALMACEN-B-04-2`)
  assert.ok(!esErrorLectura(r))
  const u = leeUbicacion(r.elementos, SITIOS)
  assert.deepEqual(u && 'zona' in u ? [u.zona, u.posicion] : u, ['almacen', 'B-04-2'])
  const malo = parseaLectura(`(414)${GLN}(254)ALMACEN-B4`)
  assert.ok(!esErrorLectura(malo))
  assert.ok('error' in (leeUbicacion(malo.elementos, SITIOS) ?? {}))
})

test('CORRECCION en lugar de edicion: el original queda intacto, la correccion lo referencia y todo cuadra', () => {
  const { e, lote } = flujo()
  const recibido = cadenaDe(e, 'SUC-CENTRO')[0]!
  // Se contaron 48 y eran 46: dos cajas menos en recibo. Y la caducidad se capturo mal.
  const c1 = ok(corrige(e, { sitio: 'SUC-CENTRO', corrige: recibido.hash, motivo: 'conteo físico: eran 46', ajuste: { zona: 'recibo', cajas: -2 } }, t(19), 'c1', OP))
  const nueva = mas(85)
  const c2 = ok(corrige(c1.estado, { sitio: 'SUC-CENTRO', corrige: recibido.hash, motivo: 'caducidad mal capturada', caducidad: nueva }, t(19), 'c2', OP))
  const cadena = cadenaDe(c2.estado, 'SUC-CENTRO')
  assert.equal(cadena[0]!.hash, recibido.hash, 'el evento original no cambió')
  assert.deepEqual(cadena.slice(-2).map((x) => [x.tipo, x.datos['corrige'], x.datos['seqCorregido']]), [['CORRECCION', recibido.hash, 1], ['CORRECCION', recibido.hash, 1]])
  assert.equal(verificaCadena('SUC-CENTRO', cadena).ok, true)
  assert.deepEqual(integridadLocal(c2.estado, 'SUC-CENTRO'), { ok: true, diferencias: [] })
  assert.ok(c2.estado.existencias.every((x) => x.caducidad === nueva))
  // El lote ya se llama con la caducidad buena y su siguiente evento enlaza con la correccion.
  const nuevoLote = { ...lote, caducidad: nueva }
  const v = ok(salida(c2.estado, { sitio: 'SUC-CENTRO', tipo: 'VENDIDO', lote: nuevoLote, cajas: 1 }, HOY, t(20), OP))
  assert.equal(v.eventos[0]!.anteriorLote, c2.valor.hash)
  assert.equal(verificaCadena('SUC-CENTRO', cadenaDe(v.estado, 'SUC-CENTRO')).ok, true)
  assert.equal(expedienteDe(v.estado.eventos!, lote).length, 8, 'el expediente sigue la corrección')
  // Editar el original en vez de corregirlo rompe la cadena en esa secuencia.
  const editada = cadena.map((x) => (x.seq === 1 ? { ...x, datos: { ...x.datos, cajas: 46 } } : x))
  const r = verificaCadena('SUC-CENTRO', editada)
  assert.deepEqual(!r.ok && [r.rotura.seq, r.rotura.motivo], [1, 'hash'])
})

test('transferencia: TRANSFERIDO en origen y RECIBIDO en destino, enlazados por hash', () => {
  let e = ok(altaConExpediente(base(), { sitio: 'CEDIS-NTE', sku: 'DUL-001', gtin: G_DUL, lote: 'L7001', caducidad: mas(70), cantidad: 100, zona: 'almacen' }, 'etiquetado', t(7), 'a1', OP)).estado
  const lote = { gtin: G_DUL, lote: 'L7001', caducidad: mas(70) }
  const tr = ok(transfiere(e, { origen: 'CEDIS-NTE', destino: 'SUC-PONIENTE', lote, cajas: 30 }, HOY, t(11), 'tr1', OP))
  e = tr.estado
  assert.deepEqual([tr.valor.salida.tipo, tr.valor.entrada.tipo, tr.valor.entrada.anteriorLote], ['TRANSFERIDO', 'RECIBIDO', tr.valor.salida.hash])
  assert.deepEqual(verificaTransferencias(e.eventos!), [])
  assert.equal(verificaCadena('SUC-PONIENTE', cadenaDe(e, 'SUC-PONIENTE')).ok, true)
  assert.deepEqual(expedienteDe(e.eventos!, lote).map((x) => `${x.sitio}:${x.tipo}`), ['CEDIS-NTE:RECIBIDO', 'CEDIS-NTE:TRANSFERIDO', 'SUC-PONIENTE:RECIBIDO'])
  assert.ok(integridadLocal(e, 'CEDIS-NTE').ok && integridadLocal(e, 'SUC-PONIENTE').ok)
  // El destino "recibe" 35 en vez de 30 y recalcula su cadena: su cadena es coherente, el enlace no.
  const r = cadenaDe(e, 'SUC-PONIENTE')[0]!
  const falsa = nuevoEvento('SUC-PONIENTE', [], { tipo: r.tipo, lote: r.lote, datos: { ...r.datos, cajas: 35 }, operador: r.operador, fecha: r.fecha }, r.anteriorLote!)
  const fallos = verificaTransferencias({ ...e.eventos!, 'SUC-PONIENTE': [falsa] })
  assert.match(fallos[0]!.detalle, /no coincide con la transferencia de CEDIS-NTE #2/)
  const huerfana = nuevoEvento('SUC-PONIENTE', [], { tipo: 'RECIBIDO', lote, datos: { cajas: 30 }, operador: OP, fecha: t(12) }, `sha256:${'0'.repeat(64)}`)
  assert.match(verificaTransferencias({ 'SUC-PONIENTE': [huerfana] })[0]!.detalle, /no existe en ninguna cadena/)
})

/** Un lote de gomitas en VERDE en Poniente que se vende poco; Centro lo vende mucho y no tiene. */
function conRiesgo() {
  let e = base()
  const verde = { gtin: G_DUL, lote: 'L8800', caducidad: mas(50) }
  e = ok(altaConExpediente(e, { sitio: 'SUC-PONIENTE', sku: 'DUL-001', ...verde, cantidad: 120, zona: 'almacen' }, 'recepcion', t(7), 'a1', OP)).estado
  const naranja = { gtin: G_YOG, lote: 'Y0101', caducidad: mas(5) }
  e = ok(altaConExpediente(e, { sitio: 'SUC-PONIENTE', sku: 'YOG-001', ...naranja, cantidad: 30, zona: 'piso' }, 'recepcion', t(7), 'a2', OP)).estado
  const ventas = ventasFicticias({ [`SUC-PONIENTE|${G_DUL}`]: 1.5, [`SUC-CENTRO|${G_DUL}`]: 4, [`SUC-PONIENTE|${G_YOG}`]: 3 })
  return { e, verde, naranja, ventas }
}

test('agente: un lote VERDE que no se vendera a tiempo se detecta con semanas de anticipacion', () => {
  const { e, verde, ventas } = conRiesgo()
  const r = evaluaRiesgo(e, 'SUC-PONIENTE', HOY, ventas).find((x) => idLote(x.lote) === idLote(verde))!
  assert.equal(r.semaforo, 'vigente')
  assert.deepEqual([r.cajas, r.venta, r.diasVendibles, r.diasInventario, r.cajasEnRiesgo], [120, 1.5, 44, 80, 54])
  assert.ok(r.diasVendibles >= 42, 'seis semanas antes de ponerse rojo')
  assert.deepEqual([r.recomendacion.accion, r.recomendacion.destino, r.recomendacion.cajas], ['transferir', 'SUC-CENTRO', 54])
  // Con la venta de Centro el lote SI alcanza: alli no hay riesgo.
  assert.equal(evaluaRiesgo(e, 'SUC-CENTRO', HOY, ventas).length, 0)
})

test('agente: recomienda, una persona ejecuta o descarta, y las dos cosas quedan en la cadena', () => {
  const { e: e0, verde, naranja, ventas } = conRiesgo()
  const integra = (e: EstadoAlmacen) => integridadLocal(e, 'SUC-PONIENTE')
  const c1 = corridaAgente(e0, 'SUC-PONIENTE', HOY, ventas, t(6), integra(e0))
  assert.deepEqual(c1.emitidas.map((x) => [x.lote.lote, x.datos['accion'], x.operador]).sort(), [['L8800', 'transferir', 'agente-riesgo'], ['Y0101', 'exhibicion', 'agente-riesgo']])
  assert.equal(corridaAgente(c1.estado, 'SUC-PONIENTE', HOY, ventas, t(7), integra(c1.estado)).emitidas.length, 0, 'no repite lo pendiente')
  const [recY, recL] = ['Y0101', 'L8800'].map((l) => recomendaciones(c1.estado, 'SUC-PONIENTE').find((r) => r.evento.lote.lote === l)!)
  // Ejecutar la transferencia: la registra en las dos cadenas.
  const ej = ok(decide(c1.estado, { sitio: 'SUC-PONIENTE', recomendacion: recL!.evento.hash, decision: 'ejecutar', persona: 'op-5e6f7a8b' }, HOY, t(9), 'd1', integra(c1.estado)))
  assert.deepEqual(ej.eventos.map((x) => `${x.sitio}:${x.tipo}`), ['SUC-PONIENTE:TRANSFERIDO', 'SUC-CENTRO:RECIBIDO', 'SUC-PONIENTE:RECOMENDACION_EJECUTADA'])
  assert.equal(ej.valor.operador, 'op-5e6f7a8b', 'quien decide es una persona, no el agente')
  // Descartar sin motivo no se puede; con motivo queda registrado quien y por que.
  assert.equal(decide(ej.estado, { sitio: 'SUC-PONIENTE', recomendacion: recY!.evento.hash, decision: 'descartar', persona: 'op-5e6f7a8b' }, HOY, t(9), 'd2', integra(ej.estado)).resultado.ok, false)
  const de = ok(decide(ej.estado, { sitio: 'SUC-PONIENTE', recomendacion: recY!.evento.hash, decision: 'descartar', persona: 'op-5e6f7a8b', motivo: 'ya está en cabecera por temporada' }, HOY, t(9), 'd3', integra(ej.estado)))
  const estados = recomendaciones(de.estado, 'SUC-PONIENTE').map((r) => [r.evento.lote.lote, r.estado, r.decision?.datos['motivo'] ?? null])
  assert.deepEqual(estados.sort(), [['L8800', 'ejecutada', null], ['Y0101', 'descartada', 'ya está en cabecera por temporada']])
  assert.ok(integra(de.estado).ok && integridadLocal(de.estado, 'SUC-CENTRO').ok)
  assert.deepEqual(verificaTransferencias(de.estado.eventos!), [])
  void verde; void naranja
})

test('agente: con la cadena rota NO actua y devuelve el motivo para abrir el incidente', () => {
  const { e, ventas } = conRiesgo()
  const cadena = cadenaDe(e, 'SUC-PONIENTE')
  const rota = { ...e, eventos: { ...e.eventos, 'SUC-PONIENTE': cadena.map((x) => (x.seq === 1 ? { ...x, lote: { ...x.lote, caducidad: mas(200) } } : x)) } }
  const i = integridadLocal(rota, 'SUC-PONIENTE')
  const c = corridaAgente(rota, 'SUC-PONIENTE', HOY, ventas, t(6), i)
  assert.deepEqual([c.emitidas.length, c.bloqueo], [0, 'cadena rota en el evento #1: el contenido no corresponde a su hash: se modificó después de registrarse'])
  assert.equal(c.estado, rota)
})

test('seudonimos: la cadena guarda op-xxxx; el mapeo vive aparte y se puede olvidar', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'seud-'))
  const s = seudonimosEnArchivo(join(dir, 'operadores.json'))
  const ana = await s.de('Ana López')
  assert.match(ana, /^op-[0-9a-f]{8}$/)
  assert.equal(await s.de('ana lópez '), ana)
  assert.notEqual(await s.de('Beto Ruiz'), ana)
  const e = ok(altaConExpediente(base(), { sitio: 'SUC-CENTRO', sku: 'DUL-001', gtin: G_DUL, lote: 'L1', caducidad: mas(80), cantidad: 1 }, 'recepcion', t(8), 'a', ana)).estado
  assert.ok(!JSON.stringify(e.eventos).includes('Ana'))
  assert.equal(await s.quien(ana), 'ana lópez')
  assert.equal(await s.olvida('Ana López'), true)
  assert.equal(await s.quien(ana), undefined)
  assert.ok(!(await readFile(join(dir, 'operadores.json'), 'utf8')).includes('ana'))
  assert.equal(verificaCadena('SUC-CENTRO', cadenaDe(e, 'SUC-CENTRO')).ok, true, 'olvidar a la persona no rompe la cadena')
})
