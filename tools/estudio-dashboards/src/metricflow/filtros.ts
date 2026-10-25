/**
 * Filtros estructurados → la plantilla de filtros de MetricFlow. Aquí no entra texto libre: el nombre de la
 * dimensión tiene que tener forma de nombre calificado y cada valor se escapa. Que la dimensión EXISTA y que el
 * valor sea del dominio lo valida el núcleo contra el catálogo antes de llegar aquí; esto es la segunda puerta.
 */
import type { ConsultaSemantica, Filtro, ValorFiltro } from '../puerto.js'

const NOMBRE = /^[a-z_][a-z0-9_]*$/
const MES = /^\d{4}-(0[1-9]|1[0-2])$/

const OPERADOR: Record<Filtro['operador'], string> = {
  igual: '=', distinto: '<>', en: 'in', no_en: 'not in', mayor: '>', menor: '<', mayor_igual: '>=', menor_igual: '<=',
}

export function literal(v: ValorFiltro): string {
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`valor numérico inválido: ${v}`)
    return String(v)
  }
  return `'${v.replace(/'/g, "''")}'`
}

export function filtroMetricFlow(f: Filtro): string {
  if (!NOMBRE.test(f.dimension)) throw new Error(`nombre de dimensión inválido: ${JSON.stringify(f.dimension)}`)
  if (f.valores.length === 0) throw new Error(`filtro sin valores sobre ${f.dimension}`)
  const dim = `{{ Dimension('${f.dimension}') }}`
  if (f.operador === 'en' || f.operador === 'no_en') return `${dim} ${OPERADOR[f.operador]} (${f.valores.map(literal).join(', ')})`
  if (f.valores.length !== 1) throw new Error(`el operador ${f.operador} lleva un solo valor`)
  return `${dim} ${OPERADOR[f.operador]} ${literal(f.valores[0] as ValorFiltro)}`
}

export function dondeMetricFlow(c: ConsultaSemantica): string[] {
  const donde: string[] = []
  if (c.periodo) {
    const { desde, hasta } = c.periodo
    if (!MES.test(desde) || !MES.test(hasta)) throw new Error(`periodo inválido: ${desde}..${hasta}`)
    const t = "{{ TimeDimension('metric_time', 'month') }}"
    donde.push(`${t} >= '${desde}-01'`, `${t} <= '${hasta}-01'`)
  }
  for (const f of c.filtros ?? []) donde.push(filtroMetricFlow(f))
  return donde
}

export function ordenMetricFlow(c: ConsultaSemantica): string[] {
  return (c.orden ?? []).map((o) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(o.campo)) throw new Error(`campo de orden inválido: ${o.campo}`)
    return `${o.desc ? '-' : ''}${o.campo}`
  })
}
