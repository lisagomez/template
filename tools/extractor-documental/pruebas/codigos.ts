import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  analizaCarga, parseaGs1, validaModulo10, validaGuiaFedexExpress, validaDigitoDeControl,
  esRafagaDeEscaner,
} from '../dist/codigos.js'

test('el QR de un CFDI se reconoce y suelta sus campos deterministas', () => {
  const url =
    'https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=5FB2822E-396D-4725-8521-CDC4BDD20CCF&re=AAA010101AAA&rr=BBB020202BBB&tt=1160.00&fe=Jp7NnQ=='
  const a = analizaCarga(url)
  assert.equal(a.tipo, 'cfdi')
  assert.equal(a.campos.rfc_emisor, 'AAA010101AAA')
  assert.equal(a.campos.total, '1160.00')
  assert.equal(a.campos.uuid, '5FB2822E-396D-4725-8521-CDC4BDD20CCF')
})

test('una URL cualquiera devuelve el destino para MOSTRARLO, no para abrirlo', () => {
  const a = analizaCarga('https://pagos-falsos.example/cobro?ref=9')
  assert.equal(a.tipo, 'url')
  assert.equal(a.destino, 'https://pagos-falsos.example/cobro?ref=9')
  // La carga cruda se conserva entera: es la evidencia de lo que traia la pegatina.
  assert.equal(a.cruda, 'https://pagos-falsos.example/cobro?ref=9')
})

test('GS1: los AIs ya son un esquema, con longitud fija y variable', () => {
  // (01) GTIN 14 fijo · (17) caducidad 6 fijo · (10) lote variable, termina en FNC1 · (21) serie
  const campos = parseaGs1('010761234567890017260930\x1D10LOTE-A\x1D21SER99')
  assert.equal(campos.gtin, '07612345678900')
  assert.equal(campos.caducidad, '260930')
  assert.equal(campos.lote, 'LOTE-A')
  assert.equal(campos.serie, 'SER99')
})

test('GS1 estrictamente correcto: sin separador tras un campo de longitud fija', () => {
  const campos = parseaGs1('01076123456789001726093010LOTE-A\x1D21SER99')
  assert.equal(campos.gtin, '07612345678900')
  assert.equal(campos.lote, 'LOTE-A')
  assert.equal(campos.serie, 'SER99')
})

test('GS1 con prefijo de simbologia ]C1 y AI desconocido: para, no adivina', () => {
  assert.equal(parseaGs1(']C10107612345678900').gtin, '07612345678900')
  assert.deepEqual(parseaGs1('99algo'), {}, 'un AI que no conocemos no se inventa')
})

test('digito de control modulo 10: una lectura mal hecha falla sola', () => {
  assert.ok(validaModulo10('07612345678900'))
  assert.equal(validaModulo10('07612345678901'), false, 'un digito cambiado tiene que fallar')
  assert.ok(validaModulo10('340123451111111111'), 'SSCC de 18 digitos')
})

test('guia FedEx Express: modulo 11 con pesos 1,3,7', () => {
  assert.ok(validaGuiaFedexExpress('449044304130'))
  assert.equal(validaGuiaFedexExpress('449044304131'), false)
  assert.equal(validaGuiaFedexExpress('44904430413'), false, 'longitud incorrecta')
})

test('validaDigitoDeControl devuelve null cuando NO SABE, que no es "es valido"', () => {
  assert.equal(validaDigitoDeControl('ABC', 'gtin'), null)
  assert.equal(validaDigitoDeControl('07612345678900', 'gtin'), true)
  assert.equal(validaDigitoDeControl('123', 'fedex-express'), null)
})

test('FNSKU de Amazon: X00 + 7 caracteres', () => {
  const a = analizaCarga('X001ABC123')
  assert.equal(a.tipo, 'fnsku')
  assert.equal(a.campos.fnsku, 'X001ABC123')
})

test('lo que no se reconoce es texto, y eso es una respuesta valida', () => {
  const a = analizaCarga('nota escrita a mano')
  assert.equal(a.tipo, 'texto')
  assert.deepEqual(a.campos, {})
  assert.equal(a.destino, undefined)
})

test('rafaga de escaner: la heuristica es el plan B y sus parametros son obligatorios', () => {
  const opc = { msEntreTeclas: 30, minimoCaracteres: 6 }
  const maquina = [0, 10, 20, 30, 40, 50, 60]
  const humano = [0, 120, 300, 480, 700, 900, 1100]
  assert.ok(esRafagaDeEscaner(maquina, opc))
  assert.equal(esRafagaDeEscaner(humano, opc), false)
  assert.equal(esRafagaDeEscaner([0, 10], opc), false, 'demasiado corto para distinguirlo')
  assert.throws(() => esRafagaDeEscaner(maquina, { msEntreTeclas: 0, minimoCaracteres: 6 }), RangeError)
})
