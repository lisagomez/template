/**
 * Puntuar una vuelta del agente contra la respuesta esperada del set de referencia, tal como lo fija
 * `evaluacion/CONTRATO.md` (escrito antes del set y del prompt): todo lo que el esperado declara tiene que
 * coincidir —o una de sus alternativas—, y el parche, si lo hay, tiene que validar. Los aciertos por campo se
 * devuelven aparte, como diagnóstico; el número final no da medio punto.
 */
import type { FiltroDashboard, PeriodoDashboard, TipoInstruccion } from './esquema.js'
import type { Vuelta } from './agente/agente.js'

export interface Esperado {
  readonly responde: boolean
  readonly metricas: readonly string[]
  readonly dimensiones?: readonly string[] | null
  readonly filtros?: readonly FiltroDashboard[] | null
  readonly periodo?: PeriodoDashboard | null
  readonly comparar?: 'anio_anterior' | null
  readonly componentes_tocados?: readonly string[] | null
  readonly alerta?: { readonly condicion: string; readonly valor: number; readonly unidad: string; readonly ventana: string } | null
}

export interface Pregunta {
  readonly id: string
  readonly tipo: TipoInstruccion
  readonly particion: 'desarrollo' | 'retenida'
  readonly tablero: string
  readonly seleccion?: { readonly dimension: string; readonly valores: readonly string[] } | null
  readonly instruccion: string
  readonly esperado: Esperado
  readonly alternativas?: readonly Esperado[]
}

export interface Puntaje { readonly correcta: boolean; readonly campos: Readonly<Record<string, boolean>>; readonly alternativa: number | null }

const conjunto = (xs: readonly string[] | null | undefined) => JSON.stringify([...new Set(xs ?? [])].sort())
const norm = (s: unknown) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** igual ≡ en con un valor; distinto ≡ no_en con un valor; valores sin mayúsculas ni tildes y ordenados. */
export function normalizaFiltros(fs: readonly FiltroDashboard[] | null | undefined): string {
  return JSON.stringify((fs ?? []).map((f) => {
    const op = f.operador === 'igual' ? 'en' : f.operador === 'distinto' ? 'no_en' : f.operador
    return `${f.dimension}|${op}|${[...f.valores].map(norm).sort().join(',')}`
  }).sort())
}

/** Los ids tocados, con los agregados contados como `+nuevo` (el agente les pone el id que quiera). */
function tocadosDe(v: Vuelta, base: readonly string[]): string[] {
  return (v.resultado?.aplicado?.tocados ?? []).map((id) => (base.includes(id) ? id : '+nuevo'))
}

/**
 * Qué se compara en cada tipo: la tabla «Los seis tipos» del contrato (congelado con el set, 734f32f). La primera
 * versión de este puntuador comparaba métricas y dimensiones en TODOS los tipos (la regla general del contrato leída
 * sin su tabla); se corrigió al contrato el 2026-10-20, tras la primera corrida de la partición de desarrollo, y el
 * set no se tocó. Queda en el reporte de decisiones.
 */
export const COMPARA: Readonly<Record<TipoInstruccion, readonly string[]>> = {
  crear: ['metricas', 'dimensiones', 'filtros', 'periodo', 'comparar'],
  modificar: ['metricas', 'dimensiones', 'filtros', 'periodo', 'comparar', 'tocados'],
  filtrar: ['filtros', 'periodo', 'comparar'],
  analizar: ['metricas', 'periodo', 'filtros'],
  explicar: ['metricas'],
  alertar: ['metricas', 'filtros', 'alerta'],
}

function campos(q: Pregunta, e: Esperado, v: Vuelta, base: readonly string[]): Record<string, boolean> {
  const p = v.plan
  const c: Record<string, boolean> = { tipo: p?.tipo === q.tipo, responde: p?.responde === e.responde, valido: v.error === null }
  if (!p || !e.responde || !p.responde) return c
  const toca = new Set(COMPARA[q.tipo])
  if (toca.has('metricas')) c['metricas'] = conjunto(p.entendi.metricas) === conjunto(e.metricas)
  if (toca.has('dimensiones')) c['dimensiones'] = conjunto(p.entendi.dimensiones) === conjunto(e.dimensiones)
  if (toca.has('filtros')) c['filtros'] = normalizaFiltros(p.entendi.filtros) === normalizaFiltros(e.filtros)
  if (toca.has('periodo') && e.periodo) c['periodo'] = p.entendi.periodo?.desde === e.periodo.desde && p.entendi.periodo?.hasta === e.periodo.hasta
  if (toca.has('comparar') && e.comparar) c['comparar'] = p.entendi.comparar === e.comparar
  if (toca.has('tocados') && e.componentes_tocados) c['tocados'] = JSON.stringify(tocadosDe(v, base).sort()) === JSON.stringify([...e.componentes_tocados].sort())
  if (toca.has('alerta') && e.alerta) {
    const a = p.alerta
    c['alerta'] = !!a && a.condicion === e.alerta.condicion && Math.abs(a.valor - e.alerta.valor) < 1e-9 && a.unidad === e.alerta.unidad && a.ventana === e.alerta.ventana
  }
  return c
}

export function puntua(q: Pregunta, v: Vuelta, idsBase: readonly string[]): Puntaje {
  const opciones = [q.esperado, ...(q.alternativas ?? [])]
  let mejor: { campos: Record<string, boolean>; i: number } | null = null
  for (const [i, e] of opciones.entries()) {
    const c = campos(q, e, v, idsBase)
    const aciertos = Object.values(c).filter(Boolean).length
    if (Object.values(c).every(Boolean)) return { correcta: true, campos: c, alternativa: i === 0 ? null : i - 1 }
    if (!mejor || aciertos > Object.values(mejor.campos).filter(Boolean).length) mejor = { campos: c, i }
  }
  return { correcta: false, campos: mejor!.campos, alternativa: null }
}
