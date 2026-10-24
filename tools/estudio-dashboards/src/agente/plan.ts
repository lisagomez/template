/**
 * El plan: lo ÚNICO que escribe el modelo. Clasifica la instrucción, dice qué entendió (métricas, dimensiones,
 * filtros, periodo, comparación) y, solo para MODIFICAR, las operaciones del parche con los ids que toca. Todo lo
 * demás lo hace el núcleo de forma determinista: armar un tablero nuevo, poner filtros, analizar una variación,
 * explicar una definición, proponer una alerta o una métrica. Así el modelo no inventa cifras: no escribe ninguna.
 */
import { z } from 'zod'
import { analizaVariacion, type AnalisisVariacion } from '../analisis.js'
import { proponeAlerta, type Alerta } from '../alertas.js'
import { alcanza, define, esSumable, metrica, tieneDesfase, type Catalogo, type Definicion } from '../catalogo.js'
import { ConsultaInvalida, type Consultor } from '../consulta.js'
import { ESQUEMA_DASHBOARD, ESQUEMA_PARCHE, TIPOS_INSTRUCCION, filtroEsquema, periodoEsquema, type Componente, type Dashboard, type Parche } from '../esquema.js'
import { aplicaParche, type Aplicado } from '../parche.js'
import { proponeMetrica, type Propuesta } from '../proponer.js'
import type { ErrorValidacion } from '../valida.js'

export const planEsquema = z.object({
  tipo: z.enum(TIPOS_INSTRUCCION),
  responde: z.boolean(),
  entendi: z.object({
    metricas: z.array(z.string().max(80)).max(8),
    dimensiones: z.array(z.string().max(80)).max(4).default([]),
    filtros: z.array(filtroEsquema).max(10).default([]),
    periodo: periodoEsquema.nullable().default(null),
    comparar: z.enum(['anio_anterior']).nullable().default(null),
  }),
  componentes: z.array(z.string().max(40)).max(24).default([]),
  operaciones: z.array(z.unknown()).max(20).default([]),
  quitar_filtros: z.array(z.string().max(80)).max(10).default([]),
  titulo: z.string().max(90).nullable().default(null),
  alerta: z.object({ condicion: z.enum(['cae_mas_de', 'sube_mas_de', 'debajo_de', 'encima_de']), valor: z.number().finite(), unidad: z.enum(['%', 'pp', 'valor']), ventana: z.enum(['diaria', 'semanal', 'mensual']) }).nullable().default(null),
  sin_metrica: z.object({ pedido: z.string().max(200), propuesta: z.unknown().nullable().default(null) }).nullable().default(null),
  resumen: z.string().max(300).default(''),
})
export type Plan = z.infer<typeof planEsquema>

export interface Resultado {
  readonly plan: Plan
  readonly parche: Parche | null
  readonly aplicado: Aplicado | null
  readonly explicacion: Definicion | null
  readonly analisis: AnalisisVariacion | null
  readonly alerta: Alerta | null
  readonly propuesta: Propuesta | null
  readonly errores: readonly ErrorValidacion[]
}

const e = (codigo: ErrorValidacion['codigo'], ruta: string, mensaje: string): ErrorValidacion => ({ codigo, ruta, mensaje })

/** Lo entendido tiene que existir en el catálogo: métricas, dimensiones alcanzables, filtros válidos. */
export function validaEntendi(cat: Catalogo, p: Plan): ErrorValidacion[] {
  if (!p.responde) return p.sin_metrica ? [] : [e('esquema', 'sin_metrica', 'si no responde, sin_metrica dice qué se pidió')]
  const errores: ErrorValidacion[] = []
  const ms = p.entendi.metricas.map((n) => ({ n, m: metrica(cat, n) }))
  if (!ms.length) errores.push(e('esquema', 'entendi.metricas', 'falta la métrica'))
  for (const { n, m } of ms) if (!m) errores.push(e('metrica_inexistente', 'entendi.metricas', `«${n}» no existe en el catálogo: usa un nombre exacto, o responde false si no hay métrica`))
  for (const d of p.entendi.dimensiones) if (!ms.some(({ m }) => m && alcanza(m, d))) errores.push(e('dimension_invalida', 'entendi.dimensiones', `ninguna métrica entendida alcanza «${d}»`))
  for (const f of p.entendi.filtros) {
    if (!ms.some(({ m }) => m && alcanza(m, f.dimension))) errores.push(e('dimension_invalida', 'entendi.filtros', `ninguna métrica entendida se puede filtrar por «${f.dimension}»`))
    const dom = cat.dominios.get(f.dimension)
    const fuera = dom ? f.valores.filter((v) => !dom.some((x) => x.toLowerCase() === String(v).toLowerCase())) : []
    if (fuera.length) errores.push(e('valor_fuera_de_dominio', 'entendi.filtros', `«${fuera.join('», «')}» no es valor de ${f.dimension}`))
  }
  if (p.tipo === 'alertar' && !p.alerta) errores.push(e('esquema', 'alerta', 'una alerta necesita condición, valor, unidad y ventana'))
  return errores
}

