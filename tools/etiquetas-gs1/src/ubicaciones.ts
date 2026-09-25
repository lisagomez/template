/**
 * Zonas dentro de un sitio y movimientos entre ellas: recibo → almacén → piso de venta, y merma
 * para lo que se da de baja.
 *
 * La mercancia se mueve con la MISMA etiqueta de la caja: (01)(17)(10) dicen que GTIN, que lote y
 * que caducidad; la etiqueta de la tarima se mueve entera por su SSCC. La zona sale de una
 * etiqueta de UBICACION: (414) el GLN del sitio + (254) el componente de extension, que GS1
 * reserva para ubicaciones internas por acuerdo (GenSpecs §3.5.12; no viaja a terceros).
 *
 * Reglas del movimiento, las de un WMS serio:
 *  - lo vencido o en dias de retiro NO sube a piso de venta (se manda a merma o se queda);
 *  - al resurtir piso, si hay en almacen un lote surtible que vence ANTES, se avisa (FEFO);
 *  - una caja se toma primero de la zona anterior del flujo (a piso: de almacen, luego de recibo),
 *    y primero de existencias sueltas que de una tarima con SSCC.
 */
import { valorDe, type Elemento, type Simbolo } from './elementos.js'
import { disenaEtiqueta, type Diseno, type PerfilImpresora } from './etiqueta.js'
import type { Interpretacion } from './existencias.js'
import { diasHasta, esFecha, parseaFechaGs1, aAammdd } from './fechas.js'
import type { EstadoAlmacen, Existencia, Movimiento, Sitio, Zona } from './modelo.js'
import { categoriaPorId, estadoSemaforo } from './semaforo.js'

export const ZONAS: readonly { readonly id: Zona; readonly nombre: string; readonly codigo: string }[] = [
  { id: 'recibo', nombre: 'Recibo', codigo: 'RECIBO' },
  { id: 'almacen', nombre: 'Almacén', codigo: 'ALMACEN' },
  { id: 'piso', nombre: 'Piso de venta', codigo: 'PISO' },
  { id: 'merma', nombre: 'Merma', codigo: 'MERMA' },
]

export function zonaDe(e: Existencia): Zona {
  return e.zona ?? 'recibo'
}

export function nombreZona(z: Zona): string {
  return ZONAS.find((x) => x.id === z)?.nombre ?? z
}

/** Etiqueta de ubicacion: (414) GLN del sitio + (254) zona. */
export function simboloUbicacion(gln: string, zona: Zona): Simbolo {
  return [{ ai: '414', valor: gln }, { ai: '254', valor: ZONAS.find((x) => x.id === zona)!.codigo }]
}

export type LecturaUbicacion = { readonly sitio: Sitio; readonly zona: Zona } | { readonly error: string }

/** ¿La lectura es una etiqueta de ubicacion de la casa? `undefined` si no es de ubicacion. */
export function leeUbicacion(elementos: readonly Elemento[], sitios: readonly Sitio[]): LecturaUbicacion | undefined {
  const gln = valorDe(elementos, '414')
  if (!gln) return undefined
  const sitio = sitios.find((s) => s.gln === gln)
  if (!sitio) return { error: `el GLN ${gln} no es de ningún sitio de la casa` }
  const codigo = valorDe(elementos, '254')
  const zona = ZONAS.find((z) => z.codigo === codigo)?.id
  if (!zona) return { error: codigo ? `la zona «${codigo}» no existe` : 'la etiqueta trae el sitio pero no la zona (254)' }
  return { sitio, zona }
}

/** A que zona se le quita primero cuando se mueve hacia `destino`. */
const PREFERENCIA: Readonly<Record<Zona, readonly Zona[]>> = {
  recibo: ['almacen', 'piso'],
  almacen: ['recibo', 'piso'],
  piso: ['almacen', 'recibo'],
  merma: ['piso', 'almacen', 'recibo'],
}

export type ResultadoMovimiento =
  | { readonly ok: true; readonly movimiento: Movimiento; readonly avisos: readonly string[] }
  | { readonly ok: false; readonly motivo: string }

export interface PedidoMovimiento {
  readonly sitio: string
  readonly destino: Zona
  readonly lectura: Interpretacion
  /** Cuantas veces cuenta la lectura (p. ej. 6 cajas del mismo lote con una sola lectura). */
  readonly veces: number
  readonly operador: string
}

const mismoLote = (e: Existencia, l: Interpretacion) => e.gtin === l.gtin && e.lote === l.lote && e.caducidad === l.caducidadIso

