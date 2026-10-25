/**
 * Las rutas del servicio de `@tu-scope/dictado`, separadas del arranque (`servidor.mjs`) para poder probarlas con
 * motores FALSOS: el manejador recibe la configuración ya hecha (motor, respaldo, voces, nube) y las utilidades de
 * audio, y no sabe si detrás hay sherpa, un proceso de Python o una prueba.
 *
 * SEIS RUTAS PROPIAS Y TRES DEL ENCHUFE COMPATIBLE CON OPENAI (`openai.mjs`):
 *  - `GET /health` → {"status":"ok"} y nada del interior (sin token: lo usan los sondeos).
 *  - `POST /transcribir` (PCM16LE o WAV en el cuerpo) · `GET /voces` · `POST /sintetizar` (PCM16LE en flujo).
 *  - `POST /v1/audio/transcriptions` · `POST /v1/audio/speech` · `GET /v1/models`: la forma de la industria, la que
 *    usan Groq, LemonFox y Kokoro. Cualquier cliente de OpenAI (y el de la capa, `creaClienteAudio`) le habla igual.
 *
 * LO QUE EXIGE: `Authorization: Bearer <token>` en todo salvo `/health`, comparado en tiempo constante (C3).
 * LO QUE NO HACE: no escribe audio ni texto a disco ni al log; un error nunca lleva texto, stack ni ruta.
 */
import { timingSafeEqual } from 'node:crypto'
import { modelos, transcripcionOpenAI, vozOpenAI } from './openai.mjs'

export class DemasiadoGrande extends Error {}

export const json = (res, codigo, cuerpo, cabeceras = {}) => {
  res.writeHead(codigo, { 'content-type': 'application/json; charset=utf-8', ...cabeceras })
  res.end(JSON.stringify(cuerpo))
}

export function leeCuerpo(req, maximo) {
  const declarado = Number(req.headers['content-length'] ?? 0)
  if (Number.isFinite(declarado) && declarado > maximo) return Promise.reject(new DemasiadoGrande('demasiado grande'))
  return new Promise((resuelve, rechaza) => {
    const trozos = []
    let largo = 0
    req.on('data', (d) => {
      largo += d.length
      if (largo > maximo) { rechaza(new DemasiadoGrande('demasiado grande')); req.destroy(); return }
      trozos.push(d)
    })
    req.on('end', () => resuelve(Buffer.concat(trozos)))
    req.on('error', () => rechaza(new Error('cuerpo ilegible')))
  })
}

/** Una sola decodificación a la vez por defecto (`enVuelo`): el motor ya usa todos los hilos. */
function creaCola(enVuelo) {
  let activos = 0
  const esperando = []
  return {
    turno: () => new Promise((r) => (activos < enVuelo ? (activos++, r()) : esperando.push(r))),
    libera: () => { activos--; const s = esperando.shift(); if (s) { activos++; s() } },
  }
}

/**
 * `configuracion`: { token, motor, respaldo, voces: Map, nube: { stt: [], tts: Map }, bytesMaximos, enVuelo,
 * caracteresMaximos, idioma }. `audio`: { pcm16aFloat, leeWav, preparaParaModelo, floatAPcm16, codificaWav }.
 */
