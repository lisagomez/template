/**
 * El catálogo: lo que la capa dice que existe, más lo que el Estudio necesita saber para no mentir con buena cara.
 *
 * No sabe de Golfo Norte. Se construye desde el catálogo crudo de CUALQUIER capa MetricFlow y los dominios de sus
 * dimensiones categóricas. De ahí salen tres juicios que el lienzo y el agente no pueden saltarse:
 *   - qué métrica existe y qué dimensiones alcanza (lo demás se rechaza, no se aproxima);
 *   - cuáles NO suman (count_distinct, razones, fotos no aditivas en el tiempo): un total suyo es su propia consulta;
 *   - cuáles llevan desfase temporal (YoY): sobre un periodo de varios meses comparan contra el año anterior
 *     COMPLETO, medido en la tabla de cifras (−17.0 % donde el conteo directo da +22.7 %).
 */
import type { CatalogoCrudo, MetricaCruda, PuertoSemantico } from './puerto.js'

export const GRANOS_TIEMPO = ['day', 'week', 'month', 'quarter', 'year'] as const

export interface Catalogo {
  readonly version: string
  readonly metricas: ReadonlyMap<string, MetricaCruda>
  /** Valores de cada dimensión categórica conocida (dominio). Una dimensión sin dominio no restringe valores. */
  readonly dominios: ReadonlyMap<string, readonly string[]>
}

export function construyeCatalogo(crudo: CatalogoCrudo, dominios: Readonly<Record<string, readonly string[]>> = {}): Catalogo {
  return {
    version: crudo.version,
    metricas: new Map(crudo.metricas.map((m) => [m.nombre, m])),
    dominios: new Map(Object.entries(dominios)),
  }
}

/** Carga el catálogo y el dominio de cada dimensión categórica (una consulta de valores por dimensión). */
export async function cargaCatalogo(puerto: PuertoSemantico, opciones: { maxValores?: number; excluir?: readonly string[] } = {}): Promise<Catalogo> {
  const crudo = await puerto.catalogo()
  const porDimension = new Map<string, string>()
  for (const m of crudo.metricas) for (const d of m.dimensiones) {
    if (d.tipo === 'categorica' && !porDimension.has(d.nombre) && !(opciones.excluir ?? []).includes(d.nombre)) porDimension.set(d.nombre, m.nombre)
  }
  const dominios: Record<string, readonly string[]> = {}
  for (const [dimension, metrica] of porDimension) {
    const valores = await puerto.valores(metrica, dimension)
    if (valores.length <= (opciones.maxValores ?? 500)) dominios[dimension] = valores
  }
  return construyeCatalogo(crudo, dominios)
}

export function metrica(cat: Catalogo, nombre: string): MetricaCruda | undefined {
  return cat.metricas.get(nombre)
}

const ORDEN_GRANO: Record<string, number> = { day: 0, week: 1, month: 2, quarter: 3, year: 4 }

/** Las dimensiones de tiempo de una métrica con su grano mínimo: `metric_time__month` → { raiz, grano: month }. */
export function tiemposDe(m: MetricaCruda): { raiz: string; grano: string }[] {
  return m.dimensiones.filter((d) => d.tipo === 'tiempo').map((d) => {
    const i = d.nombre.lastIndexOf('__')
    const grano = d.nombre.slice(i + 2)
    return i > 0 && grano in ORDEN_GRANO ? { raiz: d.nombre.slice(0, i), grano } : { raiz: d.nombre, grano: 'day' }
  })
}

/**
 * ¿La métrica alcanza este nombre de agrupación? Una categórica tal cual; un tiempo con grano igual o más grueso
 * que el mínimo de la métrica (`clientes_activos` va por mes: `metric_time__day` no la alcanza).
 */
export function alcanza(m: MetricaCruda, dimension: string): boolean {
  if (m.dimensiones.some((d) => d.tipo === 'categorica' && d.nombre === dimension)) return true
  const i = dimension.lastIndexOf('__')
  if (i < 0) return false
  const [raiz, grano] = [dimension.slice(0, i), dimension.slice(i + 2)]
  if (!(grano in ORDEN_GRANO)) return false
  return tiemposDe(m).some((t) => t.raiz === raiz && (ORDEN_GRANO[grano] ?? -1) >= (ORDEN_GRANO[t.grano] ?? 9))
}

