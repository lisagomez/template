#!/usr/bin/env node
/**
 * `calendario`: la pluma desde la terminal, para un agente o una persona (sucesor de agent-event.py).
 *
 * Cuatro reglas de los CLIs de esta fabrica:
 * - DRY-RUN POR DEFECTO: sin `--aplica`, imprime el plan (JSON) y no toca nada.
 * - Lo que notifica a terceros (invitados con `--notificar`) es IRREVERSIBLE: exige ademas
 *   `--confirmo-notificar`, y el plan lo marca `irreversible: true`.
 * - No reimplementa: lee del espejo o escribe por la pluma contra el proveedor real (gog). El
 *   simulador solo existe para probar el propio CLI (`--proveedor simulador`).
 * - Sale con 0 si todo bien, 2 si la entrada o el gate lo impiden, 1 si el proveedor fallo.
 *
 *   calendario consulta --desde ISO --hasta ISO [--calendario id]… [--zona Z]
 *   calendario sincroniza [--calendario id]…
 *   calendario crea --calendario id --titulo T --inicio ISO --fin ISO [--zona Z] [--rrule R]… [--invitado c]… [--vinculo tipo:id]…
 *   calendario actualiza --calendario id --evento id [--titulo T] [--inicio ISO --fin ISO] [--alcance este|siguientes|todos]
 *                        [--serie id --inicio-original ISO]
 *   calendario borra --calendario id --evento id [--alcance …] [--serie id --inicio-original ISO]
 *
 * Comunes: --cuenta (o CALENDARIO_CUENTA), --espejo archivo.json (por defecto .calendario-espejo.json),
 * --proveedor gog|simulador, --clave K (idempotencia), --aplica, --notificar nadie|externos|todos, --confirmo-notificar.
 */
import { parseArgs } from 'node:util'
import { Lector, Pluma, esErrorCalendario, sincroniza, type Alcance, type EntradaEvento, type Notificar, type Proveedor, type RefCalendario } from '../index.js'
import { AlmacenEnArchivo } from '../almacenes/archivo.js'
import { ProveedorGog } from '../gog/index.js'
import { ejecutorGog } from '../gog/proceso.js'
import { SimuladorGoogle } from '../simulador/index.js'
import { claveNueva } from '../ids.js'

type Valores = Record<string, string | boolean | string[] | undefined>

const OPCIONES = {
  cuenta: { type: 'string' }, espejo: { type: 'string' }, proveedor: { type: 'string' }, clave: { type: 'string' },
  aplica: { type: 'boolean' }, notificar: { type: 'string' }, 'confirmo-notificar': { type: 'boolean' },
  calendario: { type: 'string', multiple: true }, evento: { type: 'string' }, serie: { type: 'string' }, 'inicio-original': { type: 'string' },
  titulo: { type: 'string' }, descripcion: { type: 'string' }, lugar: { type: 'string' }, inicio: { type: 'string' }, fin: { type: 'string' },
  zona: { type: 'string' }, rrule: { type: 'string', multiple: true }, invitado: { type: 'string', multiple: true }, vinculo: { type: 'string', multiple: true },
  alcance: { type: 'string' }, desde: { type: 'string' }, hasta: { type: 'string' }, 'todo-el-dia': { type: 'boolean' },
} as const

class ErrorDeUso extends Error {}

const texto = (v: Valores, k: string): string | undefined => (typeof v[k] === 'string' ? (v[k] as string) : undefined)
const lista = (v: Valores, k: string): string[] => (Array.isArray(v[k]) ? (v[k] as string[]) : [])
function exige(v: Valores, k: string): string {
  const x = texto(v, k)
  if (!x) throw new ErrorDeUso(`falta --${k}`)
  return x
}

function cuentaDe(v: Valores): string {
  const cuenta = texto(v, 'cuenta') ?? process.env.CALENDARIO_CUENTA
  if (cuenta === undefined) throw new ErrorDeUso('falta --cuenta (o CALENDARIO_CUENTA)')
  return cuenta
}

const notificarDe = (v: Valores): Notificar => (texto(v, 'notificar') ?? 'nadie') as Notificar
const alcanceDe = (v: Valores): Alcance | undefined => texto(v, 'alcance') as Alcance | undefined

function proveedorDe(v: Valores): Proveedor {
  const nombre = texto(v, 'proveedor') ?? 'gog'
  if (nombre === 'simulador') return simuladorDe(v)
  if (nombre !== 'gog') throw new ErrorDeUso(`proveedor desconocido: ${nombre}`)
  return new ProveedorGog({ ejecuta: ejecutorGog(), zona: texto(v, 'zona') })
}

/** Un Google vacio con los calendarios pedidos, para probar el propio CLI. */
function simuladorDe(v: Valores): SimuladorGoogle {
  const sim = new SimuladorGoogle()
  const cuenta = cuentaDe(v)
  const zona = texto(v, 'zona') ?? 'UTC'
  for (const id of lista(v, 'calendario')) sim.agregaCalendario({ cuenta, id, nombre: id, color: null, zona, rol: 'propietario', principal: false, visible: true })
  return sim
}

function entradaEvento(v: Valores): EntradaEvento {
  return {
    titulo: exige(v, 'titulo'), inicio: exige(v, 'inicio'), fin: exige(v, 'fin'), zona: texto(v, 'zona') ?? 'UTC',
    descripcion: texto(v, 'descripcion'), lugar: texto(v, 'lugar'), todoElDia: v['todo-el-dia'] === true,
    recurrencia: lista(v, 'rrule').length ? lista(v, 'rrule') : null,
    invitados: lista(v, 'invitado').map((correo) => ({ correo })),
    vinculos: lista(v, 'vinculo').map((x) => { const [tipo = '', ...id] = x.split(':'); return { tipo, id: id.join(':') } }),
  }
}

