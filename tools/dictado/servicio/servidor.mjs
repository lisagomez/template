/**
 * Servicio HTTP de transcripcion de `@tu-scope/dictado`: el perfil «GPU en el VPS propio».
 *
 * Desde el 25/10 las rutas viven en `rutas.mjs` (y el enchufe compatible con OpenAI en `openai.mjs`: `/v1/audio/
 * transcriptions`, `/v1/audio/speech` y `/v1/models`); este archivo solo configura, calienta y escucha.
 *
 * CUATRO RUTAS PROPIAS. `GET /health` devuelve exactamente {"status":"ok"} y nada del interior. `POST
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
import { createServer as http } from 'node:http'
import { createServer as https } from 'node:https'
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configura } from './configuracion.mjs'
import { creaManejador } from './rutas.mjs'

const configuracion = await configura()
const { pcm16aFloat, leeWav, preparaParaModelo, codificaWav } = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '@tu-scope', 'voz', 'dist', 'node', 'index.js')).href)
const { floatAPcm16 } = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'node', 'index.js')).href)
console.log(`dictado-servicio: ${JSON.stringify(configuracion.describe())}`)

const manejador = creaManejador(configuracion, { pcm16aFloat, leeWav, preparaParaModelo, floatAPcm16, codificaWav })

await configuracion.motor.calienta?.()
await configuracion.respaldo?.calienta?.()
const servidor = configuracion.tls ? https(configuracion.tls, manejador) : http(manejador)
servidor.listen(configuracion.puerto, configuracion.escucha, () => console.log(`dictado-servicio: escuchando en ${configuracion.tls ? 'https' : 'http'}://${configuracion.escucha}:${configuracion.puerto}`))
const apaga = async () => { servidor.close(); await configuracion.motor.cierra?.(); await configuracion.respaldo?.cierra?.(); process.exit(0) }
process.on('SIGTERM', () => void apaga())
process.on('SIGINT', () => void apaga())