export function esTiempo(dimension: string): boolean {
  return /__(day|week|month|quarter|year)$/.test(dimension) && dimension.startsWith('metric_time')
}

/** ¿Lleva desfase temporal, directo o heredado de una métrica de entrada? */
export function tieneDesfase(cat: Catalogo, nombre: string, vistos = new Set<string>()): boolean {
  const m = cat.metricas.get(nombre)
  if (!m || vistos.has(nombre)) return false
  vistos.add(nombre)
  return m.entradas.some((e) => e.desfase !== null || tieneDesfase(cat, e.nombre, vistos))
}

/**
 * ¿Se puede SUMAR a través de una dimensión? Solo las simples con sum/count y las derivadas que son combinación
 * lineal (+, −) de sumables. count_distinct, razones y proporciones no: el total de clientes activos de un trimestre
 * no es la suma de sus meses. Una medida no aditiva (foto) no suma en su dimensión de tiempo, pero sí entre tiendas.
 */
export function esSumable(cat: Catalogo, nombre: string, a: 'tiempo' | 'categorica', vistos = new Set<string>()): boolean {
  const m = cat.metricas.get(nombre)
  if (!m || vistos.has(nombre)) return false
  vistos.add(nombre)
  if (m.tipo === 'simple') {
    if (!['sum', 'count'].includes(m.agregacion ?? '')) return false
    return !(a === 'tiempo' && m.noAditivaEn)
  }
  if (m.tipo === 'derived') {
    const lineal = m.expr !== null && /^[\w\s+\-()]+$/.test(m.expr)
    return lineal && m.entradas.every((e) => e.desfase === null && esSumable(cat, e.nombre, a, vistos))
  }
  return false
}

export function unidadDe(m: MetricaCruda): string {
  return typeof m.meta['unidad'] === 'string' ? m.meta['unidad'] : ''
}

export interface Definicion {
  readonly nombre: string
  readonly etiqueta: string
  readonly descripcion: string
  readonly tipo: string
  readonly formula: string
  readonly dueno: string | null
  readonly unidad: string
  readonly filtro: readonly string[]
  readonly dimensiones: readonly string[]
  readonly advertencias: readonly string[]
}

function formula(m: MetricaCruda): string {
  if (m.tipo === 'ratio') return `${m.numerador} / ${m.denominador}`
  if (m.tipo === 'derived') {
    const desfases = m.entradas.filter((e) => e.desfase).map((e) => `${e.alias ?? e.nombre} = ${e.nombre} desfasada ${e.desfase}`)
    return [m.expr ?? '', ...desfases].join('; ')
  }
  return m.medida ? `${m.agregacion ?? 'agg'}(${m.medida})` : m.tipo
}

/** La definición tal como la declara la capa, para EXPLICAR y para la procedencia. No se parafrasea. */
export function define(cat: Catalogo, nombre: string): Definicion | undefined {
  const m = cat.metricas.get(nombre)
  if (!m) return undefined
  const advertencias: string[] = []
  if (!esSumable(cat, nombre, 'categorica')) advertencias.push('no se suma entre categorías: cada total es su propia consulta')
  else if (!esSumable(cat, nombre, 'tiempo')) advertencias.push(`no aditiva en el tiempo${m.noAditivaEn ? ` (${m.noAditivaEn}: se toma la última foto)` : ''}: no se suma entre meses`)
  if (tieneDesfase(cat, nombre)) advertencias.push('lleva desfase temporal: úsala por mes; sobre un periodo de varios meses compara contra el año anterior completo')
  return {
    nombre, etiqueta: m.etiqueta ?? nombre, descripcion: m.descripcion, tipo: m.tipo, formula: formula(m),
    dueno: typeof m.meta['dueno'] === 'string' ? m.meta['dueno'] : null, unidad: unidadDe(m), filtro: m.filtro,
    dimensiones: m.dimensiones.map((d) => d.nombre), advertencias,
  }
}
