import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ADAPTADORES_NUBE, antesDe, categoriaDe, compone, creaClienteAudio, creaEnrutador, creaFreno, decideRanuraVoz, esClicHumano,
  literalVisible, microfonoAbierto, pareceIrreversible, pasosDe, raices, resuelveComposicion, transicion, validaEnchufe, validaResumen,
  VIGENCIA_MS, type EstadoConversacion,
} from '../dist/index.js'
import { AGENDA, BUZON, COMPOSICION, ENCHUFES, copia } from './_base.ts'

test('enchufe: el de ejemplo pasa, y cada regla cae con su defecto', () => {
  assert.equal(validaEnchufe(AGENDA).ok, true)
  const casos: Array<[string, (e: typeof AGENDA) => void, RegExp]> = [
    ['irreversible sin freno', (e) => { e.freno = [] }, /no pasa por el freno/],
    ['reclama el freno', (e) => { e.ranuras.push('freno') }, /solo la llena la capa/],
    ['sin prefijo de módulo', (e) => { e.intenciones[0]!.id = 'otro.consulta' }, /prefijo del módulo/],
    ['parece irreversible y se declara reversible', (e) => { e.intenciones[2]!.irreversible = false; e.freno = [] }, /parece irreversible/],
    ['intención repetida', (e) => { e.intenciones.push(copia(e.intenciones[0]!)) }, /repetida/],
    ['frena algo que no atiende', (e) => { e.freno.push({ accion: 'agenda.borra-todo', porque: 'x y z' }) }, /no es una intención/],
    ['pantalla ajena', (e) => { e.intenciones[0]!.pantalla = '/otra' }, /no está entre las del módulo/],
    ['campo inventado', (e) => { (e as unknown as Record<string, unknown>).extra = 1 }, /Unrecognized key/],
  ]
  for (const [nombre, rompe, caza] of casos) {
    const e = copia(AGENDA)
    rompe(e)
    const r = validaEnchufe(e)
    assert.equal(r.ok, false, nombre)
    if (!r.ok) assert.match(r.problemas.map((p) => p.que).join(' | '), caza, nombre)
  }
})

test('freno: la cita tiene que ser de la persona, y solo el clic la confirma (ni voz, ni texto, ni teclado)', () => {
  let t = 1_000
  const f = creaFreno({ ahora: () => t })
  const dicho = ['cancela la cita de mañana con la señora Ruiz']
  assert.equal(f.pide({ accion: 'agenda.cancela', porque: 'x', cita: 'cancela todo', mensajesDeLaPersona: dicho }).ok, false, 'cita inventada')
  assert.equal(f.pide({ accion: 'agenda.cancela', porque: 'x', cita: 'sí', mensajesDeLaPersona: ['sí'] }).ok, false, 'cita corta')
  const s = f.pide({ accion: 'agenda.cancela', porque: 'avisa a una persona', cita: dicho[0]!, mensajesDeLaPersona: dicho })
  assert.equal(s.ok, true)
  if (!s.ok) return
  assert.equal(s.valor.categoria, 'borrar')
  for (const origen of ['voz', 'texto', 'teclado', 'agente'] as const) assert.equal(f.confirma(s.valor.id, { origen, cita: dicho[0]! }).ok, false, origen)
  assert.equal(f.confirma(s.valor.id, { origen: 'clic', cita: 'otra cosa distinta' }).ok, false, 'cita distinta')
  assert.equal(f.confirma(s.valor.id, { origen: 'clic', cita: dicho[0]! }).ok, true)
  assert.equal(f.confirma(s.valor.id, { origen: 'clic', cita: dicho[0]! }).ok, false, 'una sola vez')
  const vieja = f.pide({ accion: 'agenda.cancela', porque: 'x', cita: dicho[0]!, mensajesDeLaPersona: dicho })
  t += VIGENCIA_MS + 1
  assert.equal(vieja.ok && f.confirma(vieja.valor.id, { origen: 'clic', cita: dicho[0]! }).ok, false, 'vencida')
  const oculta = 'cancela la cita‮ de mañana'
  assert.equal(f.pide({ accion: 'agenda.cancela', porque: 'x', cita: oculta, mensajesDeLaPersona: [oculta] }).ok, false, 'invisibles')
  assert.equal(literalVisible(oculta).texto, 'cancela la cita⟨U+202E⟩ de mañana')
  assert.equal(esClicHumano({ detail: 1, isTrusted: true }), true)
  assert.equal(esClicHumano({ detail: 0, isTrusted: true }), false)
  assert.equal(esClicHumano({ detail: 1, isTrusted: false }), false)
  assert.equal(pareceIrreversible('factura.envia al SAT'), true)
  assert.equal(pareceIrreversible('consulta la agenda'), false)
  assert.equal(categoriaDe('paga la factura'), 'pagar')
})

