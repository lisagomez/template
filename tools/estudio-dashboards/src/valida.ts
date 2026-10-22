/**
 * Validación contra el catálogo: lo que el esquema no puede saber. Un dashboard pasa solo si cada métrica existe,
 * cada dimensión es alcanzable por las métricas que la usan, cada valor de filtro es del dominio y ningún componente
 * pide a una métrica algo que la hace mentir (sumar lo que no suma, usar un desfase sobre un periodo largo).
 * El error dice QUÉ y DÓNDE, para que el agente lo pueda corregir o el usuario entenderlo.
 */
import { alcanza, esSumable, esTiempo, metrica, tieneDesfase, type Catalogo } from './catalogo.js'
import { dashboardEsquema, dimensionesDe, metricasDe, type Componente, type Dashboard, type FiltroDashboard } from './esquema.js'

export type CodigoError =
  | 'esquema' | 'sql_libre' | 'metrica_inexistente' | 'dimension_invalida' | 'valor_fuera_de_dominio'
  | 'no_sumable' | 'desfase_en_periodo' | 'alcance' | 'version' | 'operacion_no_permitida' | 'componente_inexistente'

export interface ErrorValidacion { readonly codigo: CodigoError; readonly ruta: string; readonly mensaje: string }

export type Validado<T> = { readonly ok: true; readonly valor: T } | { readonly ok: false; readonly errores: readonly ErrorValidacion[] }

const PARECE_SQL = /\b(select\s[\s\S]*\bfrom|insert\s+into|update\s+\w+\s+set|delete\s+from|drop\s+table|union\s+select)\b|;\s*--/i
const CLAVES_SQL = new Set(['sql', 'query', 'consulta_sql', 'raw_sql', 'where'])

/** El Estudio no acepta SQL en ninguna forma: ni como campo, ni escondido en un texto o un valor. */
export function buscaSql(x: unknown, ruta = ''): ErrorValidacion[] {
  if (typeof x === 'string') return PARECE_SQL.test(x) ? [{ codigo: 'sql_libre', ruta, mensaje: 'el texto parece SQL: el Estudio solo pide métricas por nombre' }] : []
  if (Array.isArray(x)) return x.flatMap((v, i) => buscaSql(v, `${ruta}[${i}]`))
  if (x && typeof x === 'object') {
    return Object.entries(x).flatMap(([k, v]) => CLAVES_SQL.has(k.toLowerCase())
      ? [{ codigo: 'sql_libre' as const, ruta: `${ruta}.${k}`, mensaje: `campo «${k}»: el Estudio no acepta SQL libre, solo métricas por nombre` }]
      : buscaSql(v, `${ruta}.${k}`))
  }
  return []
}

const normal = (v: unknown) => String(v).toLowerCase()

export function validaFiltro(cat: Catalogo, f: FiltroDashboard, metricas: readonly string[], ruta: string): ErrorValidacion[] {
  const alcanzan = metricas.filter((n) => { const m = metrica(cat, n); return m ? alcanza(m, f.dimension) : false })
  if (metricas.length && !alcanzan.length) return [{ codigo: 'dimension_invalida', ruta, mensaje: `ninguna métrica del tablero alcanza la dimensión «${f.dimension}»` }]
  if (!metricas.length && ![...cat.metricas.values()].some((m) => alcanza(m, f.dimension))) return [{ codigo: 'dimension_invalida', ruta, mensaje: `la dimensión «${f.dimension}» no existe en el catálogo` }]
  const dominio = cat.dominios.get(f.dimension)
  if (!dominio) return []
  if (['mayor', 'menor', 'mayor_igual', 'menor_igual'].includes(f.operador)) {
    return dominio.every((v) => Number.isFinite(Number(v))) ? [] : [{ codigo: 'valor_fuera_de_dominio', ruta, mensaje: `«${f.dimension}» no es numérica: no admite ${f.operador}` }]
  }
  const conocidos = new Set(dominio.map(normal))
  const fuera = f.valores.filter((v) => !conocidos.has(normal(v)))
  return fuera.length ? [{ codigo: 'valor_fuera_de_dominio', ruta, mensaje: `«${fuera.join('», «')}» no es un valor de ${f.dimension} (valores: ${dominio.slice(0, 25).join(', ')}${dominio.length > 25 ? '…' : ''})` }] : []
}

