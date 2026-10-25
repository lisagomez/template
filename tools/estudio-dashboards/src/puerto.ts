/**
 * El puerto semántico: lo único por donde el Estudio obtiene cifras.
 *
 * El núcleo no sabe de MetricFlow, de dbt ni de Golfo Norte. Pide métricas POR NOMBRE, con dimensiones, filtros
 * estructurados y un periodo, y recibe filas más el SQL que la capa compiló (la procedencia). Quien implementa el
 * puerto traduce eso a su capa: `./metricflow` lo hace con un MetricFlow caliente; una prueba lo hace con un
 * doble. Ni el lienzo ni el agente leen tablas: si una cifra no vino de aquí, no existe.
 */

/** Un valor de filtro: lo que una dimensión categórica puede valer. */
export type ValorFiltro = string | number | boolean

export type OperadorFiltro = 'igual' | 'distinto' | 'en' | 'no_en' | 'mayor' | 'menor' | 'mayor_igual' | 'menor_igual'

export interface Filtro {
  /** Nombre calificado de la dimensión en la capa (`tienda__region`). */
  readonly dimension: string
  readonly operador: OperadorFiltro
  readonly valores: readonly ValorFiltro[]
}

/** Meses inclusivos, `AAAA-MM`. El periodo filtra el tiempo de la métrica (`metric_time`). */
export interface Periodo {
  readonly desde: string
  readonly hasta: string
}

export interface ConsultaSemantica {
  readonly metricas: readonly string[]
  /** Dimensiones categóricas o tiempo con grano (`metric_time__month`). */
  readonly agrupar?: readonly string[]
  readonly filtros?: readonly Filtro[]
  readonly periodo?: Periodo
  /** Campo (métrica o dimensión) y sentido. */
  readonly orden?: readonly { readonly campo: string; readonly desc?: boolean }[]
  readonly limite?: number
}

export type Celda = string | number | boolean | null

export interface ResultadoSemantico {
  readonly columnas: readonly string[]
  readonly filas: readonly (readonly Celda[])[]
  /** SQL que compiló la capa: la procedencia de cada cifra. `null` solo si la capa no lo expone. */
  readonly sql: string | null
  readonly truncada: boolean
  /** Lo que tardó la capa (no el transporte). */
  readonly ms: number
}

/** Una métrica tal como la describe la capa: el catálogo crudo, sin opiniones del Estudio. */
export interface MetricaCruda {
  readonly nombre: string
  readonly etiqueta: string | null
  readonly descripcion: string
  /** simple · ratio · derived · cumulative · conversion */
  readonly tipo: string
  readonly expr: string | null
  readonly medida: string | null
  readonly numerador: string | null
  readonly denominador: string | null
  readonly entradas: readonly { readonly nombre: string; readonly alias: string | null; readonly desfase: string | null }[]
  readonly filtro: readonly string[]
  readonly meta: Readonly<Record<string, unknown>>
  /** Agregación de la medida (solo métricas simples): sum, count, count_distinct, average… */
  readonly agregacion: string | null
  /** Si la medida es no aditiva en alguna dimensión (p. ej. una foto de inventario), cuál. */
  readonly noAditivaEn: string | null
  readonly dimensiones: readonly { readonly nombre: string; readonly tipo: 'tiempo' | 'categorica'; readonly etiqueta: string | null }[]
}

export interface CatalogoCrudo {
  /** Huella del manifiesto: cambia si cambia la capa, e invalida la caché. */
  readonly version: string
  readonly metricas: readonly MetricaCruda[]
}

export interface PuertoSemantico {
  catalogo(): Promise<CatalogoCrudo>
  /** Valores de una dimensión categórica, vistos a través de una métrica que la alcanza. */
  valores(metrica: string, dimension: string): Promise<readonly string[]>
  consulta(c: ConsultaSemantica): Promise<ResultadoSemantico>
  cierra?(): Promise<void>
}

/** La capa no respondió o rechazó la consulta. Se distingue del rechazo del esquema (otro código en el CLI). */
export class FallaDeCapa extends Error {
  override readonly name = 'FallaDeCapa'
}
