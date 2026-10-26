/**
 * Configuracion del servicio de transcripcion, desde el entorno. Reglas que honra:
 *
 *  - **Autenticacion obligatoria (C3)**: sin `DICTADO_TOKEN` (≥ 32 caracteres) el servicio NO
 *    arranca. No hay bandera que lo salte: un servicio de audio sin token es un microfono abierto.
 *  - **El motor va PINEADO (C1)**: `DICTADO_MOTOR` nombra una carpeta o un modelo concretos; el
 *    identificador que se devuelve lleva version y cuantizacion.
 *  - **Flujo de datos (C4)**: el audio se procesa en memoria y no se escribe. Los logs no llevan texto.
 *  - **Ningun secreto se imprime**: `describe()` enmascara el token.
 *  - **Respaldo por idioma, opcional**: `DICTADO_RESPALDO=faster-whisper:small` carga un segundo
 *    motor (por proceso, con `DICTADO_PYTHON`) que el cliente pide con `x-motor: respaldo` cuando
 *    el principal oyo ingles en una confirmacion corta («sí» → «Sir», medido el 2026-09-20).
 *  - **Las voces ya descargadas, nunca bajadas**: `DICTADO_VOCES` (lista separada por comas, p. ej.
 *    `es_MX-claude-high,es_ES-davefx-medium`) o, sin ella, toda carpeta `vits-piper-*` de
 *    `DICTADO_MODELOS`. Si no hay ninguna, el servicio arranca sin `/sintetizar` y lo dice.
 *  - **La nube, APAGADA por defecto (C4)**: `DICTADO_NUBE` (p. ej. `groq,elevenlabs`) enciende adaptadores de
 *    `src/nube.ts`, cada uno con su llave del entorno (`GROQ_API_KEY`, `LEMONFOX_API_KEY`, `ELEVENLABS_API_KEY` y
 *    `ELEVENLABS_VOZ`). Sin la variable no se lee ninguna llave ni sale nada. Encender uno es decisión de flujo de
 *    datos con su C4 (el audio o el texto sale a un tercero), y nunca en un producto con datos sensibles de terceros.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '..')
const DIST = join(RAIZ, 'dist')

const env = (nombre, porDefecto) => (process.env[nombre] === undefined || process.env[nombre] === '' ? porDefecto : process.env[nombre])

async function importaDesde(raiz, nombre) {
  const ruta = createRequire(pathToFileURL(join(raiz, 'x.js'))).resolve(nombre)
  const m = await import(pathToFileURL(ruta).href)
  return m.default ?? m
}

export async function configura() {
  const token = env('DICTADO_TOKEN', null)
  if (token === null || token.length < 32) throw new Error('DICTADO_TOKEN es obligatorio y debe tener al menos 32 caracteres: el servicio no arranca sin autenticacion (C3)')

  const modelos = env('DICTADO_MODELOS', '/modelos')
  const eleccion = env('DICTADO_MOTOR', 'parakeet')
  const hilos = Number(env('DICTADO_HILOS', '4'))
  const dispositivo = env('DICTADO_DISPOSITIVO', 'cpu')
  const runtime = env('DICTADO_RUNTIME', RAIZ)
  const nodo = await import(pathToFileURL(join(DIST, 'node', 'index.js')).href)

  let motor
  if (eleccion.startsWith('faster-whisper')) {
    const modelo = eleccion.split(':')[1] ?? 'small'
    motor = nodo.creaMotorPorProceso({
      id: `faster-whisper-${modelo}-${dispositivo === 'cpu' ? 'int8' : 'float16'}-${dispositivo}`,
      comando: env('DICTADO_PYTHON', 'python3'),
      argumentos: [join(RAIZ, 'motores-locales', 'motor-faster-whisper.py'), '--modelo', modelo, '--dispositivo', dispositivo, '--hilos', String(hilos), '--raiz-modelos', join(modelos, 'faster-whisper')],
      admitePista: true,
    })
  } else {
    const carpetas = { parakeet: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8', 'whisper-turbo': 'sherpa-onnx-whisper-turbo', 'whisper-base': 'sherpa-onnx-whisper-base' }
    const carpeta = carpetas[eleccion] ?? eleccion
    if (!existsSync(join(modelos, carpeta))) throw new Error(`no existe el modelo ${carpeta} en ${modelos}`)
    const sherpa = await importaDesde(runtime, 'sherpa-onnx-node')
    motor = nodo.creaMotorSherpa({ sherpa, carpeta: join(modelos, carpeta), hilos, idioma: env('DICTADO_IDIOMA', 'es') })
  }

  const eleccionRespaldo = env('DICTADO_RESPALDO', null)
  let respaldo = null
  if (eleccionRespaldo && eleccionRespaldo.startsWith('faster-whisper')) {
    const modelo = eleccionRespaldo.split(':')[1] ?? 'small'
    respaldo = nodo.creaMotorPorProceso({
      id: `faster-whisper-${modelo}-int8-cpu`,
      comando: env('DICTADO_PYTHON', 'python3'),
      argumentos: [join(RAIZ, 'motores-locales', 'motor-faster-whisper.py'), '--modelo', modelo, '--dispositivo', 'cpu', '--hilos', String(hilos), '--raiz-modelos', join(modelos, 'faster-whisper')],
      admitePista: true,
    })
  } else if (eleccionRespaldo) {
    console.error(`dictado-servicio: respaldo ${eleccionRespaldo} no reconocido (solo faster-whisper:<modelo>); se omite`)
  }

  // Voces Piper residentes (734 ms de carga cada una, medido el 2026-09-20), en el orden pedido:
  // la primera es la de defecto. Solo carpetas que EXISTEN; una que falte se avisa y se salta.
  const pedidas = env('DICTADO_VOCES', null)
  const carpetasVoz = pedidas === null
    ? (existsSync(modelos) ? readdirSync(modelos).filter((n) => n.startsWith('vits-piper-')).sort((a, b) => (a.includes('es_MX-claude') ? -1 : b.includes('es_MX-claude') ? 1 : a.localeCompare(b))) : [])
    : pedidas.split(',').map((v) => v.trim()).filter(Boolean).map((v) => (v.startsWith('vits-piper-') ? v : `vits-piper-${v}`))
  const voces = new Map()
  for (const carpeta of carpetasVoz) {
    if (!existsSync(join(modelos, carpeta))) { console.error(`dictado-servicio: la voz ${carpeta} no esta en ${modelos}; se omite (nunca se descarga desde aqui)`); continue }
    const sherpa = await importaDesde(runtime, 'sherpa-onnx-node')
    const voz = nodo.creaVozSintetica({ sherpa, carpeta: join(modelos, carpeta), hilos: Math.min(hilos, 4) })
    voces.set(carpeta.replace('vits-piper-', ''), voz)
  }

  const { adaptadoresPedidos, describeNube } = await import(pathToFileURL(join(DIST, 'nube.js')).href)
  const pedidosNube = String(env('DICTADO_NUBE', '')).split(',').map((v) => v.trim()).filter(Boolean)
  const nube = adaptadoresPedidos(pedidosNube, process.env)
  for (const d of nube.desconocidos) console.error(`dictado-servicio: el adaptador de nube ${d} no existe; se omite`)

  const tls = env('DICTADO_TLS_CERT', null) && env('DICTADO_TLS_CLAVE', null)
    ? { cert: readFileSync(env('DICTADO_TLS_CERT')), key: readFileSync(env('DICTADO_TLS_CLAVE')) }
    : null

  return {
    token,
    motor,
    respaldo,
    voces,
    nube,
    idioma: env('DICTADO_IDIOMA', 'es'),
    tls,
    puerto: Number(env('DICTADO_PUERTO', '8090')),
    escucha: env('DICTADO_ESCUCHA', '0.0.0.0'),
    bytesMaximos: Number(env('DICTADO_BYTES_MAXIMOS', String(10 * 1024 * 1024))), // ~5 min de PCM16 a 16 kHz
    enVuelo: Number(env('DICTADO_EN_VUELO', '1')),
    caracteresMaximos: Number(env('DICTADO_CARACTERES_MAXIMOS', '2000')),
    describe() {
      return { motor: motor.id, respaldo: respaldo?.id ?? 'ninguno', dispositivo, hilos, voces: [...voces.keys()], nube: pedidosNube.length ? describeNube([...nube.stt, ...nube.tts.values()]) : 'apagada', tls: tls !== null ? 'propio' : 'no (termina en el proxy)', token: `presente (largo ${token.length})`, bytesMaximos: this.bytesMaximos, enVuelo: this.enVuelo, caracteresMaximos: this.caracteresMaximos }
    },
  }
}
