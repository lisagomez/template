/**
 * `crear_alerta`: una regla de monitoreo se PROPONE, se muestra y solo se registra con confirmación explícita de una
 * persona. Registrada, vive en un almacén local. En el laboratorio no hay canal: nada se envía, a nadie. Conectar un
 * canal externo es otra fase con C3 y C4 (AGENTS.md), fuera de este núcleo.
 */
import { z } from 'zod'
import { alcanza, metrica, unidadDe, type Catalogo } from './catalogo.js'
import type { Consultor } from './consulta.js'
import { filtroEsquema } from './esquema.js'
import { validaFiltro, type ErrorValidacion, type Validado } from './valida.js'

export const reglaEsquema = z.object({
  metrica: z.string().regex(/^[a-z_][a-z0-9_]*$/),
  filtros: z.array(filtroEsquema).max(10),
  condicion: z.enum(['cae_mas_de', 'sube_mas_de', 'debajo_de', 'encima_de']),
  valor: z.number().finite(),
  unidad: z.enum(['%', 'pp', 'valor']),
  ventana: z.enum(['diaria', 'semanal', 'mensual']),
  nombre: z.string().max(120).optional(),
}).strict()
export type ReglaPedida = z.infer<typeof reglaEsquema>

export interface Alerta extends ReglaPedida {
  readonly id: string
  readonly estado: 'propuesta' | 'registrada'
  readonly creada: string
  readonly confirmadaPor: string | null
  /** Siempre «ninguno» en el laboratorio: la alerta se evalúa, no se envía. */
  readonly canal: 'ninguno'
}

export interface AlmacenAlertas {
  lista(): Promise<readonly Alerta[]>
  guarda(a: Alerta): Promise<void>
}

const GRANO = { diaria: 'day', semanal: 'week', mensual: 'month' } as const

export function proponeAlerta(cat: Catalogo, entrada: unknown, cuando = new Date().toISOString()): Validado<Alerta> {
  const r = reglaEsquema.safeParse(entrada)
  if (!r.success) return { ok: false, errores: r.error.issues.map((e) => ({ codigo: 'esquema', ruta: e.path.join('.'), mensaje: e.message })) }
  const g = r.data
  const m = metrica(cat, g.metrica)
  const errores: ErrorValidacion[] = []
  if (!m) errores.push({ codigo: 'metrica_inexistente', ruta: 'metrica', mensaje: `la métrica «${g.metrica}» no existe en el catálogo` })
  else {
    if (!alcanza(m, `metric_time__${GRANO[g.ventana]}`)) errores.push({ codigo: 'dimension_invalida', ruta: 'ventana', mensaje: `«${g.metrica}» no se mide por ${GRANO[g.ventana]}: no admite una ventana ${g.ventana}` })
    if (g.unidad === 'pp' && unidadDe(m) !== '%') errores.push({ codigo: 'esquema', ruta: 'unidad', mensaje: 'puntos porcentuales solo para métricas en %' })
    for (const [i, f] of g.filtros.entries()) errores.push(...validaFiltro(cat, f, [g.metrica], `filtros[${i}]`))
  }
  if (errores.length) return { ok: false, errores }
  const id = `alerta_${g.metrica}_${g.ventana}_${Math.abs([...JSON.stringify(g)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)).toString(36)}`
  return { ok: true, valor: { ...g, id, estado: 'propuesta', creada: cuando, confirmadaPor: null, canal: 'ninguno' } }
}

/** Registrar exige la confirmación de una persona con nombre. Sin ella, la alerta sigue siendo una propuesta. */
export async function registraAlerta(almacen: AlmacenAlertas, a: Alerta, confirmadaPor: string | null): Promise<Alerta> {
  if (!confirmadaPor?.trim()) throw new Error('una alerta se registra solo con la confirmación de una persona (confirmadaPor)')
  const registrada: Alerta = { ...a, estado: 'registrada', confirmadaPor: confirmadaPor.trim() }
  await almacen.guarda(registrada)
  return registrada
}

export interface Evaluacion { readonly ventana: string; readonly actual: number | null; readonly anterior: number | null; readonly cambio: number | null; readonly dispararia: boolean; readonly periodos: readonly string[] }

/** Evalúa la regla sobre las dos últimas ventanas completas (en seco: dice si dispararía, no avisa a nadie). */
export async function evaluaAlerta(x: Consultor, a: ReglaPedida, hasta: string): Promise<Evaluacion> {
  const grano = GRANO[a.ventana]
  const [an, me] = hasta.split('-').map(Number) as [number, number]
  const desde = `${me <= 2 ? an - 1 : an}-${String(((me + 9) % 12) + 1).padStart(2, '0')}`
  const r = await x.consulta({ metricas: [a.metrica], agrupar: [`metric_time__${grano}`], filtros: a.filtros, periodo: { desde, hasta } })
  const filas = [...r.filas].sort((p, q) => String(p[0]).localeCompare(String(q[0])))
  const completas = grano === 'week' ? filas.slice(0, -1) : filas
  const [ant, act] = completas.slice(-2).map((f) => (f[1] === null ? null : Number(f[1])))
  const [anterior, actual] = [ant ?? null, act ?? null]
  const cambio = actual === null || anterior === null ? null : a.unidad === '%' ? (anterior ? 100 * (actual / anterior - 1) : null) : a.unidad === 'pp' ? actual - anterior : actual
  const dispararia = cambio !== null && ({ cae_mas_de: -cambio > a.valor, sube_mas_de: cambio > a.valor, debajo_de: (actual ?? Infinity) < a.valor, encima_de: (actual ?? -Infinity) > a.valor })[a.condicion]
  return { ventana: a.ventana, actual, anterior, cambio, dispararia, periodos: completas.slice(-2).map((f) => String(f[0]).slice(0, 10)) }
}

export function memoriaAlertas(): AlmacenAlertas {
  const datos = new Map<string, Alerta>()
  return { async lista() { return [...datos.values()] }, async guarda(a) { datos.set(a.id, a) } }
}
