/**
 * Aplicar un parche: la única forma en que el tablero cambia, la escriba el agente o una persona con clics.
 *
 * Contra «el merge silencioso» hay tres cerrojos, en este orden:
 *   1. cada tipo de instrucción admite solo ciertas operaciones (un FILTRAR no toca componentes; un ANALIZAR solo agrega);
 *   2. lo que el parche toca tiene que estar en su `alcance` declarado (lo que la instrucción pidió): si toca de más,
 *      se rechaza entero, no se aplica a medias;
 *   3. después de aplicar se COMPRUEBA que cada componente no tocado quedó idéntico, byte a byte.
 * Y el resultado se valida contra el esquema y el catálogo como cualquier tablero.
 */
import type { Catalogo } from './catalogo.js'
import { parcheEsquema, type Componente, type Dashboard, type Operacion, type Parche, type TipoInstruccion } from './esquema.js'
import { buscaSql, validaDashboard, type ErrorValidacion, type Validado } from './valida.js'

export const OPERACIONES_POR_TIPO: Readonly<Record<TipoInstruccion, readonly Operacion['op'][]>> = {
  crear: ['reemplazar', 'agregar', 'titulo', 'filtrar', 'periodo'],
  modificar: ['agregar', 'quitar', 'cambiar', 'mover', 'titulo', 'filtrar', 'periodo'],
  filtrar: ['filtrar', 'periodo', 'seleccionar'],
  analizar: ['agregar'],
  explicar: [],
  alertar: [],
}
const AGREGA_ANALIZAR = new Set(['hallazgo', 'nota', 'linea', 'barras', 'tabla'])

export interface Aplicado {
  readonly dashboard: Dashboard
  /** Ids de componente agregados, quitados, cambiados o movidos. */
  readonly tocados: readonly string[]
  /** Partes globales tocadas: filtros, periodo, titulo, seleccion, todo. */
  readonly globales: readonly string[]
}

type Efecto = { tocado?: string; global?: string } | ErrorValidacion
const error = (codigo: ErrorValidacion['codigo'], ruta: string, mensaje: string): ErrorValidacion => ({ codigo, ruta, mensaje })
const indice = (d: Dashboard, id: string) => d.componentes.findIndex((c) => c.id === id)

/** Convierte una gráfica de tipo conservando lo que tiene sentido (barras por región → línea con serie región). */
function convierte(c: Record<string, unknown>, tipo: string): Record<string, unknown> {
  const comun = Object.fromEntries(Object.entries(c).filter(([k]) => ['id', 'titulo', 'ancho', 'filtros', 'periodo', 'comparar'].includes(k)))
  const metrica = c['metrica'] ?? (Array.isArray(c['metricas']) ? c['metricas'][0] : undefined)
  const dim = c['dimension'] ?? c['serie']
  if (tipo === 'linea') return { ...comun, tipo, metrica, grano: 'month', ...(dim ? { serie: dim } : {}) }
  if (tipo === 'tabla') return { ...comun, tipo, metricas: Array.isArray(c['metricas']) ? c['metricas'] : [metrica], ...(dim ? { dimension: dim } : {}) }
  if (['barras', 'progreso', 'actividad'].includes(tipo)) return { ...comun, tipo, metrica, ...(dim ? { dimension: dim } : {}) }
  return { ...comun, tipo, ...(metrica ? { metrica } : {}) }
}

function cambia(d: Dashboard, op: Extract<Operacion, { op: 'cambiar' }>, ruta: string): Efecto {
  const i = indice(d, op.id)
  if (i < 0) return error('componente_inexistente', ruta, `no hay componente «${op.id}»`)
  if ('id' in op.cambios) return error('esquema', ruta, 'un cambio no renombra el componente')
  let siguiente: Record<string, unknown> = { ...(d.componentes[i] as Record<string, unknown>) }
  const tipo = op.cambios['tipo']
  if (typeof tipo === 'string' && tipo !== siguiente['tipo']) siguiente = convierte(siguiente, tipo)
  for (const [k, v] of Object.entries(op.cambios)) {
    if (k === 'tipo') continue
    if (v === null) delete siguiente[k]
    else siguiente[k] = v
  }
  d.componentes[i] = siguiente as Componente
  return { tocado: op.id }
}

function filtra(d: Dashboard, op: Extract<Operacion, { op: 'filtrar' }>): Efecto {
  const quitar = new Set([...(op.quitar ?? []), ...(op.agregar ?? []).map((f) => f.dimension)])
  d.filtros.dimensiones = [...d.filtros.dimensiones.filter((f) => !quitar.has(f.dimension)), ...(op.agregar ?? [])]
  return { global: 'filtros' }
}

