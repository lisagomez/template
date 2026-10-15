/**
 * Proveedor → espejo. Con token: solo los cambios (incluidos los borrados). Si el proveedor invalida
 * el token (410 en Google), se hace una sincronizacion COMPLETA y el espejo queda exactamente como el
 * proveedor. Sin token (un proveedor que no lo da), siempre completa sobre una ventana.
 *
 * Solo se poda el espejo si el listado vino COMPLETO: la fuente cortaba en 250 eventos y despues
 * borraba del espejo lo que no habia llegado, es decir, eventos que existian.
 *
 * Un fallo no se lanza: se GUARDA como estado (con quien lo destraba) y lo ve la salud del espejo.
 */
import { esErrorCalendario } from './errores.js'
import type { Almacen, ErrorDeSync, EstadoSync, Proveedor, Reloj } from './puertos.js'
import { relojDelSistema } from './puertos.js'
import type { Evento, RefCalendario, Ventana } from './tipos.js'

export interface ResultadoSync {
  modo: 'incremental' | 'completa'
  guardados: number
  borrados: number
  paginas: number
  completo: boolean
  error: ErrorDeSync | null
}

export interface DepsSync { proveedor: Proveedor; almacen: Almacen; reloj?: Reloj }

/** Ventana por defecto de un proveedor sin token: −7 / +45 dias (la de la fuente). */
export function ventanaPorDefecto(ahora: number): Ventana {
  return { desde: ahora - 7 * 86_400_000, hasta: ahora + 45 * 86_400_000 }
}

async function incremental(d: DepsSync, ref: RefCalendario, token: string): Promise<ResultadoSync & { token: string | null }> {
  let pagina: string | null = null
  let nuevo: string | null = null
  const r = { modo: 'incremental' as const, guardados: 0, borrados: 0, paginas: 0, completo: true, error: null }
  do {
    const p = await d.proveedor.lista(ref, { token, pagina })
    r.paginas++
    const vivos = p.eventos.filter((e) => e.estado !== 'cancelado' || e.serie)
    const muertos = p.eventos.filter((e) => e.estado === 'cancelado' && !e.serie)
    if (vivos.length) await d.almacen.guardaEventos(vivos)
    for (const m of muertos) {
      const excepciones = m.recurrencia ? (await d.almacen.excepciones(ref, m.id)).map((x) => x.id) : []
      await d.almacen.borraEventos(ref, [m.id, ...excepciones])
    }
    r.guardados += vivos.length
    r.borrados += muertos.length
    pagina = p.siguientePagina
    nuevo = p.tokenSync ?? nuevo
  } while (pagina)
  return { ...r, token: nuevo }
}

async function completa(d: DepsSync, ref: RefCalendario, ventana: Ventana | null): Promise<ResultadoSync & { token: string | null }> {
  let pagina: string | null = null
  let token: string | null = null
  let completo = true
  let paginas = 0
  const todos: Evento[] = []
  do {
    const p = await d.proveedor.lista(ref, { token: null, pagina, ventana })
    paginas++
    todos.push(...p.eventos)
    completo &&= p.completo
    pagina = p.siguientePagina
    token = p.tokenSync ?? token
  } while (pagina)
  const vivos = todos.filter((e) => e.estado !== 'cancelado' || e.serie)
  if (completo) await d.almacen.reemplazaCalendario(ref, vivos, token ? null : ventana)
  else await d.almacen.guardaEventos(vivos)
  return { modo: 'completa', guardados: vivos.length, borrados: 0, paginas, completo, error: null, token }
}

/** Cierra las reparaciones pendientes de este calendario: tras una completa, el espejo ES el proveedor. */
async function cierraPendientes(almacen: Almacen, ref: RefCalendario): Promise<void> {
  for (const i of await almacen.intenciones()) {
    if (i.cuenta === ref.cuenta && i.calendario === ref.calendario) await almacen.cierraIntencion(i.clave, null)
  }
}

export async function sincroniza(d: DepsSync, ref: RefCalendario, opciones: { ventana?: Ventana | null; forzarCompleta?: boolean } = {}): Promise<ResultadoSync> {
  const reloj = d.reloj ?? relojDelSistema
  const previo = await d.almacen.estadoSync(ref)
  const base: EstadoSync = previo ?? { ...ref, token: null, ultimaSync: null, ultimoIntento: null, error: null }
  const ventana = opciones.ventana === undefined ? ventanaPorDefecto(reloj.ahora()) : opciones.ventana
  try {
    let r: ResultadoSync & { token: string | null }
    if (base.token && !opciones.forzarCompleta) {
      try {
        r = await incremental(d, ref, base.token)
      } catch (e) {
        if (!esErrorCalendario(e, 'token-invalido')) throw e
        r = await completa(d, ref, ventana)
      }
    } else {
      r = await completa(d, ref, ventana)
    }
    if (r.modo === 'completa' && r.completo) await cierraPendientes(d.almacen, ref)
    const ahora = reloj.ahora()
    await d.almacen.guardaEstadoSync({ ...base, token: r.token, ultimaSync: ahora, ultimoIntento: ahora, error: null })
    return { modo: r.modo, guardados: r.guardados, borrados: r.borrados, paginas: r.paginas, completo: r.completo, error: null }
  } catch (e) {
    const error: ErrorDeSync = esErrorCalendario(e)
      ? { codigo: e.codigo, mensaje: e.message, destraba: e.destraba }
      : { codigo: 'proveedor', mensaje: e instanceof Error ? e.message : String(e), destraba: null }
    await d.almacen.guardaEstadoSync({ ...base, ultimoIntento: reloj.ahora(), error })
    return { modo: base.token ? 'incremental' : 'completa', guardados: 0, borrados: 0, paginas: 0, completo: false, error }
  }
}
