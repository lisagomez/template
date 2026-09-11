/**
 * El cotejo entre las tres fuentes de la MISMA factura: el XML, el codigo impreso y el
 * reconocimiento del PDF.
 *
 * `corroboracion.ts` no se toca ni una linea. Funciona porque el lector de XML emite sus campos
 * con las mismas claves que ya emitia `camposCfdi` para el codigo del SAT — y esa coincidencia,
 * que parece casual, es lo unico que sostiene el cotejo entero. Por eso hay abajo una prueba que
 * la fija: si alguien renombra una clave en cualquiera de los dos lados, el cotejo dejaria de
 * encontrar nada y reportaria CERO discrepancias, que es indistinguible de que todo coincide.
 *
 * La regla que gobierna el modulo cotejado vale aqui igual: ninguna fuente gana por decreto. El
 * XML no es mas fiable por venir estructurado, precisamente porque su sello no se verifica.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { leeCfdi40, camposParaCotejo } from '../dist/xml/cfdi/comprobante-40.js'
import { registroDeEsquemas } from '../dist/xml/registro.js'
import { lectorDeTimbre11 } from '../dist/xml/cfdi/timbre-11.js'
import { corrobora, exigeRevision } from '../dist/corroboracion.js'
import { analizaCarga } from '../dist/codigos.js'
import type { CampoExtraido } from '../dist/tipos.js'

const aqui = dirname(fileURLToPath(import.meta.url))
const conTimbre = registroDeEsquemas([lectorDeTimbre11])
const delXml = camposParaCotejo(
  leeCfdi40(readFileSync(join(aqui, 'fixtures', 'cfdi-40-ingreso.xml'), 'utf8'), conTimbre),
)

const UUID = '11111111-2222-3333-4444-555555555555'

/** El QR que va impreso en la representacion del comprobante. */
function qrDelSat(total = '1160.00', uuid = UUID): readonly CampoExtraido[] {
  const url =
    'https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx' +
    `?id=${uuid}&re=AAA010101AAA&rr=XAXX010101000&tt=${total}&fe=Jp7NnQ==`
  const analizada = analizaCarga(url)
  return Object.entries(analizada.campos).map(([clave, valor]) => ({
    clave,
    valor,
    confianza: 1,
    procedencia: 'codigo' as const,
  }))
}

test('el codigo impreso y el XML del mismo comprobante coinciden', () => {
  const cotejo = corrobora(delXml, qrDelSat())
  assert.equal(cotejo.discrepancias.length, 0)
  assert.equal(exigeRevision(cotejo), false)
  assert.ok(cotejo.acuerdos.length >= 4, 'tienen que coincidir en al menos las cuatro claves comunes')
})

test('un codigo con el total manipulado se delata', () => {
  // El fraude entero: una pegatina con otro QR decodifica igual de limpio que la legitima. Lo que
  // significa algo no es que decodifique, es la DISCREPANCIA.
  const cotejo = corrobora(delXml, qrDelSat('116.00'))
  assert.equal(cotejo.discrepancias.length, 1)
  assert.equal(cotejo.discrepancias[0].clave, 'total')
  assert.equal(exigeRevision(cotejo), true)
})

test('un codigo con otro identificador unico se delata', () => {
  const cotejo = corrobora(delXml, qrDelSat('1160.00', '00000000-0000-0000-0000-000000000000'))
  assert.equal(exigeRevision(cotejo), true)
  assert.equal(cotejo.discrepancias[0].clave, 'uuid')
})

test('las claves del XML y las del codigo se INTERSECAN, y esa interseccion es el cotejo', () => {
  // El fallo silencioso mas caro de este diseno: si dejaran de intersecar, `corrobora` devolveria
  // cero discrepancias por no tener nada que comparar, y eso se lee igual que "todo coincide".
  const delCodigo = new Set(qrDelSat().map((c) => c.clave))
  const delComprobante = new Set(delXml.map((c) => c.clave))
  for (const clave of ['uuid', 'rfc_emisor', 'rfc_receptor', 'total']) {
    assert.ok(delCodigo.has(clave), `el codigo del SAT dejo de emitir "${clave}"`)
    assert.ok(delComprobante.has(clave), `el lector de XML dejo de emitir "${clave}"`)
  }
})