test('intención: encuentra el módulo por lo dicho, no adivina y pregunta si duda', () => {
  const intenciones = ENCHUFES.flatMap((e) => e.intenciones.map((i) => ({ ...i, modulo: e.modulo })))
  const r = creaEnrutador(intenciones)
  assert.equal(r.resuelve('¿Qué tengo hoy?').intencion?.id, 'agenda.consulta-hoy')
  assert.equal(r.resuelve('apártame una cita para mañana a las diez').intencion?.id, 'agenda.reserva')
  assert.equal(r.resuelve('cuántos documentos hay pendientes').intencion?.id, 'buzon.pendientes')
  const nada = r.resuelve('cuéntame un chiste de astronautas')
  assert.equal(nada.intencion, null)
  assert.equal(nada.motivo, 'sin-coincidencia')
  assert.equal(r.resuelve('   ').motivo, 'vacio')
  assert.deepEqual(raices('Las citas de MAÑANA'), ['cita', 'manan'])
})

test('composición: cada ranura dice quién la llena; intercambiar un módulo cambia el dato, no la capa', () => {
  const p = resuelveComposicion(COMPOSICION, ENCHUFES)
  assert.deepEqual(p.problemas, [])
  assert.equal(p.ranuras.plan.quien, 'agenda')
  assert.equal(p.ranuras.freno.quien, 'capa')
  assert.equal(p.ranuras.conversacion.quien, 'capa')
  assert.equal(p.ranuras.voz.quien, 'voz-local')
  assert.equal(p.intenciones.length, 6, 'las 4 de los módulos y las 2 de memoria de la capa')
  const sinAgenda = { ...copia(COMPOSICION), modulos: ['buzon', 'voz-local'], ranuras: {} }
  const q = resuelveComposicion(sinAgenda, ENCHUFES)
  assert.deepEqual(q.problemas, [])
  assert.equal(q.ranuras.plan.quien, 'capa', 'sin la agenda, el plan lo llena la capa')
  const mal = compone({ ...copia(COMPOSICION), ranuras: { freno: 'agenda' } }, ENCHUFES)
  assert.equal(mal.ok, false)
  const ajeno = compone({ ...copia(COMPOSICION), ranuras: { plan: 'buzon' } }, ENCHUFES)
  assert.equal(ajeno.ok, false, 'el buzón no declara el plan')
  const huerfano = compone({ ...copia(COMPOSICION), modulos: ['agenda', 'no-existe'] }, ENCHUFES)
  assert.equal(huerfano.ok, false)
  const conTexto = compone({ ...copia(COMPOSICION), marca: { ...COMPOSICION.marca, extra: 'x' } }, ENCHUFES)
  assert.equal(conTexto.ok, false)
})

test('voz: la ranura no se llena sola con la nube; con datos sensibles, nunca; sin motor local no hay botón y se dice', () => {
  const local = decideRanuraVoz({ stt: 'parakeet', tts: 'piper', vad: 'silero', nube: [] }, { datosSensibles: true })
  assert.deepEqual([local.visible, local.puede.conversar, local.sale.length], [true, true, 0])
  const nubeCallada = decideRanuraVoz({ stt: 'groq', tts: 'piper', vad: 'silero', nube: [] }, { datosSensibles: false })
  assert.equal(nubeCallada.puede.dictar, false)
  assert.match(nubeCallada.problemas.join(), /no se llena sola/)
  const nubeEncendida = decideRanuraVoz({ stt: 'groq', tts: 'piper', vad: 'silero', nube: ['groq'] }, { datosSensibles: false })
  assert.deepEqual(nubeEncendida.sale, [{ que: 'audio', aQuien: 'Groq (whisper-large-v3-turbo)', motor: 'groq' }])
  const pacientes = decideRanuraVoz({ stt: 'groq', tts: 'elevenlabs', vad: 'silero', nube: ['groq', 'elevenlabs'] }, { datosSensibles: true })
  assert.equal(pacientes.visible, false)
  assert.match(pacientes.motivo, /sin motor local/)
  assert.equal(decideRanuraVoz(null, { datosSensibles: false }).visible, false)
  assert.ok(ADAPTADORES_NUBE.every((a) => !a.local && !a.medido && a.sale !== 'nada'), 'cada adaptador dice qué sale y queda «no medido»')
})

test('voz: el botón pasa apagado → escuchando → pensando → hablando, se interrumpe, y apagar gana siempre', () => {
  const pasos: Array<[Parameters<typeof transicion>[1], EstadoConversacion]> = [
    [{ tipo: 'enciende' }, 'pidiendo-permiso'], [{ tipo: 'permiso', concedido: true }, 'escuchando'], [{ tipo: 'fin-de-habla' }, 'pensando'],
    [{ tipo: 'responde' }, 'hablando'], [{ tipo: 'habla-encima' }, 'escuchando'], [{ tipo: 'fin-de-habla' }, 'pensando'], [{ tipo: 'apaga' }, 'apagado'],
  ]
  let e: EstadoConversacion = 'apagado'
  for (const [ev, esperado] of pasos) { e = transicion(e, ev); assert.equal(e, esperado, ev.tipo) }
  assert.equal(microfonoAbierto('apagado'), false)
  assert.equal(transicion('pidiendo-permiso', { tipo: 'permiso', concedido: false }), 'apagado')
})