export function creaManejador(configuracion, audio) {
  const cola = creaCola(configuracion.enVuelo ?? 1)
  const autorizado = (req) => {
    const cabecera = String(req.headers.authorization ?? '')
    if (!cabecera.startsWith('Bearer ')) return false
    const dado = Buffer.from(cabecera.slice(7))
    const bueno = Buffer.from(configuracion.token)
    return dado.length === bueno.length && timingSafeEqual(dado, bueno)
  }
  const ctx = { configuracion, audio, cola, json, leeCuerpo }

  async function transcribir(req, res) {
    const bytes = await leeCuerpo(req, configuracion.bytesMaximos)
    if (bytes.length < 320) return json(res, 400, { error: 'el cuerpo esta vacio o es demasiado corto: se esperaba PCM16LE mono o un WAV' })
    const idioma = String(req.headers['x-idioma'] ?? 'es').slice(0, 8)
    // `x-motor: respaldo`: el segundo motor (idioma forzado), para cuando el principal oyo otro idioma en audio corto.
    const eleccionMotor = String(req.headers['x-motor'] ?? 'principal')
    if (eleccionMotor !== 'principal' && eleccionMotor !== 'respaldo') return json(res, 400, { error: 'x-motor debe ser principal o respaldo' })
    if (eleccionMotor === 'respaldo' && !configuracion.respaldo) return json(res, 409, { error: 'este servicio no tiene motor de respaldo' })
    const motor = eleccionMotor === 'respaldo' ? configuracion.respaldo : configuracion.motor
    const pista = req.headers['x-pista-base64'] ? Buffer.from(String(req.headers['x-pista-base64']), 'base64').toString('utf8').slice(0, 2000) : undefined
    let muestras
    let hz = Number(req.headers['x-frecuencia-hz'] ?? 16000)
    if (bytes.subarray(0, 4).toString('ascii') === 'RIFF') {
      const leido = audio.leeWav(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
      muestras = audio.preparaParaModelo(leido, 16000)
      hz = 16000
    } else {
      if (!Number.isFinite(hz) || hz < 8000 || hz > 48000) return json(res, 400, { error: 'x-frecuencia-hz invalida' })
      muestras = audio.pcm16aFloat(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length - (bytes.length % 2)))
    }
    await cola.turno()
    try {
      const t0 = performance.now()
      const r = await motor.transcribe(muestras, hz, { idioma, pista })
      return json(res, 200, { texto: r.texto, ...(r.confianza !== undefined ? { confianza: r.confianza } : {}), ...(r.idioma ? { idioma: r.idioma } : {}), ms: Math.round(performance.now() - t0), motor: motor.id, ...(eleccionMotor === 'respaldo' ? { respaldo: true } : {}) })
    } finally {
      cola.libera()
    }
  }

  /**
   * Texto → PCM16LE mono en flujo. La cabecera sale antes de sintetizar nada; cada frase se escribe al momento.
   * Si el cliente cierra (interrupción), el callback devuelve `false` y sherpa para.
   */
  async function sintetizar(req, res) {
    if (configuracion.voces.size === 0) return json(res, 503, { error: 'este servicio no tiene ninguna voz cargada' })
    const bytes = await leeCuerpo(req, 64 * 1024)
    let cuerpo
    try { cuerpo = JSON.parse(bytes.toString('utf8')) } catch { return json(res, 400, { error: 'se esperaba JSON {texto, voz?, velocidad?}' }) }
    const texto = typeof cuerpo?.texto === 'string' ? cuerpo.texto.trim() : ''
    if (texto.length === 0 || texto.length > configuracion.caracteresMaximos) return json(res, 400, { error: `el texto esta vacio o pasa de ${configuracion.caracteresMaximos} caracteres` })
    const nombreVoz = typeof cuerpo.voz === 'string' && cuerpo.voz.length > 0 ? cuerpo.voz : [...configuracion.voces.keys()][0]
    const voz = configuracion.voces.get(nombreVoz)
    if (!voz) return json(res, 404, { error: 'esa voz no esta cargada en este servicio' })
    const velocidad = cuerpo.velocidad === undefined ? 1 : Number(cuerpo.velocidad)
    if (!(velocidad >= 0.5 && velocidad <= 2)) return json(res, 400, { error: 'velocidad fuera de 0,5 a 2' })
    let cortado = false
    res.on('close', () => { if (!res.writableFinished) cortado = true })
    await cola.turno()
    try {
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'x-frecuencia-hz': String(voz.frecuenciaHz), 'x-voz': nombreVoz, 'cache-control': 'no-store' })
      res.flushHeaders()
      const t0 = performance.now()
      let trozos = 0
      await voz.sintetiza(texto, (muestras) => {
        if (cortado) return false
        trozos++
        res.write(audio.floatAPcm16(muestras))
        return true
      }, { velocidad })
      if (!cortado) res.end()
      console.log(`dictado-servicio: sintetizar ${cortado ? 'cortado' : 'completo'} · ${trozos} frases · ${Math.round(performance.now() - t0)} ms`)
    } finally {
      cola.libera()
    }
  }

  return async (req, res) => {
    const ruta = new URL(req.url ?? '/', 'http://interno').pathname
    try {
      if (req.method === 'GET' && ruta === '/health') return json(res, 200, { status: 'ok' })
      if (!autorizado(req)) return ruta.startsWith('/v1/') ? json(res, 401, { error: { message: 'no autorizado', type: 'invalid_request_error', code: 'invalid_api_key' } }) : json(res, 401, { error: 'no autorizado' })
      if (req.method === 'POST' && ruta === '/transcribir') return await transcribir(req, res)
      if (req.method === 'GET' && ruta === '/voces') return json(res, 200, { voces: [...configuracion.voces.keys()], porDefecto: [...configuracion.voces.keys()][0] ?? null })
      if (req.method === 'POST' && ruta === '/sintetizar') return await sintetizar(req, res)
      if (req.method === 'POST' && ruta === '/v1/audio/transcriptions') return await transcripcionOpenAI(ctx, req, res)
      if (req.method === 'POST' && ruta === '/v1/audio/speech') return await vozOpenAI(ctx, req, res)
      if (req.method === 'GET' && ruta === '/v1/models') return await modelos(ctx, res, new URL(req.url ?? '/', 'http://interno').searchParams.get('probar') === '1')
      return json(res, 404, { error: 'ruta desconocida' })
    } catch (error) {
      if (error instanceof DemasiadoGrande) {
        res.writeHead(413, { 'content-type': 'application/json; charset=utf-8', connection: 'close' })
        return res.end(JSON.stringify({ error: 'el audio supera el tamano maximo' }))
      }
      console.error(`dictado-servicio: fallo en ${ruta} (${error instanceof Error ? error.constructor.name : 'error'})`)
      if (res.headersSent) return res.destroy()
      return json(res, 500, { error: ruta === '/sintetizar' || ruta === '/v1/audio/speech' ? 'fallo interno al sintetizar' : 'fallo interno al transcribir' })
    }
  }
}
