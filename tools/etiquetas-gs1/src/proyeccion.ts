/**
 * El estado es una PROYECCION de la cadena: sumando la huella (`cambios`) de cada evento se
 * reconstruyen las cajas por sitio, lote, zona y tarima, y las posiciones del almacen. Si el
 * estado guardado no coincide con la reconstruccion, alguien lo toco por fuera de la cadena: es
 * manipulacion (o un defecto), y se dice exactamente donde.
 *
 * La cadena prueba que los eventos no cambiaron; la proyeccion prueba que el estado que se ve
 * (y del que se surte) es el que dicen los eventos. Hacen falta las dos.
 */
import { verificaCadena, type Evento } from './cadena.js'
import type { EstadoAlmacen, Existencia, Zona } from './modelo.js'
import { zonaDe } from './ubicaciones.js'

export interface Renglon {
  readonly sitio: string
  readonly gtin: string
  readonly lote: string
  readonly caducidad: string
  readonly zona: Zona
  readonly sscc?: string
  readonly cajas: number
  readonly posicion?: string
}

const clave = (sitio: string, gtin: string, lote: string, caducidad: string, zona: string, sscc?: string) => `${sitio}|${gtin}|${lote}|${caducidad}|${zona}|${sscc ?? ''}`

interface CambioLeido { zona: Zona; cajas: number; sscc?: string; caducidad?: string }

function leeCambios(e: Evento): CambioLeido[] {
  const c = e.datos['cambios']
  if (!Array.isArray(c)) return []
  return c.flatMap((x): CambioLeido[] => {
    if (typeof x !== 'object' || x === null || Array.isArray(x)) return []
    const o = x as Readonly<Record<string, unknown>>
    if (typeof o['zona'] !== 'string' || typeof o['cajas'] !== 'number') return []
    return [{ zona: o['zona'] as Zona, cajas: o['cajas'], ...(typeof o['sscc'] === 'string' ? { sscc: o['sscc'] } : {}), ...(typeof o['caducidad'] === 'string' ? { caducidad: o['caducidad'] } : {}) }]
  })
}

export interface Reconstruccion {
  readonly renglones: readonly Renglon[]
  /** Eventos cuya huella dejaria una cantidad negativa: la cadena misma es incoherente. */
  readonly incoherencias: readonly { readonly seq: number; readonly detalle: string }[]
}

/** Reconstruye las existencias de un sitio desde su cadena. */
export function proyecta(sitio: string, eventos: readonly Evento[]): Reconstruccion {
  const m = new Map<string, { r: Omit<Renglon, 'cajas' | 'posicion'>; cajas: number; posicion?: string }>()
  const incoherencias: { seq: number; detalle: string }[] = []
  for (const e of eventos) {
    const cambios = leeCambios(e)
    // Una correccion de caducidad re-etiqueta el lote: la caja sigue en el mismo rack.
    const heredada = new Map(cambios.filter((c) => c.caducidad).map((c) => [`${c.zona}|${c.sscc ?? ''}`, m.get(clave(sitio, e.lote.gtin, e.lote.lote, e.lote.caducidad, c.zona, c.sscc))?.posicion]))
    for (const c of cambios) {
      const cad = c.caducidad ?? e.lote.caducidad
      const k = clave(sitio, e.lote.gtin, e.lote.lote, cad, c.zona, c.sscc)
      const previo = m.get(k) ?? { r: { sitio, gtin: e.lote.gtin, lote: e.lote.lote, caducidad: cad, zona: c.zona, ...(c.sscc ? { sscc: c.sscc } : {}) }, cajas: 0 }
      const cajas = previo.cajas + c.cajas
      if (cajas < 0) incoherencias.push({ seq: e.seq, detalle: `deja ${cajas} cajas en ${c.zona}` })
      const posicion = previo.posicion ?? (c.caducidad ? heredada.get(`${c.zona}|${c.sscc ?? ''}`) : undefined)
      // Lo que se vacia pierde su posicion: una caja nueva en el almacen se ubica de nuevo.
      m.set(k, cajas > 0 ? { r: previo.r, cajas, ...(posicion ? { posicion } : {}) } : { r: previo.r, cajas })
    }
    const filas = e.datos['filas']
    const posicion = e.datos['posicion']
    if (e.tipo !== 'UBICADO' || typeof posicion !== 'string' || !Array.isArray(filas)) continue
    for (const f of filas) {
      if (typeof f !== 'object' || f === null || Array.isArray(f)) continue
      const o = f as Readonly<Record<string, unknown>>
      const k = clave(sitio, e.lote.gtin, e.lote.lote, e.lote.caducidad, String(o['zona']), typeof o['sscc'] === 'string' ? o['sscc'] : undefined)
      const previo = m.get(k)
      if (previo && previo.cajas > 0) m.set(k, { ...previo, posicion })
    }
  }
  const renglones = [...m.values()].filter((x) => x.cajas !== 0).map((x) => ({ ...x.r, cajas: x.cajas, ...(x.posicion ? { posicion: x.posicion } : {}) }))
  return { renglones, incoherencias }
}