test('voz: el cliente habla el contrato /v1/audio de OpenAI y prueba la llave sin gastar cuota', async () => {
  const vistas: Array<{ url: string; metodo: string; tipo: string | null }> = []
  const falso: typeof fetch = async (entrada, init) => {
    const url = String(entrada)
    vistas.push({ url, metodo: init?.method ?? 'GET', tipo: init?.body instanceof FormData ? 'multipart' : typeof init?.body === 'string' ? 'json' : null })
    if (url.endsWith('/v1/audio/transcriptions')) {
      const f = init!.body as FormData
      assert.equal(f.get('model'), 'parakeet')
      assert.ok(f.get('file') instanceof Blob)
      return Response.json({ text: 'qué tengo hoy' })
    }
    if (url.endsWith('/v1/audio/speech')) {
      assert.deepEqual(JSON.parse(String(init!.body)), { model: 'piper', input: 'Hola.', voice: 'es_MX', response_format: 'wav', speed: 1 })
      return new Response(new Uint8Array([82, 73, 70, 70]), { headers: { 'content-type': 'audio/wav' } })
    }
    return new Response('{"data":[]}', { status: 200 })
  }
  const c = creaClienteAudio({ base: 'http://127.0.0.1:8765/', token: 'token-de-prueba', fetch: falso })
  assert.equal((await c.transcribe(new Blob([new Uint8Array(4)]))).texto, 'qué tengo hoy')
  assert.equal((await c.sintetiza('Hola.')).tipo, 'audio/wav')
  assert.equal((await c.pruebaLlave()).ok, true)
  assert.deepEqual(vistas.map((v) => `${v.metodo} ${new URL(v.url).pathname} ${v.tipo}`), ['POST /v1/audio/transcriptions multipart', 'POST /v1/audio/speech json', 'GET /v1/models null'])
})

test('resumen: solo conteos y enlaces declarados; un texto libre, una clave inventada o una consulta en el enlace se rechazan', () => {
  const d = COMPOSICION.resumen!
  const bueno = { resumen: 1, producto: 'consultorio-demo', generado: '2026-10-25T12:00:00Z', conteos: { 'citas-hoy': 3, pendientes: 1 }, enlaces: { agenda: '/agenda' } }
  assert.equal(validaResumen(bueno, d).ok, true)
  const malos: Array<[string, Record<string, unknown>]> = [
    ['un campo de texto libre', { ...bueno, nota: 'la paciente Ana López viene nerviosa' }],
    ['una clave inventada', { ...bueno, conteos: { 'caso-de-ana-lopez': 1 } }],
    ['texto en un conteo', { ...bueno, conteos: { 'citas-hoy': 'tres' } }],
    ['texto en la consulta del enlace', { ...bueno, enlaces: { agenda: '/agenda?nota=Ana%20Lopez' } }],
    ['un enlace con espacios', { ...bueno, enlaces: { agenda: '/agenda de ana' } }],
    ['un conteo negativo', { ...bueno, conteos: { 'citas-hoy': -1 } }],
  ]
  for (const [nombre, x] of malos) assert.equal(validaResumen(x, d).ok, false, nombre)
})

test('primer arranque: lo irreversible va al freno en todos los niveles; la voz solo se ofrece si hay motor local', () => {
  for (const nivel of ['siempre', 'lo-importante', 'solo-irreversible'] as const) assert.equal(antesDe(nivel, { efecto: 'escribe', irreversible: true }), 'freno')
  assert.equal(antesDe('lo-importante', { efecto: 'escribe', irreversible: false }), 'pregunta')
  assert.equal(antesDe('lo-importante', { efecto: 'lee', irreversible: false }), 'directo')
  assert.equal(antesDe('siempre', { efecto: 'lee', irreversible: false }), 'pregunta')
  const con = pasosDe(resuelveComposicion(COMPOSICION, ENCHUFES)).map((p) => p.id)
  assert.deepEqual(con, ['bienvenida', 'privacidad', 'voz', 'pregunta', 'listo'])
  const sin = pasosDe(resuelveComposicion({ ...copia(COMPOSICION), voz: null }, [AGENDA, BUZON])).map((p) => p.id)
  assert.equal(sin.includes('voz'), false)
  assert.doesNotMatch(JSON.stringify(pasosDe(resuelveComposicion(COMPOSICION, ENCHUFES))), /Levy|Arbrain/)
})
