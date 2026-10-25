/**
 * Una sola superficie de herramientas con dos puertas: el agente del lienzo las llama en proceso y el CLI las expone
 * tal cual (misma entrada validada, misma salida). Las de la propuesta —listar_metricas, describir_metrica,
 * consultar_metricas, leer_dashboard, editar_dashboard, analizar_variacion, ver_senales, crear_alerta,
 * proponer_metrica— más tres de versiones (comparar, volver, fijar oficial), que pide «versiones de verdad».
 *
 * Las que ESCRIBEN van en seco por defecto: sin `aplicar: true` validan y muestran, pero no guardan nada. Ninguna
 * envía, publica ni abre nada fuera del almacén local.
 */
import { z } from 'zod'
import { analizaVariacion, type AnalisisVariacion } from './analisis.js'
import { evaluaAlerta, proponeAlerta, registraAlerta, reglaEsquema, type Alerta, type AlmacenAlertas, type Evaluacion } from './alertas.js'
import { define, metrica, unidadDe } from './catalogo.js'
import { ConsultaInvalida, type Consultor } from './consulta.js'
import { filtroEsquema, periodoEsquema, type Dashboard } from './esquema.js'
import { aplicaParche } from './parche.js'
import { proponeMetrica, type Propuesta } from './proponer.js'
import { comparaCifras, resuelve, type CambioCifra, type OpcionesResolver } from './resolver.js'
import { detectaSenales, type PerfilSenales, type Senal } from './senales.js'
import type { ErrorValidacion } from './valida.js'
import { comparaVersiones, fijaOficial, nuevoHistorial, registra, versionActual, vuelveA, type AlmacenVersiones, type DiferenciaDashboard, type Historial } from './versiones.js'

export interface ContextoEstudio {
  readonly consultor: Consultor
  readonly versiones: AlmacenVersiones
  readonly alertas: AlmacenAlertas
  /** Tableros con los que nace un historial que aún no existe. */
  readonly tablerosBase?: Readonly<Record<string, Dashboard>>
  readonly perfil?: PerfilSenales
  readonly resolver?: OpcionesResolver
  /** Último mes con datos (`AAAA-MM`): la ventana de una alerta se evalúa hasta aquí. */
  readonly fechaCorte: string
  readonly reloj?: () => string
}

/** La entrada o el parche no pasó el esquema o el catálogo. El CLI lo distingue de un error de uso y de la capa. */
export class RechazoEsquema extends Error {
  override readonly name = 'RechazoEsquema'
  readonly errores: readonly ErrorValidacion[]
  constructor(errores: readonly ErrorValidacion[]) {
    super(errores.map((e) => `${e.codigo} · ${e.ruta}: ${e.mensaje}`).join('\n'))
    this.errores = errores
  }
}

const ahora = (c: ContextoEstudio) => (c.reloj ?? (() => new Date().toISOString()))()
const tablero = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,60}$/)
const consultaEsquema = z.object({ metricas: z.array(z.string()).min(1).max(8), agrupar: z.array(z.string()).max(3).optional(), filtros: z.array(filtroEsquema).max(10).optional(), periodo: periodoEsquema.optional(), orden: z.array(z.object({ campo: z.string(), desc: z.boolean().optional() }).strict()).max(3).optional(), limite: z.number().int().min(1).max(5000).optional() }).strict()

async function historial(c: ContextoEstudio, t: string): Promise<{ h: Historial; guardado: boolean }> {
  const h = await c.versiones.lee(t)
  if (h) return { h, guardado: true }
  const base = c.tablerosBase?.[t]
  if (!base) throw new RechazoEsquema([{ codigo: 'componente_inexistente', ruta: 'tablero', mensaje: `no existe el tablero «${t}»` }])
  return { h: nuevoHistorial(t, base, ahora(c)), guardado: false }
}

async function guarda(c: ContextoEstudio, previo: { h: Historial; guardado: boolean }, h: Historial): Promise<void> {
  await c.versiones.guarda(h, previo.guardado ? previo.h.actual : null)
}

export interface Herramienta<E extends z.ZodType = z.ZodType, S = unknown> {
  readonly nombre: string
  readonly descripcion: string
  readonly escribe: boolean
  readonly entrada: E
  ejecuta(c: ContextoEstudio, e: z.infer<E>): Promise<S>
}
const herramienta = <E extends z.ZodType, S>(h: Herramienta<E, S>) => h

