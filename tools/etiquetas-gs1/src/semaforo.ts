/**
 * Semaforo de vida restante, con umbrales POR CATEGORIA: un yogurt no es una lata.
 *
 * Cuatro estados, tomados de como lo resuelven los WMS serios (SAP EWM, Odoo, Manhattan):
 * - `vigente`: se surte con normalidad.
 * - `alerta`: entra en la ventana de aviso ("alert date" de Odoo): se prioriza en el FEFO.
 * - `retiro`: dentro de los dias de retiro ("removal date"): ya no debe salir a venta.
 * - `vencido`: paso la fecha. El FEFO lo EXCLUYE (la leccion de EWM: FEFO a secas sigue
 *   eligiendo lotes vencidos si nadie los filtra).
 *
 * Los umbrales por defecto son EJEMPLOS para arrancar, no una regla: cada cadena los fija con
 * su area de calidad y los cambia en la pantalla de ajustes.
 */
import { diasHasta, esFecha, parseaFechaGs1, type FechaGs1 } from './fechas.js'

export type EstadoSemaforo = 'vigente' | 'alerta' | 'retiro' | 'vencido'

export interface Categoria {
  readonly id: string
  readonly nombre: string
  /** Con esta vida restante o menos, el lote pasa a `alerta`. */
  readonly alertaDias: number
  /** Con esta vida restante o menos, se retira de venta. */
  readonly retiroDias: number
  /** Vida minima para aceptar el lote al recibirlo (0 = sin minimo). */
  readonly minimoRecepcionDias: number
}

/** EJEMPLO. Se marcan asi en pantalla: `ejemplo: true` hasta que alguien los edite. */
export const CATEGORIAS_EJEMPLO: readonly Categoria[] = [
  { id: 'lacteos', nombre: 'Lácteos y refrigerados', alertaDias: 10, retiroDias: 3, minimoRecepcionDias: 15 },
  { id: 'panaderia', nombre: 'Panadería', alertaDias: 3, retiroDias: 1, minimoRecepcionDias: 4 },
  { id: 'congelados', nombre: 'Congelados', alertaDias: 30, retiroDias: 7, minimoRecepcionDias: 60 },
  { id: 'bebidas', nombre: 'Bebidas', alertaDias: 45, retiroDias: 10, minimoRecepcionDias: 60 },
  { id: 'abarrotes', nombre: 'Abarrotes secos y latas', alertaDias: 90, retiroDias: 30, minimoRecepcionDias: 120 },
  { id: 'general', nombre: 'General', alertaDias: 30, retiroDias: 7, minimoRecepcionDias: 0 },
]

export function estadoSemaforo(diasRestantes: number, categoria: Categoria): EstadoSemaforo {
  if (diasRestantes < 0) return 'vencido'
  if (diasRestantes <= categoria.retiroDias) return 'retiro'
  if (diasRestantes <= categoria.alertaDias) return 'alerta'
  return 'vigente'
}

export const TEXTO_SEMAFORO: Readonly<Record<EstadoSemaforo, { etiqueta: string; color: string; accion: string }>> = {
  vigente: { etiqueta: 'Vigente', color: 'verde', accion: 'Se surte con normalidad.' },
  alerta: { etiqueta: 'Por vencer', color: 'amarillo', accion: 'Surtir primero (FEFO) y vigilar.' },
  retiro: { etiqueta: 'Retirar de venta', color: 'rojo', accion: 'Ya no debe salir a venta: retirar, rebajar o mermar según la política.' },
  vencido: { etiqueta: 'Vencido', color: 'negro', accion: 'No se surte. Separar y dar de baja.' },
}

export interface VidaRestante {
  readonly fecha: FechaGs1
  readonly dias: number
  readonly estado: EstadoSemaforo
  readonly categoria: Categoria
  /** Cumple la vida minima para recibirlo. */
  readonly aceptableEnRecepcion: boolean
}

export function vidaRestante(valor17: string, hoyIso: string, categoria: Categoria): VidaRestante | undefined {
  const anio = Number(hoyIso.slice(0, 4))
  const fecha = parseaFechaGs1(valor17, anio)
  if (!esFecha(fecha)) return undefined
  const dias = diasHasta(fecha, hoyIso)
  return { fecha, dias, estado: estadoSemaforo(dias, categoria), categoria, aceptableEnRecepcion: dias >= categoria.minimoRecepcionDias }
}

export function categoriaPorId(categorias: readonly Categoria[], id: string | undefined): Categoria {
  return categorias.find((c) => c.id === id) ?? categorias.find((c) => c.id === 'general') ?? CATEGORIAS_EJEMPLO[CATEGORIAS_EJEMPLO.length - 1]!
}

/** «Caduca en 12 días», «caduca hoy», «caducó hace 3 días». */
export function textoDias(dias: number): string {
  if (dias === 0) return 'caduca hoy'
  if (dias === 1) return 'caduca mañana'
  if (dias > 0) return `le quedan ${dias} días`
  return dias === -1 ? 'caducó ayer' : `caducó hace ${-dias} días`
}
