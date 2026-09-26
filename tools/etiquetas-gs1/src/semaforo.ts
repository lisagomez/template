/**
 * Semaforo de vida restante, con umbrales POR CATEGORIA: un yogurt no es una lata.
 *
 * Cinco estados, cada uno con su ACCION (un color sin accion es decoracion):
 * - `vigente` (verde): se surte con normalidad.
 * - `alerta` (amarillo): prioridad de surtido (FEFO) y transferencia sugerida a la sucursal que
 *   mas lo vende ("alert date" de Odoo).
 * - `promocion` (naranja): promocion y exhibicion especial identificada (cabecera o isla).
 * - `retiro` (rojo): separacion fisica y BLOQUEO para venta normal ("removal date"): solo
 *   liquidacion, donacion o merma, y eso lo decide una persona.
 * - `vencido`: paso la fecha. Merma. El FEFO lo EXCLUYE (la leccion de EWM: FEFO a secas sigue
 *   eligiendo lotes vencidos si nadie los filtra).
 *
 * Recepcion: regla de 2/3 (el lote debe llegar con al menos esa fraccion de su vida util: con 90
 * dias de vida, 60) cuando el catalogo trae la vida util; si no, el minimo absoluto de la
 * categoria. La fraccion es configurable: Japon usa 1/3 de entrega y su ministerio (MAFF) empuja
 * a relajarla; muchas cadenas piden entre 60 y 75 %.
 *
 * Los umbrales por defecto son EJEMPLOS para arrancar, no una regla: cada cadena los fija con
 * su area de calidad y los cambia en la pantalla de ajustes.
 */
import { diasHasta, esFecha, parseaFechaGs1, type FechaGs1 } from './fechas.js'

export type EstadoSemaforo = 'vigente' | 'alerta' | 'promocion' | 'retiro' | 'vencido'

/** Del peor al mejor: el orden en que se listan. */
export const ESTADOS_SEMAFORO: readonly EstadoSemaforo[] = ['vencido', 'retiro', 'promocion', 'alerta', 'vigente']

export interface Categoria {
  readonly id: string
  readonly nombre: string
  /** Con esta vida restante o menos, el lote pasa a `alerta` (amarillo). */
  readonly alertaDias: number
  /** Con esta vida restante o menos, promocion y exhibicion (naranja). Sin dato: a la mitad entre alerta y retiro. */
  readonly promocionDias?: number
  /** Con esta vida restante o menos, se separa y bloquea para venta normal (rojo). */
  readonly retiroDias: number
  /** Vida minima absoluta para aceptar el lote al recibirlo (0 = sin minimo). Vale cuando no se conoce la vida util. */
  readonly minimoRecepcionDias: number
  /** Fraccion de la vida util que debe quedarle al recibirlo (regla de 2/3). Sin dato: 2/3. */
  readonly fraccionRecepcion?: number
}

export const FRACCION_RECEPCION = 2 / 3

/** EJEMPLO. Se marcan asi en pantalla: `ejemplo: true` hasta que alguien los edite. */
export const CATEGORIAS_EJEMPLO: readonly Categoria[] = [
  { id: 'lacteos', nombre: 'Lácteos y refrigerados', alertaDias: 10, promocionDias: 6, retiroDias: 3, minimoRecepcionDias: 15 },
  { id: 'panaderia', nombre: 'Panadería', alertaDias: 3, promocionDias: 2, retiroDias: 1, minimoRecepcionDias: 4 },
  { id: 'congelados', nombre: 'Congelados', alertaDias: 30, promocionDias: 14, retiroDias: 7, minimoRecepcionDias: 60 },
  { id: 'bebidas', nombre: 'Bebidas', alertaDias: 45, promocionDias: 21, retiroDias: 10, minimoRecepcionDias: 60 },
  { id: 'abarrotes', nombre: 'Abarrotes secos y latas', alertaDias: 90, promocionDias: 45, retiroDias: 30, minimoRecepcionDias: 120 },
  { id: 'dulceria', nombre: 'Dulcería y botanas', alertaDias: 30, promocionDias: 14, retiroDias: 6, minimoRecepcionDias: 45 },
  { id: 'general', nombre: 'General', alertaDias: 30, promocionDias: 14, retiroDias: 6, minimoRecepcionDias: 0 },
]

