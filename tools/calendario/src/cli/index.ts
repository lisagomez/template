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

function proveedorDe(v: Valores): Proveedor {
  const nombre = texto(v, 'proveedor') ?? 'gog'
  if (nombre === 'simulador') {
    const sim = new SimuladorGoogle()
    for (const c of lista(v, 'calendario')) sim.agregaCalendario({ cuenta: cuentaDe(v), id: c, nombre: c, color: null, zona: texto(v, 'zona') ?? 'UTC', rol: 'propietario', principal: false, visible: true })
    return sim
  }
  if (nombre !== 'gog') throw new ErrorDeUso(`proveedor desconocido: ${nombre}`)
  return new ProveedorGog({ ejecuta: ejecutorGog(), zona: texto(v, 'zona') })
}

const cuentaDe = (v: Valores): string => texto(v, 'cuenta') ?? process.env.CALENDARIO_CUENTA ?? (() => { throw new ErrorDeUso('falta --cuenta (o CALENDARIO_CUENTA)') })()

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
  const notificar = (texto(v, 'notificar') ?? 'nadie') as Notificar
  return { accion, aplicado: false, calendario: lista(v, 'calendario')[0], ...detalle, notificar, invitados, irreversible: notificar !== 'nadie' && invitados > 0, como_aplicar: 'repite con --aplica (y --confirmo-notificar si notifica a invitados)' }
}

async function ejecuta(orden: string, v: Valores): Promise<object> {
  const cuenta = cuentaDe(v)
  const almacen = await AlmacenEnArchivo.abre(texto(v, 'espejo') ?? '.calendario-espejo.json')
  const refs: RefCalendario[] = lista(v, 'calendario').map((calendario) => ({ cuenta, calendario }))
  if (orden === 'consulta') {
    const lector = new Lector({ almacen })
    return lector.consulta({ calendarios: refs, desde: Date.parse(exige(v, 'desde')), hasta: Date.parse(exige(v, 'hasta')), zona: texto(v, 'zona') ?? 'UTC' })
  }
  const ref = refs[0]
  if (!ref && orden !== 'sincroniza') throw new ErrorDeUso('falta --calendario')
  const notificar = (texto(v, 'notificar') ?? 'nadie') as Notificar
  const op = { clave: texto(v, 'clave') ?? claveNueva('cli'), notificar, confirmaNotificar: v['confirmo-notificar'] === true }
  const alcance = texto(v, 'alcance') as Alcance | undefined
  const inst = () => ({ ...(ref as RefCalendario), id: exige(v, 'evento'), serie: texto(v, 'serie') ?? null, inicioOriginal: texto(v, 'inicio-original') ?? null })
  if (!v.aplica) {
    if (orden === 'crea') { const e = entradaEvento(v); return plan('crea', v, { evento: e }, e.invitados?.length ?? 0) }
    if (orden === 'actualiza') return plan('actualiza', v, { evento: inst(), cambios: cambios(v), alcance: alcance ?? 'este' }, lista(v, 'invitado').length)
    if (orden === 'borra') return plan('borra', v, { evento: inst(), alcance: alcance ?? 'este' }, lista(v, 'invitado').length)
    if (orden === 'sincroniza') return { accion: 'sincroniza', aplicado: false, calendarios: refs, como_aplicar: 'repite con --aplica' }
    throw new ErrorDeUso(`orden desconocida: ${orden}`)
  }
  const proveedor = proveedorDe(v)
  const pluma = new Pluma({ proveedor, almacen })
  if (orden === 'crea') return pluma.crea(ref as RefCalendario, entradaEvento(v), op)
  if (orden === 'actualiza') return pluma.actualiza(inst(), cambios(v), { ...op, alcance })
  if (orden === 'borra') return pluma.borra(inst(), { ...op, alcance })
  if (orden === 'sincroniza') return Promise.all(refs.map((r) => sincroniza({ proveedor, almacen }, r)))
  throw new ErrorDeUso(`orden desconocida: ${orden}`)
}

async function principal(argv: string[]): Promise<number> {
  try {
    const { values, positionals } = parseArgs({ args: argv, options: OPCIONES, allowPositionals: true, strict: true })
    const orden = positionals[0]
    if (!orden) throw new ErrorDeUso('uso: calendario consulta|sincroniza|crea|actualiza|borra [opciones] (ver la cabecera de este archivo)')
    process.stdout.write(`${JSON.stringify(await ejecuta(orden, values as Valores), null, 2)}\n`)
    return 0
  } catch (e) {
    const codigo = e instanceof ErrorDeUso || esErrorCalendario(e, 'validacion') || esErrorCalendario(e, 'requiere-confirmacion') || (e instanceof TypeError && /parseArgs|Unknown option/i.test(e.message)) ? 2 : 1
    const salida = esErrorCalendario(e) ? { error: e.codigo, mensaje: e.message, destraba: e.destraba } : { error: 'uso', mensaje: e instanceof Error ? e.message : String(e) }
    process.stderr.write(`${JSON.stringify(salida)}\n`)
    return codigo
  }
}

process.exitCode = await principal(process.argv.slice(2))
