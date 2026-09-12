import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  validaRfc, diagnosticaRfc, digitoVerificadorRfc, validaCurp, diagnosticaCurp, digitoVerificadorCurp,
  validaNss, diagnosticaNss, validaLuhn, corrigePorChecksum, CONFUSIONES_OCR, RFC_GENERICOS,
} from '../dist/identificadores-mx.js'

// --- RFC ---------------------------------------------------------------------------------------

test('el RFC del propio SAT pasa; con el ultimo caracter cambiado, falla por digito', () => {
  assert.equal(validaRfc('SAT970701NN3'), true)
  assert.deepEqual(diagnosticaRfc('SAT970701NN2'), { valido: false, motivo: 'digito' })
  assert.equal(digitoVerificadorRfc('SAT970701NN'), '3')
})

test('forma antes que digito: 11 caracteres, minusculas y espacios', () => {
  assert.equal(diagnosticaRfc('SAT970701N3').motivo, 'forma')
  assert.equal(validaRfc('  sat970701nn3 '), true, 'caso y espacios son confusion de escritura, no otro identificador')
  assert.equal(digitoVerificadorRfc('no-es-rfc'), null)
})

test('una fecha imposible es invalida por fecha, aunque el digito cuadrara', () => {
  const cuerpo = 'SAT971301NN'
  const conDigito = cuerpo + (digitoVerificadorRfc(cuerpo) ?? '0')
  assert.equal(diagnosticaRfc(conDigito).motivo, 'fecha')
})

test('el generico XAXX010101000 no pasa el digito salvo que el proyecto lo admita; XEXX010101000 lo cuadra por coincidencia', () => {
  assert.equal(diagnosticaRfc('XAXX010101000').motivo, 'digito')
  assert.equal(validaRfc('XAXX010101000', { admiteGenericos: true }), true)
  assert.equal(validaRfc('XEXX010101000'), true, 'medido: su digito verificador da 0')
  assert.ok(RFC_GENERICOS.has('XAXX010101000') && RFC_GENERICOS.has('XEXX010101000'))
})

test('el RFC del corpus sintetico de siempre NO pasa: sus fixtures sirven para lo suyo, no para esto', () => {
  assert.equal(validaRfc('AAA010101AAA'), false)
})

// --- CURP --------------------------------------------------------------------------------------

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/identificadores-sinteticos.json', import.meta.url), 'utf8')) as {
  rfc: { validos: string[]; invalidos: string[] }
  curp: { validos: string[]; invalidos: string[] }
  nss: { validos: string[]; invalidos: string[] }
}

test('una CURP con entidad inexistente falla por entidad; con dia 31 de abril, por fecha; con consonante en la segunda letra, por forma', () => {
  const buena = fixtures.curp.validos[0]
  const conEntidadMala = buena.slice(0, 11) + 'XX' + buena.slice(13)
  assert.equal(diagnosticaCurp(conEntidadMala).motivo, 'entidad')
  const conFechaMala = buena.slice(0, 6) + '0431' + buena.slice(10)
  assert.equal(diagnosticaCurp(conFechaMala).motivo, 'fecha')
  const conFormaMala = buena[0] + 'B' + buena.slice(2)
  assert.equal(diagnosticaCurp(conFormaMala).motivo, 'forma')
})

test('la posicion 17 resuelve el siglo: un 29 de febrero de un anio no bisiesto falla por fecha', () => {
  // 1901 no fue bisiesto: yy=01, siglo 1900 (digito en la posicion 17).
  const cuerpo = 'GOAJ010229HDFNRN0'
  const curp = cuerpo + (digitoVerificadorCurp(cuerpo) ?? '0')
  assert.equal(diagnosticaCurp(curp).motivo, 'fecha')
  // 2004 si lo fue: misma fecha con letra en la posicion 17.
  const cuerpo2 = 'GOAJ040229HDFNRNA'
  const curp2 = cuerpo2 + (digitoVerificadorCurp(cuerpo2) ?? '0')
  assert.equal(validaCurp(curp2), true)
})

test('digito verificador de CURP: null sin 17 caracteres', () => {
  assert.equal(digitoVerificadorCurp('corto'), null)
})