export function promocionDe(c: Categoria): number {
  return c.promocionDias ?? Math.round((c.alertaDias + c.retiroDias) / 2)
}

export function estadoSemaforo(diasRestantes: number, categoria: Categoria): EstadoSemaforo {
  if (diasRestantes < 0) return 'vencido'
  if (diasRestantes <= categoria.retiroDias) return 'retiro'
  if (diasRestantes <= promocionDe(categoria)) return 'promocion'
  if (diasRestantes <= categoria.alertaDias) return 'alerta'
  return 'vigente'
}

/** Se puede vender en canal normal (ni rojo ni vencido). */
export const vendible = (e: EstadoSemaforo): boolean => e === 'vigente' || e === 'alerta' || e === 'promocion'

export const TEXTO_SEMAFORO: Readonly<Record<EstadoSemaforo, { etiqueta: string; color: string; accion: string }>> = {
  vigente: { etiqueta: 'Vigente', color: 'verde', accion: 'Se surte con normalidad.' },
  alerta: { etiqueta: 'Por vencer', color: 'amarillo', accion: 'Prioridad de surtido (FEFO) y transferencia sugerida a la sucursal que más lo vende.' },
  promocion: { etiqueta: 'Promoción', color: 'naranja', accion: 'Promoción y exhibición especial identificada (cabecera o isla) en piso de venta.' },
  retiro: { etiqueta: 'Bloqueado', color: 'rojo', accion: 'Separar y bloquear para venta normal: solo liquidación, donación o merma, y lo decide una persona.' },
  vencido: { etiqueta: 'Vencido', color: 'negro', accion: 'No se surte ni se vende: merma.' },
}

export interface MinimoRecepcion {
  readonly dias: number
  /** Como se obtuvo: con la vida util (regla de fraccion) o el minimo absoluto de la categoria. */
  readonly regla: 'fraccion' | 'absoluto'
  readonly texto: string
}

/** Vida minima al recibir: la regla de 2/3 si se conoce la vida util; si no, el minimo de la categoria. */
export function minimoRecepcion(categoria: Categoria, vidaUtilDias?: number): MinimoRecepcion {
  if (vidaUtilDias && vidaUtilDias > 0) {
    const f = categoria.fraccionRecepcion ?? FRACCION_RECEPCION
    const dias = Math.ceil(vidaUtilDias * f - 1e-9)
    const fr = Math.abs(f - 2 / 3) < 1e-9 ? '2/3' : Math.abs(f - 1 / 3) < 1e-9 ? '1/3' : `${Math.round(f * 100)} %`
    return { dias, regla: 'fraccion', texto: `regla de ${fr}: con ${vidaUtilDias} días de vida útil debe llegar con al menos ${dias}` }
  }
  return { dias: categoria.minimoRecepcionDias, regla: 'absoluto', texto: `«${categoria.nombre}» pide al menos ${categoria.minimoRecepcionDias} días (mínimo de la categoría; sin vida útil en el catálogo)` }
}

export interface VidaRestante {
  readonly fecha: FechaGs1
  readonly dias: number
  readonly estado: EstadoSemaforo
  readonly categoria: Categoria
  /** Cumple la vida minima para recibirlo. */
  readonly aceptableEnRecepcion: boolean
  readonly minimo: MinimoRecepcion
}

export function vidaRestante(valor17: string, hoyIso: string, categoria: Categoria, vidaUtilDias?: number): VidaRestante | undefined {
  const anio = Number(hoyIso.slice(0, 4))
  const fecha = parseaFechaGs1(valor17, anio)
  if (!esFecha(fecha)) return undefined
  const dias = diasHasta(fecha, hoyIso)
  const minimo = minimoRecepcion(categoria, vidaUtilDias)
  return { fecha, dias, estado: estadoSemaforo(dias, categoria), categoria, aceptableEnRecepcion: dias >= minimo.dias, minimo }
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
