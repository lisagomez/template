/**
 * El anonimizador (v2): 0 fugas sobre el corpus sembrado, las variantes propias y las 63 entradas
 * del revisor adversarial; todo caso de RR. HH. o nómina a revisión humana; lo técnico entra y no
 * se confunde con nombres.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anonimiza, generaliza } from '../dist/index.js'
import { casosDelSandbox, mide, VALIDADORES, fuga } from './_anonimizacion.ts'
import { CASOS_ADVERSARIALES, CASOS_TECNICOS } from './_adversariales.ts'

test('0 fugas: ningún valor sembrado sale en un texto que entra al sandbox', () => {
  const m = mide(casosDelSandbox())
  assert.deepEqual(m.fugas, [])
  assert.ok(m.conDatosSembrados >= 100, `${m.conDatosSembrados} casos con datos sembrados`)
  assert.ok(m.entran > 0, 'lo técnico sin datos personales sí entra')
})

test('las 63 entradas del revisor adversarial: ninguna fuga, una por una', () => {
  const malas = CASOS_ADVERSARIALES.flatMap(([id, texto, sensibles]) => {
    const r = anonimiza(texto, VALIDADORES)
    return r.veredicto === 'entra' ? sensibles.filter((s) => fuga(r.texto, s)).map((s) => `${id}: «${s}»`) : []
  })
  assert.deepEqual(malas, [])
})

test('todo caso de RR. HH. o nómina va a revisión humana, aunque esté bien anonimizado', () => {
  for (const t of ['Error en PC00_M32_CALC de la quincena', 'Baja IMSS rechazada por el IDSE', 'La trabajadora no tiene PTU calculada']) {
    const r = anonimiza(t, VALIDADORES)
    assert.equal(r.veredicto, 'cuarentena', t)
    assert.match(r.senales[0] ?? '', /revisión humana obligatoria/)
  }
})

test('lo técnico que no es de personal entra y no se confunde con nombres', () => {
  for (const [id, texto] of CASOS_TECNICOS) {
    const r = anonimiza(texto, VALIDADORES)
    if (/n[oó]mina|infotipo|PA30|vacaciones/i.test(texto)) continue
    assert.equal(r.veredicto, 'entra', `${id}: ${r.senales.join('; ')}`)
    assert.doesNotMatch(r.texto, /\[NOMBRE\]/, `${id}: ${r.texto}`)
  }
  assert.equal(anonimiza('La app Fiori F0842 se queda en blanco al abrirla desde el launchpad', VALIDADORES).texto, 'La app Fiori F0842 se queda en blanco al abrirla desde el launchpad')
  assert.equal(anonimiza('Pedido 4500012345 no se puede liberar en ME29N', VALIDADORES).texto, 'Pedido [NUMERO] no se puede liberar en ME29N')
})

test('un nombre que no está en ninguna lista se reconoce porque no es vocabulario', () => {
  const r = anonimiza('Xóchitl Tzompantzi reporta que MIGO no contabiliza la entrada 101', VALIDADORES)
  assert.equal(r.veredicto, 'entra')
  assert.equal(r.texto, '[NOMBRE] reporta que MIGO no contabiliza la entrada 101')
})

test('la cuarentena dice tipos de señal, nunca el dato', () => {
  const r = anonimiza('Finiquito de Xóchitl Tzompantzi, CURP rara AB12CD34EF56GH78IJ', VALIDADORES)
  assert.equal(r.veredicto, 'cuarentena')
  for (const s of r.senales) assert.doesNotMatch(s, /Xóchitl|Tzompantzi|AB12/)
})

test('generalizar para el núcleo quita también lo que identifica al cliente', () => {
  const r = generaliza('El reporte ZVENTAS_MES de Aceros del Norte falla en sociedad 2000', VALIDADORES, ['Aceros del Norte'])
  assert.equal(r.texto, 'El reporte [TRANSACCION_Z] de [CLIENTE] falla en sociedad [SOCIEDAD]')
})
