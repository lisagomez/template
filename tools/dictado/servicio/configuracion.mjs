/**
 * Configuracion del servicio de transcripcion, desde el entorno. Reglas que honra:
 *
 *  - **Autenticacion obligatoria (C3)**: sin `DICTADO_TOKEN` (≥ 32 caracteres) el servicio NO
 *    arranca. No hay bandera que lo salte: un servicio de audio sin token es un microfono abierto.
 *  - **El motor va PINEADO (C1)**: `DICTADO_MOTOR` nombra una carpeta o un modelo concretos; el
 *    identificador que se devuelve lleva version y cuantizacion.
 *  - **Flujo de datos (C4)**: el audio se procesa en memoria y no se escribe. Los logs no llevan texto.
 *  - **Ningun secreto se imprime**: `describe()` enmascara el token.
 */
import { existsSync, readFileSync } from 'node:fs'
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

  const tls = env('DICTADO_TLS_CERT', null) && env('DICTADO_TLS_CLAVE', null)
    ? { cert: readFileSync(env('DICTADO_TLS_CERT')), key: readFileSync(env('DICTADO_TLS_CLAVE')) }
    : null

  return {
    token,
    motor,
    tls,
    puerto: Number(env('DICTADO_PUERTO', '8090')),
    escucha: env('DICTADO_ESCUCHA', '0.0.0.0'),
    bytesMaximos: Number(env('DICTADO_BYTES_MAXIMOS', String(10 * 1024 * 1024))), // ~5 min de PCM16 a 16 kHz
    enVuelo: Number(env('DICTADO_EN_VUELO', '1')),
    describe() {
      return { motor: motor.id, dispositivo, hilos, tls: tls !== null ? 'propio' : 'no (termina en el proxy)', token: `presente (largo ${token.length})`, bytesMaximos: this.bytesMaximos, enVuelo: this.enVuelo }
    },
  }
}
