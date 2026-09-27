/**
 * Medidas fisicas del codigo contra lo que pide GS1 (GenSpecs §5.12.3, tablas de
 * especificacion de simbolos) segun QUIEN lo lee.
 *
 * - `automatico`: escaner fijo o tunel en distribucion general. Tabla 2 (cajas) y Tabla 5
 *   (unidades logisticas): X de 0.495 mm (maximo 1.016 caja / 0.940 tarima) y barras de al
 *   menos 31.75 mm.
 * - `pistola`: lectura manual. GS1 NO tiene una tabla aparte para esto: los minimos generales
 *   son los mismos, y solo "si la unidad es fisicamente demasiado pequena" admite bajar a
 *   X = 0.250 mm y barras de 12.70 mm. Aqui se refleja tal cual: por debajo de 0.495 es un
 *   AVISO (lo lee una pistola, pero no cumple el general), por debajo de 0.250 es ERROR.
 *
 * Ademas, en cualquier caso: zona en blanco de 10X a cada lado y 165.10 mm de largo maximo
 * con las zonas incluidas (GenSpecs §5.4.4).
 */
import { modulosGs1128, ZONA_BLANCA_MODULOS } from './code128.js'
import type { Simbolo } from './elementos.js'

export type PerfilLectura = 'automatico' | 'pistola'
/** `ubicacion`: etiqueta de ubicacion (GLN, Tabla 9 de las GenSpecs). */
export type TipoUnidad = 'caja' | 'tarima' | 'ubicacion'

export const MM_POR_PULGADA = 25.4
export const LARGO_MAXIMO_MM = 165.1

export interface LimitesGs1 {
  readonly xMinimo: number
  readonly xMaximo: number
  readonly alturaMinima: number
  readonly xMinimoReducido: number
  readonly alturaMinimaReducida: number
  readonly tabla: string
}

export function limitesGs1(unidad: TipoUnidad): LimitesGs1 {
  // Tabla 9 (GDTI, GRAI, GIAI y GLN): X 0.250 a 0.495 mm y 12.70 mm de alto; para marcar
  // ubicaciones la nota de la tabla admite hasta 1.016 mm.
  if (unidad === 'ubicacion') return { xMinimo: 0.25, xMaximo: 1.016, alturaMinima: 12.7, xMinimoReducido: 0.25, alturaMinimaReducida: 12.7, tabla: 'Tabla 9 (GLN, marcado de ubicaciones)' }
  return unidad === 'caja'
    ? { xMinimo: 0.495, xMaximo: 1.016, alturaMinima: 31.75, xMinimoReducido: 0.25, alturaMinimaReducida: 12.7, tabla: 'Tabla 2 (artículos en distribución general)' }
    : { xMinimo: 0.495, xMaximo: 0.94, alturaMinima: 31.75, xMinimoReducido: 0.25, alturaMinimaReducida: 12.7, tabla: 'Tabla 5 (unidades logísticas)' }
}

export function puntosAMm(puntos: number, dpi: number): number {
  return (puntos / dpi) * MM_POR_PULGADA
}

export function mmAPuntos(mm: number, dpi: number): number {
  return Math.round((mm / MM_POR_PULGADA) * dpi)
}

export interface MedidaSimbolo {
  readonly modulos: number
  readonly puntosPorModulo: number
  readonly xMm: number
  /** Ancho de las barras, sin zonas en blanco. */
  readonly anchoPuntos: number
  /** Ancho con 10X de zona en blanco a cada lado. */
  readonly anchoConZonasPuntos: number
  readonly anchoConZonasMm: number
}

export function mideSimbolo(simbolo: Simbolo, puntosPorModulo: number, dpi: number): MedidaSimbolo {
  const modulos = modulosGs1128(simbolo)
  const anchoPuntos = modulos * puntosPorModulo
  const anchoConZonasPuntos = (modulos + 2 * ZONA_BLANCA_MODULOS) * puntosPorModulo
  return { modulos, puntosPorModulo, xMm: puntosAMm(puntosPorModulo, dpi), anchoPuntos, anchoConZonasPuntos, anchoConZonasMm: puntosAMm(anchoConZonasPuntos, dpi) }
}

/**
 * El mayor grosor (en puntos de la impresora) con el que el simbolo cabe, zonas incluidas, en
 * `anchoUtilPuntos`, sin pasar del maximo de GS1 ni de 10 puntos (el tope de ^BY).
 */
export function mejorGrosor(simbolo: Simbolo, anchoUtilPuntos: number, dpi: number, unidad: TipoUnidad): number | undefined {
  const lim = limitesGs1(unidad)
  const modulos = modulosGs1128(simbolo) + 2 * ZONA_BLANCA_MODULOS
  for (let p = 10; p >= 1; p--) {
    if (puntosAMm(p, dpi) > lim.xMaximo + 1e-9) continue
    if (modulos * p <= anchoUtilPuntos) return p
  }
  return undefined
}

export type Veredicto = 'cumple' | 'reducido' | 'no-cumple'

export interface EvaluacionMedidas {
  readonly x: Veredicto
  readonly altura: Veredicto
  readonly cabe: boolean
  readonly excedeLargoMaximo: boolean
  readonly xMm: number
  readonly alturaMm: number
  readonly limites: LimitesGs1
}

export function evaluaMedidas(medida: MedidaSimbolo, alturaPuntos: number, dpi: number, anchoUtilPuntos: number, unidad: TipoUnidad, perfil: PerfilLectura): EvaluacionMedidas {
  const lim = limitesGs1(unidad)
  const alturaMm = puntosAMm(alturaPuntos, dpi)
  const tol = 1e-3
  const veredicto = (valor: number, minimo: number, reducido: number): Veredicto => {
    if (valor + tol >= minimo) return 'cumple'
    if (perfil === 'pistola' && valor + tol >= reducido) return 'reducido'
    return 'no-cumple'
  }
  // Para unidades logisticas pequenas la altura minima reducida es la mayor de 12.70 mm y el
  // 15 % del ancho con zonas (Tabla 5, nota **).
  const alturaReducida = unidad === 'tarima' ? Math.max(lim.alturaMinimaReducida, 0.15 * medida.anchoConZonasMm) : lim.alturaMinimaReducida
  return {
    x: medida.xMm > lim.xMaximo + tol ? 'no-cumple' : veredicto(medida.xMm, lim.xMinimo, lim.xMinimoReducido),
    altura: veredicto(alturaMm, lim.alturaMinima, alturaReducida),
    cabe: medida.anchoConZonasPuntos <= anchoUtilPuntos,
    excedeLargoMaximo: medida.anchoConZonasMm > LARGO_MAXIMO_MM + tol,
    xMm: medida.xMm,
    alturaMm,
    limites: lim,
  }
}
