/**
 * Lo que una lectura significa para el inventario: que producto es, que lote, cuanta vida le
 * queda y en que sitio esta. Y, si se confirma como RECEPCION, el alta del lote en ese sitio
 * (una tarima con SSCC ya recibida no se cuenta dos veces).
 */
import { valorDe, type Elemento } from './elementos.js'
import { esFecha, fechaIso, parseaFechaGs1 } from './fechas.js'
import { identificaGtin, type CodigoAnterior } from './codigos-anteriores.js'
import type { Articulo, EstadoAlmacen, Existencia, Nivel, Zona } from './modelo.js'
import { categoriaPorId, vidaRestante, type VidaRestante } from './semaforo.js'

export interface Interpretacion {
  readonly gtin?: string
  readonly sscc?: string
  readonly lote?: string
  readonly caducidadIso?: string
  readonly cajas: number
  readonly articulo?: Articulo
  /** Que se leyo: la pieza o la caja (el GTIN de la pieza no es el de la caja). */
  readonly nivel?: Nivel
  /** El GTIN leido es un codigo ANTERIOR del articulo (la etiqueta vieja se sigue leyendo). */
  readonly codigoAnterior?: CodigoAnterior
  readonly vida?: VidaRestante
  /** Sitios donde hay existencia de ese GTIN y lote. */
  readonly sitios: readonly string[]
  /** Donde esta, zona por zona: sitio, zona y cajas. */
  readonly ubicaciones: readonly { readonly sitio: string; readonly zona: Zona; readonly cajas: number }[]
  readonly avisos: readonly string[]
}

/** El articulo de un GTIN: el que lo tiene hoy o aquel del que fue codigo anterior (`codigos-anteriores.ts`). */
export function buscaArticulo(estado: EstadoAlmacen, gtin: string): Articulo | undefined {
  return identificaGtin(estado, gtin)?.articulo
}

export function interpreta(elementos: readonly Elemento[], estado: EstadoAlmacen, hoy: string): Interpretacion {
  const gtin = valorDe(elementos, '01') ?? valorDe(elementos, '02')
  const sscc = valorDe(elementos, '00')
  const lote = valorDe(elementos, '10')
  const cad = valorDe(elementos, '17')
  const cuenta37 = valorDe(elementos, '37')
  const avisos: string[] = []
  const id = gtin ? identificaGtin(estado, gtin) : undefined
  const articulo = id?.articulo
  if (gtin && !articulo) avisos.push('Ese GTIN no está en el catálogo de la casa.')
  if (id?.anterior) avisos.push(`Es un código ANTERIOR de este artículo (lo sustituyó ${id.anterior.sustituidoPor} el ${id.anterior.hasta.slice(0, 10)}): se sigue leyendo para lo que ya trae esa etiqueta.`)
  const cat = categoriaPorId(estado.configuracion.categorias, articulo?.categoria)
  const vida = cad ? vidaRestante(cad, hoy, cat, articulo?.vidaUtilDias) : undefined
  const fecha = cad ? parseaFechaGs1(cad, Number(hoy.slice(0, 4))) : undefined
  const caducidadIso = fecha && esFecha(fecha) ? fechaIso(fecha) : undefined
  if (vida && vida.dias < 0) avisos.push('Está vencido: no se recibe ni se surte.')
  else if (vida && !vida.aceptableEnRecepcion) avisos.push(`Le quedan ${vida.dias} días; ${vida.minimo.texto}: no se recibe.`)
  if (sscc && !gtin) avisos.push('Solo se leyó el SSCC: lee también el código de contenido de la tarima.')
  const aqui = estado.existencias.filter((e) => ((sscc && e.sscc === sscc) || (gtin && e.gtin === gtin && (!lote || e.lote === lote))) && e.cantidad > 0)
  const sitios = [...new Set(aqui.map((e) => e.sitio))]
  const cuenta = new Map<string, { sitio: string; zona: Zona; cajas: number }>()
  for (const e of aqui) {
    const zona = e.zona ?? 'recibo'
    const k = `${e.sitio}|${zona}`
    cuenta.set(k, { sitio: e.sitio, zona, cajas: (cuenta.get(k)?.cajas ?? 0) + e.cantidad })
  }
  return {
    ...(gtin ? { gtin } : {}), ...(sscc ? { sscc } : {}), ...(lote ? { lote } : {}), ...(caducidadIso ? { caducidadIso } : {}),
    cajas: cuenta37 ? Number(cuenta37) : 1, ...(id ? { articulo: id.articulo, nivel: id.nivel, ...(id.anterior ? { codigoAnterior: id.anterior } : {}) } : {}), ...(vida ? { vida } : {}), sitios, ubicaciones: [...cuenta.values()], avisos,
  }
}

