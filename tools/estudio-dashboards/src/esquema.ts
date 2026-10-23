/**
 * El esquema versionado de la especificación del dashboard (`estudio.dashboard/1`) y de sus parches
 * (`estudio.parche/1`). Es el contrato que hace confiable al Estudio: el agente NO dibuja ni escribe SQL; edita
 * esto, y el lienzo solo lo renderiza. Una regeneración es entonces predecible (el mismo JSON da el mismo tablero),
 * reversible (cada parche es una versión) y comparable (dos versiones se diferencian componente a componente).
 *
 * Los 14 tipos de componente salen del prototipo publicado (hero, kpis, metas, progreso, medidor, actividad, mapa,
 * senales, contabilidad, barras, cohortes, linea, tabla, nota); `hallazgo` es la nota con evidencia que deja un
 * análisis. Los nombres de métrica y dimensión son los de la capa semántica: este archivo valida la FORMA; que
 * existan y sean alcanzables lo valida `valida.ts` contra el catálogo.
 */
import { z } from 'zod'

export const ESQUEMA_DASHBOARD = 'estudio.dashboard/1' as const
export const ESQUEMA_PARCHE = 'estudio.parche/1' as const

const nombre = z.string().regex(/^[a-z_][a-z0-9_]*$/, 'nombre de la capa semántica (minúsculas y _)')
const id = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, 'id de componente: minúsculas, dígitos y _, hasta 40')
const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'mes AAAA-MM')
export const GRANOS = ['day', 'week', 'month', 'quarter', 'year'] as const

export const periodoEsquema = z.object({ desde: mes, hasta: mes }).strict()
  .refine((p) => p.desde <= p.hasta, 'el periodo empieza después de terminar')
export const filtroEsquema = z.object({
  dimension: nombre,
  operador: z.enum(['igual', 'distinto', 'en', 'no_en', 'mayor', 'menor', 'mayor_igual', 'menor_igual']),
  valores: z.array(z.union([z.string().max(120), z.number(), z.boolean()])).min(1).max(50),
}).strict()
export const comparar = z.enum(['anio_anterior', 'periodo_anterior'])
const ancho = z.enum(['completo', 'ancho', 'medio', 'tercio'])
const orden = z.enum(['desc', 'asc'])

/** Lo que todo componente puede llevar además de lo suyo. */
const base = {
  id,
  titulo: z.string().min(1).max(100).optional(),
  ancho: ancho.optional(),
  /** Filtros SOLO de este componente («quita Lácteos» en una gráfica), además de los globales. */
  filtros: z.array(filtroEsquema).max(10).optional(),
  /** Periodo propio; si falta, el global. */
  periodo: periodoEsquema.optional(),
}
const meta = z.object({ metrica: nombre, meta: z.number().finite() }).strict()
const resaltar = z.object({ operador: z.enum(['menor', 'mayor']), valor: z.number().finite() }).strict()

export const componenteEsquema = z.discriminatedUnion('tipo', [
  z.object({ ...base, tipo: z.literal('hero'), metrica: nombre, comparar: comparar.optional() }).strict(),
  z.object({ ...base, tipo: z.literal('kpis'), metricas: z.array(nombre).min(1).max(6), comparar: comparar.optional() }).strict(),
  z.object({ ...base, tipo: z.literal('metas'), metas: z.array(meta).min(1).max(3) }).strict(),
  z.object({ ...base, tipo: z.literal('medidor'), metrica: nombre, meta: z.number().finite() }).strict(),
  z.object({ ...base, tipo: z.literal('progreso'), metrica: nombre, dimension: nombre }).strict(),
  z.object({ ...base, tipo: z.literal('actividad'), metrica: nombre, dimension: nombre, top: z.number().int().min(3).max(50).optional(), comparar: comparar.optional() }).strict(),
  z.object({ ...base, tipo: z.literal('barras'), metrica: nombre, dimension: nombre, top: z.number().int().min(1).max(50).optional(), orden: orden.optional(), resaltar: resaltar.optional(), comparar: comparar.optional() }).strict(),
  z.object({ ...base, tipo: z.literal('linea'), metrica: nombre, grano: z.enum(GRANOS).optional(), serie: nombre.optional(), comparar: comparar.optional() }).strict(),
  z.object({ ...base, tipo: z.literal('tabla'), metricas: z.array(nombre).min(1).max(6), dimension: nombre, top: z.number().int().min(1).max(100).optional(), orden: orden.optional() }).strict(),
  /** El mapa agrupa por la dimensión que tiene geografía (la del catálogo geográfico inyectado si se omite). */
  z.object({ ...base, tipo: z.literal('mapa'), metrica: nombre, dimension: nombre.optional(), color: z.enum(['variacion', 'metrica']).optional(), capas: z.array(z.enum(['reorden', 'cobertura', 'senales'])).max(3).optional() }).strict(),
  z.object({ ...base, tipo: z.literal('cohortes'), metrica: nombre, serie: nombre.optional() }).strict(),
  z.object({ ...base, tipo: z.literal('contabilidad'), entradas: z.array(nombre).min(1).max(4), salidas: z.array(nombre).max(2) }).strict(),
  z.object({ ...base, tipo: z.literal('senales') }).strict(),
  z.object({ ...base, tipo: z.literal('nota'), texto: z.string().min(1).max(600) }).strict(),
  z.object({
    ...base,
    tipo: z.literal('hallazgo'),
    texto: z.string().min(1).max(800),
    /** Cada cifra del texto sale de aquí: valores de consultas de ESA vuelta (`texto.ts` lo comprueba). */
    evidencia: z.array(z.object({ etiqueta: z.string().max(120), valor: z.number().finite(), unidad: z.string().max(20), consulta: z.string().max(400) }).strict()).min(1).max(30),
  }).strict(),
])

