/**
 * Cola del agente: un trabajo a la vez por impresora, reintentos con espera exponencial y
 * estado consultable. Persiste en un archivo (escritura atomica) para que un reinicio del
 * agente no pierda etiquetas ya aceptadas.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ConfigAgente, ImpresoraAgente } from './config.js'
import { consultaEstadoHost, enviaTcp, problemaDeEstado } from './tcp.js'

export type EstadoTrabajo = 'en-cola' | 'enviando' | 'reintentando' | 'impreso' | 'fallido'

export interface Trabajo {
  readonly id: string
  readonly impresora: string
  readonly zpl: string
  readonly copias: number
  readonly creado: string
  readonly huellaToken: string
  readonly operador: string
  estado: EstadoTrabajo
  intentos: number
  proximoIntento: number
  ultimoError?: string
  terminado?: string
}

export interface Transporte {
  envia(imp: ImpresoraAgente, datos: Buffer, timeoutMs: number): Promise<void>
  estado(imp: ImpresoraAgente, timeoutMs: number): Promise<string | undefined>
}

export const transporteTcp: Transporte = {
  envia: (imp, datos, t) => enviaTcp(imp.host, imp.puerto, datos, t),
  estado: async (imp, t) => problemaDeEstado(await consultaEstadoHost(imp.host, imp.puerto, t)),
}

export interface Cola {
  agrega(t: { impresora: string; zpl: string; copias: number; huellaToken: string; operador: string }): Promise<Trabajo>
  busca(id: string): Trabajo | undefined
  pendientes(): number
  fallidos(): number
  /** Procesa lo que toque ahora (lo llama el temporizador; las pruebas lo llaman a mano). */
  procesa(): Promise<void>
  arranca(intervaloMs?: number): void
  detiene(): Promise<void>
}

export async function creaCola(config: ConfigAgente, transporte: Transporte = transporteTcp, registra: (m: string) => void = () => {}): Promise<Cola> {
  const trabajos = new Map<string, Trabajo>()
  if (config.archivoCola) {
    try {
      for (const t of JSON.parse(await readFile(config.archivoCola, 'utf8')) as Trabajo[]) {
        // Lo que estaba enviandose al caer el agente vuelve a la cola: mejor duplicar una
        // etiqueta que perderla, y el log lo dice.
        if (t.estado === 'enviando') { t.estado = 'reintentando'; t.ultimoError = 'el agente se reinició a mitad del envío' }
        trabajos.set(t.id, t)
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
  }
  let guardando: Promise<void> = Promise.resolve()
  const guarda = (): Promise<void> => {
    const ruta = config.archivoCola
    if (!ruta) return Promise.resolve()
    guardando = guardando.then(async () => {
      await mkdir(dirname(ruta), { recursive: true })
      const tmp = join(dirname(ruta), `.cola-${randomUUID()}.tmp`)
      // Los impresos de hace mas de un dia se podan: la cola no es un archivo historico.
      const limite = Date.now() - 86_400_000
      const vivos = [...trabajos.values()].filter((t) => !(t.estado === 'impreso' && Date.parse(t.terminado ?? '') < limite))
      await writeFile(tmp, JSON.stringify(vivos), { mode: 0o600 })
      await rename(tmp, ruta)
    })
    return guardando
  }
  const ocupadas = new Set<string>()
  let temporizador: NodeJS.Timeout | undefined
  let enCurso: Promise<void> = Promise.resolve()

  const espera = (intentos: number) => Math.min(config.reintentos.topeMs, config.reintentos.baseMs * 2 ** Math.max(0, intentos - 1))

  async function intenta(t: Trabajo, imp: ImpresoraAgente): Promise<void> {
    t.estado = 'enviando'
    t.intentos++
    try {
      if (config.consultaEstado) {
        const problema = await transporte.estado(imp, config.timeoutMs)
        if (problema) throw new Error(`impresora ${problema}`)
      }
      await transporte.envia(imp, Buffer.from(t.zpl, 'utf8'), config.timeoutMs)
      t.estado = 'impreso'
      t.terminado = new Date().toISOString()
      delete t.ultimoError
      registra(`trabajo ${t.id} impreso en ${imp.id} (intento ${t.intentos})`)
    } catch (e) {
      t.ultimoError = e instanceof Error ? e.message : String(e)
      if (t.intentos > config.reintentos.maximo) {
        t.estado = 'fallido'
        t.terminado = new Date().toISOString()
        registra(`trabajo ${t.id} FALLIDO en ${imp.id} tras ${t.intentos} intentos: ${t.ultimoError}`)
      } else {
        t.estado = 'reintentando'
        t.proximoIntento = Date.now() + espera(t.intentos)
        registra(`trabajo ${t.id} en ${imp.id}: ${t.ultimoError}; reintento ${t.intentos} en ${espera(t.intentos)} ms`)
      }
    }
    await guarda()
  }

  const procesa = async (): Promise<void> => {
    const ahora = Date.now()
    const tareas: Promise<void>[] = []
    for (const imp of config.impresoras) {
      if (ocupadas.has(imp.id)) continue
      const siguiente = [...trabajos.values()]
        .filter((t) => t.impresora === imp.id && (t.estado === 'en-cola' || t.estado === 'reintentando') && t.proximoIntento <= ahora)
        .sort((a, b) => a.creado.localeCompare(b.creado))[0]
      if (!siguiente) continue
      ocupadas.add(imp.id)
      tareas.push(intenta(siguiente, imp).finally(() => ocupadas.delete(imp.id)))
    }
    enCurso = Promise.all(tareas).then(() => undefined)
    await enCurso
  }

  return {
    async agrega(d) {
      const t: Trabajo = { id: randomUUID(), impresora: d.impresora, zpl: d.zpl, copias: d.copias, creado: new Date().toISOString(), huellaToken: d.huellaToken, operador: d.operador, estado: 'en-cola', intentos: 0, proximoIntento: 0 }
      trabajos.set(t.id, t)
      await guarda()
      return t
    },
    busca: (id) => trabajos.get(id),
    pendientes: () => [...trabajos.values()].filter((t) => t.estado === 'en-cola' || t.estado === 'reintentando' || t.estado === 'enviando').length,
    fallidos: () => [...trabajos.values()].filter((t) => t.estado === 'fallido').length,
    procesa,
    arranca(intervaloMs = 250) {
      temporizador ??= setInterval(() => { void procesa() }, intervaloMs)
    },
    async detiene() {
      if (temporizador) clearInterval(temporizador)
      temporizador = undefined
      await enCurso
      await guardando
    },
  }
}