export function mueve(estado: EstadoAlmacen, p: PedidoMovimiento, cuando: string, id: string, hoy: string): { estado: EstadoAlmacen; resultado: ResultadoMovimiento } {
  const no = (motivo: string) => ({ estado, resultado: { ok: false as const, motivo } })
  const l = p.lectura
  const destino = nombreZona(p.destino)
  if (!estado.configuracion.sitios.some((s) => s.clave === p.sitio)) return no(`el sitio ${p.sitio} no existe`)
  if (p.destino === 'piso' && l.vida && (l.vida.estado === 'vencido' || l.vida.estado === 'retiro')) {
    return no(`${l.vida.estado === 'vencido' ? 'está vencido' : 'está en días de retiro'}: no sube a piso de venta; muévelo a merma`)
  }
  const del = estado.existencias.filter((e) => e.sitio === p.sitio && e.cantidad > 0)
  // Una tarima leida por su SSCC se mueve entera.
  if (l.sscc && !l.gtin) {
    const t = del.find((e) => e.sscc === l.sscc)
    if (!t) return no(`la tarima ${l.sscc} no está en ${p.sitio}`)
    if (zonaDe(t) === p.destino) return no(`la tarima ya está en ${destino}`)
    const movida: Existencia = { ...t, zona: p.destino, actualizado: cuando }
    const mov: Movimiento = { id, fecha: cuando, sitio: p.sitio, sku: t.sku, gtin: t.gtin, lote: t.lote, caducidad: t.caducidad, cajas: t.cantidad, de: [zonaDe(t)], a: p.destino, sscc: t.sscc!, operador: p.operador }
    return { estado: { ...estado, version: estado.version + 1, existencias: estado.existencias.map((e) => (e === t ? movida : e)), movimientos: [...(estado.movimientos ?? []), mov] }, resultado: { ok: true, movimiento: mov, avisos: [] } }
  }
  if (!l.gtin || !l.lote || !l.caducidadIso || !l.articulo) return no('la lectura no trae GTIN, lote y caducidad de un artículo del catálogo')
  let faltan = l.cajas * Math.max(1, p.veces)
  const pedidas = faltan
  const orden = PREFERENCIA[p.destino]
  const fuentes = del
    .filter((e) => mismoLote(e, l) && zonaDe(e) !== p.destino)
    .sort((a, b) => orden.indexOf(zonaDe(a)) - orden.indexOf(zonaDe(b)) || Number(Boolean(a.sscc)) - Number(Boolean(b.sscc)))
  const disponibles = fuentes.reduce((s, e) => s + e.cantidad, 0)
  if (disponibles < faltan) return no(`solo hay ${disponibles} caja(s) de ese lote fuera de ${destino} en ${p.sitio}`)
  const quitadas = new Map<Existencia, number>()
  for (const f of fuentes) {
    if (faltan === 0) break
    const n = Math.min(f.cantidad, faltan)
    quitadas.set(f, n)
    faltan -= n
  }
  const previa = del.find((e) => mismoLote(e, l) && zonaDe(e) === p.destino && !e.sscc)
  const idsFuente = new Set([...quitadas.keys()].map((e) => e.id))
  let existencias = estado.existencias
    .map((e) => (quitadas.has(e) ? { ...e, cantidad: e.cantidad - quitadas.get(e)!, actualizado: cuando } : e))
    .filter((e) => e.cantidad > 0 || !idsFuente.has(e.id))
  existencias = previa
    ? existencias.map((e) => (e.id === previa.id ? { ...e, cantidad: e.cantidad + pedidas, actualizado: cuando } : e))
    : [...existencias, { id: `${id}-d`, sitio: p.sitio, sku: l.articulo.sku, gtin: l.gtin, lote: l.lote, caducidad: l.caducidadIso, cantidad: pedidas, origen: 'recepcion' as const, actualizado: cuando, zona: p.destino }]
  const avisos: string[] = []
  if (p.destino === 'piso') {
    const cat = categoriaPorId(estado.configuracion.categorias, l.articulo.categoria)
    const anio = Number(hoy.slice(0, 4))
    const antes = del.filter((e) => e.gtin === l.gtin && e.lote !== l.lote && ['almacen', 'recibo'].includes(zonaDe(e)) && e.caducidad < l.caducidadIso!).filter((e) => {
      const f = parseaFechaGs1(aAammdd(e.caducidad), anio)
      const s = esFecha(f) ? estadoSemaforo(diasHasta(f, hoy), cat) : 'vencido'
      return s === 'vigente' || s === 'alerta'
    }).sort((a, b) => a.caducidad.localeCompare(b.caducidad))
    const a = antes[0]
    if (a) avisos.push(`FEFO: en ${nombreZona(zonaDe(a))} hay el lote ${a.lote} que vence antes (${a.caducidad.split('-').reverse().join('/')}); bájalo primero.`)
  }
  const mov: Movimiento = { id, fecha: cuando, sitio: p.sitio, sku: l.articulo.sku, gtin: l.gtin, lote: l.lote, caducidad: l.caducidadIso, cajas: pedidas, de: [...new Set([...quitadas.keys()].map(zonaDe))], a: p.destino, operador: p.operador }
  return { estado: { ...estado, version: estado.version + 1, existencias, movimientos: [...(estado.movimientos ?? []), mov] }, resultado: { ok: true, movimiento: mov, avisos } }
}

/** Cajas por zona de un sitio: lo que muestra «esta en...». */
export function porZona(existencias: readonly Existencia[], sitio: string): Record<Zona, number> {
  const r: Record<Zona, number> = { recibo: 0, almacen: 0, piso: 0, merma: 0 }
  for (const e of existencias) if (e.sitio === sitio) r[zonaDe(e)] += e.cantidad
  return r
}

/** Etiqueta de ubicacion lista para imprimir: la zona en grande, el sitio y su GLN. */
export function disenaUbicacion(sitio: Sitio, zona: Zona, perfil: PerfilImpresora): Diseno {
  if (!sitio.gln) throw new Error(`el sitio ${sitio.clave} no tiene GLN`)
  return disenaEtiqueta({ simbolos: [simboloUbicacion(sitio.gln, zona)], titulo: nombreZona(zona).toUpperCase(), lineas: [sitio.nombre, `GLN ${sitio.gln}`], unidad: 'ubicacion' }, perfil)
}