/** CREAR: KPI, tendencia y desglose con lo entendido. Las métricas con desfase no van al KPI (sumarían un año de más). */
export function tableroNuevo(cat: Catalogo, p: Plan, actual: Dashboard): Dashboard {
  const ms = p.entendi.metricas
  const kpi = ms.filter((m) => !tieneDesfase(cat, m)).slice(0, 4)
  const tiempo = p.entendi.dimensiones.find((d) => d.startsWith('metric_time__'))
  const cats = p.entendi.dimensiones.filter((d) => !d.startsWith('metric_time__'))
  const comparar = p.entendi.comparar ? { comparar: p.entendi.comparar } : {}
  const componentes: Componente[] = []
  if (kpi.length === 1) componentes.push({ id: 'principal', tipo: 'hero', metrica: kpi[0]!, ...comparar })
  if (kpi.length > 1) componentes.push({ id: 'kpis', tipo: 'kpis', metricas: kpi, ...comparar })
  componentes.push({ id: 'tendencia', tipo: 'linea', metrica: ms[0]!, grano: (tiempo?.split('__')[1] as 'month' | undefined) ?? 'month', ...(cats[0] ? { serie: cats[0] } : {}) })
  for (const [i, d] of cats.slice(0, 2).entries()) {
    componentes.push(ms.length > 1 ? { id: `desglose_${i + 1}`, tipo: 'tabla', metricas: ms.slice(0, 6), dimension: d } : { id: `desglose_${i + 1}`, tipo: 'barras', metrica: ms[0]!, dimension: d, ...comparar })
  }
  const etiquetas = ms.map((m) => metrica(cat, m)?.etiqueta ?? m).join(', ')
  return {
    esquema: ESQUEMA_DASHBOARD, titulo: (p.titulo ?? `Tablero de ${etiquetas}`).slice(0, 90),
    filtros: { periodo: p.entendi.periodo ?? actual.filtros.periodo, ...comparar, dimensiones: p.entendi.filtros },
    componentes,
  }
}

function operacionesDe(cat: Catalogo, p: Plan, actual: Dashboard): { operaciones: unknown[]; componentes: string[] } {
  if (p.tipo === 'crear') {
    const propia = p.operaciones.find((o) => (o as { op?: string }).op === 'reemplazar')
    return { operaciones: [propia ?? { op: 'reemplazar', dashboard: tableroNuevo(cat, p, actual) }], componentes: [] }
  }
  if (p.tipo === 'filtrar') {
    const ops: unknown[] = []
    if (p.entendi.filtros.length || p.quitar_filtros.length) ops.push({ op: 'filtrar', agregar: p.entendi.filtros, quitar: p.quitar_filtros })
    if (p.entendi.periodo || p.entendi.comparar) ops.push({ op: 'periodo', periodo: p.entendi.periodo ?? actual.filtros.periodo, comparar: p.entendi.comparar ?? undefined })
    return { operaciones: ops, componentes: [] }
  }
  const nuevos = p.operaciones.flatMap((o) => { const c = (o as { op?: string; componente?: { id?: string } }); return c.op === 'agregar' && c.componente?.id ? [c.componente.id] : [] })
  return { operaciones: p.operaciones, componentes: [...new Set([...p.componentes, ...nuevos])] }
}