function aplicaOperacion(d: Dashboard, op: Operacion, ruta: string): Efecto {
  switch (op.op) {
    case 'agregar': {
      if (indice(d, op.componente.id) >= 0) return error('esquema', ruta, `ya existe un componente «${op.componente.id}»`)
      const tras = op.despues_de === undefined ? d.componentes.length : op.despues_de === null ? 0 : indice(d, op.despues_de) + 1
      if (op.despues_de && tras === 0) return error('componente_inexistente', ruta, `no hay componente «${op.despues_de}»`)
      d.componentes.splice(tras, 0, op.componente)
      return { tocado: op.componente.id }
    }
    case 'quitar': {
      const i = indice(d, op.id)
      if (i < 0) return error('componente_inexistente', ruta, `no hay componente «${op.id}»`)
      d.componentes.splice(i, 1)
      return { tocado: op.id }
    }
    case 'cambiar': return cambia(d, op, ruta)
    case 'mover': {
      const i = indice(d, op.id)
      if (i < 0) return error('componente_inexistente', ruta, `no hay componente «${op.id}»`)
      const [c] = d.componentes.splice(i, 1) as [Componente]
      const tras = op.despues_de === null ? 0 : indice(d, op.despues_de) + 1
      if (op.despues_de !== null && tras === 0) return error('componente_inexistente', ruta, `no hay componente «${op.despues_de}»`)
      d.componentes.splice(tras, 0, c)
      return { tocado: op.id }
    }
    case 'filtrar': return filtra(d, op)
    case 'periodo': {
      d.filtros.periodo = op.periodo
      if (op.comparar === null) delete d.filtros.comparar
      else if (op.comparar) d.filtros.comparar = op.comparar
      return { global: 'periodo' }
    }
    case 'seleccionar': {
      if (op.seleccion === null) delete d.seleccion
      else d.seleccion = op.seleccion
      return { global: 'seleccion' }
    }
    case 'titulo': d.titulo = op.titulo; return { global: 'titulo' }
    case 'reemplazar': return { global: 'todo' }
  }
}

function aplicaTodas(actual: Dashboard, p: Parche): Validado<Aplicado> {
  const permitidas = OPERACIONES_POR_TIPO[p.alcance.tipo]
  const errores: ErrorValidacion[] = []
  let d: Dashboard = structuredClone(actual)
  const tocados = new Set<string>()
  const globales = new Set<string>()
  for (const [i, op] of p.operaciones.entries()) {
    const ruta = `operaciones[${i}](${op.op})`
    if (!permitidas.includes(op.op)) { errores.push(error('operacion_no_permitida', ruta, `una instrucción de tipo ${p.alcance.tipo} no admite «${op.op}»`)); continue }
    if (op.op === 'agregar' && p.alcance.tipo === 'analizar' && !AGREGA_ANALIZAR.has(op.componente.tipo)) errores.push(error('operacion_no_permitida', ruta, 'un análisis solo agrega un hallazgo o la gráfica que lo sostiene'))
    if (op.op === 'reemplazar') {
      const nuevo = op.dashboard as Dashboard | null
      if (!nuevo || typeof nuevo !== 'object' || !Array.isArray(nuevo.componentes) || !nuevo.filtros) { errores.push(error('esquema', ruta, 'reemplazar exige un tablero completo')); continue }
      d = structuredClone(nuevo)
      for (const c of [...actual.componentes, ...d.componentes]) tocados.add(c.id)
    }
    const efecto = aplicaOperacion(d, op, ruta)
    if ('codigo' in efecto) errores.push(efecto)
    else { if (efecto.tocado) tocados.add(efecto.tocado); if (efecto.global) globales.add(efecto.global) }
  }
  return errores.length ? { ok: false, errores } : { ok: true, valor: { dashboard: d, tocados: [...tocados], globales: [...globales] } }
}

/** Lo no tocado, idéntico: si no, el parche se llevó algo que nadie pidió. */
function intactos(antes: Dashboard, despues: Dashboard, tocados: ReadonlySet<string>): ErrorValidacion[] {
  const ahora = new Map(despues.componentes.map((c) => [c.id, JSON.stringify(c)]))
  return antes.componentes.filter((c) => !tocados.has(c.id) && ahora.get(c.id) !== JSON.stringify(c))
    .map((c) => error('alcance', `componentes(${c.id})`, `el componente «${c.id}» cambió sin que la instrucción lo pidiera`))
}

export function aplicaParche(cat: Catalogo, actual: Dashboard, version: number, entrada: unknown): Validado<Aplicado> {
  const sql = buscaSql(entrada, 'parche')
  if (sql.length) return { ok: false, errores: sql }
  const r = parcheEsquema.safeParse(entrada)
  if (!r.success) return { ok: false, errores: r.error.issues.map((e) => error('esquema', e.path.join('.'), e.message)) }
  const p = r.data
  if (p.base !== version) return { ok: false, errores: [error('version', 'base', `el parche se calculó sobre la versión ${p.base} y el tablero va en la ${version}: se recalcula, no se fusiona a ciegas`)] }
  const aplicado = aplicaTodas(actual, p)
  if (!aplicado.ok) return aplicado
  const { dashboard, tocados, globales } = aplicado.valor
  const pedidos = new Set(p.alcance.componentes)
  const errores = globales.includes('todo') ? [] : tocados.filter((id) => !pedidos.has(id)).map((id) => error('alcance', `componentes(${id})`, `el parche toca «${id}», que la instrucción no pidió tocar`))
  errores.push(...intactos(actual, dashboard, new Set(tocados)))
  if (errores.length) return { ok: false, errores }
  const v = validaDashboard(cat, dashboard)
  return v.ok ? { ok: true, valor: { dashboard: v.valor, tocados, globales } } : v
}
