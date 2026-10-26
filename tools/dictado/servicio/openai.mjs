/**
 * El enchufe de motor COMPATIBLE CON OPENAI del servicio de dictado: la forma de la industria, la que usan en
 * Arbrain v0.2.10 Groq y LemonFox (`server/src/live/transcribe.ts › speechProviders`) y Kokoro
 * (`server/src/voice.ts › synthesizeSpeech`). Así el servicio atiende a cualquiera de los dos lados: un cliente de
 * OpenAI, el `creaClienteAudio` de la capa o la voz de Arbrain apuntada aquí.
 *
 *  - `POST /v1/audio/transcriptions` (multipart: `file`, `model`, `language`, `prompt`, `response_format`) →
 *    `{ "text": … }` (`json`, por defecto) o el texto a secas (`text`). El audio es WAV PCM16; otro formato → 415
 *    con la razón (aquí no hay decodificador de mp3/webm: se dice en vez de adivinar). Quién contestó va en
 *    cabeceras (`x-motor`, `x-ms`, `x-local`), no en el cuerpo, para que el cuerpo sea el de OpenAI.
 *    `model`: `respaldo` (o su id) pide el segundo motor; el id de un adaptador de nube ENCENDIDO lo pide a él; lo
 *    demás (`whisper-1`, `parakeet`…) es la cadena: el motor LOCAL primero y, si falla, la nube encendida con llave.
 *  - `POST /v1/audio/speech` (JSON `{ model, input, voice, response_format, speed }`) → `audio/wav` entero (con sus
 *    tamaños exactos) o `audio/pcm` (PCM16LE mono) EN FLUJO, con `x-frecuencia-hz`. mp3/opus/aac/flac → 400: no hay
 *    codificador (resuelve el «sin verificar» del mapa: hoy solo PCM16 y WAV). `voice` admite el nombre exacto o un
 *    prefijo (`es_MX` → la primera voz es_MX cargada). `model: elevenlabs | lemonfox-tts` solo si está encendido.
 *  - `GET /v1/models` → la lista de motores y voces: PROBAR LA LLAVE SIN GASTAR CUOTA (lo importado de
 *    `server/src/cliente/voz.ts › probarLlaveVoz`): 200 con el token bueno, 401 con otro, y ningún motor se mueve.
 *    Con `?probar=1`, cada adaptador de nube encendido prueba SU llave por su ruta gratuita, si la tiene.
 *
 * Los errores van en la forma de OpenAI (`{ error: { message, type, code } }`), sin texto dictado, sin stack ni ruta.
 */
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { transcribeEnCadena, ErrorNube } = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'nube.js')).href)

const FORMATOS_TEXTO = new Set(['json', 'text'])
const FORMATOS_AUDIO = new Set(['wav', 'pcm'])
const IDIOMAS = { spanish: 'es', espanol: 'es', 'español': 'es', english: 'en', portuguese: 'pt', french: 'fr' }

const errorOpenAI = (ctx, res, codigo, mensaje, tipo = 'invalid_request_error', clave = null) =>
  ctx.json(res, codigo, { error: { message: mensaje, type: tipo, code: clave } })

/** «es», «es-MX», «spanish» → «es». Vacío → el idioma del servicio. */
export function idiomaDe(valor, porDefecto = 'es') {
  const v = String(valor ?? '').trim().toLowerCase()
  if (!v) return porDefecto
  return IDIOMAS[v] ?? v.split(/[-_]/)[0].slice(0, 8)
}

/** El nombre exacto de una voz cargada, o la primera cuyo nombre empieza por lo pedido (`es_MX`). */
export function vozDe(voces, pedida) {
  const nombres = [...voces.keys()]
  if (pedida === undefined || pedida === null || pedida === '') return nombres[0]
  const p = String(pedida)
  return voces.has(p) ? p : nombres.find((n) => n.startsWith(p))
}

