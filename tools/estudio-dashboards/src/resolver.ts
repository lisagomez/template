/**
 * De la especificación a los datos de cada componente, SOLO por el consultor (capa semántica).
 *
 * Reglas que aquí se cumplen y que el lienzo da por hechas:
 *   - un filtro global se aplica a cada métrica que alcanza su dimensión; a la que no, se omite Y se dice;
 *   - la selección del mapa filtra todo menos el propio mapa (que la resalta);
 *   - comparar con el año anterior = la MISMA métrica con el periodo corrido 12 meses (dos consultas), nunca una
 *     métrica con desfase sobre un periodo largo (ver la trampa medida en la tabla de cifras);
 *   - ningún total se suma en el cliente: cada valor de un KPI es su propia consulta. La única aritmética local es
 *     la variación entre dos cifras de la capa y la participación de una métrica SUMABLE (validada antes).
 */
import { alcanza, metrica, unidadDe, type Catalogo } from './catalogo.js'
import type { Consultor, Respuesta } from './consulta.js'
import { dimensionesDe, metricasDe, type Comparar, type Componente, type Dashboard, type PeriodoDashboard } from './esquema.js'
import type { Celda, ConsultaSemantica, Filtro } from './puerto.js'

export interface ValorKpi { readonly metrica: string; readonly valor: number | null; readonly anterior: number | null; readonly variacion: number | null; readonly tipoVariacion: '%' | 'pp' | null; readonly unidad: string }
export interface Fila { readonly clave: string; readonly valores: Readonly<Record<string, number | null>>; readonly anteriores: Readonly<Record<string, number | null>> }
export interface Punto { readonly x: string; readonly y: number | null }
export interface Serie { readonly nombre: string; readonly metrica: string; readonly puntos: readonly Punto[]; readonly anterior: readonly Punto[] }
export type Forma =
  | { readonly tipo: 'valores'; readonly valores: readonly ValorKpi[] }
  | { readonly tipo: 'filas'; readonly dimension: string; readonly metricas: readonly string[]; readonly filas: readonly Fila[] }
  | { readonly tipo: 'series'; readonly series: readonly Serie[] }
  | { readonly tipo: 'vacio' }
export interface DatosComponente { readonly id: string; readonly forma: Forma; readonly consultas: readonly Respuesta[]; readonly advertencias: readonly string[]; readonly error: string | null }
export interface DatosTablero { readonly componentes: Readonly<Record<string, DatosComponente>>; readonly ms: number; readonly consultas: number; readonly desdeCache: number }
export interface OpcionesResolver {
  /** Dimensión con geografía para el mapa cuando el componente no la nombra (la da el catálogo geográfico). */
  readonly dimensionMapa?: string
  /** Capa del mapa → métrica que la sostiene (p. ej. reorden → combinaciones_bajo_reorden). Sin entrada: sin datos. */
  readonly capasMapa?: Readonly<Partial<Record<'reorden' | 'cobertura', string>>>
}

const num = (v: Celda | undefined): number | null => (v === null || v === undefined || v === '' ? null : Number(v))
const mesDe = (v: Celda | undefined) => String(v ?? '').slice(0, 7)

export function corre(p: PeriodoDashboard, comparar: Comparar): PeriodoDashboard {
  const aMes = (s: string) => { const [a, m] = s.split('-').map(Number) as [number, number]; return a * 12 + (m - 1) }
  const deMes = (n: number) => `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`
  const largo = aMes(p.hasta) - aMes(p.desde) + 1
  const salto = comparar === 'anio_anterior' ? 12 : largo
  return { desde: deMes(aMes(p.desde) - salto), hasta: deMes(aMes(p.hasta) - salto) }
}

export function variacion(valor: number | null, anterior: number | null, unidad: string): { variacion: number | null; tipo: '%' | 'pp' | null } {
  if (valor === null || anterior === null) return { variacion: null, tipo: null }
  if (unidad === '%') return { variacion: valor - anterior, tipo: 'pp' }
  return anterior === 0 ? { variacion: null, tipo: null } : { variacion: 100 * (valor / anterior - 1), tipo: '%' }
}

/** Filtros que aplican a una métrica; los que no alcanza se devuelven aparte para decirlo. */
export function filtrosPara(cat: Catalogo, c: Componente, d: Dashboard, nombre: string): { filtros: Filtro[]; omitidos: string[] } {
  const m = metrica(cat, nombre)
  const sel: Filtro[] = d.seleccion && c.tipo !== 'mapa' ? [{ dimension: d.seleccion.dimension, operador: 'en', valores: d.seleccion.valores }] : []
  const todos = [...d.filtros.dimensiones, ...(c.filtros ?? []), ...sel]
  const filtros = todos.filter((f) => m && alcanza(m, f.dimension))
  return { filtros, omitidos: todos.filter((f) => !filtros.includes(f)).map((f) => f.dimension) }
}

