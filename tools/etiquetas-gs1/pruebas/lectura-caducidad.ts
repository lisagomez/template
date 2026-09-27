/**
 * Lo que trae el proveedor: sus codigos (EAN-13, UPC-A, EAN-8, ITF-14, Digital Link) con y sin
 * identificador de simbologia, y la fecha impresa leida de una foto — el analizador determinista
 * con su tabla de formatos y la propuesta que coteja dos tomas.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CATEGORIAS_EJEMPLO, completaClave, esErrorLectura, estadoVacio, exigeModeloPineado, fechaLarga, interpreta, leeFechasImpresas, leeYPropone, parseaLectura, proponCaducidad,
  recibeConExpediente, textoEnOrden, type EstadoAlmacen, type LecturaDelMotor, type MotorFechas,
} from '../dist/index.js'

const HOY = '2026-09-27'
const lee = (texto: string) => { const r = parseaLectura(texto); assert.ok(!esErrorLectura(r), esErrorLectura(r) ? r.mensaje : ''); return r }
const toma = (...lineas: (string | [string, [number, number, number, number]])[]): LecturaDelMotor => ({
  motor: 'prueba-1.0', ms: 5, lineas: lineas.map((l) => (typeof l === 'string' ? { texto: l } : { texto: l[0], caja: l[1] })),
})
const propon = (lecturas: LecturaDelMotor[], extra: Partial<Parameters<typeof proponCaducidad>[1]> = {}) => proponCaducidad(lecturas, { hoy: HOY, ...extra })

// --- Codigos del proveedor -------------------------------------------------------------------
test('EAN-13, UPC-A, EAN-8 e ITF-14: con identificador de la pistola y sin el, todos a GTIN-14', () => {
  const casos: [string, string, string, string | undefined][] = [
    ['7501031302741', '07501031302741', 'ean-13', undefined],
    [']E07501031302741', '07501031302741', 'ean-13', ']E0'],
    ['036000291452', '00036000291452', 'upc-a', undefined],
    [']E00036000291452', '00036000291452', 'upc-a', ']E0'],
    ['96385074', '00000096385074', 'ean-8', undefined],
    [']E496385074', '00000096385074', 'ean-8', ']E4'],
    ['19521111000010', '19521111000010', 'itf-14', undefined],
    [']I119521111000010', '19521111000010', 'itf-14', ']I1'],
    [']E375010313027410512', '07501031302741', 'ean-13', ']E3'],
  ]
  for (const [texto, gtin, formato, simb] of casos) {
    const r = lee(texto)
    assert.deepEqual([r.elementos, r.forma, r.formato, r.simbologia], [[{ ai: '01', valor: gtin }], 'gtin', formato, simb], texto)
  }
})

test('un EAN con el digito malo se dice como tal (no como «AI desconocido»); un ITF que no es de 14 tampoco pasa', () => {
  const r = parseaLectura('7501031302742')
  assert.ok(esErrorLectura(r))
  assert.equal(r.error, 'digito')
  const itf = parseaLectura(']I1123456')
  assert.ok(esErrorLectura(itf) && itf.error === 'no-gs1')
})

test('los vectores GS1 que ya pasaban siguen igual: ]C1 con GS, sustituto de GS y parentesis', () => {
  const g = '09521234000020'
  for (const t of [`]C101${g}17261030\x1d10L4471`.replace('\x1d10', '10'), `]C101${g}1726103010L4471`, `01${g}1726103010L4471`, `(01)${g}(17)261030(10)L4471`, `]C101${g}10L4471|17261030`]) {
    const r = lee(t)
    assert.equal(r.forma === 'hri' || r.forma === 'cruda', true, t)
    assert.equal(r.elementos[0]?.valor, g)
  }
})

test('GS1 Digital Link sin comprimir: clave, lote en la ruta y caducidad en la consulta; cualquier dominio', () => {
  for (const url of ['https://id.gs1.org/01/09521234000020/10/L4471?17=261030', 'https://marca.example/gtin/9521234000020/10/L4471?17=261030&3103=000500']) {
    const r = lee(url)
    assert.equal(r.forma, 'digital-link')
    assert.deepEqual(r.elementos.map((e) => `${e.ai}:${e.valor}`), ['01:09521234000020', '10:L4471', '17:261030'])
  }
})

test('un QR de publicidad, un Code 128 sin GS1 o un DataMatrix sin GS1 NO se toman por producto', () => {
  for (const t of ['https://uqr.to/18u0o', ']Q1https://uqr.to/18u0o', ']C0ABC123', ']d1HOLA']) {
    const r = parseaLectura(t)
    assert.ok(esErrorLectura(r) && r.error === 'no-gs1', t)
  }
})

const G_CAJA = '19521111000010'
const G_PIEZA = '09521111000013'
const base = (): EstadoAlmacen => ({
  ...estadoVacio({ sitios: [{ clave: 'CEDIS-NTE', nombre: 'CEDIS', tipo: 'cedis' }], categorias: CATEGORIAS_EJEMPLO }),
  articulos: { 'YOG-001': { sku: 'YOG-001', descripcion: 'Yogurt natural 1 kg', categoria: 'lacteos', sitios: ['CEDIS-NTE'], marcaPropia: false, gtinUnidad: G_PIEZA, reglaUnidad: 'fabricante', gtinCaja: G_CAJA, reglaCaja: 'fabricante', unidadesPorCaja: 12, notas: [] } },
})

test('pieza contra caja: el EAN-13 de la pieza y el ITF-14 de la caja son el mismo articulo en distinto nivel', () => {
  const e = base()
  assert.ok(completaClave(G_PIEZA.slice(0, 13)) === G_PIEZA && completaClave(G_CAJA.slice(0, 13)) === G_CAJA)
  const pieza = interpreta(lee(G_PIEZA.slice(1)).elementos, e, HOY)
  const caja = interpreta(lee(`]I1${G_CAJA}`).elementos, e, HOY)
  assert.deepEqual([pieza.articulo?.sku, pieza.nivel, caja.articulo?.sku, caja.nivel], ['YOG-001', 'unidad', 'YOG-001', 'caja'])
  assert.equal(pieza.lote, undefined, 'un EAN-13 no trae lote ni caducidad: para eso es la foto')
})

test('Digital Link con (17) y (10): se recibe como hoy, SIN foto', () => {
  const e = base()
  const url = `https://id.gs1.org/01/${G_CAJA}/10/L4471?17=270115`
  const r = recibeConExpediente(e, interpreta(lee(url).elementos, e, HOY), 'CEDIS-NTE', '2026-09-27T15:00:00.000Z', 'dl1', 'op-0a1b2c3d', url)
  assert.ok(r.resultado.ok, r.resultado.ok ? '' : r.resultado.motivo)
  assert.deepEqual([r.resultado.eventos[0]?.tipo, r.estado.existencias[0]?.lote, r.estado.existencias[0]?.caducidad], ['RECIBIDO', 'L4471', '2027-01-15'])
})

// --- Fechas impresas ----------------------------------------------------------------------------
test('tabla de formatos: cada forma que aparece en una caja real, con su tipo', () => {
  const tabla: [string, string, string, string][] = [
    ['CAD 30/10/26', '2026-10-30', 'caducidad', 'DD/MM/AA'],
    ['CAD 30/10/2026', '2026-10-30', 'caducidad', 'DD/MM/AAAA'],
    ['EXP 15.03.27', '2027-03-15', 'caducidad', 'DD/MM/AA'],
    ['VENCE 2027-01-31', '2027-01-31', 'caducidad', 'AAAA/MM/DD'],
    ['CONS. PREF. 30 OCT 26', '2026-10-30', 'consumo-preferente', 'DD MES AA'],
    ['BEST BEFORE:14/06/26', '2026-06-14', 'consumo-preferente', 'DD/MM/AA'],
    ['BB 3 NOV 2027', '2027-11-03', 'consumo-preferente', 'DD MES AAAA'],
    ['CAD31AG027', '2027-08-31', 'caducidad', 'DD MES AA'],
    ['CAD 31 ENE 27', '2027-01-31', 'caducidad', 'DD MES AA'],
    ['EXP OCT 2026', '2026-10-31', 'caducidad', 'MES AAAA'],
    ['CAD 10/26', '2026-10-31', 'caducidad', 'MM/AA'],
    ['CAD 02/2027', '2027-02-28', 'caducidad', 'MM/AAAA'],
    ['CAD 26273', '2026-09-30', 'caducidad', 'JULIANO AADDD'],
    ['USE BY 14/06/26', '2026-06-14', 'caducidad', 'DD/MM/AA'],
  ]
  for (const [texto, iso, tipo, formato] of tabla) {
    const c = leeFechasImpresas(texto).candidatos
    assert.equal(c.length, 1, texto)
    assert.deepEqual([c[0]!.lecturas.map((l) => l.iso), c[0]!.tipo, c[0]!.lecturas[0]?.formato], [[iso], tipo, formato], texto)
  }
})

test('ambiguedad MARCADA y no resuelta: DD/MM contra MM/DD, DDMMAA contra AAMMDD, y sin rotulo', () => {
  assert.deepEqual(leeFechasImpresas('CAD 03/04/26').candidatos[0]!.lecturas.map((l) => `${l.iso} ${l.formato}`), ['2026-04-03 DD/MM/AA', '2026-03-04 MM/DD/AA'])
  assert.deepEqual(leeFechasImpresas('CAD 241123').candidatos[0]!.lecturas.map((l) => `${l.iso} ${l.formato}`), ['2023-11-24 DDMMAA', '2024-11-23 AAMMDD'])
  assert.deepEqual(leeFechasImpresas('CAD 13/04/26').candidatos[0]!.lecturas.map((l) => l.iso), ['2026-04-13'], 'con un dia de 13 en adelante no hay ambiguedad')
  assert.deepEqual(leeFechasImpresas('04/13/26').candidatos[0]!.lecturas.map((l) => l.formato), ['MM/DD/AA'], 'importado de EE. UU.')
  const p = propon([toma('11.01.25 2F030955')])
  assert.equal(p.estado, 'ambigua')
  assert.equal(p.fecha, undefined, 'nunca se elige en silencio')
  assert.match(p.mensaje, /sin rótulo/)
})

test('fabricacion contra caducidad: ELAB no es caducidad; con vida util se DERIVA y se dice; sin ella, no', () => {
  const con = propon([toma('ELAB 22/09/26 L5521')], { vidaUtilDias: 180 })
  assert.deepEqual([con.estado, con.fecha, con.opciones[0]?.derivada], ['propuesta', '2027-03-21', { fabricacion: '2026-09-22', vidaUtilDias: 180 }])
  assert.ok(con.avisos.some((a) => a.startsWith('Calculada')))
  assert.equal(propon([toma('ELAB 22/09/26')]).estado, 'solo-fabricacion')
  const ambos = propon([toma('ELAB 22/09/26 CAD 22/03/27')], { vidaUtilDias: 180 })
  assert.deepEqual([ambos.estado, ambos.fecha], ['propuesta', '2027-03-22'], 'si hay caducidad impresa, manda la impresa')
})

test('el cero con diagonal leido como 8: 38/10/26 se rechaza por calendario y se SUGIERE 30/10/26 (una sola variante)', () => {
  const p = propon([toma('CAD 38/10/26 L4471')])
  assert.equal(p.estado, 'invalida')
  assert.match(p.mensaje, /el día 38 no existe/)
  assert.deepEqual(p.opciones.map((o) => [o.iso, o.sugerida]), [['2026-10-30', true]])
  assert.equal(p.fecha, undefined, 'una sugerencia no es una propuesta')
  assert.equal(propon([toma('CAD 39/19/26')]).opciones.length, 0, 'un 9 y un 1 imposibles: no se adivina')
  const dos = propon([toma('CAO 38/85/27')])
  assert.deepEqual([dos.estado, dos.opciones.map((o) => [o.iso, o.tipo, o.sugerida])], ['invalida', [['2027-05-30', 'caducidad', true]]], 'medido con el motor real: dos ceros con diagonal leídos como 8, y la D como O')
})

test('lo que NO es fecha: cifras sin rotulo (clave del proveedor, un numero inventado) y el texto que remite a otra cara', () => {
  for (const t of ['12076239', '20240202', 'NUEVA RECETA 13 CAJAS POR CAMA 12076239 CLAVE', '125045 Nestle SACA TU LADO']) {
    const p = propon([toma(t)])
    assert.deepEqual([p.estado, p.opciones.length], ['sin-fecha', 0], t)
    assert.match(p.mensaje, /No encontré una fecha/)
  }
  const r = propon([toma('FECHA DE CADUCIDAD Y LOTE INDICADOS EN EL ENVASE')])
  assert.deepEqual([r.estado, r.opciones.length], ['remite', 0])
  assert.match(r.mensaje, /no está en esta cara/)
  assert.equal(propon([toma('LOTE Y CONSUMO PREFERENTE IMPRESO EN EL EMPAQUE')]).estado, 'remite')
})

test('lotes: el rotulado primero; «LOTE INDICADO» no es un lote; el codigo suelto queda como posible', () => {
  assert.equal(propon([toma('CAD 30/10/26 L4471')]).lote, 'L4471')
  assert.equal(propon([toma('CAD 30/10/26 LOTE: 88A1')]).lote, '88A1')
  assert.equal(propon([toma('CAD31AG027 L61450215A2')]).lote, 'L61450215A2')
  const suelto = propon([toma('CAD 30/10/26 2F030955')])
  assert.deepEqual([suelto.lote, suelto.lotesPosibles.map((l) => [l.valor, l.rotulado])], [undefined, [['2F030955', false]]])
  assert.equal(propon([toma('CAD 241123-240HF60 L0503MTY04085')]).lote, 'L0503MTY04085')
  assert.deepEqual(leeFechasImpresas('LOTE INDICADO EN EL ENVASE').lotes, [])
})

test('dos tomas: si coinciden, propuesta; si no, DISCREPANCIA con las dos opciones; el lote se compara caracter por caracter', () => {
  const a = propon([toma('CAD 30/10/26 L4471'), toma('CAD 30/10/26 L4471')])
  assert.deepEqual([a.estado, a.fecha, a.lote, a.coinciden], ['propuesta', '2026-10-30', 'L4471', true])
  const b = propon([toma('BEST BEFORE 14/06/26'), toma('BEST BEFORE 14/06/28')])
  assert.deepEqual([b.estado, b.fecha, b.opciones.map((o) => o.iso).sort()], ['discrepancia', undefined, ['2026-06-14', '2028-06-14']])
  const c = propon([toma('CAD 30/10/26 L2F030955'), toma('CAD 30/10/26 L3F030955')])
  assert.deepEqual([c.estado, c.lote, c.loteDifiere, c.coinciden], ['propuesta', undefined, ['posición 2: «2» contra «3»'], false])
  const d = propon([toma('CAD 30/10/26'), toma('COCA')])
  assert.equal(d.estado, 'discrepancia', 'si una toma no encontro fecha, no hay cotejo que respalde la otra')
})

test('orden de lectura por cajas: «CAD» detectado aparte y despues de la fecha se reune con ella; la zona marca la linea', () => {
  const l = toma(['241123-240HF60', [120, 10, 300, 40]], ['L0503MTY04085', [0, 60, 330, 40]], ['CAD', [0, 12, 90, 38]])
  assert.equal(textoEnOrden(l.lineas).texto, 'CAD 241123-240HF60\nL0503MTY04085')
  const p = propon([l])
  assert.deepEqual([p.estado, p.zona?.caja, p.lote], ['ambigua', [120, 10, 300, 40], 'L0503MTY04085'])
})

test('formato aprendido: una vez que el laboratorio fijo DDMMAA para el articulo, 241127 sale sin ambiguedad (y se sigue confirmando)', () => {
  const p = propon([toma('CAD 241127')], { aprendido: { formato: 'DDMMAA', tipo: 'caducidad' } })
  assert.deepEqual([p.estado, p.fecha, p.opciones[0]?.aprendido], ['propuesta', '2027-11-24', true])
  const sinRotulo = propon([toma('11.01.27 2F030955')], { aprendido: { formato: 'DD/MM/AA', tipo: 'caducidad' } })
  assert.deepEqual([sinRotulo.estado, sinRotulo.fecha], ['propuesta', '2027-01-11'])
})

test('plausibilidad: vencido, mas lejos que la vida util, fin de mes y consumo preferente se AVISAN', () => {
  assert.ok(propon([toma('CAD 13/09/26')]).avisos.some((a) => a.includes('vencido')))
  assert.ok(propon([toma('CAD 13/09/29')], { vidaUtilDias: 90 }).avisos.some((a) => a.includes('vida útil')))
  assert.ok(propon([toma('CAD OCT 2026')]).avisos.some((a) => a.includes('último día del mes')))
  const cp = propon([toma('BEST BEFORE 14/06/27')])
  assert.ok(cp.avisos.some((a) => a.includes('consumo preferente')))
  assert.match(cp.mensaje, /consumo preferente/)
})

test('la fecha dicha sin ambiguedad posible, y el motor va pineado', () => {
  assert.equal(fechaLarga('2026-10-30'), 'viernes 30 de octubre de 2026')
  assert.equal(propon([toma('CAD 30/10/26')]).mensaje, 'Leí caducidad: viernes 30 de octubre de 2026. Confírmala o corrígela.')
  assert.throws(() => exigeModeloPineado('rapidocr:latest'))
  assert.throws(() => exigeModeloPineado('rapidocr'))
  assert.equal(exigeModeloPineado('rapidocr-onnxruntime-1.4.4/ppocrv4'), 'rapidocr-onnxruntime-1.4.4/ppocrv4')
})

test('medido en el banco: un pedazo mal leido NO hereda el rotulo («BEST BEFORE 14/06/ 5/27» no es mayo de 2027)', () => {
  assert.deepEqual([propon([toma('BEST BEFORE 14/06/ 5/27')]).estado, propon([toma('BEST BEFORE 14/06/ 5/27')]).opciones.length], ['sin-fecha', 0])
  assert.equal(propon([toma('CAD31AGO027 L61450215A2')]).estado, 'sin-fecha', 'las cifras del lote tampoco heredan el CAD de mas atras')
})

test('texto girado leido fecha-primero: el rotulo pegado DESPUES tambien cuenta, si no tiene su propia fecha', () => {
  assert.deepEqual([propon([toma('14/06/26 BEST BEFORE')]).estado, propon([toma('14/06/26 BEST BEFORE')]).fecha], ['propuesta', '2026-06-14'])
  assert.equal(leeFechasImpresas('30/10/26 CAD 15/11/26').candidatos[0]!.tipo, 'sin-rotulo', 'el CAD es de la fecha que lo sigue')
})

test('ventana de años: 2827 o una caducidad de 2021 no se proponen (y el 8 de mas se sugiere como 0)', () => {
  const p = propon([toma('CAD OCT 2827 L7788')])
  assert.deepEqual([p.estado, p.opciones.map((o) => [o.iso, o.sugerida])], ['invalida', [['2027-10-31', true]]])
  assert.match(propon([toma('EXP 15.05.21')]).mensaje, /2021 no es plausible/)
  assert.equal(propon([toma('ELAB 01/01/29')], { vidaUtilDias: 90 }).estado, 'invalida', 'una fabricacion del futuro no es plausible')
})

function motorFalso(respuestas: Record<string, string>): MotorFechas & { llamadas: string[] } {
  const llamadas: string[] = []
  return {
    modelo: 'falso-1.0', llamadas,
    async lee(imagen, op) {
      const k = `${new TextDecoder().decode(imagen)}${op?.variante === 'puntos' ? '+puntos' : ''}`
      llamadas.push(k)
      return { motor: 'falso-1.0', ms: 1, lineas: respuestas[k] ? [{ texto: respuestas[k]! }] : [] }
    },
  }
}

test('la cascada de la app: cruda, luego puntos si no vio fecha, y la foto entera solo si ninguna toma vio nada', async () => {
  const m = motorFalso({ a: '', 'a+puntos': 'CAD 30/10/26 L4471', b: 'CAD 30/10/26 L4471', entera: 'CAD 01/12/26' })
  const p = await leeYPropone(m, [new TextEncoder().encode('a'), new TextEncoder().encode('b')], { hoy: HOY }, new TextEncoder().encode('entera'))
  assert.deepEqual([p.estado, p.fecha, p.coinciden, p.enFotoEntera], ['propuesta', '2026-10-30', true, undefined])
  assert.deepEqual(m.llamadas, ['a', 'a+puntos', 'b'], 'la foto entera no se lee si una toma ya encontro la fecha')
  const n = motorFalso({ entera: 'BEST BEFORE:14/06/26' })
  const q = await leeYPropone(n, [new TextEncoder().encode('x')], { hoy: HOY }, new TextEncoder().encode('entera'))
  assert.deepEqual([q.estado, q.fecha, q.enFotoEntera, n.llamadas], ['propuesta', '2026-06-14', true, ['x', 'x+puntos', 'entera']])
})
