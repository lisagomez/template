/**
 * Los cuatro puertos. Interfaces, sin una sola implementacion.
 *
 * Es lo que permite que el nucleo no importe React, Next, Supabase ni ningun proveedor de OCR, y
 * que la decision de si el documento sale del perimetro (C4) la tome cada proyecto en vez de
 * venir cocida en la herramienta.
 */
import type { PaginaExtraida, LimitesDelMotor } from './tipos.js'
import type { DescriptorDeEsquema } from './esquema.js'

export interface OpcionesDeExtraccion {
  /** Paginas concretas, para trocear. Empiezan en 0, como en la API de Mistral. */
  paginas?: readonly number[]
  /** Esquema JSON de la anotacion pedida. Lo que vuelva se valida igual: no se confia. */
  esquemaDeAnotacion?: unknown
}

export interface MotorOcr {
  /** El identificador PINEADO del modelo. Un alias autoactualizable se rechaza (C1). */
  readonly modelo: string
  readonly limites: LimitesDelMotor
  extrae(documento: Uint8Array, opciones?: OpcionesDeExtraccion): Promise<PaginaExtraida[]>
}

export interface AlmacenDocumentos {
  guarda(id: string, paginas: readonly PaginaExtraida[]): Promise<void>
  lee(id: string): Promise<PaginaExtraida[] | null>
  lista(): Promise<readonly string[]>
}

export interface AlmacenPlantillas {
  guardaPorDefecto(tipoDocumento: string, plantilla: unknown): Promise<void>
  leePorDefecto(tipoDocumento: string): Promise<unknown | null>
}

/**
 * El puerto que hace posible mapear contra lo que el proyecto YA tiene.
 *
 * Su implementacion por defecto no consulta nada: devuelve el descriptor que el integrador
 * declaro. No es pereza — es que no hay via sin privilegio para introspeccionar el esquema (el
 * OpenAPI por anon key esta bloqueado y la introspeccion GraphQL viene desactivada), y una
 * herramienta que exige una clave secreta para arrancar amplia el privilegio de forma permanente
 * en todo proyecto que la instale (C7).
 */
export interface EsquemaExistente {
  describe(): Promise<DescriptorDeEsquema>
}
