#!/usr/bin/env node
/**
 * El CLI del Estudio: la MISMA superficie de herramientas que usa el agente del lienzo, para cualquier otro agente o
 * persona. Las cuatro reglas de la casa (AGENTS.md, CLIs):
 *   - dry-run por defecto: lo que escribe (editar, alerta, volver, oficial, agente) solo se guarda con `--aplicar`;
 *   - nada que mueva dinero; nada se envía (una alerta registrada no tiene canal);
 *   - anti-reimplementación: lee la capa real (MetricFlow) o la foto del catálogo; jamás inventa una respuesta;
 *   - grado: NO MEDIDO hasta que se puntúe con la imprenta.
 * La salida es el JSON del núcleo tal cual (paridad probada en `pruebas/cli.ts`). Códigos: 0 bien · 2 error de uso ·
 * 3 rechazo del esquema o del catálogo · 4 falla de la capa · 5 modelo no disponible.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { cargaCatalogo, ConsultaInvalida, consultor, construyeCatalogo, ejecutaHerramienta, FallaDeCapa, HERRAMIENTAS, interpreta, RechazoEsquema, versionActual, nuevoHistorial, registra, type CatalogoCrudo, type ContextoEstudio, type PuertoSemantico } from '../index.js'
import { archivoAlertas, archivoVersiones } from '../almacenes/archivo.js'
import { puertoMetricFlow } from '../metricflow/index.js'
import { modeloOpenRouter } from '../openrouter.js'

export const SALIDA = { bien: 0, uso: 2, esquema: 3, capa: 4, modelo: 5 } as const
class ErrorDeUso extends Error {}

interface Config {
  readonly metricflow?: { readonly proyecto: string; readonly perfiles: string; readonly entorno?: Record<string, string> }
  readonly foto?: string
  readonly tableros?: Record<string, string>
  readonly perfil?: string
  readonly mapa?: { readonly dimensionMapa?: string; readonly capasMapa?: Record<string, string> }
  readonly almacen?: string
  readonly corte: string
  readonly contexto?: string
  readonly modelo?: string
  /** Tokens de razonamiento aparte de la respuesta, o "apagado". Sin él decide el proveedor. */
  readonly razonamiento?: number | 'apagado'
}

const AYUDA = `estudio-dashboards <subcomando> --config <archivo.json> [--entrada '<json>' | --entrada-archivo <ruta>] [--aplicar] [--confirmada-por <nombre>]
Subcomandos: ${HERRAMIENTAS.map((h) => `${h.nombre}${h.escribe ? ' (escribe: en seco salvo --aplicar)' : ''}`).join(' · ')} · agente "<instrucción>" --tablero <t> [--aplicar]
Salida: el JSON del núcleo. Códigos: 0 bien · 2 uso · 3 rechazo del esquema · 4 falla de la capa · 5 modelo no disponible.
Grado: no medido.`

function args(argv: string[]): { sub: string | undefined; pos: string[]; op: Record<string, string | true> } {
  const op: Record<string, string | true> = {}
  const pos: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (!a.startsWith('--')) { pos.push(a); continue }
    const siguiente = argv[i + 1]
    if (['--aplicar', '--ayuda'].includes(a) || siguiente === undefined || siguiente.startsWith('--')) op[a.slice(2)] = true
    else { op[a.slice(2)] = siguiente; i++ }
  }
  return { sub: pos.shift()?.replace(/-/g, '_'), pos, op }
}

const ruta = (base: string, r: string) => (r.startsWith('~/') ? join(homedir(), r.slice(2)) : isAbsolute(r) ? r : resolve(base, r))

function leeConfig(op: Record<string, string | true>): { c: Config; base: string } {
  const archivo = op['config']
  if (typeof archivo !== 'string') throw new ErrorDeUso('falta --config <archivo.json>')
  const c = JSON.parse(readFileSync(archivo, 'utf8')) as Config
  if (!c.corte || !/^\d{4}-\d{2}$/.test(c.corte)) throw new ErrorDeUso('la config necesita "corte": "AAAA-MM"')
  return { c, base: dirname(resolve(archivo)) }
}

/** Sin capa (solo la foto del catálogo): sirve para listar, describir y validar; consultar falla como capa. */
function puertoFoto(crudo: CatalogoCrudo & { dominios?: Record<string, string[]> }): PuertoSemantico {
  return {
    async catalogo() { return crudo },
    async valores(_m, d) { return crudo.dominios?.[d] ?? [] },
    async consulta() { throw new FallaDeCapa('sin capa semántica: la config solo trae la foto del catálogo') },
  }
}

