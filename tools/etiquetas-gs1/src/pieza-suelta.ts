/**
 * La PIEZA SUELTA en piso: al abrir la caja, la pieza ya no trae la etiqueta de la casa; solo el
 * EAN del proveedor y su fecha impresa. Con la foto de esa fecha (el mismo motor local de la
 * recepcion) se IDENTIFICA el lote: lo leido (fecha, lote) se compara con los lotes de ese
 * articulo en ese sitio.
 *
 * - Un solo lote coincide → identificado, pero es una PROPUESTA: la persona confirma que es ese
 *   antes de cualquier accion (ninguna caducidad cuenta sin confirmacion humana).
 * - Varios → se ensenan para elegir.
 * - Ninguno → HALLAZGO: se registra en la cadena (mercancia que no entro por recepcion, o un lote
 *   mal capturado). No es un error que se ignora; lo ve el supervisor en el tablero del dia.
 */
import type { ClaveLote, Evento } from './cadena.js'
import { registra, type Paso } from './expediente.js'
import { diasParaCaducar } from './fefo.js'
import type { Json } from './jcs.js'
import type { Propuesta } from './lectura-caducidad.js'
import type { EstadoAlmacen, Zona } from './modelo.js'
import { categoriaPorId, estadoSemaforo, type EstadoSemaforo } from './semaforo.js'
import { ubicacionDe, zonaDe } from './ubicaciones.js'

export interface CandidatoPieza {
  readonly lote: ClaveLote
  readonly semaforo: EstadoSemaforo
  readonly dias: number
  readonly ubicacion: string
  /** Coincidio tambien el lote leido (no solo la fecha). */
  readonly porLote: boolean
}

export interface Identificacion {
  readonly estado: 'identificado' | 'varios' | 'no-cuadra' | 'sin-fecha'
  readonly candidatos: readonly CandidatoPieza[]
  readonly leido: { readonly fechas: readonly string[]; readonly lote?: string }
  readonly mensaje: string
}

/** Las fechas que la propuesta deja sobre la mesa: la propuesta, o sus opciones si hay ambiguedad. */
const fechasDe = (p: Propuesta): string[] => (p.fecha ? [p.fecha] : [...new Set(p.opciones.map((o) => o.iso))])

export function identificaPieza(estado: EstadoAlmacen, sitio: string, sku: string, p: Propuesta, hoy: string): Identificacion {
  const art = estado.articulos[sku]
  const fechas = fechasDe(p)
  const lote = p.lote ?? p.lotesPosibles[0]?.valor
  const leido = { fechas, ...(lote ? { lote } : {}) }
  if (fechas.length === 0) return { estado: 'sin-fecha', candidatos: [], leido, mensaje: `${p.mensaje} Sin fecha no se sabe qué lote es.` }
  const cat = categoriaPorId(estado.configuracion.categorias, art?.categoria)
  const vistos = new Set<string>()
  const candidatos = estado.existencias
    .filter((e) => e.sitio === sitio && e.sku === sku && e.cantidad > 0 && zonaDe(e) !== 'merma' && fechas.includes(e.caducidad))
    .filter((e) => { const k = `${e.lote}|${e.caducidad}`; if (vistos.has(k)) return false; vistos.add(k); return true })
    .map((e) => { const dias = diasParaCaducar(e.caducidad, hoy); return { lote: { gtin: e.gtin, lote: e.lote, caducidad: e.caducidad }, semaforo: estadoSemaforo(dias, cat), dias, ubicacion: ubicacionDe(zonaDe(e), e.posicion), porLote: Boolean(lote && e.lote === lote) } })
    .sort((a, b) => Number(b.porLote) - Number(a.porLote) || a.lote.caducidad.localeCompare(b.lote.caducidad))
  const exactos = candidatos.filter((c) => c.porLote)
  const final = exactos.length === 1 ? exactos : candidatos
  if (final.length === 1) return { estado: 'identificado', candidatos: final, leido, mensaje: `Es el lote ${final[0]!.lote.lote} (caduca ${final[0]!.lote.caducidad}). Confírmalo con la pieza en la mano.` }
  if (final.length > 1) return { estado: 'varios', candidatos: final, leido, mensaje: 'Varios lotes de este artículo coinciden con lo leído: elige el de la pieza.' }
  return { estado: 'no-cuadra', candidatos: [], leido, mensaje: `Lo leído (${fechas.join(' o ')}${lote ? `, lote ${lote}` : ''}) no cuadra con ningún lote de este artículo en el sitio: regístralo como hallazgo.` }
}

export interface PedidoHallazgo {
  readonly sitio: string
  readonly sku: string
  readonly zona: Zona
  readonly fotos: { readonly completa: string; readonly recortes: readonly string[] }
  readonly propuesta: Propuesta
  readonly motivo?: string
}

/** HALLAZGO en la cadena: la huella de la foto, lo leido y por que no cuadro. No mueve existencias. */
export function registraHallazgo(estado: EstadoAlmacen, p: PedidoHallazgo, cuando: string, folio: string, operador: string): Paso<Evento> {
  const art = estado.articulos[p.sku]
  const gtin = art?.gtinCaja ?? art?.gtinUnidad
  if (!art || !gtin) return { estado, resultado: { ok: false, motivo: `el artículo ${p.sku} no está en el catálogo con GTIN` } }
  if (!/^sha256:[0-9a-f]{64}$/.test(p.fotos.completa)) return { estado, resultado: { ok: false, motivo: 'el hallazgo lleva su foto' } }
  const lote = p.propuesta.lote ?? p.propuesta.lotesPosibles[0]?.valor
  const clave: ClaveLote = { gtin, lote: lote && lote.length <= 20 ? lote : folio, caducidad: p.propuesta.fecha ?? '' }
  const datos = {
    sku: p.sku, zona: p.zona, ubicacion: ubicacionDe(p.zona), folio, fotos: JSON.parse(JSON.stringify(p.fotos)) as Json,
    leido: JSON.parse(JSON.stringify({ fecha: p.propuesta.fecha, opciones: p.propuesta.opciones.map((o) => o.iso), lote, texto: p.propuesta.textoLeido })) as Json,
    motivo: p.motivo?.trim() || 'no cuadra con ningún lote del sitio', cambios: [],
  }
  const r = registra(estado, p.sitio, { tipo: 'HALLAZGO', lote: clave, operador, fecha: cuando, datos })
  return { estado: r.estado, resultado: { ok: true, valor: r.evento, eventos: [r.evento] } }
}

/** Los hallazgos del sitio en los ultimos `dias` (para el tablero del supervisor). */
export function hallazgos(estado: EstadoAlmacen, sitio: string, desde: string): Evento[] {
  return (estado.eventos?.[sitio] ?? []).filter((e) => e.tipo === 'HALLAZGO' && e.fecha.slice(0, 10) >= desde)
}