// --- NSS ---------------------------------------------------------------------------------------

test('el NSS admite los separadores que imprime el IMSS; 10 digitos es forma invalida; un digito cambiado falla por digito', () => {
  const bueno = fixtures.nss.validos[0]
  const conGuiones = `${bueno.slice(0, 2)}-${bueno.slice(2, 4)}-${bueno.slice(4, 6)}-${bueno.slice(6, 10)}-${bueno.slice(10)}`
  assert.equal(validaNss(conGuiones), true)
  assert.equal(diagnosticaNss(bueno.slice(0, 10)).motivo, 'forma')
  assert.equal(diagnosticaNss(fixtures.nss.invalidos[0]).motivo, 'digito')
  assert.equal(validaLuhn('79927398713'), true, 'el ejemplo canonico de Luhn')
  assert.equal(validaLuhn('7992739871x'), false)
})

// --- Cotejo cruzado contra una implementacion independiente en Python --------------------------

test('600 identificadores sinteticos validos pasan y sus 600 mutaciones fallan (dos implementaciones que coinciden)', () => {
  const casos: [string, (v: string) => boolean][] = [['rfc', validaRfc], ['curp', validaCurp], ['nss', validaNss]]
  for (const [nombre, valida] of casos) {
    const f = fixtures[nombre as 'rfc' | 'curp' | 'nss']
    assert.equal(f.validos.length, 200)
    assert.equal(f.validos.filter(valida).length, 200, `${nombre}: todos los validos tienen que pasar`)
    assert.equal(f.invalidos.filter(valida).length, 0, `${nombre}: ninguna mutacion del digito puede pasar`)
  }
})

// --- Correccion restringida por checksum ---------------------------------------------------------

test('una confusion O/0 en la fecha se corrige, declarando posicion y original', () => {
  const buena = fixtures.rfc.validos.find((r) => r.slice(-9, -3).includes('0')) ?? fixtures.rfc.validos[0]
  const posicionDelCero = buena.slice(0, -3).lastIndexOf('0')
  const leida = buena.slice(0, posicionDelCero) + 'O' + buena.slice(posicionDelCero + 1)
  const r = corrigePorChecksum(leida, validaRfc)
  assert.equal(r.corregido, true)
  if (r.corregido) {
    assert.equal(r.valor, buena)
    assert.equal(r.original, leida)
    assert.equal(r.posicion, posicionDelCero)
  }
})

test('un valor ya valido no se toca', () => {
  const r = corrigePorChecksum(fixtures.curp.validos[3], validaCurp)
  assert.deepEqual(r, { corregido: false, valor: fixtures.curp.validos[3], motivo: 'ya_valido', variantesValidas: 0 })
})

test('con dos variantes validas distintas NO se corrige: es ambiguo y lo decide una persona', () => {
  // Validador de juguete: pasa cualquier cadena que contenga un 0. "OO" tiene dos posiciones
  // corregibles a dos valores distintos ("0O" y "O0"): ambiguo por construccion.
  const r = corrigePorChecksum('OO', (v) => v.includes('0'))
  assert.equal(r.corregido, false)
  if (!r.corregido) {
    assert.equal(r.motivo, 'ambiguo')
    assert.equal(r.variantesValidas, 2)
    assert.equal(r.valor, 'OO')
  }
})

test('con dos errores a la vez no hay variante valida de una sola posicion', () => {
  const buena = fixtures.nss.validos[1]
  const dosErrores = buena.replace(/\d/, 'O').replace(/\d/, 'O')
  assert.notEqual(dosErrores, buena)
  const r = corrigePorChecksum(dosErrores, validaNss)
  assert.equal(r.corregido, false)
  if (!r.corregido) assert.equal(r.motivo, 'sin_variante_valida')
})

test('la tabla de confusiones es simetrica', () => {
  for (const [a, alternativas] of Object.entries(CONFUSIONES_OCR)) {
    for (const b of alternativas) assert.ok(CONFUSIONES_OCR[b]?.includes(a), `${a}->${b} sin vuelta`)
  }
})