export type ResultadoRecepcion = { readonly ok: true; readonly existencia: Existencia } | { readonly ok: false; readonly motivo: string }

/** Alta (o suma) de un lote en un sitio. Pura: devuelve el estado nuevo. */
export function recibe(estado: EstadoAlmacen, lectura: Interpretacion, sitio: string, cuando: string, id: string): { estado: EstadoAlmacen; resultado: ResultadoRecepcion } {
  const no = (motivo: string) => ({ estado, resultado: { ok: false as const, motivo } })
  if (!estado.configuracion.sitios.some((s) => s.clave === sitio)) return no(`el sitio ${sitio} no existe`)
  if (!lectura.articulo || !lectura.gtin) return no('el código no corresponde a un artículo del catálogo')
  if (!lectura.lote || !lectura.caducidadIso) return no('la lectura no trae lote y caducidad')
  if (lectura.sscc && estado.existencias.some((e) => e.sscc === lectura.sscc && e.sitio === sitio)) return no(`la tarima ${lectura.sscc} ya se recibió en ${sitio}`)
  // La leccion de los WMS: lo vencido no entra, y lo que no llega a la vida minima tampoco.
  if (lectura.vida && lectura.vida.dias < 0) return no('el lote está vencido: no se recibe')
  if (lectura.vida && !lectura.vida.aceptableEnRecepcion) return no(`le quedan ${lectura.vida.dias} días; ${lectura.vida.minimo.texto}`)
  return altaDeLote(estado, { sitio, sku: lectura.articulo.sku, gtin: lectura.gtin, lote: lectura.lote, caducidad: lectura.caducidadIso, cantidad: lectura.cajas, ...(lectura.sscc ? { sscc: lectura.sscc } : {}) }, 'recepcion', cuando, id)
}

export interface AltaLote {
  readonly sitio: string
  readonly sku: string
  readonly gtin: string
  readonly lote: string
  readonly caducidad: string
  readonly cantidad: number
  readonly sscc?: string
  /** Zona donde entra; por defecto recibo. */
  readonly zona?: Zona
}

/**
 * Alta de un lote en un sitio: si ya hay existencia del mismo GTIN, lote y caducidad (sin SSCC),
 * SUMA; una tarima con SSCC es siempre su propia existencia. Asi imprimir diez veces el mismo
 * lote no llena el tablero de renglones de una caja.
 */
export function altaDeLote(estado: EstadoAlmacen, a: AltaLote, origen: Existencia['origen'], cuando: string, id: string): { estado: EstadoAlmacen; resultado: ResultadoRecepcion } {
  const zona = a.zona ?? 'recibo'
  const igual = (e: Existencia) => !a.sscc && !e.sscc && e.sitio === a.sitio && e.gtin === a.gtin && e.lote === a.lote && e.caducidad === a.caducidad && (e.zona ?? 'recibo') === zona
  const previa = estado.existencias.find(igual)
  const existencia: Existencia = previa
    ? { ...previa, cantidad: previa.cantidad + a.cantidad, actualizado: cuando }
    : { id, sitio: a.sitio, sku: a.sku, gtin: a.gtin, lote: a.lote, caducidad: a.caducidad, cantidad: a.cantidad, origen, actualizado: cuando, zona, ...(a.sscc ? { sscc: a.sscc } : {}) }
  const existencias = previa ? estado.existencias.map((e) => (e === previa ? existencia : e)) : [...estado.existencias, existencia]
  return { estado: { ...estado, version: estado.version + 1, existencias }, resultado: { ok: true, existencia } }
}
