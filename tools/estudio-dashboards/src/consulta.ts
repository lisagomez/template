/**
 * `consultar_metricas` con sus límites: la puerta por la que pasan TODAS las cifras del Estudio.
 *
 * Antes de tocar la capa, la consulta se valida contra el catálogo (métricas que existen, dimensiones que TODAS
 * las métricas pedidas alcanzan, valores del dominio, periodo bien formado, tope de filas y de métricas). Después,
 * una caché por consulta normalizada y versión del catálogo: la regeneración con caché caliente no vuelve a la capa
 * para lo que no cambió. Cada respuesta lleva su consulta y su SQL: la procedencia viaja con la cifra.
 */
import { alcanza, metrica, type Catalogo } from './catalogo.js'
import type { ConsultaSemantica, PuertoSemantico, ResultadoSemantico } from './puerto.js'
import { validaFiltro, type ErrorValidacion } from './valida.js'

export interface Respuesta extends ResultadoSemantico {
  readonly consulta: ConsultaSemantica
  readonly desdeCache: boolean
  /** Pared, incluida la caché y el transporte. */
  readonly totalMs: number
}

export interface Consultor {
  readonly catalogo: Catalogo
  valida(c: ConsultaSemantica): ErrorValidacion[]
  consulta(c: ConsultaSemantica): Promise<Respuesta>
  estadisticas(): { readonly consultas: number; readonly aciertosCache: number; readonly msCapa: number }
}

export interface OpcionesConsultor {
  readonly maxFilas?: number
  readonly maxMetricas?: number
  readonly maxAgrupar?: number
  /** Entradas en caché (LRU). 0 la apaga. */
  readonly cache?: number
}

export class ConsultaInvalida extends Error {
  override readonly name = 'ConsultaInvalida'
  readonly errores: readonly ErrorValidacion[]
  constructor(errores: readonly ErrorValidacion[]) {
    super(errores.map((e) => e.mensaje).join('; '))
    this.errores = errores
  }
}

const MES = /^\d{4}-(0[1-9]|1[0-2])$/

export function validaConsulta(cat: Catalogo, c: ConsultaSemantica, o: OpcionesConsultor = {}): ErrorValidacion[] {
  const e: ErrorValidacion[] = []
  const malo = (codigo: ErrorValidacion['codigo'], mensaje: string) => e.push({ codigo, ruta: 'consulta', mensaje })
  if (!c.metricas.length) malo('esquema', 'la consulta no pide ninguna métrica')
  if (c.metricas.length > (o.maxMetricas ?? 8)) malo('esquema', `más de ${o.maxMetricas ?? 8} métricas en una consulta`)
  if ((c.agrupar ?? []).length > (o.maxAgrupar ?? 3)) malo('esquema', `más de ${o.maxAgrupar ?? 3} agrupaciones`)
  if ((c.limite ?? 0) > (o.maxFilas ?? 5000)) malo('esquema', `el límite de filas es ${o.maxFilas ?? 5000}`)
  const ms = c.metricas.map((n) => ({ n, m: metrica(cat, n) }))
  for (const { n, m } of ms) if (!m) malo('metrica_inexistente', `la métrica «${n}» no existe en el catálogo`)
  for (const d of c.agrupar ?? []) for (const { n, m } of ms) if (m && !alcanza(m, d)) malo('dimension_invalida', `«${n}» no se puede agrupar por «${d}»`)
  for (const [i, f] of (c.filtros ?? []).entries()) {
    for (const { n, m } of ms) if (m && !alcanza(m, f.dimension)) malo('dimension_invalida', `«${n}» no se puede filtrar por «${f.dimension}»`)
    e.push(...validaFiltro(cat, { ...f, valores: [...f.valores] }, [], `consulta.filtros[${i}]`))
  }
  if (c.periodo && !(MES.test(c.periodo.desde) && MES.test(c.periodo.hasta) && c.periodo.desde <= c.periodo.hasta)) malo('esquema', 'periodo mal formado')
  return e
}

/** Clave estable: el orden de métricas, agrupaciones y filtros no cambia la respuesta. */
export function claveConsulta(c: ConsultaSemantica, version: string): string {
  const filtros = [...(c.filtros ?? [])].map((f) => ({ ...f, valores: [...f.valores].map(String).sort() })).sort((a, b) => a.dimension.localeCompare(b.dimension))
  return JSON.stringify([version, [...c.metricas].sort(), [...(c.agrupar ?? [])].sort(), filtros, c.periodo ?? null, c.orden ?? [], c.limite ?? null])
}

export function consultor(puerto: PuertoSemantico, cat: Catalogo, o: OpcionesConsultor = {}): Consultor {
  const cache = new Map<string, ResultadoSemantico>()
  // La misma consulta pedida dos veces A LA VEZ (dos componentes en paralelo) va una sola vez a la capa.
  const enVuelo = new Map<string, Promise<ResultadoSemantico>>()
  const capacidad = o.cache ?? 500
  const est = { consultas: 0, aciertosCache: 0, msCapa: 0 }
  return {
    catalogo: cat,
    valida: (c) => validaConsulta(cat, c, o),
    estadisticas: () => ({ ...est }),
    async consulta(c) {
      const t = performance.now()
      const errores = validaConsulta(cat, c, o)
      if (errores.length) throw new ConsultaInvalida(errores)
      est.consultas++
      const clave = claveConsulta(c, cat.version)
      const guardada = cache.get(clave)
      if (guardada) {
        est.aciertosCache++
        cache.delete(clave); cache.set(clave, guardada)
        return { ...guardada, consulta: c, desdeCache: true, totalMs: performance.now() - t }
      }
      const compartida = enVuelo.get(clave)
      if (compartida) {
        est.aciertosCache++
        return { ...(await compartida), consulta: c, desdeCache: true, totalMs: performance.now() - t }
      }
      const pedida = puerto.consulta({ ...c, limite: c.limite ?? o.maxFilas ?? 5000 })
      if (capacidad > 0) enVuelo.set(clave, pedida)
      try {
        const r = await pedida
        est.msCapa += r.ms
        if (capacidad > 0) {
          cache.set(clave, r)
          if (cache.size > capacidad) cache.delete(cache.keys().next().value as string)
        }
        return { ...r, consulta: c, desdeCache: false, totalMs: performance.now() - t }
      } finally { enVuelo.delete(clave) }
    },
  }
}