async function formulario(ctx, req, res) {
  const tipo = String(req.headers['content-type'] ?? '')
  if (!tipo.toLowerCase().startsWith('multipart/form-data')) return void errorOpenAI(ctx, res, 400, 'se esperaba multipart/form-data con el campo «file»')
  const bytes = await ctx.leeCuerpo(req, ctx.configuracion.bytesMaximos + 64 * 1024)
  try {
    return await new Request('http://interno/', { method: 'POST', headers: { 'content-type': tipo }, body: bytes }).formData()
  } catch {
    return void errorOpenAI(ctx, res, 400, 'el multipart no se pudo leer')
  }
}

/** El audio del campo `file` a 16 kHz mono, o `undefined` si ya se respondió el error. */
async function audioDe(ctx, res, archivo) {
  if (!archivo || typeof archivo === 'string' || typeof archivo.arrayBuffer !== 'function') return void errorOpenAI(ctx, res, 400, 'falta el campo «file» con el audio')
  const bytes = new Uint8Array(await archivo.arrayBuffer())
  if (bytes.length < 44 + 320) return void errorOpenAI(ctx, res, 400, 'el audio está vacío o es demasiado corto')
  if (Buffer.from(bytes.subarray(0, 4)).toString('ascii') !== 'RIFF') {
    return void errorOpenAI(ctx, res, 415, 'formato no soportado: este servicio lee WAV PCM16 (p. ej. ffmpeg -i toma.webm -ar 16000 -ac 1 toma.wav)', 'invalid_request_error', 'unsupported_audio')
  }
  try {
    return ctx.audio.preparaParaModelo(ctx.audio.leeWav(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), 16000)
  } catch {
    return void errorOpenAI(ctx, res, 415, 'el WAV no se pudo leer (se espera PCM entero o flotante de 32 bits)', 'invalid_request_error', 'unsupported_audio')
  }
}

/** Los eslabones de la transcripción según `model`: el respaldo, un adaptador concreto, o la cadena local → nube. */
function eslabonesPara(ctx, modelo, muestras, idioma, pista) {
  const { configuracion, cola } = ctx
  const local = (motor) => ({
    id: motor.id, local: true, disponible: true,
    async transcribe() {
      await cola.turno()
      try { return (await motor.transcribe(muestras, 16000, { idioma, pista })).texto } finally { cola.libera() }
    },
  })
  const nube = (a) => ({ id: a.ficha.id, local: false, disponible: a.disponible, transcribe: (senal) => a.transcribe(ctx.audio.codificaWav(muestras, 16000), { idioma, senal }) })
  const sttNube = configuracion.nube?.stt ?? []
  if (modelo === 'respaldo' || (configuracion.respaldo && modelo === configuracion.respaldo.id)) return configuracion.respaldo ? [local(configuracion.respaldo)] : 'este servicio no tiene motor de respaldo'
  const pedido = sttNube.find((a) => a.ficha.id === modelo)
  if (pedido) return pedido.disponible ? [nube(pedido)] : `${modelo} está encendido pero sin llave en este servicio`
  if (['groq', 'lemonfox-stt'].includes(modelo)) return `${modelo} está apagado en este servicio (DICTADO_NUBE)`
  return [local(configuracion.motor), ...sttNube.map(nube)]
}

