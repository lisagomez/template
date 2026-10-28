/**
 * La capa semántica de Ágora: métricas DECLARADAS (nombre, definición, la decisión que apoyan, su modelo, su medida y
 * las dimensiones válidas) que se COMPILAN a SQL sobre los modelos `agora.sem_*` y se leen con la sesión de quien mira.
 * Ninguna cifra se escribe a mano ni la redacta un modelo: el tablero solo pinta lo que devuelve `consulta`.
 *
 * Es el patrón de MetricFlow (modelo semántico → medida → métrica), escrito aquí sin su dependencia: el catálogo es
 * dato y el SQL se arma de él. Una métrica que no está en el catálogo NO se sustituye por una parecida: se dice.
 */
import type { Sesion } from './base/tipos.js'

export type Formato = 'mxn' | 'pct' | 'n' | 'horas'
export interface Metrica {
  nombre: string; titulo: string; definicion: string; decision: string
  modelo: string; expresion: string; formato: Formato; dimensiones: string[]
  /** Palabras con que una persona la pide (el intérprete sin LLM las usa). */
  claves: string[]
}

const LIBRO = ['categoria', 'dominio', 'workspace', 'periodo']
export const CATALOGO: readonly Metrica[] = [
  { nombre: 'presupuesto_mxn', titulo: 'Presupuesto', definicion: 'Suma del presupuesto vigente (última versión aprobada) por centro y mes.', decision: '¿Cuánto se aprobó gastar?', modelo: 'sem_libro', expresion: 'sum(presupuesto_mxn)', formato: 'mxn', dimensiones: LIBRO, claves: ['presupuesto', 'aprobado'] },
  { nombre: 'comprometido_mxn', titulo: 'Comprometido', definicion: 'Lo aprobado y aún no ejercido (compromisos vigentes).', decision: '¿Cuánto ya está comprometido?', modelo: 'sem_libro', expresion: 'sum(comprometido_mxn)', formato: 'mxn', dimensiones: LIBRO, claves: ['comprometido', 'compromisos'] },
  { nombre: 'ejercido_mxn', titulo: 'Ejercido', definicion: 'Costo real con evidencia (CFDI, comprobante o uso de modelo).', decision: '¿Cuánto se gastó de verdad?', modelo: 'sem_libro', expresion: 'sum(ejercido_mxn)', formato: 'mxn', dimensiones: LIBRO, claves: ['ejercido', 'gastado', 'gasto real'] },
  { nombre: 'disponible_mxn', titulo: 'Disponible', definicion: 'Presupuesto − comprometido − ejercido.', decision: '¿Cuánto queda?', modelo: 'sem_libro', expresion: 'sum(disponible_mxn)', formato: 'mxn', dimensiones: LIBRO, claves: ['disponible', 'queda'] },
  { nombre: 'desviacion_pct', titulo: 'Desviación contra presupuesto', definicion: '(comprometido + ejercido − presupuesto) ÷ presupuesto.', decision: '¿Dónde nos pasamos?', modelo: 'sem_libro', expresion: 'round(100 * sum(desviacion_mxn) / nullif(sum(presupuesto_mxn), 0), 1)', formato: 'pct', dimensiones: LIBRO, claves: ['desviacion', 'desviación', 'nos pasamos'] },
  { nombre: 'costo_modelo_mxn', titulo: 'Costo de modelo de los agentes', definicion: 'Suma del gasto de modelo con costo, en MXN (tipo de cambio con fuente).', decision: '¿Cuánto cuestan los agentes?', modelo: 'sem_gasto', expresion: 'sum(costo_mxn)', formato: 'mxn', dimensiones: ['agente', 'origen', 'workspace', 'categoria', 'periodo'], claves: ['costo de modelo', 'gasto de agentes', 'cuestan los agentes'] },
  { nombre: 'filas_sin_costo', titulo: 'Llamadas sin costo', definicion: 'Llamadas a modelo sin datos de uso: su costo es null, no cero.', decision: '¿Cuánto falta por costear?', modelo: 'sem_gasto', expresion: 'count(*) filter (where sin_costo)', formato: 'n', dimensiones: ['agente', 'workspace', 'periodo'], claves: ['sin costo', 'sin datos de uso'] },
  { nombre: 'tareas_a_tiempo_pct', titulo: 'Tareas a tiempo', definicion: 'Cerradas en o antes de su fecha ÷ cerradas.', decision: '¿El plan es realista?', modelo: 'sem_items', expresion: 'round(100.0 * count(*) filter (where a_tiempo) / nullif(count(*) filter (where cerrado), 0), 1)', formato: 'pct', dimensiones: ['workspace', 'dominio', 'categoria'], claves: ['a tiempo', 'realista'] },
  { nombre: 'tareas_vencidas', titulo: 'Tareas vencidas', definicion: 'Abiertas con fecha anterior a hoy.', decision: '¿Dónde intervenir hoy?', modelo: 'sem_items', expresion: 'count(*) filter (where vencido)', formato: 'n', dimensiones: ['workspace', 'dominio', 'categoria'], claves: ['vencidas', 'atrasadas', 'intervenir'] },
  { nombre: 'aceptacion_propuestas', titulo: 'Aceptación de propuestas', definicion: 'Aprobadas ÷ decididas.', decision: '¿Qué agente sube o baja de autonomía?', modelo: 'sem_propuestas', expresion: 'round(100.0 * count(*) filter (where aceptada) / nullif(count(*) filter (where decidida), 0), 1)', formato: 'pct', dimensiones: ['agente', 'origen', 'dominio', 'workspace', 'periodo'], claves: ['aceptacion', 'aceptación', 'aceptadas'] },
  { nombre: 'horas_a_decision', titulo: 'Horas a la decisión (mediana)', definicion: 'Mediana entre la propuesta y su decisión.', decision: '¿Hay cuello de botella de aprobadores?', modelo: 'sem_propuestas', expresion: 'round((percentile_cont(0.5) within group (order by horas_a_decision) filter (where decidida and horas_a_decision is not null))::numeric, 1)', formato: 'horas', dimensiones: ['dominio', 'workspace', 'agente'], claves: ['horas', 'cuello de botella', 'tardan en decidir'] },
  { nombre: 'retrabajo_pct', titulo: 'Retrabajo', definicion: 'Devueltas a revisión ÷ decididas.', decision: '¿Las propuestas llegan completas?', modelo: 'sem_propuestas', expresion: 'round(100.0 * count(*) filter (where devuelta) / nullif(count(*) filter (where decidida), 0), 1)', formato: 'pct', dimensiones: ['agente', 'dominio'], claves: ['retrabajo', 'revision', 'devueltas'] },
  { nombre: 'autonomia_efectiva', titulo: 'Autonomía efectiva', definicion: 'Cambios aplicados sin intervención (A2/A3) ÷ cambios aplicados.', decision: '¿Crece la autonomía sin incidentes?', modelo: 'sem_propuestas', expresion: "round(100.0 * count(*) filter (where autonoma) / nullif(count(*) filter (where estado = 'aplicada'), 0), 1)", formato: 'pct', dimensiones: ['agente', 'workspace'], claves: ['autonomia', 'autonomía'] },
  { nombre: 'llamadas_a2a_rechazadas_pct', titulo: 'Rechazos en la Puerta', definicion: 'Rechazadas ÷ recibidas en la Puerta.', decision: '¿Algún agente prueba fuera de su alcance?', modelo: 'sem_puerta', expresion: "round(100.0 * count(*) filter (where resultado = 'rechazada') / nullif(count(*), 0), 1)", formato: 'pct', dimensiones: ['agente', 'motivo', 'periodo'], claves: ['rechazos', 'puerta', 'rechazadas'] },
  { nombre: 'llamadas_tras_revocar', titulo: 'Llamadas tras revocar (meta: 0)', definicion: 'Llamadas admitidas después del eslabón de revocación.', decision: '¿La revocación de verdad corta?', modelo: 'sem_puerta', expresion: 'count(*) filter (where tras_revocar)', formato: 'n', dimensiones: ['agente'], claves: ['tras revocar', 'revocacion', 'revocación'] },
  { nombre: 'suspensiones_por_deriva', titulo: 'Suspensiones por deriva de tarjeta', definicion: 'Suspensiones del vigía por huella de tarjeta distinta.', decision: '¿Qué socio cambia sin avisar?', modelo: 'sem_suspensiones', expresion: "count(*) filter (where accion = 'suspender' and motivo = 'deriva_tarjeta')", formato: 'n', dimensiones: ['agente'], claves: ['deriva', 'suspensiones'] },
]

