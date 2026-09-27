/**
 * `MotorFechas` que lanza un PROCESO LOCAL por lectura (Node): por defecto el script de RapidOCR
 * de esta herramienta (`motores/rapidocr-json.py`) con el Python del entorno que dejo
 * `motores/instala-rapidocr.sh`. La foto no sale de la maquina.
 *
 * Mismo protocolo y mismas reglas que el adaptador de proceso del extractor documental, del que
 * sale el patron (no el codigo: aquel devuelve paginas con campos, este lineas con su caja):
 * directorio temporal solo del usuario y borrado SIEMPRE, modelo pineado, salida validada, y un
 * error que nunca incluye stdout (lleva el texto de la foto): solo el codigo y la linea `motor:`.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tipoDeImagen } from '../fotos.js'
import { exigeModeloPineado, type LecturaDelMotor, type LineaLeida, type MotorFechas } from '../lectura-caducidad.js'

export const MODELO_RAPIDOCR = 'rapidocr-onnxruntime-1.4.4/ppocrv4'
/** El script que viaja con la herramienta (fuera de `dist/`, junto a su lista de versiones). */
export const SCRIPT_RAPIDOCR = resolve(dirname(fileURLToPath(import.meta.url)), '../../motores/rapidocr-json.py')

export interface OpcionesMotorProceso {
  /** El Python del entorno de RapidOCR (`ETIQUETAS_MOTOR_PYTHON`). */
  readonly comando: string
  readonly argumentos?: readonly string[]
  readonly modelo?: string
  readonly milisegundosDeEspera?: number
}

function ejecuta(comando: string, argumentos: readonly string[], espera: number): Promise<{ codigo: number | null; stdout: string; stderr: string; cortado: boolean }> {
  return new Promise((ok) => {
    const p = spawn(comando, argumentos, { stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '' } })
    let stdout = ''
    let stderr = ''
    let cortado = false
    const reloj = setTimeout(() => { cortado = true; p.kill('SIGKILL') }, espera)
    p.stdout.on('data', (d: Buffer) => { stdout += d.toString('utf8') })
    p.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8') })
    p.on('error', () => { clearTimeout(reloj); ok({ codigo: -1, stdout: '', stderr: 'motor: no se pudo lanzar el proceso', cortado }) })
    p.on('close', (codigo) => { clearTimeout(reloj); ok({ codigo, stdout, stderr, cortado }) })
  })
}

/** Valida la salida del proceso: lineas con texto, confianza en [0,1] y caja de cuatro enteros. */
export function validaSalida(stdout: string): LineaLeida[] {
  let j: { lineas?: unknown }
  // El mensaje de JSON.parse cita la entrada, y la entrada es el texto de la foto: no se propaga.
  try { j = JSON.parse(stdout) as { lineas?: unknown } } catch { throw new Error('motor: la salida no es JSON') }
  if (!Array.isArray(j.lineas)) throw new Error('motor: la salida no trae lineas')
  return j.lineas.slice(0, 200).map((l: unknown) => {
    const o = l as { texto?: unknown; confianza?: unknown; caja?: unknown }
    if (typeof o.texto !== 'string' || o.texto.length > 500) throw new Error('motor: una linea no trae texto')
    const caja = Array.isArray(o.caja) && o.caja.length === 4 && o.caja.every((n) => Number.isFinite(n)) ? (o.caja as [number, number, number, number]) : undefined
    const confianza = typeof o.confianza === 'number' && o.confianza >= 0 && o.confianza <= 1 ? o.confianza : undefined
    return { texto: o.texto, ...(confianza !== undefined ? { confianza } : {}), ...(caja ? { caja } : {}) }
  })
}

export function motorPorProceso(op: OpcionesMotorProceso): MotorFechas {
  const modelo = exigeModeloPineado(op.modelo ?? MODELO_RAPIDOCR)
  const argumentos = op.argumentos ?? [SCRIPT_RAPIDOCR]
  return {
    modelo,
    async lee(imagen, opciones) {
      const tipo = tipoDeImagen(imagen)
      if (!tipo) throw new Error('motor: no es una imagen')
      const dir = await mkdtemp(join(tmpdir(), 'etiquetas-motor-'))
      const t0 = Date.now()
      try {
        const ruta = join(dir, `recorte.${tipo === 'jpeg' ? 'jpg' : tipo}`)
        await writeFile(ruta, imagen, { mode: 0o600 })
        const r = await ejecuta(op.comando, [...argumentos, ...(opciones?.variante === 'puntos' ? ['--puntos'] : []), ruta], op.milisegundosDeEspera ?? 30_000)
        if (r.cortado) throw new Error('motor: tardó demasiado y se detuvo')
        if (r.codigo !== 0) throw new Error(r.stderr.split('\n').find((x) => x.startsWith('motor:')) ?? `motor: salió con código ${r.codigo}`)
        const lectura: LecturaDelMotor = { motor: `${modelo}${opciones?.variante === 'puntos' ? '+puntos' : ''}`, ms: Date.now() - t0, lineas: validaSalida(r.stdout) }
        return lectura
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    },
  }
}