interface Ctx { readonly consultor: Consultor; readonly c: Componente; readonly d: Dashboard; readonly periodo: PeriodoDashboard; readonly comparar: Comparar | null; readonly consultas: Respuesta[]; readonly advertencias: string[] }

async function pide(x: Ctx, nombre: string, agrupar: string[], periodo: PeriodoDashboard): Promise<Respuesta> {
  const { filtros, omitidos } = filtrosPara(x.consultor.catalogo, x.c, x.d, nombre)
  for (const o of omitidos) {
    const aviso = `el filtro «${o}» no aplica a «${nombre}» (la métrica no alcanza esa dimensión): se omite`
    if (!x.advertencias.includes(aviso)) x.advertencias.push(aviso)
  }
  const q: ConsultaSemantica = { metricas: [nombre], agrupar, filtros, periodo }
  const r = await x.consultor.consulta(q)
  x.consultas.push(r)
  return r
}

const columna = (r: Respuesta, nombre: string) => r.columnas.indexOf(nombre)

async function valores(x: Ctx, nombres: readonly string[]): Promise<Forma> {
  const salida: ValorKpi[] = []
  for (const n of nombres) {
    const unidad = unidadDe(metrica(x.consultor.catalogo, n)!)
    const r = await pide(x, n, [], x.periodo)
    const valor = num(r.filas[0]?.[columna(r, n)])
    const anterior = x.comparar ? num((await pide(x, n, [], corre(x.periodo, x.comparar))).filas[0]?.[0]) : null
    const v = variacion(valor, anterior, unidad)
    salida.push({ metrica: n, valor, anterior, variacion: v.variacion, tipoVariacion: v.tipo, unidad })
  }
  return { tipo: 'valores', valores: salida }
}

async function filas(x: Ctx, nombres: readonly string[], dimension: string, top?: number, ascendente = false): Promise<Forma> {
  const porClave = new Map<string, { valores: Record<string, number | null>; anteriores: Record<string, number | null> }>()
  const toma = (r: Respuesta, n: string, campo: 'valores' | 'anteriores') => {
    for (const f of r.filas) {
      const clave = String(f[columna(r, dimension)] ?? '∅')
      const e = porClave.get(clave) ?? { valores: {}, anteriores: {} }
      e[campo][n] = num(f[columna(r, n)])
      porClave.set(clave, e)
    }
  }
  for (const n of nombres) {
    toma(await pide(x, n, [dimension], x.periodo), n, 'valores')
    if (x.comparar) toma(await pide(x, n, [dimension], corre(x.periodo, x.comparar)), n, 'anteriores')
  }
  const primera = nombres[0] ?? ''
  const ordenadas = [...porClave.entries()].map(([clave, e]) => ({ clave, ...e }))
    .sort((a, b) => ((b.valores[primera] ?? -Infinity) - (a.valores[primera] ?? -Infinity)) * (ascendente ? -1 : 1))
  return { tipo: 'filas', dimension, metricas: [...nombres], filas: top ? ordenadas.slice(0, top) : ordenadas }
}

function aSeries(r: Respuesta, n: string, eje: string, serie: string | undefined): Map<string, Punto[]> {
  const salida = new Map<string, Punto[]>()
  for (const f of r.filas) {
    const nombre = serie ? String(f[columna(r, serie)] ?? '∅') : n
    salida.set(nombre, [...(salida.get(nombre) ?? []), { x: mesDe(f[columna(r, eje)]), y: num(f[columna(r, n)]) }])
  }
  for (const pts of salida.values()) pts.sort((a, b) => a.x.localeCompare(b.x))
  return salida
}

async function series(x: Ctx, nombres: readonly string[], grano: string, serie?: string): Promise<Forma> {
  const eje = `metric_time__${grano}`
  const salida: Serie[] = []
  for (const n of nombres) {
    const agrupar = serie ? [eje, serie] : [eje]
    const actual = aSeries(await pide(x, n, agrupar, x.periodo), n, eje, serie)
    const previo = x.comparar ? aSeries(await pide(x, n, agrupar, corre(x.periodo, x.comparar)), n, eje, serie) : new Map<string, Punto[]>()
    for (const [nombre, puntos] of actual) salida.push({ nombre, metrica: n, puntos, anterior: previo.get(nombre) ?? [] })
  }
  return { tipo: 'series', series: salida }
}

