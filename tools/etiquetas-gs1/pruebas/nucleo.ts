/**
 * Nucleo GS1 contra la norma: vectores de las GS1 General Specifications (Release 26.0) y de
 * GS1 mismo (prefijo 952, reservado para ejemplos). Nada de "el algoritmo contra si mismo":
 * donde hay un ejemplo publicado, se usa ese.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import bwipjs from 'bwip-js/node'
import {
  aHri, aTransmitida, aiAlInicio, caracteresDeDatos, corrigeDigito, digitoCorrecto, digitoVerificador, entradaAi, esErrorLectura,
  esFecha, fechaIso, llevaSeparador, modulosGs1128, normalizaGtin, parDeControlCorrecto, parseaFechaGs1, parseaLectura, totalAis,
  validaEtiqueta, aplicaArreglo, clasificaPrefijo, anioConSiglo, GS, type Simbolo,
} from '../dist/index.js'

const ANIO = 2026
const codigos = (s: readonly Simbolo[]) => validaEtiqueta(s, { anioActual: ANIO }).filter((h) => h.severidad === 'error').map((h) => h.codigo)

// --- Digitos verificadores (GenSpecs §7.9.1) ------------------------------------------------
test('digito: el ejemplo de la Tabla 7-9 de las GenSpecs (18 cifras) da 9', () => {
  assert.equal(digitoVerificador('37610425002123456'), 9)
})

test('digito: GTIN-8, 12, 13 y 14 publicados, y los ejemplos 952 de GS1', () => {
  for (const g of ['96385074', '036000291452', '4006381333931', '09521234000020', '09520123456788', '09524000059109', '095212340005678903']) {
    assert.ok(digitoCorrecto(g), g)
  }
  assert.equal(digitoCorrecto('09521234000021'), false)
  assert.equal(corrigeDigito('09521234000021'), '09521234000020')
})

test('digito: el par alfanumerico del GMN de la Figura 7-15 (1987654Ad4X4bL5ttr2310c2K)', () => {
  assert.ok(parDeControlCorrecto('1987654Ad4X4bL5ttr2310c2K'))
  assert.equal(parDeControlCorrecto('1987654Ad4X4bL5ttr2310c2L'), false)
})

test('normalizaGtin: 8/12/13/14 a 14 cifras; lo que Excel se come (ceros a la izquierda) vuelve', () => {
  assert.equal(normalizaGtin('9521234000020'), '09521234000020')
  assert.equal(normalizaGtin('036000291452'), '00036000291452')
  assert.equal(normalizaGtin('96385074'), '00000096385074')
  assert.equal(normalizaGtin('12345'), undefined)
})

// --- Fechas: DD=00 y siglo (GenSpecs §3.4 y §7.12) ------------------------------------------
test('fecha: DD=00 es el ultimo dia del mes, con los ejemplos de la norma (130200, 160200)', () => {
  const f1 = parseaFechaGs1('130200', ANIO)
  const f2 = parseaFechaGs1('160200', ANIO)
  assert.ok(esFecha(f1) && esFecha(f2))
  assert.equal(fechaIso(f1), '2013-02-28')
  assert.equal(fechaIso(f2), '2016-02-29')
  const f3 = parseaFechaGs1('261100', ANIO)
  assert.ok(esFecha(f3) && f3.diaImplicito && fechaIso(f3) === '2026-11-30')
})

test('fecha: invalidas (mes 13, 30 de febrero, 29 de febrero no bisiesto) y DD=00 donde no se admite', () => {
  assert.equal(parseaFechaGs1('261301', ANIO), 'mes-invalido')
  assert.equal(parseaFechaGs1('260230', ANIO), 'dia-invalido')
  assert.equal(parseaFechaGs1('250229', ANIO), 'dia-invalido')
  assert.equal(parseaFechaGs1('261100', ANIO, false), 'dia-cero-no-admitido')
})

test('fecha: siglo con la ventana de -49/+50 años (Figura 7-17)', () => {
  assert.equal(anioConSiglo(76, 2026), 2076)
  assert.equal(anioConSiglo(77, 2026), 1977)
  assert.equal(anioConSiglo(29, 2080), 2129)
  assert.equal(anioConSiglo(30, 2080), 2130)
  assert.equal(anioConSiglo(31, 2080), 2031)
})

// --- Diccionario -----------------------------------------------------------------------------
test('diccionario: todo el GS1 Syntax Dictionary, y ningun AI es prefijo de otro', () => {
  assert.ok(totalAis() > 500, `solo ${totalAis()} AIs`)
  assert.equal(entradaAi('00')?.longitudPredefinida, true)
  assert.equal(entradaAi('10')?.longitudPredefinida, false)
  assert.equal(entradaAi('37')?.longitudMax, 8)
  assert.equal(entradaAi('3103')?.longitudPredefinida, true)
  assert.equal(aiAlInicio('8006'), '8006')
  assert.equal(aiAlInicio('2400'), '240')
})

// --- Combinaciones prohibidas y asociaciones obligatorias (§4.13-4.14) -----------------------
test('combinacion: (01)+(37) prohibida — y bwip-js (BWIPP) coincide', () => {
  const s: Simbolo[] = [[{ ai: '01', valor: '09521234000020' }, { ai: '37', valor: '24' }, { ai: '10', valor: 'L1' }]]
  assert.ok(codigos(s).includes('combinacion-prohibida'))
  assert.throws(() => bwipjs.toSVG({ bcid: 'gs1-128', text: aHri(s[0]!) }), /mutually exclusive/)
})

test('combinacion: (01)+(02) prohibida; (02) sin (37) y (37) sin (00) incumplen su asociacion', () => {
  assert.ok(codigos([[{ ai: '01', valor: '09521234000020' }, { ai: '02', valor: '09521234000020' }, { ai: '37', valor: '5' }]]).includes('combinacion-prohibida'))
  const soloContenido = codigos([[{ ai: '02', valor: '09521234000020' }, { ai: '17', valor: '261030' }]])
  assert.ok(soloContenido.includes('falta-asociacion'))
  const sinSscc = validaEtiqueta([[{ ai: '02', valor: '09521234000020' }, { ai: '37', valor: '24' }]], { anioActual: ANIO })
  assert.ok(sinSscc.some((h) => h.codigo === 'falta-asociacion' && h.ai === '37'))
})

test('combinacion: el lote o la fecha solos no significan nada', () => {
  assert.ok(codigos([[{ ai: '10', valor: 'L4471' }]]).includes('falta-asociacion'))
  assert.ok(codigos([[{ ai: '00', valor: '095212340005678903' }, { ai: '17', valor: '261030' }]]).includes('falta-asociacion'))
})

test('combinacion: la tarima en dos codigos (SSCC aparte) cumple todas las reglas sobre la etiqueta entera', () => {
  const tarima: Simbolo[] = [
    [{ ai: '02', valor: '09521234000020' }, { ai: '37', valor: '50' }, { ai: '17', valor: '261030' }, { ai: '10', valor: 'L4471' }],
    [{ ai: '00', valor: '095212340005678903' }],
  ]
  assert.deepEqual(codigos(tarima), [])
})

// --- CSET 82 y lote --------------------------------------------------------------------------
test('CSET 82: espacio, Ñ y # en el lote son errores, con arreglo que propone quitarlos', () => {
  const s: Simbolo[] = [[{ ai: '01', valor: '09521234000020' }, { ai: '17', valor: '261030' }, { ai: '10', valor: 'LOTE Ñ#1' }]]
  const h = validaEtiqueta(s, { anioActual: ANIO }).find((x) => x.codigo === 'caracter-prohibido')
  assert.ok(h)
  assert.deepEqual(h.arreglo, { tipo: 'quita-caracteres', ai: '10', valor: 'LOTE1' })
  assert.deepEqual(codigos(aplicaArreglo(s, h.arreglo!)), [])
})

test('lote: en medio del codigo es aviso, y el arreglo lo manda al final', () => {
  const s: Simbolo[] = [[{ ai: '01', valor: '09521234000020' }, { ai: '10', valor: 'L4471' }, { ai: '17', valor: '261030' }]]
  const h = validaEtiqueta(s, { anioActual: ANIO }).find((x) => x.codigo === 'lote-no-al-final')
  assert.equal(h?.severidad, 'aviso')
  const arreglado = aplicaArreglo(s, h!.arreglo!)
  assert.deepEqual(arreglado[0]!.map((e) => e.ai), ['01', '17', '10'])
})

// --- 48 caracteres (§5.4.4.3: AIs + datos + FNC1 separadores) -------------------------------
test('48: justo 48 pasa, 49 no; los FNC1 separadores cuentan', () => {
  const base = [{ ai: '01', valor: '09521234000020' }, { ai: '17', valor: '261030' }, { ai: '10', valor: 'ABCDEFGHIJK' }]
  const s48: Simbolo = [...base, { ai: '21', valor: '12345678' }]
  const s49: Simbolo = [...base, { ai: '21', valor: '123456789' }]
  assert.equal(caracteresDeDatos(s48), 48)
  assert.equal(caracteresDeDatos(s49), 49)
  assert.ok(!codigos([s48]).includes('mas-de-48'))
  assert.ok(codigos([s49]).includes('mas-de-48'))
})

test('48: la tarima en UN solo codigo pasa de 48; el arreglo separa el SSCC como pide la guia logistica', () => {
  const uno: Simbolo[] = [[{ ai: '00', valor: '095212340005678903' }, { ai: '02', valor: '09521234000020' }, { ai: '37', valor: '50' }, { ai: '17', valor: '261030' }, { ai: '10', valor: 'L4471' }]]
  assert.equal(caracteresDeDatos(uno[0]!), 56)
  const h = validaEtiqueta(uno, { anioActual: ANIO }).find((x) => x.codigo === 'mas-de-48')!
  const partido = aplicaArreglo(uno, h.arreglo!)
  assert.deepEqual(partido.map((s) => s.map((e) => e.ai)), [['02', '37', '17', '10'], ['00']])
  assert.deepEqual(codigos(partido), [])
})

// --- FNC1 solo donde toca ----------------------------------------------------------------
test('FNC1: nunca tras AIs de longitud predefinida ni tras el ultimo; si tras un variable en medio', () => {
  const caja: Simbolo = [{ ai: '01', valor: '09521234000020' }, { ai: '17', valor: '261030' }, { ai: '10', valor: 'L4471' }]
  assert.equal(aTransmitida(caja), ']C1010952123400002017261030' + '10L4471')
  const contenido: Simbolo = [{ ai: '02', valor: '09521234000020' }, { ai: '37', valor: '50' }, { ai: '17', valor: '261030' }, { ai: '10', valor: 'L4471' }]
  assert.deepEqual(contenido.map((_, i) => llevaSeparador(contenido, i)), [false, true, false, false])
  assert.equal(aTransmitida(contenido), `]C1020952123400002037 50${GS}1726103010L4471`.replace(' ', ''))
})

// --- Entradas de pistola ---------------------------------------------------------------------
const CAJA_ESPERADA = [{ ai: '01', valor: '09521234000020' }, { ai: '17', valor: '261030' }, { ai: '10', valor: 'L4471' }]
const TARIMA_ESPERADA = [{ ai: '02', valor: '09521234000020' }, { ai: '37', valor: '50' }, { ai: '17', valor: '261030' }, { ai: '10', valor: 'L4471' }]

test('pistola: ]C1 + GS real, GS sustituido, parentesis, sin prefijo y con Enter al final', () => {
  const formas: [string, string][] = [
    [`]C1020952123400002037 50${GS}1726103010L4471\r\n`.replace(' ', ''), 'cruda'],
    ['020952123400002037' + '50<GS>1726103010L4471', 'cruda'],
    ['020952123400002037' + '50␝1726103010L4471', 'cruda'],
    ['020952123400002037' + '50|1726103010L4471', 'cruda'],
    ['(02)09521234000020(37)50(17)261030(10)L4471', 'hri'],
  ]
  for (const [texto, forma] of formas) {
    const r = parseaLectura(texto)
    assert.ok(!esErrorLectura(r), `${JSON.stringify(texto)}: ${esErrorLectura(r) ? r.mensaje : ''}`)
    assert.deepEqual(r.elementos, TARIMA_ESPERADA, JSON.stringify(texto))
    assert.equal(r.forma, forma)
  }
  const conId = parseaLectura(`]C1${GS}010952123400002017261030` + '10L4471')
  assert.ok(!esErrorLectura(conId) && conId.simbologia === ']C1')
  assert.deepEqual(!esErrorLectura(conId) && conId.elementos, CAJA_ESPERADA)
})

test('pistola: sin el separador tras un campo variable el parser NO adivina, avisa', () => {
  const r = parseaLectura(']C102095212340000203750172610301' + '0L4471')
  assert.ok(esErrorLectura(r))
  assert.equal(r.error, 'falta-separador')
  const x = parseaLectura('2345678')
  assert.ok(esErrorLectura(x))
})

// --- Ancho del Code 128 contra BWIPP ---------------------------------------------------------
test('code128: los modulos calculados coinciden con los de bwip-js en caja, tarima y SSCC', () => {
  const casos: Simbolo[] = [
    CAJA_ESPERADA, TARIMA_ESPERADA, [{ ai: '00', valor: '095212340005678903' }],
    [{ ai: '01', valor: '09521234000020' }, { ai: '17', valor: '261000' }, { ai: '10', valor: 'A1B2C3' }],
    [{ ai: '01', valor: '09521234000020' }, { ai: '10', valor: '123' }],
  ]
  for (const s of casos) {
    const svg = bwipjs.toSVG({ bcid: 'gs1-128', text: aHri(s), scale: 1, includetext: false, paddingwidth: 0 })
    const ancho = Number(/viewBox="0 0 (\d+)/.exec(svg)?.[1])
    assert.equal(modulosGs1128(s), ancho, aHri(s))
  }
})

// --- Prefijos ----------------------------------------------------------------------------------
test('prefijos: 952 demo, 04 empresa, 02/20-29 region, 978 ISBN, 750 global', () => {
  assert.equal(clasificaPrefijo('09521234000020').clase, 'demostracion')
  assert.equal(clasificaPrefijo('00400000000017').clase, 'restringido-empresa')
  assert.equal(clasificaPrefijo('02012345000013').clase, 'restringido-region')
  assert.equal(clasificaPrefijo('00212345000017').clase, 'restringido-region')
  assert.equal(clasificaPrefijo('09780306406157').clase, 'publicacion')
  assert.equal(clasificaPrefijo('07501234567893').clase, 'global')
})