/** Las que necesitan cruzar modelos: SQL propio, con las mismas reglas (sesión de quien mira, nada a mano). */
const COMPUESTAS: Record<string, { titulo: string; definicion: string; decision: string; formato: Formato; claves: string[]; sql: string }> = {
  costo_por_propuesta_aceptada: {
    titulo: 'Costo por propuesta aceptada', definicion: 'Gasto de modelo (MXN) del agente ÷ sus propuestas aceptadas.', decision: '¿Qué agente cuesta más de lo que aporta?', formato: 'mxn', claves: ['costo por propuesta', 'cuesta cada propuesta'],
    sql: `select g.agente dimension, round(g.mxn / nullif(p.aceptadas, 0), 2)::text valor from
            (select agente, sum(costo_mxn) mxn from agora.sem_gasto group by agente) g
            left join (select agente, count(*) filter (where aceptada) aceptadas from agora.sem_propuestas group by agente) p on p.agente = g.agente order by 1`,
  },
  consumo_tope_gasto_pct: {
    titulo: 'Consumo del tope de gasto', definicion: 'Gasto de modelo del mes ÷ tope de gasto del agente.', decision: '¿Qué agente necesita más cupo o se está desbocando?', formato: 'pct', claves: ['consumo', 'cuota', 'tope'],
    sql: `select a.nombre dimension, round(100 * ((agora.topes_de(a.id) -> 'gasto' ->> 'uso')::numeric) / nullif(a.tope_gasto_mes_mxn, 0), 1)::text valor
            from agora.agente a where a.estado in ('aprobado', 'prueba', 'suspendido') and a.tope_gasto_mes_mxn > 0 order by 1`,
  },
}