function cambios(v: Valores): Partial<EntradaEvento> {
  const c: Partial<EntradaEvento> = {}
  for (const k of ['titulo', 'descripcion', 'lugar', 'inicio', 'fin', 'zona'] as const) if (texto(v, k) !== undefined) c[k] = texto(v, k)
  if (lista(v, 'rrule').length) c.recurrencia = lista(v, 'rrule')
  return c
}

function plan(accion: string, v: Valores, detalle: object, invitados: number): object {
  const notificar = notificarDe(v)
  return { accion, aplicado: false, calendario: lista(v, 'calendario')[0], ...detalle, notificar, invitados, irreversible: notificar !== 'nadie' && invitados > 0, como_aplicar: 'repite con --aplica (y --confirmo-notificar si notifica a invitados)' }
}

interface Contexto {
  v: Valores
  almacen: AlmacenEnArchivo
  refs: RefCalendario[]
  /** El primer `--calendario`: toda orden lo exige salvo `sincroniza`. */
  ref: RefCalendario
}

/** Una orden que escribe: su plan (lo que imprime el dry-run) y lo que hace con `--aplica`. */
interface Orden {
  plan(c: Contexto): object
  aplica(c: Contexto, proveedor: Proveedor): Promise<object>
}

const instanciaDe = (c: Contexto) => ({ ...c.ref, id: exige(c.v, 'evento'), serie: texto(c.v, 'serie') ?? null, inicioOriginal: texto(c.v, 'inicio-original') ?? null })
const escrituraDe = (v: Valores) => ({ clave: texto(v, 'clave') ?? claveNueva('cli'), notificar: notificarDe(v), confirmaNotificar: v['confirmo-notificar'] === true })
const plumaDe = (c: Contexto, proveedor: Proveedor) => new Pluma({ proveedor, almacen: c.almacen })

const ORDENES: Record<string, Orden> = {
  crea: {
    plan: (c) => { const e = entradaEvento(c.v); return plan('crea', c.v, { evento: e }, e.invitados?.length ?? 0) },
    aplica: (c, p) => plumaDe(c, p).crea(c.ref, entradaEvento(c.v), escrituraDe(c.v)),
  },
  actualiza: {
    plan: (c) => plan('actualiza', c.v, { evento: instanciaDe(c), cambios: cambios(c.v), alcance: alcanceDe(c.v) ?? 'este' }, lista(c.v, 'invitado').length),
    aplica: (c, p) => plumaDe(c, p).actualiza(instanciaDe(c), cambios(c.v), { ...escrituraDe(c.v), alcance: alcanceDe(c.v) }),
  },
  borra: {
    plan: (c) => plan('borra', c.v, { evento: instanciaDe(c), alcance: alcanceDe(c.v) ?? 'este' }, lista(c.v, 'invitado').length),
    aplica: (c, p) => plumaDe(c, p).borra(instanciaDe(c), { ...escrituraDe(c.v), alcance: alcanceDe(c.v) }),
  },
  sincroniza: {
    plan: (c) => ({ accion: 'sincroniza', aplicado: false, calendarios: c.refs, como_aplicar: 'repite con --aplica' }),
    aplica: (c, proveedor) => Promise.all(c.refs.map((r) => sincroniza({ proveedor, almacen: c.almacen }, r))),
  },
}

async function ejecuta(nombre: string, v: Valores): Promise<object> {
  const cuenta = cuentaDe(v)
  const almacen = await AlmacenEnArchivo.abre(texto(v, 'espejo') ?? '.calendario-espejo.json')
  const refs: RefCalendario[] = lista(v, 'calendario').map((calendario) => ({ cuenta, calendario }))
  if (nombre === 'consulta') {
    return new Lector({ almacen }).consulta({ calendarios: refs, desde: Date.parse(exige(v, 'desde')), hasta: Date.parse(exige(v, 'hasta')), zona: texto(v, 'zona') ?? 'UTC' })
  }
  const ref = refs[0]
  if (!ref && nombre !== 'sincroniza') throw new ErrorDeUso('falta --calendario')
  const orden = Object.hasOwn(ORDENES, nombre) ? ORDENES[nombre] : undefined
  if (!orden) throw new ErrorDeUso(`orden desconocida: ${nombre}`)
  const c: Contexto = { v, almacen, refs, ref: ref as RefCalendario }
  return v.aplica ? orden.aplica(c, proveedorDe(v)) : orden.plan(c)
}

function codigoDeSalida(e: unknown): number {
  const deUso = e instanceof ErrorDeUso || esErrorCalendario(e, 'validacion') || esErrorCalendario(e, 'requiere-confirmacion')
    || (e instanceof TypeError && /parseArgs|Unknown option/i.test(e.message))
  return deUso ? 2 : 1
}

function salidaDeError(e: unknown): object {
  if (esErrorCalendario(e)) return { error: e.codigo, mensaje: e.message, destraba: e.destraba }
  return { error: 'uso', mensaje: e instanceof Error ? e.message : String(e) }
}

async function principal(argv: string[]): Promise<number> {
  try {
    const { values, positionals } = parseArgs({ args: argv, options: OPCIONES, allowPositionals: true, strict: true })
    const orden = positionals[0]
    if (!orden) throw new ErrorDeUso('uso: calendario consulta|sincroniza|crea|actualiza|borra [opciones] (ver la cabecera de este archivo)')
    process.stdout.write(`${JSON.stringify(await ejecuta(orden, values as Valores), null, 2)}\n`)
    return 0
  } catch (e) {
    process.stderr.write(`${JSON.stringify(salidaDeError(e))}\n`)
    return codigoDeSalida(e)
  }
}

process.exitCode = await principal(process.argv.slice(2))