export async function transcripcionOpenAI(ctx, req, res) {
  const form = await formulario(ctx, req, res)
  if (!form) return
  const formato = String(form.get('response_format') ?? 'json')
  if (!FORMATOS_TEXTO.has(formato)) return errorOpenAI(ctx, res, 400, `response_format «${formato.slice(0, 20)}» no soportado: este servicio da json o text`)
  const muestras = await audioDe(ctx, res, form.get('file'))
  if (!muestras) return
  const idioma = idiomaDe(form.get('language'), ctx.configuracion.idioma ?? 'es')
  const pista = typeof form.get('prompt') === 'string' ? String(form.get('prompt')).slice(0, 2000) : undefined
  const eslabones = eslabonesPara(ctx, String(form.get('model') ?? ''), muestras, idioma, pista)
  if (typeof eslabones === 'string') return errorOpenAI(ctx, res, 400, eslabones)
  const corte = new AbortController()
  res.on('close', () => { if (!res.writableFinished) corte.abort() })
  const t0 = performance.now()
  try {
    const r = await transcribeEnCadena(eslabones, corte.signal)
    const cabeceras = { 'x-motor': r.motor, 'x-ms': String(Math.round(performance.now() - t0)), 'x-local': r.local ? '1' : '0', ...(r.saltados.length ? { 'x-saltados': r.saltados.map((s) => `${s.motor}:${s.motivo}`).join(',') } : {}) }
    if (formato === 'text') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', ...cabeceras })
      return res.end(r.texto)
    }
    return ctx.json(res, 200, { text: r.texto }, cabeceras)
  } catch (e) {
    if (corte.signal.aborted) return res.destroy()
    if (e instanceof ErrorNube) return errorOpenAI(ctx, res, e.estado, e.message, e.codigo === 'audio-invalido' ? 'invalid_request_error' : 'server_error', e.codigo)
    // El motor local cayó y no había nube encendida a la que pasar: se dice (sin el detalle interno), no se inventa.
    return errorOpenAI(ctx, res, 503, 'el motor de transcripción no pudo contestar', 'server_error', 'motor_caido')
  }
}

async function cuerpoJson(ctx, req, res) {
  const bytes = await ctx.leeCuerpo(req, 64 * 1024)
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch {
    return void errorOpenAI(ctx, res, 400, 'se esperaba JSON { model, input, voice, response_format, speed }')
  }
}

/** Valida el pedido de voz; devuelve el error (texto) o los valores. */
function pedidoDeVoz(ctx, cuerpo) {
  const input = typeof cuerpo?.input === 'string' ? cuerpo.input.trim() : ''
  if (!input || input.length > ctx.configuracion.caracteresMaximos) return `«input» vacío o de más de ${ctx.configuracion.caracteresMaximos} caracteres`
  const formato = String(cuerpo.response_format ?? 'wav')
  if (!FORMATOS_AUDIO.has(formato)) return `response_format «${formato.slice(0, 20)}» no soportado: este servicio no codifica mp3, opus, aac ni flac; pide wav o pcm`
  const velocidad = cuerpo.speed === undefined ? 1 : Number(cuerpo.speed)
  if (!(velocidad >= 0.5 && velocidad <= 2)) return 'speed fuera de 0,5 a 2'
  return { input, formato, velocidad, modelo: String(cuerpo.model ?? ''), voz: cuerpo.voice }
}

export async function vozOpenAI(ctx, req, res) {
  const cuerpo = await cuerpoJson(ctx, req, res)
  if (cuerpo === undefined) return
  const p = pedidoDeVoz(ctx, cuerpo)
  if (typeof p === 'string') return errorOpenAI(ctx, res, 400, p)
  const tts = ctx.configuracion.nube?.tts ?? new Map()
  if (tts.has(p.modelo)) return vozDeNube(ctx, req, res, tts.get(p.modelo), p)
  if (['elevenlabs', 'lemonfox-tts'].includes(p.modelo)) return errorOpenAI(ctx, res, 400, `${p.modelo} está apagado en este servicio (DICTADO_NUBE)`)
  if (ctx.configuracion.voces.size === 0) return errorOpenAI(ctx, res, 503, 'este servicio no tiene ninguna voz cargada', 'server_error')
  const nombre = vozDe(ctx.configuracion.voces, p.voz)
  if (!nombre) return errorOpenAI(ctx, res, 400, `esa voz no está cargada: hay ${[...ctx.configuracion.voces.keys()].join(', ')}`)
  return vozLocal(ctx, req, res, nombre, p)
}