export interface Pedido { metrica: string; dimension?: string | null; periodo?: string | null; workspace?: string | null; origen?: string | null }
export interface Resultado { metrica: string; titulo: string; definicion: string; formato: Formato; filas: Array<{ dimension: string | null; valor: string | null }>; sql: string }

export const nombres = (): string[] => [...CATALOGO.map((m) => m.nombre), ...Object.keys(COMPUESTAS)]
export const describe = (n: string) => CATALOGO.find((m) => m.nombre === n) ?? (COMPUESTAS[n] ? { nombre: n, ...COMPUESTAS[n], dimensiones: ['agente'] } : null)

/** Compila una métrica a SQL. La dimensión y los filtros salen del catálogo, nunca del texto de quien pide. */
export function compila(p: Pedido): { sql: string; params: unknown[] } {
  const c = COMPUESTAS[p.metrica]
  if (c) return { sql: c.sql, params: [] }
  const m = CATALOGO.find((x) => x.nombre === p.metrica)
  if (!m) throw new Error(`la métrica «${p.metrica}» no existe en el catálogo`)
  if (p.dimension && !m.dimensiones.includes(p.dimension)) throw new Error(`«${p.metrica}» no se abre por «${p.dimension}» (sí por: ${m.dimensiones.join(', ')})`)
  const filtros: string[] = []
  const params: unknown[] = []
  const tiene = (col: string) => ['sem_libro', 'sem_gasto', 'sem_propuestas', 'sem_puerta', 'sem_suspensiones'].includes(m.modelo) || col !== 'periodo'
  if (p.periodo && tiene('periodo') && m.modelo !== 'sem_items') { params.push(p.periodo); filtros.push(`periodo = $${params.length}`) }
  if (p.workspace && ['sem_libro', 'sem_gasto', 'sem_propuestas', 'sem_items'].includes(m.modelo)) { params.push(p.workspace); filtros.push(`workspace_id = $${params.length}::uuid`) }
  if (p.origen && ['sem_gasto', 'sem_propuestas'].includes(m.modelo)) { params.push(p.origen); filtros.push(`origen = $${params.length}`) }
  const donde = filtros.length ? ` where ${filtros.join(' and ')}` : ''
  const dim = p.dimension ? `${p.dimension}::text` : 'null::text'
  const agrupa = p.dimension ? ` group by ${p.dimension} order by ${p.dimension}` : ''
  return { sql: `select ${dim} dimension, (${m.expresion})::text valor from agora.${m.modelo}${donde}${agrupa}`, params }
}

