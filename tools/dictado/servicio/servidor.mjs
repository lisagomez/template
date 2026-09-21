/**
 * Servicio HTTP de transcripcion de `@tu-scope/dictado`: el perfil «GPU en el VPS propio».
 *
 * CUATRO RUTAS. `GET /health` devuelve exactamente {"status":"ok"} y nada del interior. `POST
 * /transcribir` recibe PCM16LE mono en crudo (o un WAV) con la frecuencia en cabecera y devuelve
 * el texto. Es la MISMA interfaz que un motor local: el cliente esta en `./remoto` y el dictado
 * no distingue uno de otro. `GET /voces` lista las voces cargadas y `POST /sintetizar` (JSON
 * `{texto, voz?, velocidad?}`) responde PCM16LE mono EN FLUJO: cada frase sale en cuanto
 * existe (`x-frecuencia-hz`, `x-voz` en cabecera), y si el cliente corta la conexion, la sintesis
 * que falta no se hace. Medido el 2026-09-20: primera frase a los ~110 ms.
 *
 * LO QUE EXIGE. `Authorization: Bearer <DICTADO_TOKEN>` en cada peticion, comparado en tiempo
 * constante; sin token no arranca (ver configuracion.mjs). TLS: propio si le dan certificado y
 * clave (`DICTADO_TLS_CERT/CLAVE`), o lo termina el proxy (Caddy) delante — nunca se publica
 * en claro a internet, y publicarlo siquiera es gate humano (C3).
 *
 * LO QUE NO HACE. No escribe el audio ni el texto a disco ni al log. Un error nunca lleva
 * texto, stack ni ruta: solo una razon en espanol. Sin dependencias: `node:http(s)` y `dist/`.
 */
import { timingSafeEqual } from 'node:crypto'
import { createServer as http } from 'node:http'
import { createServer as https } from 'node:https'
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configura } from './configuracion.mjs'

const configuracion = await configura()
const { pcm16aFloat, leeWav, preparaParaModelo } = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '@tu-scope', 'voz', 'dist', 'node', 'index.js')).href)
const { floatAPcm16 } = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'node', 'index.js')).href)
console.log(`dictado-servicio: ${JSON.stringify(configuracion.describe())}`)

const json = (res, codigo, cuerpo) => {
  res.writeHead(codigo, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(cuerpo))
}

function autorizado(req) {
  const cabecera = String(req.headers.authorization ?? '')
  if (!cabecera.startsWith('Bearer ')) return false
  const dado = Buffer.from(cabecera.slice(7))
  const bueno = Buffer.from(configuracion.token)
  return dado.length === bueno.length && timingSafeEqual(dado, bueno)
}

function leeCuerpo(req, maximo) {
  const declarado = Number(req.headers['content-length'] ?? 0)
  if (Number.isFinite(declarado) && declarado > maximo) return Promise.reject(new Error('demasiado grande'))
  return new Promise((resuelve, rechaza) => {
    const trozos = []
    let largo = 0
    req.on('data', (d) => {
      largo += d.length
      if (largo > maximo) { rechaza(new Error('demasiado grande')); req.destroy(); return }
      trozos.push(d)
    })
    req.on('end', () => resuelve(Buffer.concat(trozos)))
    req.on('error', () => rechaza(new Error('cuerpo ilegible')))
  })
}

/** Una sola decodificacion a la vez por defecto (`DICTADO_EN_VUELO`): el motor ya usa todos los hilos. */
let enVuelo = 0
const esperando = []
const turno = () => new Promise((r) => (enVuelo < configuracion.enVuelo ? (enVuelo++, r()) : esperando.push(r)))
const libera = () => { enVuelo--; const s = esperando.shift(); if (s) { enVuelo++; s() } }

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
    const audio = leeWav(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    muestras = preparaParaModelo(audio, 16000)
    hz = 16000
  } else {
    if (!Number.isFinite(hz) || hz < 8000 || hz > 48000) return json(res, 400, { error: 'x-frecuencia-hz invalida' })
    muestras = pcm16aFloat(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length - (bytes.length % 2)))
  }
  await turno()
  try {
    const t0 = performance.now()
    const r = await motor.transcribe(muestras, hz, { idioma, pista })
    return json(res, 200, { texto: r.texto, ...(r.confianza !== undefined ? { confianza: r.confianza } : {}), ...(r.idioma ? { idioma: r.idioma } : {}), ms: Math.round(performance.now() - t0), motor: motor.id, ...(eleccionMotor === 'respaldo' ? { respaldo: true } : {}) })
  } finally {
    libera()
  }
}

/**
 * Texto → PCM16LE mono en flujo. La cabecera sale antes de sintetizar nada; cada frase se escribe
 * al momento. Si el cliente cierra (interrupcion), el callback devuelve `false` y sherpa para.
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
  await turno()
  try {
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'x-frecuencia-hz': String(voz.frecuenciaHz), 'x-voz': nombreVoz, 'cache-control': 'no-store' })
    res.flushHeaders()
    const t0 = performance.now()
    let trozos = 0
    await voz.sintetiza(texto, (muestras) => {
      if (cortado) return false
      trozos++
      res.write(floatAPcm16(muestras))
      return true
    }, { velocidad })
    if (!cortado) res.end()
    console.log(`dictado-servicio: sintetizar ${cortado ? 'cortado' : 'completo'} · ${trozos} frases · ${Math.round(performance.now() - t0)} ms`)
  } finally {
    libera()
  }
}

const manejador = async (req, res) => {
  const ruta = new URL(req.url ?? '/', 'http://interno').pathname
  try {
    if (req.method === 'GET' && ruta === '/health') return json(res, 200, { status: 'ok' })
    if (!autorizado(req)) return json(res, 401, { error: 'no autorizado' })
    if (req.method === 'POST' && ruta === '/transcribir') return await transcribir(req, res)
    if (req.method === 'GET' && ruta === '/voces') return json(res, 200, { voces: [...configuracion.voces.keys()], porDefecto: [...configuracion.voces.keys()][0] ?? null })
    if (req.method === 'POST' && ruta === '/sintetizar') return await sintetizar(req, res)
    return json(res, 404, { error: 'ruta desconocida' })
  } catch (error) {
    if (error instanceof Error && error.message === 'demasiado grande') {
      res.writeHead(413, { 'content-type': 'application/json; charset=utf-8', connection: 'close' })
      return res.end(JSON.stringify({ error: 'el audio supera el tamano maximo' }))
    }
    console.error(`dictado-servicio: fallo en ${ruta} (${error instanceof Error ? error.constructor.name : 'error'})`)
    if (res.headersSent) return res.destroy()
    return json(res, 500, { error: ruta === '/sintetizar' ? 'fallo interno al sintetizar' : 'fallo interno al transcribir' })
  }
}

await configuracion.motor.calienta?.()
await configuracion.respaldo?.calienta?.()
const servidor = configuracion.tls ? https(configuracion.tls, manejador) : http(manejador)
servidor.listen(configuracion.puerto, configuracion.escucha, () => console.log(`dictado-servicio: escuchando en ${configuracion.tls ? 'https' : 'http'}://${configuracion.escucha}:${configuracion.puerto}`))
const apaga = async () => { servidor.close(); await configuracion.motor.cierra?.(); await configuracion.respaldo?.cierra?.(); process.exit(0) }
process.on('SIGTERM', () => void apaga())
process.on('SIGINT', () => void apaga())