async function vozLocal(ctx, req, res, nombre, p) {
  const voz = ctx.configuracion.voces.get(nombre)
  let cortado = false
  res.on('close', () => { if (!res.writableFinished) cortado = true })
  await ctx.cola.turno()
  try {
    const cabeceras = { 'x-frecuencia-hz': String(voz.frecuenciaHz), 'x-voz': nombre, 'x-motor': 'piper', 'cache-control': 'no-store' }
    if (p.formato === 'pcm') {
      res.writeHead(200, { 'content-type': 'audio/pcm', ...cabeceras })
      res.flushHeaders()
      await voz.sintetiza(p.input, (m) => (cortado ? false : (res.write(ctx.audio.floatAPcm16(m)), true)), { velocidad: p.velocidad })
      if (!cortado) res.end()
      return
    }
    const trozos = []
    await voz.sintetiza(p.input, (m) => (cortado ? false : (trozos.push(Float32Array.from(m)), true)), { velocidad: p.velocidad })
    if (cortado) return
    const total = new Float32Array(trozos.reduce((s, t) => s + t.length, 0))
    let i = 0
    for (const t of trozos) { total.set(t, i); i += t.length }
    const wav = ctx.audio.codificaWav(total, voz.frecuenciaHz)
    res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': String(wav.length), ...cabeceras })
    res.end(wav)
  } finally {
    ctx.cola.libera()
  }
}

/** Un adaptador de nube ENCENDIDO: sale el texto (C4, su ficha lo dice). Se entrega en el formato pedido. */
async function vozDeNube(ctx, req, res, a, p) {
  if (!a.disponible) return errorOpenAI(ctx, res, 400, `${a.ficha.id} está encendido pero sin llave en este servicio`)
  const corte = new AbortController()
  res.on('close', () => { if (!res.writableFinished) corte.abort() })
  try {
    const r = await a.sintetiza(p.input, { velocidad: p.velocidad, senal: corte.signal, ...(typeof p.voz === 'string' && p.voz ? { voz: p.voz } : {}) })
    const muestras = r.tipo === 'audio/wav' ? ctx.audio.leeWav(r.audio.buffer.slice(r.audio.byteOffset, r.audio.byteOffset + r.audio.byteLength)) : null
    const hz = muestras ? muestras.frecuenciaHz : (r.frecuenciaHz ?? 24000)
    const cabeceras = { 'x-frecuencia-hz': String(hz), 'x-motor': a.ficha.id, 'cache-control': 'no-store' }
    if (p.formato === 'pcm') {
      const pcm = muestras ? ctx.audio.floatAPcm16(ctx.audio.preparaParaModelo(muestras, hz)) : r.audio
      res.writeHead(200, { 'content-type': 'audio/pcm', ...cabeceras })
      return res.end(Buffer.from(pcm))
    }
    const wav = muestras ? r.audio : ctx.audio.codificaWav(ctx.audio.pcm16aFloat(r.audio), hz)
    res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': String(wav.length), ...cabeceras })
    return res.end(Buffer.from(wav))
  } catch (e) {
    if (corte.signal.aborted) return res.destroy()
    if (e instanceof ErrorNube) return errorOpenAI(ctx, res, e.estado, e.message, 'server_error', e.codigo)
    throw e
  }
}

/** La lista de motores y voces. Ningún motor se mueve: es la prueba del token que no gasta nada. */
export async function modelos(ctx, res, probar = false) {
  const { configuracion } = ctx
  const local = (id, tipo) => ({ id, object: 'model', created: 0, owned_by: 'local', tipo })
  const nube = [...(configuracion.nube?.stt ?? []), ...(configuracion.nube?.tts?.values() ?? [])]
  const data = [
    local(configuracion.motor.id, 'stt'),
    ...(configuracion.respaldo ? [local(configuracion.respaldo.id, 'stt')] : []),
    ...[...configuracion.voces.keys()].map((v) => local(v, 'tts')),
    ...(await Promise.all(nube.map(async (a) => ({
      id: a.ficha.id, object: 'model', created: 0, owned_by: a.ficha.aQuien, tipo: a.ficha.tipo, sale: a.ficha.sale, disponible: a.disponible, medido: false,
      ...(probar ? { prueba: await a.pruebaLlave() } : {}),
    })))),
  ]
  return ctx.json(res, 200, { object: 'list', data })
}