export async function consulta(s: Sesion, p: Pedido): Promise<Resultado> {
  const d = describe(p.metrica)
  if (!d) throw new Error(`la métrica «${p.metrica}» no existe en el catálogo`)
  const { sql, params } = compila(p)
  const filas = await s.consulta<{ dimension: string | null; valor: string | null }>(sql, params)
  return { metrica: p.metrica, titulo: d.titulo, definicion: d.definicion, formato: d.formato, filas, sql }
}

// --- El tablero regenerable: una especificación que se edita con palabras, sin LLM ------------------------------------
export interface Componente { id: string; metrica: string; dimension: string | null; periodo: string | null; workspace: string | null; origen: string | null; vista: 'cifra' | 'barras' | 'tabla' }
export interface EspecTablero { version: 1; titulo: string; componentes: Componente[] }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const DIM_PALABRAS: Array<[string, RegExp]> = [['agente', /por agente|cada agente|agentes?/], ['dominio', /por dominio|dominios?/], ['categoria', /por categoria|categorias?|centro/], ['workspace', /por workspace|workspaces?/], ['periodo', /por mes|por periodo|mensual/], ['motivo', /por motivo|motivos?/]]

export type Entendido = { ok: true; componente: Omit<Componente, 'id'>; entendi: string[] } | { ok: false; motivo: string; propuesta?: string }

/** «aceptación por agente externo, últimos 30 días, solo Comercial» → lo que entendí. Sin métrica en el catálogo: lo dice. */
export function entiende(texto: string, contexto: { periodo: string; workspaces: Array<{ id: string; nombre: string }> }): Entendido {
  const t = norm(texto)
  const puntos = [...CATALOGO.map((m) => ({ n: m.nombre, claves: m.claves })), ...Object.entries(COMPUESTAS).map(([n, c]) => ({ n, claves: c.claves }))]
    .map((m) => ({ n: m.n, p: m.claves.filter((k) => t.includes(norm(k))).length })).filter((x) => x.p > 0).sort((a, b) => b.p - a.p)
  if (!puntos.length) {
    const palabra = t.replace(/[^a-z0-9ñ ]/g, '').split(/\s+/).filter((w) => w.length > 4)[0] ?? 'nueva'
    return { ok: false, motivo: 'esa métrica no está en el catálogo, y no la sustituyo por una parecida', propuesta: `+ - nombre: ${palabra}_n\n+   modelo: <sem_libro | sem_items | sem_propuestas | sem_gasto | sem_puerta>\n+   expresion: <agregado sobre el modelo>\n+   decision: <qué decide>` }
  }
  if (puntos[1] && puntos[1].p === puntos[0]!.p) return { ok: false, motivo: `dudo entre «${puntos[0]!.n}» y «${puntos[1].n}»: dime cuál` }
  const metrica = puntos[0]!.n
  const d = describe(metrica)!
  const dimension = (DIM_PALABRAS.find(([dim, re]) => re.test(t) && d.dimensiones.includes(dim))?.[0]) ?? null
  const origen = /externo/.test(t) ? 'externo' : /interno/.test(t) ? 'interno' : null
  const ws = contexto.workspaces.find((w) => norm(w.nombre).split(/\s+/).some((p) => p.length > 4 && t.includes(p)))
  const entendi = [`métrica: ${d.titulo}`, dimension ? `por ${dimension}` : 'total', origen ? `solo ${origen}s` : null, ws ? `workspace: ${ws.nombre}` : null, `periodo: ${contexto.periodo}`].filter((x): x is string => Boolean(x))
  return { ok: true, componente: { metrica, dimension, periodo: d.formato === 'mxn' || metrica.includes('tope') ? contexto.periodo : null, workspace: ws?.id ?? null, origen, vista: dimension ? 'barras' : 'cifra' }, entendi }
}

