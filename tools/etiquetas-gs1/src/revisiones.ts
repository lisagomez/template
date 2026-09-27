/**
 * Lo que esta POR CONFIRMAR: recepciones cuya caducidad se leyo de una foto y la persona no ha
 * confirmado. Son una vista de la cadena (eventos EN_REVISION sin resolver), no una lista aparte:
 * borrar una revision abierta rompe la cadena como borrar cualquier otro evento.
 *
 * Mientras una revision este abierta, esas cajas NO existen para el inventario: no estan en las
 * existencias, ni en el FEFO, ni en el semaforo. Estan en el andén, en recibo, y el servidor
 * rechaza moverlas, venderlas o transferirlas con un motivo que dice por que.
 */
import type { Evento } from './cadena.js'
import type { EstadoAlmacen } from './modelo.js'

export interface RevisionAbierta {
  readonly evento: Evento
  readonly sitio: string
  readonly folio: string
  readonly sku: string
  readonly cajas: number
  /** Seudonimo de quien la registro: es quien la confirma. */
  readonly operador: string
  readonly desde: string
}

/** Hashes que una revision ya resolvio: confirmada (RECIBIDO), descartada (RECHAZADO) o reemplazada. */
function resueltas(eventos: readonly Evento[]): Set<string> {
  const r = new Set<string>()
  for (const e of eventos) {
    const rev = e.datos['revision']
    const reemplaza = e.datos['reemplaza']
    if (typeof rev === 'string' && (e.tipo === 'RECIBIDO' || e.tipo === 'RECHAZADO')) r.add(rev)
    if (typeof reemplaza === 'string' && e.tipo === 'EN_REVISION') r.add(reemplaza)
  }
  return r
}

/** Las revisiones abiertas de un sitio (o de todos), de la mas vieja a la mas nueva. */
export function revisionesAbiertas(estado: EstadoAlmacen, sitio?: string): RevisionAbierta[] {
  const salida: RevisionAbierta[] = []
  for (const [s, eventos] of Object.entries(estado.eventos ?? {})) {
    if (sitio && s !== sitio) continue
    const cerradas = resueltas(eventos)
    for (const e of eventos) {
      if (e.tipo !== 'EN_REVISION' || cerradas.has(e.hash)) continue
      salida.push({ evento: e, sitio: s, folio: e.lote.lote, sku: String(e.datos['sku'] ?? ''), cajas: Number(e.datos['cajas'] ?? 0), operador: e.operador, desde: e.fecha })
    }
  }
  return salida.sort((a, b) => a.desde.localeCompare(b.desde))
}

/** «hace 2 h», «hace 3 días»: cuanto lleva una revision sin confirmar. */
export function antiguedad(desde: string, ahora: string): string {
  const min = Math.max(0, Math.round((Date.parse(ahora) - Date.parse(desde)) / 60_000))
  if (min < 60) return `hace ${min} min`
  if (min < 48 * 60) return `hace ${Math.floor(min / 60)} h`
  return `hace ${Math.floor(min / 1440)} días`
}

/**
 * Si ese articulo tiene cajas por confirmar en el sitio, el motivo para no moverlo, venderlo ni
 * transferirlo. `gtin` puede ser el de la pieza o el de la caja.
 */
export function bloqueoPorRevision(estado: EstadoAlmacen, sitio: string, gtin: string, ahora?: string): string | undefined {
  const art = Object.values(estado.articulos).find((a) => a.gtinCaja === gtin || a.gtinUnidad === gtin)
  if (!art) return undefined
  const abiertas = revisionesAbiertas(estado, sitio).filter((r) => r.sku === art.sku)
  if (abiertas.length === 0) return undefined
  const cajas = abiertas.reduce((n, r) => n + r.cajas, 0)
  const vieja = abiertas[0]!
  return `caducidad por confirmar: ${cajas} caja(s) de «${art.descripcion}» siguen en recibo${ahora ? ` (${antiguedad(vieja.desde, ahora)})` : ''} y no se mueven, venden ni transfieren hasta que quien las registró confirme la fecha (folio ${vieja.folio})`
}