/**
 * MODIFICAR: «lo que entendí» lleva el eje de tiempo de cada línea que el cambio deja tocada (las dimensiones son las
 * de lo que queda en los componentes tocados, y el modelo suele omitir el tiempo). Lo completa el núcleo desde el
 * tablero ya parchado, no el modelo. Visto en la medición del 2026-10-20 (q020, q027); se mide en un set nuevo.
 */
export function conEjeDeTiempo(p: Plan, a: Aplicado): Plan {
  const tiempos = a.tocados.flatMap((id) => {
    const c = a.dashboard.componentes.find((x) => x.id === id)
    return c?.tipo === 'linea' ? [`metric_time__${c.grano ?? 'month'}`] : []
  })
  const dimensiones = [...new Set([...p.entendi.dimensiones, ...tiempos])].slice(0, 4)
  return dimensiones.length === p.entendi.dimensiones.length ? p : { ...p, entendi: { ...p.entendi, dimensiones } }
}

const vacio = (plan: Plan, errores: ErrorValidacion[] = []): Resultado => ({ plan, parche: null, aplicado: null, explicacion: null, analisis: null, alerta: null, propuesta: null, errores })

async function analiza(x: Consultor, p: Plan, actual: Dashboard, version: number): Promise<Resultado> {
  const n = p.entendi.metricas[0]!
  const usados = new Set(actual.componentes.map((c) => c.id))
  let k = 1
  while (usados.has(`hallazgo_${k}`)) k++
  let analisis: AnalisisVariacion
  try {
    analisis = await analizaVariacion(x, { metrica: n, periodo: p.entendi.periodo ?? actual.filtros.periodo, filtros: p.entendi.filtros, id: `hallazgo_${k}` })
  } catch (error) {
    if (error instanceof ConsultaInvalida) return vacio(p, [...error.errores])
    throw error
  }
  const parche: Parche = { esquema: ESQUEMA_PARCHE, base: version, alcance: { tipo: 'analizar', componentes: [analisis.hallazgo.id] }, operaciones: [{ op: 'agregar', componente: analisis.hallazgo, despues_de: actual.componentes[0]?.id ?? null }] }
  const r = aplicaParche(x.catalogo, actual, version, parche)
  return { ...vacio(p, r.ok ? [] : [...r.errores]), parche, aplicado: r.ok ? r.valor : null, analisis }
}

/** Ejecuta el plan EN SECO: valida, arma el parche, consulta lo que haga falta. Registrar la versión es aparte. */
export async function ejecutaPlan(x: Consultor, p: Plan, actual: Dashboard, version: number): Promise<Resultado> {
  const cat = x.catalogo
  const errores = validaEntendi(cat, p)
  if (errores.length) return vacio(p, errores)
  if (!p.responde) {
    const propuesta = p.sin_metrica?.propuesta ? proponeMetrica(cat, p.sin_metrica.propuesta) : null
    return { ...vacio(p), propuesta: propuesta?.ok ? propuesta.valor : null }
  }
  if (p.tipo === 'explicar') return { ...vacio(p), explicacion: define(cat, p.entendi.metricas[0]!) ?? null }
  if (p.tipo === 'alertar') {
    const a = proponeAlerta(cat, { metrica: p.entendi.metricas[0], filtros: p.entendi.filtros, ...p.alerta })
    return a.ok ? { ...vacio(p), alerta: a.valor } : vacio(p, [...a.errores])
  }
  if (p.tipo === 'analizar') return analiza(x, p, actual, version)
  const { operaciones, componentes } = operacionesDe(cat, p, actual)
  if (!operaciones.length) return vacio(p, [e('esquema', 'operaciones', `una instrucción de tipo ${p.tipo} necesita cambiar algo`)])
  const parche = { esquema: ESQUEMA_PARCHE, base: version, alcance: { tipo: p.tipo, componentes }, operaciones } as Parche
  const r = aplicaParche(cat, actual, version, parche)
  if (!r.ok) return { ...vacio(p, [...r.errores]), parche }
  return { ...vacio(p.tipo === 'modificar' ? conEjeDeTiempo(p, r.valor) : p), parche, aplicado: r.valor }
}

export { esSumable }