export const TABLERO_INICIAL: EspecTablero = {
  version: 1,
  titulo: 'Ágora · cómo vamos',
  componentes: [
    { id: 'presupuesto', metrica: 'presupuesto_mxn', dimension: null, periodo: null, workspace: null, origen: null, vista: 'cifra' },
    { id: 'comprometido', metrica: 'comprometido_mxn', dimension: null, periodo: null, workspace: null, origen: null, vista: 'cifra' },
    { id: 'ejercido', metrica: 'ejercido_mxn', dimension: null, periodo: null, workspace: null, origen: null, vista: 'cifra' },
    { id: 'disponible', metrica: 'disponible_mxn', dimension: null, periodo: null, workspace: null, origen: null, vista: 'cifra' },
    { id: 'desviacion', metrica: 'desviacion_pct', dimension: 'categoria', periodo: null, workspace: null, origen: null, vista: 'barras' },
    { id: 'costo-agentes', metrica: 'costo_modelo_mxn', dimension: 'agente', periodo: null, workspace: null, origen: null, vista: 'barras' },
    { id: 'sin-costo', metrica: 'filas_sin_costo', dimension: null, periodo: null, workspace: null, origen: null, vista: 'cifra' },
    { id: 'a-tiempo', metrica: 'tareas_a_tiempo_pct', dimension: null, periodo: null, workspace: null, origen: null, vista: 'cifra' },
    { id: 'vencidas', metrica: 'tareas_vencidas', dimension: 'categoria', periodo: null, workspace: null, origen: null, vista: 'barras' },
    { id: 'aceptacion', metrica: 'aceptacion_propuestas', dimension: 'agente', periodo: null, workspace: null, origen: null, vista: 'barras' },
    { id: 'horas', metrica: 'horas_a_decision', dimension: 'dominio', periodo: null, workspace: null, origen: null, vista: 'barras' },
    { id: 'autonomia', metrica: 'autonomia_efectiva', dimension: null, periodo: null, workspace: null, origen: null, vista: 'cifra' },
    { id: 'costo-propuesta', metrica: 'costo_por_propuesta_aceptada', dimension: 'agente', periodo: null, workspace: null, origen: null, vista: 'tabla' },
    { id: 'consumo', metrica: 'consumo_tope_gasto_pct', dimension: 'agente', periodo: null, workspace: null, origen: null, vista: 'barras' },
    { id: 'rechazos', metrica: 'llamadas_a2a_rechazadas_pct', dimension: 'motivo', periodo: null, workspace: null, origen: null, vista: 'tabla' },
    { id: 'tras-revocar', metrica: 'llamadas_tras_revocar', dimension: null, periodo: null, workspace: null, origen: null, vista: 'cifra' },
    { id: 'deriva', metrica: 'suspensiones_por_deriva', dimension: null, periodo: null, workspace: null, origen: null, vista: 'cifra' },
  ],
}
