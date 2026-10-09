/**
 * El anonimizador (v2): 0 fugas sobre el corpus sembrado, las variantes propias y las 63 entradas
 * del revisor adversarial; todo caso de RR. HH. o nómina a cuarentena; lo técnico entra y no
 * se confunde con nombres.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anonimiza, generaliza } from '../dist/index.js'
import { casosDelSandbox, mide, VALIDADORES, fuga } from './_anonimizacion.ts'
import { CASOS_ADVERSARIALES, CASOS_TECNICOS } from './_adversariales.ts'
import { BANCO_ANONIMIZA, BANCO_GENERALIZA, FRASES_DE_LA_REVISION, GENERALIZA_DE_LA_REVISION, DE_REVISION_HUMANA, NOMBRES_DEL_CLIENTE } from './_banco-independiente.ts'
import { CONTROL_ANONIMIZA, CONTROL_GENERALIZA, NOMBRES_CONTROL } from './_banco-de-control.ts'
import { HERRAMIENTA, lee } from './_ayuda.ts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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

test('todo caso de RR. HH. o nómina va a cuarentena, aunque esté bien anonimizado', () => {
  for (const t of ['Error en PC00_M32_CALC de la quincena', 'Baja IMSS rechazada por el IDSE', 'La trabajadora no tiene PTU calculada']) {
    const r = anonimiza(t, VALIDADORES)
    assert.equal(r.veredicto, 'cuarentena', t)
    assert.match(r.senales[0] ?? '', /no entra al sandbox \(cuarentena definitiva hasta D14\)/)
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
  assert.equal(r.texto, 'El reporte [OBJETO_PROPIO] de [CLIENTE] falla en sociedad [SOCIEDAD]')
})

test('la cuarentena no frena la atención: el reloj de SLA no la conoce y el caso sigue en atención con su consultora', () => {
  assert.doesNotMatch(readFileSync(join(HERRAMIENTA, 'src', 'sla.ts'), 'utf8'), /cuarentena|veredicto/i, 'el reloj de SLA no depende de la cuarentena')
  const runtime = lee('src/features/soporte-sap/services/runtime.ts')
  const desde = runtime.indexOf('function alSandbox(')
  const cuerpo = runtime.slice(desde, runtime.indexOf('\n}\n', desde))
  assert.match(cuerpo, /EN_CUARENTENA/, 'el caso en cuarentena queda en su cadena')
  assert.match(cuerpo, /\n  i\.estado = 'en_atencion'/, 'el caso sigue en atención, entre o no al sandbox')
})

// PRP-010 H-17 (DP-4): la primera respuesta es de una PERSONA. Antes, esta misma prueba exigía lo contrario (que
// anonimizar marcara la primera respuesta): fijaba el bug como requisito, y una P1 a 60 min se cumplía sola.
const cuerpoDe = (runtime: string, funcion: string) => { const d = runtime.indexOf(`function ${funcion}(`); return runtime.slice(d, runtime.indexOf('\n}\n', d)) }
test('H-17 · ni anonimizar ni mandar a la sala marcan la primera respuesta: solo la da el consultor, respondiéndole al cliente', () => {
  const runtime = lee('src/features/soporte-sap/services/runtime.ts')
  for (const f of ['alSandbox', 'proponPlan', 'levanta', 'decide', 'aplica', 'revisa', 'conversa', 'relojDelCliente']) {
    assert.doesNotMatch(cuerpoDe(runtime, f), /PRIMERA_RESPUESTA/, `${f} no la marca`)
  }
  const responde = cuerpoDe(runtime, 'respondeAlCliente')
  assert.match(responde, /if \(s\.rol !== 'consultor'\) throw/, 'solo el consultor responde')
  assert.match(responde, /i\.sla\.push\(\{ tipo: 'PRIMERA_RESPUESTA'/, 'y su respuesta es la que marca el reloj')
})

test('la red de señales residuales: un dominio que ningún detector reconoce deja el caso en cuarentena', () => {
  const r = anonimiza('MIGO marca M7 053; escribir a soporte en grupo-norteno.com.mx para el detalle', VALIDADORES)
  assert.equal(r.veredicto, 'cuarentena', JSON.stringify(r))
  assert.ok(r.senales.includes('queda algo con forma de correo'), JSON.stringify(r.senales))
  assert.ok(!r.senales.some((x) => x.includes('grupo-norteno')), 'la señal dice el tipo, nunca el dato')
})

// --- PRP-010 H-04 y H-19: el banco lo escribió quien no leyó el detector (`_banco-independiente.ts`), y es fixture permanente.
type CasoDeBanco = { readonly texto: string; readonly noDebeQuedar: readonly string[]; readonly debeQuedar?: readonly string[] }
const contiene = (t: string, s: string) => t.toLowerCase().includes(s.toLowerCase())
/** Lo que entra con el dato. Un caso en cuarentena no fuga: no entra. */
const fugasDe = (banco: readonly CasoDeBanco[], f: (t: string) => { texto: string; veredicto: string }) => banco.flatMap((c) => {
  const r = f(c.texto)
  return r.veredicto === 'entra' ? c.noDebeQuedar.filter((s) => contiene(r.texto, s)).map((s) => `«${c.texto}» deja «${s}»`) : []
})
/** Lo técnico que se perdió: el término ya no está, o un control sin datos personales fue a cuarentena. Un caso CON
 *  datos que va a cuarentena no pierde nada: es la respuesta segura. */
