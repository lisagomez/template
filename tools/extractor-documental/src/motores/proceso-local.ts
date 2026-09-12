/**
 * Adaptador de `MotorOcr` que lanza un PROCESO LOCAL: Tesseract, un script de RapidOCR, lo que sea
 * que lea una imagen y devuelva JSON por stdout.
 *
 * POR QUE EXISTE. El adaptador compatible con OpenAI cubre los modelos de vision, que en CPU
 * tardan 100-200 s por pagina (medido). Un OCR clasico tarda 1-3 s y no habla HTTP: es un binario.
 * Este adaptador lo enchufa al MISMO puerto, con la MISMA barrera de validacion
 * (`validaPaginas`), para que el resto de la herramienta no sepa cual de los dos esta detras.
 *
 * PROTOCOLO. Se crea un directorio temporal solo legible por el usuario, se escribe la imagen y
 * un `peticion.json` (`{imagen, tipoMime, esquemaDeAnotacion}`), se ejecuta
 * `comando [...argumentos, rutaDePeticion]`, y se lee de stdout
 * `{paginas:[{indice, markdown, confianza?, campos:[{clave, valor, confianza, region?}]}]}`.
 * El directorio se borra SIEMPRE al terminar: el documento no se queda en disco.
 *
 * TRES REGLAS DE LA CASA. (1) El modelo va PINEADO: `tesseract-5.5.0-spa-zonal-1` vale,
 * `tesseract:latest` no (C1). (2) La salida no se confia: pasa por `validaPaginas`. (3) Un error
 * NUNCA incluye stdout ni el grueso de stderr —llevan el documento—; solo el codigo de salida y la
 * primera linea de stderr si el proceso la marco con el prefijo `extractor:`, que es el contrato
 * para diagnosticos que no contienen datos.
 *
 * Es el primer archivo de `src/` que importa `node:`. Es un adaptador, y el contrato lo permite:
 * el nucleo sigue sin tocar nada de Node.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PaginaExtraida, LimitesDelMotor } from '../tipos.js'
import type { MotorOcr, OpcionesDeExtraccion } from '../puertos.js'
import { exigeModeloPineado, tipoMimeDe, validaPaginas } from './comun.js'

export interface ResultadoDelProceso {
  readonly codigo: number | null
  readonly stdout: string
  readonly stderr: string
  /** `true` si se mato por tiempo. */
  readonly cortado: boolean
}

export interface OpcionesDeEjecucion {
  readonly entorno: Readonly<Record<string, string>>
  readonly milisegundosDeEspera: number
}

/** Como se lanza el proceso. Inyectable para probar sin binario; por defecto `spawn`. */
export type Ejecutor = (comando: string, argumentos: readonly string[], opciones: OpcionesDeEjecucion) => Promise<ResultadoDelProceso>

export interface OpcionesDelMotorPorProceso {
  /** `python3`, `tesseract`, una ruta absoluta... */
  readonly comando: string
  /** Van antes de la ruta de la peticion: `['motores-locales/tesseract.py']`. */
  readonly argumentos?: readonly string[]
  /** Identificador PINEADO de lo que hay detras: version del binario, idioma, version del script. */
  readonly modelo: string
  /** Se anade al entorno del proceso (`LD_LIBRARY_PATH`, `TESSDATA_PREFIX`...). */
  readonly entorno?: Readonly<Record<string, string>>
  readonly milisegundosDeEspera?: number
  readonly limites?: Partial<LimitesDelMotor>
  /** Donde se crea el directorio temporal. Por defecto el del sistema. */
  readonly directorioTemporal?: string
  readonly ejecuta?: Ejecutor
}

const LIMITES_POR_DEFECTO: LimitesDelMotor = { bytesMaximos: 50 * 1024 * 1024, paginasMaximas: 1, paginasPorAnotacion: 1 }

const ejecutaConSpawn: Ejecutor = (comando, argumentos, { entorno, milisegundosDeEspera }) =>
  new Promise((resuelve, rechaza) => {
    const hijo = spawn(comando, argumentos, { env: { ...process.env, ...entorno }, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let cortado = false
    hijo.stdout.on('data', (d: Buffer) => { stdout += d.toString('utf8') })
    hijo.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8') })
    const temporizador = setTimeout(() => { cortado = true; hijo.kill('SIGKILL') }, milisegundosDeEspera)
    hijo.on('error', (error) => { clearTimeout(temporizador); rechaza(error) })
    hijo.on('close', (codigo) => { clearTimeout(temporizador); resuelve({ codigo, stdout, stderr, cortado }) })
  })

const EXTENSIONES: Readonly<Record<string, string>> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }

/** La unica parte de stderr que puede entrar en un error: la linea que el proceso marco como segura. */
function diagnosticoSeguro(stderr: string): string {
  const linea = stderr.split('\n').find((l) => l.startsWith('extractor:'))
  return linea === undefined ? '' : ` — ${linea.trim()}`
}

export function motorPorProceso(opciones: OpcionesDelMotorPorProceso): MotorOcr {
  const modelo = exigeModeloPineado(opciones.modelo)
  const limites: LimitesDelMotor = { ...LIMITES_POR_DEFECTO, ...opciones.limites }
  const espera = opciones.milisegundosDeEspera ?? 120_000
  const ejecuta = opciones.ejecuta ?? ejecutaConSpawn
  const argumentos = opciones.argumentos ?? []

  return {
    modelo,
    limites,
    async extrae(documento: Uint8Array, extra?: OpcionesDeExtraccion): Promise<PaginaExtraida[]> {
      if (documento.byteLength > limites.bytesMaximos) {
        throw new Error(`el documento pesa ${documento.byteLength} y el motor topa en ${limites.bytesMaximos}`)
      }
      const tipoMime = tipoMimeDe(documento)
      // `mkdtemp` crea el directorio con 0700: solo este usuario lo lee mientras existe.
      const directorio = await mkdtemp(join(opciones.directorioTemporal ?? tmpdir(), 'extractor-'))
      try {
        const rutaImagen = join(directorio, `pagina.${EXTENSIONES[tipoMime] ?? 'bin'}`)
        const rutaPeticion = join(directorio, 'peticion.json')
        await writeFile(rutaImagen, documento, { mode: 0o600 })
        await writeFile(rutaPeticion, JSON.stringify({ imagen: rutaImagen, tipoMime, esquemaDeAnotacion: extra?.esquemaDeAnotacion ?? null }), { mode: 0o600 })

        const resultado = await ejecuta(opciones.comando, [...argumentos, rutaPeticion], { entorno: opciones.entorno ?? {}, milisegundosDeEspera: espera })
        if (resultado.cortado) throw new Error(`el proceso local se corto a los ${espera} ms sin terminar`)
        if (resultado.codigo !== 0) throw new Error(`el proceso local salio con codigo ${resultado.codigo}${diagnosticoSeguro(resultado.stderr)}`)

        let cruda: unknown
        try {
          cruda = JSON.parse(resultado.stdout) as unknown
        } catch {
          // A proposito sin el stdout: puede llevar el documento entero.
          throw new Error('la salida del proceso local no es JSON valido')
        }
        // Un proceso local no declara uso de tokens: se dice, no se inventa.
        extra?.alConsumirTokens?.(null)
        return validaPaginas(cruda)
      } finally {
        await rm(directorio, { recursive: true, force: true })
      }
    },
  }
}