const meses = (p: { desde: string; hasta: string }) => {
  const [a1, m1] = p.desde.split('-').map(Number) as [number, number]
  const [a2, m2] = p.hasta.split('-').map(Number) as [number, number]
  return (a2 - a1) * 12 + (m2 - m1) + 1
}

function validaMetricas(cat: Catalogo, c: Componente, d: Dashboard, ruta: string): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []
  for (const n of metricasDe(c)) {
    const m = metrica(cat, n)
    if (!m) { errores.push({ codigo: 'metrica_inexistente', ruta, mensaje: `la métrica «${n}» no existe en el catálogo; no se inventa: se puede proponer` }); continue }
    for (const dim of dimensionesDe(c)) if (!alcanza(m, dim)) errores.push({ codigo: 'dimension_invalida', ruta, mensaje: `«${n}» no se puede cortar por «${dim}»` })
    const periodo = c.periodo ?? d.filtros.periodo
    const sinEjeTiempo = ['hero', 'kpis', 'metas', 'medidor', 'progreso', 'actividad', 'mapa'].includes(c.tipo)
    if (tieneDesfase(cat, n) && sinEjeTiempo && meses(periodo) > 1) {
      errores.push({ codigo: 'desfase_en_periodo', ruta, mensaje: `«${n}» lleva desfase de un año: sobre ${meses(periodo)} meses compara contra el año anterior completo. Úsala en una línea por mes, o compara periodos con «comparar: anio_anterior»` })
    }
    if (c.tipo === 'progreso' && !esSumable(cat, n, 'categorica')) {
      errores.push({ codigo: 'no_sumable', ruta, mensaje: `«${n}» no se suma entre categorías: una participación por «${c.dimension}» no daría 100 %` })
    }
  }
  return errores
}

function validaComponente(cat: Catalogo, c: Componente, d: Dashboard, i: number): ErrorValidacion[] {
  const ruta = `componentes[${i}](${c.id})`
  const errores = validaMetricas(cat, c, d, ruta)
  const ms = metricasDe(c)
  for (const [j, f] of (c.filtros ?? []).entries()) errores.push(...validaFiltro(cat, f, ms, `${ruta}.filtros[${j}]`))
  if ((c.tipo === 'linea' || c.tipo === 'cohortes') && c.serie && esTiempo(c.serie)) errores.push({ codigo: 'dimension_invalida', ruta, mensaje: 'la serie de una línea es categórica; el tiempo ya es el eje' })
  return errores
}

export function validaDashboard(cat: Catalogo, entrada: unknown): Validado<Dashboard> {
  const sql = buscaSql(entrada, 'dashboard')
  if (sql.length) return { ok: false, errores: sql }
  const r = dashboardEsquema.safeParse(entrada)
  if (!r.success) return { ok: false, errores: r.error.issues.map((e) => ({ codigo: 'esquema' as const, ruta: e.path.join('.'), mensaje: e.message })) }
  const d = r.data
  const todas = [...new Set(d.componentes.flatMap(metricasDe))]
  const errores = d.componentes.flatMap((c, i) => validaComponente(cat, c, d, i))
  for (const [j, f] of d.filtros.dimensiones.entries()) errores.push(...validaFiltro(cat, f, todas, `filtros.dimensiones[${j}]`))
  if (d.seleccion) errores.push(...validaFiltro(cat, { dimension: d.seleccion.dimension, operador: 'en', valores: d.seleccion.valores }, todas, 'seleccion'))
  return errores.length ? { ok: false, errores } : { ok: true, valor: d }
}