test('el cotejo generico NO sirve para el sello, y por eso el sello va aparte', () => {
  // `comparable()` pliega mayusculas antes de comparar: correcto para un RFC, falso para base64.
  // Esta prueba fija el defecto a proposito. Es la razon de que el sello viaje bajo una clave
  // propia y se cotee con `cotejaSelloConQr`, no aqui.
  const uno: CampoExtraido[] = [{ clave: 'sello', valor: 'aB/cD+', confianza: 1, procedencia: 'xml' }]
  const otro: CampoExtraido[] = [
    { clave: 'sello', valor: 'Ab/Cd+', confianza: 1, procedencia: 'codigo' },
  ]
  const cotejo = corrobora(uno, otro)
  assert.equal(
    cotejo.discrepancias.length,
    0,
    'los da por iguales aunque sean sellos distintos: por eso el sello no usa esta via',
  )
})

test('lo que solo aporta una fuente no es un problema, es cobertura distinta', () => {
  const cotejo = corrobora(delXml, qrDelSat())
  assert.ok(cotejo.soloOcr.includes('nombre_emisor'), 'el codigo no lleva el nombre del emisor')
  assert.equal(cotejo.discrepancias.length, 0, 'y eso no cuenta como discrepancia')
})

test('el XML no gana por decreto: una discrepancia manda a revision venga de donde venga', () => {
  // Podria parecer que el XML deberia imponerse por venir estructurado. No: su sello no esta
  // verificado, asi que un XML entero puede estar inventado y analizar perfecto.
  const cotejo = corrobora(delXml, qrDelSat('999.00'))
  assert.equal(exigeRevision(cotejo), true)
})

// --- Formatos que enseño una factura REAL --------------------------------------------------------
// Los dos salieron de pasar un CFDI de verdad por el cotejo el 2026-09-10. Ninguno lo cubrian los
// fixtures sinteticos, porque un fixture se escribe con el formato que uno tiene en la cabeza y
// estos son los que usan los emisores. Los valores de aqui siguen siendo inventados: lo que se
// prueba es la FORMA, no el documento.

test('el total del codigo con relleno de ceros coteja igual', () => {
  // El QR del SAT no siempre trae el total "tal cual": hay emisores que lo rellenan con ceros a la
  // izquierda y con seis decimales. Compararlo como CADENA daria una discrepancia falsa en cada
  // factura de esos emisores, y una cola llena de discrepancias falsas deja de leerse — que es
  // justo el fallo que el umbral tiene prohibido causar.
  const conRelleno = qrDelSat('0000001160.000000')
  const cotejo = corrobora(delXml, conRelleno)
  assert.equal(cotejo.discrepancias.length, 0, '1160.00 y 0000001160.000000 son el mismo importe')
  assert.ok(cotejo.acuerdos.some((a) => a.clave === 'total'))
})

test('el identificador en minusculas coteja igual', () => {
  // El XML lo escribe en mayusculas y hay QR que lo traen en minusculas. Son el mismo comprobante.
  const cotejo = corrobora(delXml, qrDelSat('1160.00', UUID.toLowerCase()))
  assert.equal(cotejo.discrepancias.length, 0)
})

test('pero un total DISTINTO sigue siendo una discrepancia, por mucho relleno que lleve', () => {
  // El reverso, y el que evita que lo de arriba se lea como "los numeros se comparan a la ligera".
  const cotejo = corrobora(delXml, qrDelSat('0000000116.000000'))
  assert.equal(cotejo.discrepancias.length, 1)
  assert.equal(cotejo.discrepancias[0].clave, 'total')
  assert.equal(exigeRevision(cotejo), true)
})