function forma(x: Ctx, o: OpcionesResolver): Promise<Forma> {
  const c = x.c
  switch (c.tipo) {
    case 'hero': case 'medidor': return valores(x, [c.metrica])
    case 'kpis': return valores(x, c.metricas)
    case 'metas': return valores({ ...x, comparar: null }, c.metas.map((m) => m.metrica))
    case 'progreso': return filas({ ...x, comparar: null }, [c.metrica], c.dimension)
    case 'actividad': return filas(x, [c.metrica], c.dimension, c.top ?? 10)
    case 'barras': return filas(x, [c.metrica], c.dimension, c.top, c.orden === 'asc')
    case 'tabla': return filas({ ...x, comparar: null }, c.metricas, c.dimension, c.top, c.orden === 'asc')
    case 'mapa': {
      const dim = c.dimension ?? o.dimensionMapa
      if (!dim) throw new Error('el mapa no tiene dimensión geográfica: nómbrala o inyecta el catálogo geográfico')
      const capas = (c.capas ?? []).flatMap((k) => (k === 'reorden' || k === 'cobertura') && o.capasMapa?.[k] ? [o.capasMapa[k] as string] : [])
      return filas({ ...x, comparar: x.comparar ?? 'anio_anterior' }, [c.metrica, ...capas], dim)
    }
    case 'linea': return series(x, [c.metrica], c.grano ?? 'month', c.serie)
    case 'cohortes': return series({ ...x, comparar: null }, [c.metrica], 'month', c.serie)
    case 'contabilidad': return series({ ...x, comparar: null }, [...c.entradas, ...c.salidas], 'month')
    default: return Promise.resolve({ tipo: 'vacio' })
  }
}

export async function resuelveComponente(consultor: Consultor, d: Dashboard, c: Componente, o: OpcionesResolver = {}): Promise<DatosComponente> {
  const comparar = ('comparar' in c ? c.comparar : undefined) ?? d.filtros.comparar ?? null
  const x: Ctx = { consultor, c, d, periodo: c.periodo ?? d.filtros.periodo, comparar, consultas: [], advertencias: [] }
  try {
    return { id: c.id, forma: await forma(x, o), consultas: x.consultas, advertencias: x.advertencias, error: null }
  } catch (e) {
    return { id: c.id, forma: { tipo: 'vacio' }, consultas: x.consultas, advertencias: x.advertencias, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function resuelve(consultor: Consultor, d: Dashboard, o: OpcionesResolver = {}): Promise<DatosTablero> {
  const t = performance.now()
  const componentes: Record<string, DatosComponente> = {}
  for (const c of d.componentes) componentes[c.id] = await resuelveComponente(consultor, d, c, o)
  const todas = Object.values(componentes).flatMap((x) => x.consultas)
  return { componentes, ms: performance.now() - t, consultas: todas.length, desdeCache: todas.filter((r) => r.desdeCache).length }
}

/** Las cifras de un componente como pares clave → valor, para comparar dos versiones. */
export function cifrasDe(dc: DatosComponente): Map<string, number | null> {
  const f = dc.forma
  if (f.tipo === 'valores') return new Map(f.valores.map((v) => [v.metrica, v.valor]))
  if (f.tipo === 'filas') return new Map(f.filas.flatMap((r) => f.metricas.map((m) => [`${m} · ${r.clave}`, r.valores[m] ?? null] as [string, number | null])))
  if (f.tipo === 'series') return new Map(f.series.flatMap((s) => s.puntos.map((p) => [`${s.metrica} · ${s.nombre} · ${p.x}`, p.y] as [string, number | null])))
  return new Map()
}

export interface CambioCifra { readonly componente: string; readonly clave: string; readonly antes: number | null; readonly despues: number | null }

/** Qué cifras cambiaron entre dos resoluciones (componentes con el mismo id). */
export function comparaCifras(a: DatosTablero, b: DatosTablero): CambioCifra[] {
  const cambios: CambioCifra[] = []
  for (const [id, db] of Object.entries(b.componentes)) {
    const da = a.componentes[id]
    if (!da) continue
    const [ca, cb] = [cifrasDe(da), cifrasDe(db)]
    for (const clave of new Set([...ca.keys(), ...cb.keys()])) {
      const [antes, despues] = [ca.get(clave) ?? null, cb.get(clave) ?? null]
      if (antes !== despues) cambios.push({ componente: id, clave, antes, despues })
    }
  }
  return cambios
}

export { dimensionesDe, metricasDe }