export const HERRAMIENTAS = [
  herramienta({ nombre: 'listar_metricas', escribe: false, descripcion: 'Las métricas del catálogo con su tipo, unidad y dueño.', entrada: z.object({}).strict(),
    async ejecuta(c) { return [...c.consultor.catalogo.metricas.values()].map((m) => ({ nombre: m.nombre, etiqueta: m.etiqueta ?? m.nombre, tipo: m.tipo, unidad: unidadDe(m), dueno: typeof m.meta['dueno'] === 'string' ? m.meta['dueno'] : null, descripcion: m.descripcion })) } }),
  herramienta({ nombre: 'describir_metrica', escribe: false, descripcion: 'Definición de una métrica tal como la declara la capa: fórmula, dueño, unidad, advertencias, dimensiones y dominios.', entrada: z.object({ metrica: z.string() }).strict(),
    async ejecuta(c, e) {
      const d = define(c.consultor.catalogo, e.metrica)
      if (!d) throw new RechazoEsquema([{ codigo: 'metrica_inexistente', ruta: 'metrica', mensaje: `la métrica «${e.metrica}» no existe en el catálogo; se puede proponer con proponer_metrica` }])
      const m = metrica(c.consultor.catalogo, e.metrica)!
      return { ...d, dimensiones: m.dimensiones, dominios: Object.fromEntries(m.dimensiones.flatMap((x) => { const v = c.consultor.catalogo.dominios.get(x.nombre); return v ? [[x.nombre, v.slice(0, 25)]] : [] })) }
    } }),
  herramienta({ nombre: 'consultar_metricas', escribe: false, descripcion: 'Pide métricas por nombre con dimensiones, filtros y periodo; la capa compila el SQL y lo devuelve como procedencia.', entrada: consultaEsquema,
    async ejecuta(c, e) {
      try { const r = await c.consultor.consulta(e); return { columnas: r.columnas, filas: r.filas, sql: r.sql, truncada: r.truncada, ms: r.ms, desdeCache: r.desdeCache } }
      catch (x) { if (x instanceof ConsultaInvalida) throw new RechazoEsquema(x.errores); throw x }
    } }),
  herramienta({ nombre: 'leer_dashboard', escribe: false, descripcion: 'La especificación vigente de un tablero, su versión, la oficial y el historial.', entrada: z.object({ tablero }).strict(),
    async ejecuta(c, e) {
      const { h } = await historial(c, e.tablero)
      return { tablero: h.tablero, version: h.actual, oficial: h.oficial, dashboard: versionActual(h).dashboard, versiones: h.versiones.map((v) => ({ n: v.n, padre: v.padre, autor: v.autor, resumen: v.resumen, instruccion: v.instruccion, cuando: v.cuando })) }
    } }),
  herramienta({ nombre: 'editar_dashboard', escribe: true, descripcion: 'Valida un parche (esquema, catálogo, alcance) y, solo con aplicar, lo registra como versión nueva.', entrada: z.object({ tablero, parche: z.unknown(), instruccion: z.string().max(500).optional(), resumen: z.string().max(300).optional(), autor: z.enum(['agente', 'persona']).default('persona'), aplicar: z.boolean().default(false) }).strict(),
    async ejecuta(c, e) {
      const previo = await historial(c, e.tablero)
      const actual = versionActual(previo.h)
      const r = aplicaParche(c.consultor.catalogo, actual.dashboard, previo.h.actual, e.parche)
      if (!r.ok) throw new RechazoEsquema(r.errores)
      const diferencia = comparaVersiones(actual.dashboard, r.valor.dashboard)
      if (!e.aplicar) return { aplicado: false, enSeco: true, version: previo.h.actual, tocados: r.valor.tocados, globales: r.valor.globales, diferencia, dashboard: r.valor.dashboard }
      const h = registra(previo.h, { dashboard: r.valor.dashboard, autor: e.autor, instruccion: e.instruccion ?? null, parche: e.parche as never, resumen: e.resumen ?? `${r.valor.tocados.length} componente(s) y ${r.valor.globales.length} parte(s) global(es)`, cuando: ahora(c) })
      await guarda(c, previo, h)
      return { aplicado: true, enSeco: false, version: h.actual, tocados: r.valor.tocados, globales: r.valor.globales, diferencia, dashboard: r.valor.dashboard }
    } }),
  herramienta({ nombre: 'analizar_variacion', escribe: false, descripcion: 'Descompone el cambio de una métrica entre dos periodos (mezcla y tasa, volumen y precio, por los ejes del catálogo) y redacta un hallazgo con cifras de esas consultas.', entrada: z.object({ metrica: z.string(), periodo: periodoEsquema, contra: periodoEsquema.optional(), filtros: z.array(filtroEsquema).max(10).optional(), ejes: z.array(z.string()).max(6).optional() }).strict(),
    async ejecuta(c, e): Promise<AnalisisVariacion> {
      try { return await analizaVariacion(c.consultor, e) } catch (x) { if (x instanceof ConsultaInvalida) throw new RechazoEsquema(x.errores); throw x }
    } }),
  herramienta({ nombre: 'ver_senales', escribe: false, descripcion: 'Las señales de growth (detectar, diagnosticar, actuar, aprender) que el motor encuentra con el perfil, por ICE.', entrada: z.object({}).strict(),
    async ejecuta(c): Promise<readonly Senal[]> {
      if (!c.perfil) throw new RechazoEsquema([{ codigo: 'esquema', ruta: 'perfil', mensaje: 'sin perfil de growth no hay qué recorrer' }])
      return detectaSenales(c.consultor, c.perfil)
    } }),
  herramienta({ nombre: 'crear_alerta', escribe: true, descripcion: 'Propone una regla de monitoreo y la evalúa en seco; solo con aplicar y confirmada_por la registra. Nunca envía nada.', entrada: z.object({ regla: reglaEsquema, aplicar: z.boolean().default(false), confirmada_por: z.string().max(80).optional() }).strict(),
    async ejecuta(c, e): Promise<{ alerta: Alerta; evaluacion: Evaluacion }> {
      const p = proponeAlerta(c.consultor.catalogo, e.regla, ahora(c))
      if (!p.ok) throw new RechazoEsquema(p.errores)
      if (e.aplicar && !e.confirmada_por?.trim()) throw new RechazoEsquema([{ codigo: 'esquema', ruta: 'confirmada_por', mensaje: 'una alerta se registra solo con la confirmación de una persona (confirmada_por)' }])
      const evaluacion = await evaluaAlerta(c.consultor, p.valor, c.fechaCorte)
      const alerta = e.aplicar ? await registraAlerta(c.alertas, p.valor, e.confirmada_por ?? null) : p.valor
      return { alerta, evaluacion }
    } }),
  herramienta({ nombre: 'proponer_metrica', escribe: false, descripcion: 'Propone una métrica nueva como diff del YAML semántico (o dice qué dato falta). No abre PR ni toca el proyecto dbt.', entrada: z.unknown(),
    async ejecuta(c, e): Promise<Propuesta> { const r = proponeMetrica(c.consultor.catalogo, e); if (!r.ok) throw new RechazoEsquema(r.errores); return r.valor } }),
  herramienta({ nombre: 'comparar_versiones', escribe: false, descripcion: 'Qué componentes y qué cifras cambiaron entre dos versiones de un tablero.', entrada: z.object({ tablero, a: z.number().int().min(0), b: z.number().int().min(0), cifras: z.boolean().default(true) }).strict(),
    async ejecuta(c, e): Promise<{ diferencia: DiferenciaDashboard; cifras: readonly CambioCifra[] | null }> {
      const { h } = await historial(c, e.tablero)
      const [va, vb] = [h.versiones[e.a], h.versiones[e.b]]
      if (!va || !vb) throw new RechazoEsquema([{ codigo: 'version', ruta: 'a/b', mensaje: `el tablero tiene versiones 0 a ${h.versiones.length - 1}` }])
      const cifras = e.cifras ? comparaCifras(await resuelve(c.consultor, va.dashboard, c.resolver), await resuelve(c.consultor, vb.dashboard, c.resolver)) : null
      return { diferencia: comparaVersiones(va.dashboard, vb.dashboard), cifras }
    } }),
  herramienta({ nombre: 'volver_version', escribe: true, descripcion: 'Vuelve a una versión registrando una nueva con su contenido (la historia no se reescribe). Con aplicar.', entrada: z.object({ tablero, n: z.number().int().min(0), aplicar: z.boolean().default(false) }).strict(),
    async ejecuta(c, e) {
      const previo = await historial(c, e.tablero)
      if (!previo.h.versiones[e.n]) throw new RechazoEsquema([{ codigo: 'version', ruta: 'n', mensaje: `no existe la versión ${e.n}` }])
      const h = vuelveA(previo.h, e.n, ahora(c))
      if (e.aplicar) await guarda(c, previo, h)
      return { aplicado: e.aplicar, version: h.actual, dashboard: versionActual(h).dashboard }
    } }),
  herramienta({ nombre: 'fijar_oficial', escribe: true, descripcion: 'Marca una versión como la oficial del tablero. Con aplicar.', entrada: z.object({ tablero, n: z.number().int().min(0), aplicar: z.boolean().default(false) }).strict(),
    async ejecuta(c, e) {
      const previo = await historial(c, e.tablero)
      if (!previo.h.versiones[e.n]) throw new RechazoEsquema([{ codigo: 'version', ruta: 'n', mensaje: `no existe la versión ${e.n}` }])
      const h = fijaOficial(previo.h, e.n)
      if (e.aplicar) await guarda(c, previo, h)
      return { aplicado: e.aplicar, oficial: h.oficial }
    } }),
] as const

export type NombreHerramienta = (typeof HERRAMIENTAS)[number]['nombre']

/** La puerta única: valida la entrada con el esquema de la herramienta y la ejecuta. */
export async function ejecutaHerramienta(c: ContextoEstudio, nombre: string, entrada: unknown): Promise<unknown> {
  const h = HERRAMIENTAS.find((x) => x.nombre === nombre)
  if (!h) throw new RechazoEsquema([{ codigo: 'esquema', ruta: 'herramienta', mensaje: `no existe la herramienta «${nombre}»` }])
  const r = (h.entrada as z.ZodType).safeParse(entrada ?? {})
  if (!r.success) throw new RechazoEsquema(r.error.issues.map((i) => ({ codigo: 'esquema' as const, ruta: i.path.join('.'), mensaje: i.message })))
  return (h.ejecuta as (c: ContextoEstudio, e: unknown) => Promise<unknown>)(c, r.data)
}