export interface Diferencia {
  readonly sitio: string
  readonly gtin: string
  readonly lote: string
  readonly caducidad: string
  readonly zona: string
  readonly sscc?: string
  /** Lo que dice la cadena. */
  readonly esperado: { readonly cajas: number; readonly posicion?: string }
  /** Lo que hay guardado. */
  readonly guardado: { readonly cajas: number; readonly posicion?: string }
  readonly detalle: string
}

function agrupaGuardado(existencias: readonly Existencia[], sitio: string) {
  const m = new Map<string, { e: Existencia; cajas: number; posiciones: Set<string> }>()
  for (const e of existencias) {
    if (e.sitio !== sitio || e.cantidad === 0) continue
    const k = clave(sitio, e.gtin, e.lote, e.caducidad, zonaDe(e), e.sscc)
    const g = m.get(k) ?? { e, cajas: 0, posiciones: new Set<string>() }
    g.cajas += e.cantidad
    if (e.posicion) g.posiciones.add(e.posicion)
    m.set(k, g)
  }
  return m
}

/** Compara el estado guardado con la reconstruccion de la cadena del sitio. */
export function comparaProyeccion(estado: EstadoAlmacen, sitio: string): Diferencia[] {
  const p = proyecta(sitio, estado.eventos?.[sitio] ?? [])
  const esperado = new Map(p.renglones.map((r) => [clave(r.sitio, r.gtin, r.lote, r.caducidad, r.zona, r.sscc), r]))
  const guardado = agrupaGuardado(estado.existencias, sitio)
  const difs: Diferencia[] = []
  for (const k of [...new Set([...esperado.keys(), ...guardado.keys()])].sort()) {
    const r = esperado.get(k)
    const g = guardado.get(k)
    const base = r ?? { sitio, gtin: g!.e.gtin, lote: g!.e.lote, caducidad: g!.e.caducidad, zona: zonaDe(g!.e), ...(g!.e.sscc ? { sscc: g!.e.sscc } : {}) }
    const e = { cajas: r?.cajas ?? 0, ...(r?.posicion ? { posicion: r.posicion } : {}) }
    const posG = g ? [...g.posiciones].sort().join(', ') : ''
    const gu = { cajas: g?.cajas ?? 0, ...(posG ? { posicion: posG } : {}) }
    const quien = `${base.gtin} lote ${base.lote} (cad. ${base.caducidad}) en ${base.zona}${base.sscc ? ` tarima ${base.sscc}` : ''}`
    if (e.cajas !== gu.cajas) difs.push({ ...pick(base), esperado: e, guardado: gu, detalle: `${quien}: la cadena dice ${e.cajas} caja(s) y el estado guardado ${gu.cajas}` })
    else if ((e.posicion ?? '') !== (gu.posicion ?? '')) difs.push({ ...pick(base), esperado: e, guardado: gu, detalle: `${quien}: la cadena lo ubica en ${e.posicion ?? '(sin posición)'} y el estado guardado en ${gu.posicion ?? '(sin posición)'}` })
  }
  return difs
}

const pick = (b: { sitio: string; gtin: string; lote: string; caducidad: string; zona: string; sscc?: string }) => ({
  sitio: b.sitio, gtin: b.gtin, lote: b.lote, caducidad: b.caducidad, zona: b.zona, ...(b.sscc ? { sscc: b.sscc } : {}),
})

/**
 * Integridad local de un sitio: la cadena se sostiene, su huella no deja cantidades imposibles y
 * el estado guardado es su proyeccion. Es lo que el agente comprueba antes de actuar (el anclaje
 * lo comprueba el central).
 */
export function integridadLocal(estado: EstadoAlmacen, sitio: string): { ok: boolean; motivo?: string; diferencias: readonly Diferencia[] } {
  const eventos = estado.eventos?.[sitio] ?? []
  const c = verificaCadena(sitio, eventos)
  if (!c.ok) return { ok: false, motivo: `cadena rota en el evento #${c.rotura.seq}: ${c.rotura.detalle}`, diferencias: [] }
  const inc = proyecta(sitio, eventos).incoherencias[0]
  if (inc) return { ok: false, motivo: `la huella del evento #${inc.seq} ${inc.detalle}`, diferencias: [] }
  const diferencias = comparaProyeccion(estado, sitio)
  if (diferencias.length) return { ok: false, motivo: `el estado guardado no es la proyección de la cadena: ${diferencias[0]!.detalle}`, diferencias }
  return { ok: true, diferencias }
}