export const seleccionEsquema = z.object({ dimension: nombre, valores: z.array(z.string().max(120)).min(1).max(50) }).strict()

export const dashboardEsquema = z.object({
  esquema: z.literal(ESQUEMA_DASHBOARD),
  titulo: z.string().min(1).max(90),
  /** La palanca de growth a la que se ata la vista; el margen es guardarraíl, no palanca. */
  palanca: z.enum(['adquisicion', 'frecuencia', 'retencion', 'ticket', 'margen']).optional(),
  filtros: z.object({
    periodo: periodoEsquema,
    comparar: comparar.optional(),
    dimensiones: z.array(filtroEsquema).max(10),
  }).strict(),
  /** Selección del mapa (clic o lazo): filtra el tablero y es contexto para el agente. */
  seleccion: seleccionEsquema.optional(),
  componentes: z.array(componenteEsquema).max(24),
}).strict().superRefine((d, ctx) => {
  const vistos = new Set<string>()
  for (const c of d.componentes) {
    if (vistos.has(c.id)) ctx.addIssue({ code: 'custom', message: `id repetido: ${c.id}` })
    vistos.add(c.id)
  }
})

export const TIPOS_INSTRUCCION = ['crear', 'modificar', 'filtrar', 'analizar', 'explicar', 'alertar'] as const

/** Una operación de parche. Cada una nombra lo que toca: así se mide si el parche tocó de más. */
export const operacionEsquema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('agregar'), componente: componenteEsquema, despues_de: id.nullable().optional() }).strict(),
  z.object({ op: z.literal('quitar'), id }).strict(),
  /** Cambia campos de UN componente; `null` borra un campo opcional. No cambia ni el id ni el tipo… salvo `tipo`
   *  explícito, que convierte la gráfica (barras → linea) conservando lo compatible. */
  z.object({ op: z.literal('cambiar'), id, cambios: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ op: z.literal('mover'), id, despues_de: id.nullable() }).strict(),
  z.object({ op: z.literal('filtrar'), agregar: z.array(filtroEsquema).max(10).optional(), quitar: z.array(nombre).max(10).optional() }).strict(),
  z.object({ op: z.literal('periodo'), periodo: periodoEsquema, comparar: comparar.nullable().optional() }).strict(),
  z.object({ op: z.literal('seleccionar'), seleccion: seleccionEsquema.nullable() }).strict(),
  z.object({ op: z.literal('titulo'), titulo: z.string().min(1).max(90) }).strict(),
  /** Solo para CREAR: un tablero completo nuevo. */
  z.object({ op: z.literal('reemplazar'), dashboard: z.unknown() }).strict(),
])

export const parcheEsquema = z.object({
  esquema: z.literal(ESQUEMA_PARCHE),
  /** Versión sobre la que se calculó: si el tablero cambió entretanto, el parche se rechaza (no se fusiona a ciegas). */
  base: z.number().int().min(0),
  /** Lo que la instrucción pidió tocar. Un parche que toca algo fuera de aquí se RECHAZA. */
  alcance: z.object({ tipo: z.enum(TIPOS_INSTRUCCION), componentes: z.array(id).max(24) }).strict(),
  operaciones: z.array(operacionEsquema).min(1).max(30),
}).strict()

export type PeriodoDashboard = z.infer<typeof periodoEsquema>
export type FiltroDashboard = z.infer<typeof filtroEsquema>
export type Componente = z.infer<typeof componenteEsquema>
export type TipoComponente = Componente['tipo']
export type Dashboard = z.infer<typeof dashboardEsquema>
export type Operacion = z.infer<typeof operacionEsquema>
export type Parche = z.infer<typeof parcheEsquema>
export type TipoInstruccion = (typeof TIPOS_INSTRUCCION)[number]
export type Comparar = z.infer<typeof comparar>

/** Las métricas que nombra un componente (las que el resolver va a consultar). */
export function metricasDe(c: Componente): string[] {
  switch (c.tipo) {
    case 'kpis': case 'tabla': return [...c.metricas]
    case 'metas': return c.metas.map((m) => m.metrica)
    case 'contabilidad': return [...c.entradas, ...c.salidas]
    case 'senales': case 'nota': case 'hallazgo': return []
    default: return [c.metrica]
  }
}

/** Las dimensiones por las que agrupa un componente (sin contar filtros). */
export function dimensionesDe(c: Componente): string[] {
  switch (c.tipo) {
    case 'progreso': case 'actividad': case 'barras': case 'tabla': return [c.dimension]
    case 'linea': return c.serie ? [c.serie] : []
    case 'cohortes': return c.serie ? [c.serie] : []
    default: return []
  }
}

/** Ancho por defecto de cada tipo en la rejilla de 12 columnas (como el prototipo). */
export const ANCHO_POR_DEFECTO: Record<TipoComponente, 'completo' | 'ancho' | 'medio' | 'tercio'> = {
  hero: 'tercio', kpis: 'completo', metas: 'tercio', medidor: 'medio', progreso: 'tercio', actividad: 'medio',
  barras: 'medio', linea: 'medio', tabla: 'completo', mapa: 'completo', cohortes: 'medio', contabilidad: 'ancho',
  senales: 'completo', nota: 'completo', hallazgo: 'completo',
}
