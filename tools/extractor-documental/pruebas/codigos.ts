import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  analizaCarga, camposDeCodigo, parseaGs1, validaModulo10, validaGuiaFedexExpress, validaDigitoDeControl,
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

// --- Constancias: SAT (situacion fiscal) y RENAPO (CURP). Formas MEDIDAS, valores inventados -----

const CSF_CORTA = 'https://siat.sat.gob.mx/app/qr/faces/pages/mobile/validadorqr.jsf?D1=10&D2=1&D3=12345678901_SAT970701NN3'
const CSF_LARGA = 'https://siat.sat.gob.mx/app/qr/faces/pages/mobile/validadorqr.jsf?D1=1&D2=1&D3=||2026/01/15|SAT970701NN3|SERVICIO DE ADMINISTRACION TRIBUTARIA|_c2VsbG8='

test('el QR corto de la constancia de situacion fiscal da rfc e id_cif, y el destino se muestra, no se abre', () => {
  const a = analizaCarga(CSF_CORTA)
  assert.equal(a.tipo, 'csf')
  assert.deepEqual(a.campos, { id_cif: '12345678901', rfc: 'SAT970701NN3' })
  assert.equal(a.destino, CSF_CORTA)
})

test('el QR largo da rfc, fecha de emision y nombre; el sello no se toca', () => {
  const a = analizaCarga(CSF_LARGA)
  assert.equal(a.tipo, 'csf')
  assert.deepEqual(a.campos, { rfc: 'SAT970701NN3', fecha_emision: '2026/01/15', nombre: 'SERVICIO DE ADMINISTRACION TRIBUTARIA' })
})

test('un D3 sin forma de RFC no se adivina: queda como url', () => {
  const a = analizaCarga('https://siat.sat.gob.mx/app/qr/faces/pages/mobile/validadorqr.jsf?D1=10&D2=1&D3=12345678901_NOESRFC')
  assert.equal(a.tipo, 'url')
  assert.deepEqual(a.campos, {})
})

test('la constancia de CURP con campos por | da la curp y los datos impresos; la de etiquetas, curp, nombre y numero de validacion', () => {
  const pipes = analizaCarga('GOAJ040229HDFNRNA6||GOMEZ|ALVAREZ|JUAN PABLO|HOMBRE|29/02/2004|DISTRITO FEDERAL|01|')
  assert.equal(pipes.tipo, 'curp')
  assert.deepEqual(pipes.campos, {
    curp: 'GOAJ040229HDFNRNA6', apellido_paterno: 'GOMEZ', apellido_materno: 'ALVAREZ', nombres: 'JUAN PABLO',
    sexo: 'HOMBRE', fecha_nacimiento: '29/02/2004', entidad_nacimiento: 'DISTRITO FEDERAL',
  })
  const etiquetas = analizaCarga('||Número de Validación Legal: 12345678901 |Nombre: JUAN PABLO GOMEZ ALVAREZ |CURP: GOAJ040229HDFNRNA6||')
  assert.equal(etiquetas.tipo, 'curp')
  assert.deepEqual(etiquetas.campos, { curp: 'GOAJ040229HDFNRNA6', nombre: 'JUAN PABLO GOMEZ ALVAREZ', numero_validacion: '12345678901' })
})

test('un Code128 con solo el RFC en claro es tipo rfc', () => {
  const a = analizaCarga('SAT970701NN3')
  assert.equal(a.tipo, 'rfc')
  assert.deepEqual(a.campos, { rfc: 'SAT970701NN3' })
})

test('un QR de otro tipo (CFE, INE, vacunacion) NO trae rfc ni curp: es url y punto', () => {
  for (const otra of ['https://app.cfe.mx/Aplicaciones/CCFE/Login.aspx', 'https://qr.ine.mx/004697', 'https://cvcovid.salud.gob.mx/compruebaVacuna?id1=x&id2=y']) {
    const a = analizaCarga(otra)
    assert.equal(a.tipo, 'url')
    assert.deepEqual(a.campos, {})
  }
})

test('camposDeCodigo: procedencia codigo, confianza 1, identificadores marcados, y de texto no sale nada', () => {
  const campos = camposDeCodigo(analizaCarga(CSF_CORTA))
  assert.deepEqual(campos, [
    { clave: 'id_cif', valor: '12345678901', confianza: 1, procedencia: 'codigo', formato: 'identificador' },
    { clave: 'rfc', valor: 'SAT970701NN3', confianza: 1, procedencia: 'codigo', formato: 'identificador' },
  ])
  const conNombre = camposDeCodigo(analizaCarga(CSF_LARGA))
  assert.equal(conNombre.find((c) => c.clave === 'nombre')?.formato, undefined, 'un nombre no es identificador: se compara por parecido')
  assert.deepEqual(camposDeCodigo(analizaCarga('hola')), [])
})