async function contexto(c: Config, base: string): Promise<ContextoEstudio & { puerto: PuertoSemantico }> {
  let puerto: PuertoSemantico
  if (c.metricflow) {
    const entorno = Object.fromEntries(Object.entries(c.metricflow.entorno ?? {}).map(([k, v]) => [k, /^(\.{1,2}\/|~\/)/.test(v) ? ruta(base, v) : v]))
    puerto = puertoMetricFlow({ proyecto: ruta(base, c.metricflow.proyecto), perfiles: ruta(base, c.metricflow.perfiles), entorno })
  } else if (c.foto) puerto = puertoFoto(JSON.parse(readFileSync(ruta(base, c.foto), 'utf8')))
  else throw new ErrorDeUso('la config necesita "metricflow" o "foto"')
  const cat = c.foto && !c.metricflow ? (() => { const f = JSON.parse(readFileSync(ruta(base, c.foto!), 'utf8')); return construyeCatalogo(f, f.dominios ?? {}) })() : await cargaCatalogo(puerto)
  const almacen = ruta(base, c.almacen ?? '~/.estudio-dashboards/sin-nombre')
  return {
    puerto, consultor: consultor(puerto, cat), versiones: archivoVersiones(almacen), alertas: archivoAlertas(almacen), fechaCorte: c.corte,
    tablerosBase: Object.fromEntries(Object.entries(c.tableros ?? {}).map(([k, r]) => [k, JSON.parse(readFileSync(ruta(base, r), 'utf8'))])),
    ...(c.perfil ? { perfil: JSON.parse(readFileSync(ruta(base, c.perfil), 'utf8')) } : {}),
    ...(c.mapa ? { resolver: c.mapa } : {}),
  }
}

function entrada(op: Record<string, string | true>): Record<string, unknown> {
  if (typeof op['entrada'] === 'string') return JSON.parse(op['entrada']) as Record<string, unknown>
  if (typeof op['entrada-archivo'] === 'string') return JSON.parse(readFileSync(op['entrada-archivo'], 'utf8')) as Record<string, unknown>
  return {}
}

async function agente(ctx: ContextoEstudio, c: Config, pos: string[], op: Record<string, string | true>): Promise<unknown> {
  const instruccion = pos.join(' ').trim()
  const tablero = op['tablero']
  if (!instruccion || typeof tablero !== 'string') throw new ErrorDeUso('uso: agente "<instrucción>" --tablero <nombre>')
  const llave = process.env['OPENROUTER_API_KEY'] ?? ''
  const modelo = typeof op['modelo'] === 'string' ? op['modelo'] : c.modelo
  if (!llave || !modelo) return Promise.reject(Object.assign(new Error(`modelo no disponible: ${llave ? '' : 'falta OPENROUTER_API_KEY en el entorno; '}${modelo ? '' : 'falta "modelo" (pineado) en la config'}`), { modeloNoDisponible: true }))
  const h = (await ctx.versiones.lee(tablero)) ?? nuevoHistorial(tablero, ctx.tablerosBase?.[tablero] ?? (() => { throw new ErrorDeUso(`no existe el tablero «${tablero}»`) })())
  const v = await interpreta({ consultor: ctx.consultor, modelo: modeloOpenRouter({ llave, modelo, fetch, ...(c.razonamiento === undefined ? {} : { razonamiento: c.razonamiento === 'apagado' ? 'apagado' : { maxTokens: c.razonamiento } }) }), corte: c.corte, contexto: c.contexto }, versionActual(h).dashboard, h.actual, instruccion)
  const aplicado = v.resultado?.aplicado
  if (op['aplicar'] === true && aplicado && !v.error) {
    const previo = await ctx.versiones.lee(tablero)
    await ctx.versiones.guarda(registra(h, { dashboard: aplicado.dashboard, autor: 'agente', instruccion, parche: v.resultado!.parche, resumen: v.texto.slice(0, 300), cuando: new Date().toISOString() }), previo ? previo.actual : null)
  }
  return { aplicado: op['aplicar'] === true && !!aplicado && !v.error, entendi: v.entendi, texto: v.texto, plan: v.plan, tocados: aplicado?.tocados ?? [], error: v.error, modelo: v.modelo, versionPrompt: v.versionPrompt, costoUsd: v.costoUsd, intentos: v.intentos }
}

export async function principal(argv: string[]): Promise<{ codigo: number; salida: string }> {
  const { sub, pos, op } = args(argv)
  if (!sub || sub === 'ayuda' || op['ayuda']) return { codigo: sub ? SALIDA.bien : SALIDA.uso, salida: AYUDA }
  let ctx: (ContextoEstudio & { puerto: PuertoSemantico }) | undefined
  try {
    const { c, base } = leeConfig(op)
    if (sub !== 'agente' && !HERRAMIENTAS.some((h) => h.nombre === sub)) throw new ErrorDeUso(`subcomando desconocido: ${sub}\n${AYUDA}`)
    ctx = await contexto(c, base)
    const e = entrada(op)
    if (op['aplicar'] === true) e['aplicar'] = true
    if (typeof op['confirmada-por'] === 'string') e['confirmada_por'] = op['confirmada-por']
    const r = sub === 'agente' ? await agente(ctx, c, pos, op) : await ejecutaHerramienta(ctx, sub, e)
    return { codigo: SALIDA.bien, salida: JSON.stringify(r) }
  } catch (x) {
    const m = x instanceof Error ? x.message : String(x)
    const codigo = x instanceof ErrorDeUso || x instanceof SyntaxError ? SALIDA.uso : x instanceof RechazoEsquema || x instanceof ConsultaInvalida ? SALIDA.esquema : (x as { modeloNoDisponible?: boolean }).modeloNoDisponible ? SALIDA.modelo : x instanceof FallaDeCapa ? SALIDA.capa : SALIDA.capa
    return { codigo, salida: JSON.stringify({ error: m, ...(x instanceof RechazoEsquema ? { errores: x.errores } : {}) }) }
  } finally {
    await ctx?.puerto.cierra?.()
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('/estudio-dashboards')) {
  principal(process.argv.slice(2)).then(({ codigo, salida }) => { (codigo ? process.stderr : process.stdout).write(`${salida}\n`); process.exitCode = codigo })
}