const tapadosDe = (banco: readonly CasoDeBanco[], f: (t: string) => { texto: string; veredicto: string }) => banco.flatMap((c) => {
  const r = f(c.texto)
  if (r.veredicto !== 'entra' && c.noDebeQuedar.length) return []
  return (c.debeQuedar ?? []).filter((s) => r.veredicto !== 'entra' || !contiene(r.texto, s)).map((s) => `«${c.texto}» pierde «${s}» → ${r.texto}`)
})
const an = (t: string) => anonimiza(t, VALIDADORES)
const gen = (t: string) => generaliza(t, VALIDADORES, NOMBRES_DEL_CLIENTE)

test('H-04 · las 5 frases de la revisión del 07/10 ya no entran con el dato, solas ni dentro de un ticket', () => {
  assert.deepEqual(fugasDe(FRASES_DE_LA_REVISION, an), [])
})

test('H-04 · el banco independiente: ningún dato personal entra al sandbox, y lo de nómina va a cuarentena', () => {
  assert.deepEqual(fugasDe(BANCO_ANONIMIZA, an), [])
  const deNomina = BANCO_ANONIMIZA.filter((c) => DE_REVISION_HUMANA.some((d) => c.texto.includes(d)))
  assert.equal(deNomina.length, DE_REVISION_HUMANA.length, 'cada caso de nómina del banco encuentra su marca')
  assert.deepEqual(deNomina.filter((c) => an(c.texto).veredicto === 'entra').map((c) => c.texto), [])
})

test('H-04 · los controles del banco: lo técnico entra y no se tapa (MIRO, «dolores de cabeza», M7 053, «En VA01»)', () => {
  assert.deepEqual(tapadosDe(BANCO_ANONIMIZA, an), [])
})

test('H-04 · un nombre que no está en la lista de nombres comunes se reconoce por la mayúscula a media frase', () => {
  for (const t of ['Lo reportó Tlacaélel, el del turno de noche: la MIGO no contabiliza', 'Ya quedó el ajuste, gracias a Yaretzi por la captura']) {
    const r = an(t)
    assert.ok(r.veredicto !== 'entra' || !/Tlacaélel|Yaretzi/.test(r.texto), r.texto)
  }
})

test('H-19 · el banco independiente de la generalización: nada que identifique al cliente sube al núcleo, y lo estándar se queda', () => {
  assert.deepEqual(fugasDe([...GENERALIZA_DE_LA_REVISION, ...BANCO_GENERALIZA], gen), [])
  assert.deepEqual(tapadosDe(BANCO_GENERALIZA, gen), [])
})

/** Por diseño, un número de 7 dígitos o más y una fecha se generalizan aunque sean técnicos (cabecera de anonimiza.ts). */
const porDiseno = (s: string) => /^\d{7,}$/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)
const sinLoDeDiseno = (banco: readonly CasoDeBanco[]) => banco.map((c) => ({ ...c, debeQuedar: c.debeQuedar?.filter((s) => !porDiseno(s)) }))

test('H-04 · el banco de control (escrito después, sin ver el detector): ningún dato entra, lo de nómina va a cuarentena y lo técnico se queda', () => {
  assert.deepEqual(fugasDe(CONTROL_ANONIMIZA, an), [])
  assert.deepEqual(CONTROL_ANONIMIZA.filter((c) => c.revision && an(c.texto).veredicto === 'entra').map((c) => c.texto), [])
  assert.deepEqual(tapadosDe(sinLoDeDiseno(CONTROL_ANONIMIZA), an), [])
})

test('H-19 · el banco de control de la generalización: nada del cliente sube al núcleo, y lo estándar (ZTERM, /SCWM/) se queda', () => {
  const g = (t: string) => generaliza(t, VALIDADORES, NOMBRES_CONTROL)
  assert.deepEqual(fugasDe(CONTROL_GENERALIZA, g), [])
  assert.deepEqual(tapadosDe(CONTROL_GENERALIZA, g), [])
})

test('H-19 · en la app, al núcleo solo sube el superadministrador, y sube con alNucleo (generalizada)', () => {
  const runtime = lee('src/features/soporte-sap/services/runtime.ts')
  const cuerpo = cuerpoDe(runtime, 'subeAlNucleo')
  assert.match(cuerpo, /if \(s\.rol !== 'superadmin'\) throw/, 'solo el superadministrador')
  assert.match(cuerpo, /= alNucleo\(p, VALIDADORES, NOMBRES_DE_ORGANIZACION\)/, 'y sube lo que deja alNucleo')
  assert.match(runtime, /if \(a\.tipo === 'al_nucleo'\) return subeAlNucleo\(s, a\.propuesta\)/, 'la acción llega a esa función')
})

test('R3-06 · el anonimizador no deja entrar las formas de la tercera revisión: separadores, «at», ancho completo', () => {
  const casos: Array<[string, string[]]> = [
    ['llamar al teléfono 55/1234/5678 por la tarde', ['1234', '5678']], ['tel 55_1234_5678', ['1234', '5678']],
    ['el NSS １２３４５６７８９０１ no aparece', ['12345678901', '１２３４５６７８９０１']], ['correo xochitl＠acme.mx', ['xochitl', 'acme']],
    ['escribir a xochitl.tzompantzi at acme.io', ['tzompantzi', 'acme']],
  ]
  const fugan = casos.filter(([t, datos]) => { const r = anonimiza(t, VALIDADORES); return r.veredicto === 'entra' && datos.some((d) => r.texto.includes(d)) })
  assert.deepEqual(fugan.map(([t]) => t), [])
})

