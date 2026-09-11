/**
 * Los cuatro puertos. Interfaces, sin una sola implementacion.
 *
 * Es lo que permite que el nucleo no importe React, Next, Supabase ni ningun proveedor de OCR, y
 * que la decision de si el documento sale del perimetro (C4) la tome cada proyecto en vez de
 * venir cocida en la herramienta.
 */
import type { PaginaExtraida, LimitesDelMotor, UsoDeTokens } from './tipos.js'
import type { DescriptorDeEsquema } from './esquema.js'

export interface OpcionesDeExtraccion {
  /** Paginas concretas, para trocear. Empiezan en 0, como en la API de Mistral. */
  paginas?: readonly number[]
  /** Esquema JSON de la anotacion pedida. Lo que vuelva se valida igual: no se confia. */
  esquemaDeAnotacion?: unknown
  /**
   * Se llama UNA vez por peticion, con lo que el servidor declaro consumir (`null` si no lo
   * declara). Deliberadamente NO es parte del valor de retorno de `extrae()`: cambiar esa firma
   * romperia a cada llamador existente, y esto es aditivo — quien no lo necesite no lo pasa.
   */
  alConsumirTokens?: (uso: UsoDeTokens | null) => void
}

export interface MotorOcr {
  /** El identificador PINEADO del modelo. Un alias autoactualizable se rechaza (C1). */
  readonly modelo: string
  readonly limites: LimitesDelMotor
  extrae(documento: Uint8Array, opciones?: OpcionesDeExtraccion): Promise<PaginaExtraida[]>
}

/**
 * Lector de codigos: hermano de `MotorOcr` y deliberadamente SEPARADO de el.
 *
 * No comparten interfaz porque no comparten semantica: el OCR devuelve confianza y region; un
 * decodificador devuelve una carga que decodifico o no. Meterlos en el mismo puerto obligaria a
 * inventar una confianza para el codigo, que es justo el error que §2.11 del SDD evita.
 */
export interface LectorDeCodigos {
  /** Formatos que este adaptador sabe leer: 'qr', 'code128', 'pdf417', 'datamatrix', 'ean13'... */
  readonly formatos: readonly string[]
  /** Devuelve las cargas crudas encontradas. Interpretarlas es de `analizaCarga`, no de aqui. */
  lee(imagen: Uint8Array): Promise<readonly string[]>
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

/**
 * Persistencia y recuperacion de lotes. El titulo es para el humano; los identificadores del
 * indice son por lo que se busca de verdad.
 */
export interface RepositorioDeRegistros {
  guardaLote(lote: unknown): Promise<void>
  leeLote(id: string): Promise<unknown | null>
  busca(criterios: unknown): Promise<readonly unknown[]>
}

/**
 * El fichero original en un bucket PRIVADO. La lectura va siempre por URL firmada y caduca: un
 * bucket publico con facturas es una fuga con enlace permanente.
 *
 * Ojo con el respaldo: los bytes viven fuera de Postgres, asi que `pg_dump` NO los incluye. Un
 * respaldo de base en verde deja fuera todas las evidencias, y eso es peor que no tenerlas
 * respaldadas — parece que estan.
 */
export interface AlmacenDeOriginales {
  guarda(ruta: string, contenido: Uint8Array, tipoMime: string): Promise<void>
  urlFirmada(ruta: string, segundos: number): Promise<string>
  /** Irreversible: solo por llamada explicita, nunca por vencimiento automatico de retencion. */
  borra(ruta: string): Promise<void>
}
