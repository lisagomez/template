/**
 * Cola local de lecturas para trabajar sin conexion. Nucleo puro sobre un puerto de almacenamiento:
 * aqui no hay IndexedDB, que vive en el entry point de navegador.
 *
 * Existe porque el trabajo de campo —almacen, reparto— ocurre sin cobertura, y una lectura que no
 * se puede enviar no puede perderse. Dos decisiones sostienen el modulo:
 *
 *   1. **El instante se sella al ESCANEAR, no al sincronizar.** Sellarlo al llegar al servidor
 *      desplaza toda la trazabilidad, y ademas hace colapsar la identidad de los eventos: varios
 *      encolados y sincronizados a la vez compartirian instante y se deduplicarian entre si.
 *   2. **Se guardan los dos instantes.** El del dispositivo manda para el ORDEN de los hechos; el
 *      del servidor es auditoria de cuando llego. Un desfase grande entre ambos no es un error a
 *      corregir: es una senal de que el reloj del dispositivo esta mal, y se revisa.
 */
import type { LecturaDeCodigo } from './identidad.js'

export type EstadoEnCola = 'pendiente' | 'sincronizada' | 'fallida'

export interface EntradaEnCola {
  id: string
  lectura: LecturaDeCodigo
  estado: EstadoEnCola
  intentos: number
  /** Lo pone el servidor al aceptar la entrada. `null` mientras no haya llegado. */
  instanteServidor: string | null
  ultimoError?: string
}

/** Puerto de persistencia local. El adaptador de IndexedDB lo implementa fuera del nucleo. */
export interface AlmacenLocal {
  guarda(entrada: EntradaEnCola): Promise<void>
  lee(id: string): Promise<EntradaEnCola | null>
  listaPendientes(): Promise<readonly EntradaEnCola[]>
  cuenta(): Promise<number>
}

/** Una entrada nueva nace pendiente y con el instante que ya traia la lectura. */
export function encola(id: string, lectura: LecturaDeCodigo): EntradaEnCola {
  if (!lectura.instanteDispositivo) {
    throw new Error('Una lectura sin instante de dispositivo no se puede encolar: el orden de los hechos se perderia')
  }
  return { id, lectura, estado: 'pendiente', intentos: 0, instanteServidor: null }
}

/**
 * Marca sincronizada. **No toca `instanteDispositivo`**: es la garantia de que la hora del hecho
 * sobrevive al viaje.
 */
export function marcaSincronizada(entrada: EntradaEnCola, instanteServidor: string): EntradaEnCola {
  return { ...entrada, estado: 'sincronizada', instanteServidor }
}

export function marcaFallida(entrada: EntradaEnCola, error: string): EntradaEnCola {
  return { ...entrada, estado: 'fallida', intentos: entrada.intentos + 1, ultimoError: error }
}

/** Retroceso exponencial acotado. Sin tope, una cola grande se reintenta sola para siempre. */
export function esperaAntesDeReintentar(intentos: number, baseMs = 1000, topeMs = 300_000): number {
  if (intentos < 0) throw new RangeError('intentos no puede ser negativo')
  return Math.min(baseMs * 2 ** intentos, topeMs)
}

/** Desfase entre el reloj del dispositivo y el del servidor, en milisegundos. */
export function desfaseDeReloj(entrada: EntradaEnCola): number | null {
  if (entrada.instanteServidor === null) return null
  return Date.parse(entrada.instanteServidor) - Date.parse(entrada.lectura.instanteDispositivo)
}

export interface AvisoDeCola {
  /** Cuantas lecturas siguen sin llegar al servidor. */
  pendientes: number
  /**
   * `true` cuando hay cola pendiente y la app NO esta instalada.
   *
   * iOS purga el almacenamiento a los 7 dias de no usarse, y **las apps anadidas a la pantalla de
   * inicio estan exentas**. Es decir: sin instalar, una cola sin sincronizar puede borrarse sola y
   * los eventos se pierden sin ningun error. El usuario no puede saberlo — hay que decirselo.
   */
  riesgoDePurga: boolean
  mensaje: string
}

/**
 * Estado de la cola de cara al usuario. Funcion pura: `instalada` lo averigua la capa de UI
 * (display-mode: standalone) y lo pasa aqui.
 */
export function avisoDeCola(pendientes: number, instalada: boolean): AvisoDeCola {
  const riesgoDePurga = pendientes > 0 && !instalada
  const mensaje = riesgoDePurga
    ? `${pendientes} lectura(s) sin enviar. Instala la aplicacion en la pantalla de inicio: sin instalar, el navegador puede borrarlas y se perderian.`
    : pendientes > 0
      ? `${pendientes} lectura(s) sin enviar. Se enviaran solas al recuperar la conexion.`
      : 'Todo enviado.'
  return { pendientes, riesgoDePurga, mensaje }
}
