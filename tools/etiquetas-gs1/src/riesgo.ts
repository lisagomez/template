/**
 * El agente de riesgo (determinista, sin modelo de lenguaje). La alerta util no es por fecha sino
 * por RIESGO: un lote en verde que no se va a vender a tiempo es un problema hoy, no el dia que se
 * pone rojo.
 *
 *   dias de inventario = existencia ÷ venta promedio diaria
 *
 * con la existencia ACUMULADA en orden FEFO (lo que vence antes se vende antes: un lote espera a
 * que se acaben los anteriores) y comparada con los dias VENDIBLES (hasta que entra en rojo, no
 * hasta la caducidad). Si no alcanza, recomienda: transferir a la sucursal que mas lo vende,
 * promocion escalonada o exhibicion. Recomienda; decide una persona, y las dos cosas entran a la
 * cadena. Antes de cada accion verifica la integridad del sitio: con la cadena rota no actua.
 *
 * Las ventas llegan por un ADAPTADOR (`FuenteVentas`): ficticias aqui; leerlas del ERP es una
 * propuesta con gate humano.
 */
import { idLote, type ClaveLote, type Evento } from './cadena.js'
import type { Json } from './jcs.js'
import { cadenaDe, claveDe, registra, semaforoDe, transfiere, type Paso } from './expediente.js'
import type { EstadoAlmacen } from './modelo.js'
import { categoriaPorId, vendible, type EstadoSemaforo } from './semaforo.js'
import { zonaDe } from './ubicaciones.js'

export interface FuenteVentas {
  readonly nombre: string
  /** Venta promedio diaria, en CAJAS, del GTIN en el sitio. `undefined`: sin dato. */
  promedioDiario(sitio: string, gtin: string): number | undefined
}

/** Ventas ficticias: `{ "SITIO|GTIN": cajas por dia }`. */
export function ventasFicticias(tabla: Readonly<Record<string, number>>): FuenteVentas {
  return { nombre: 'ficticias', promedioDiario: (s, g) => tabla[`${s}|${g}`] }
}

export type AccionRiesgo = 'transferir' | 'promocion' | 'exhibicion'

export interface Recomendacion {
  readonly accion: AccionRiesgo
  readonly cajas: number
  readonly destino?: string
  /** Promocion escalonada: el descuento sube conforme se acerca el rojo. Porcentajes de EJEMPLO. */
  readonly escalones?: readonly { readonly desdeDias: number; readonly descuento: number }[]
  readonly texto: string
}

export interface Riesgo {
  readonly sitio: string
  readonly lote: ClaveLote
  readonly sku: string
  readonly descripcion: string
  readonly cajas: number
  /** Cajas por dia; null si la venta registrada es cero. */
  readonly venta: number | null
  readonly diasRestantes: number
  /** Dias hasta que entra en rojo (bloqueo de venta normal). */
  readonly diasVendibles: number
  /** Dias en venderse, contando los lotes que salen antes (FEFO). null: sin venta, nunca. */
  readonly diasInventario: number | null
  readonly cajasEnRiesgo: number
  readonly semaforo: EstadoSemaforo
  readonly recomendacion: Recomendacion
}

/** Dias de transito que se descuentan al estimar lo que el destino alcanza a vender. */
export const DIAS_TRANSITO = 2

interface LoteSitio { lote: ClaveLote; sku: string; cajas: number; dias: number; semaforo: EstadoSemaforo; retiro: number }

function lotesVendibles(estado: EstadoAlmacen, sitio: string, hoy: string): LoteSitio[] {
  const m = new Map<string, LoteSitio>()
  for (const e of estado.existencias) {
    if (e.sitio !== sitio || e.cantidad <= 0 || zonaDe(e) === 'merma') continue
    const k = idLote(claveDe(e))
    const previo = m.get(k)
    if (previo) { previo.cajas += e.cantidad; continue }
    const s = semaforoDe(estado, e.sku, e.caducidad, hoy)
    const retiro = categoriaPorId(estado.configuracion.categorias, estado.articulos[e.sku]?.categoria).retiroDias
    m.set(k, { lote: claveDe(e), sku: e.sku, cajas: e.cantidad, dias: s.dias, semaforo: s.estado, retiro })
  }
  return [...m.values()].filter((l) => vendible(l.semaforo)).sort((a, b) => a.lote.caducidad.localeCompare(b.lote.caducidad))
}

/** Evalua todos los lotes vendibles del sitio y devuelve los que no se venderan a tiempo. */
export function evaluaRiesgo(estado: EstadoAlmacen, sitio: string, hoy: string, ventas: FuenteVentas): Riesgo[] {
  const lotes = lotesVendibles(estado, sitio, hoy)
  const acumulado = new Map<string, number>()
  const riesgos: Riesgo[] = []
  for (const l of lotes) {
    const antes = acumulado.get(l.lote.gtin) ?? 0
    const total = antes + l.cajas
    acumulado.set(l.lote.gtin, total)
    const v = ventas.promedioDiario(sitio, l.lote.gtin)
    // Sin dato de venta no se evalua (no es lo mismo que vender cero).
    if (v === undefined) continue
    const venta = v > 0 ? v : null
    const diasVendibles = Math.max(0, l.dias - l.retiro)
    const diasInventario = venta ? Math.round((total / venta) * 10) / 10 : null
    if (diasInventario !== null && diasInventario <= diasVendibles) continue
    const cajasEnRiesgo = Math.min(l.cajas, Math.ceil(total - (venta ?? 0) * diasVendibles - 1e-9))
    if (cajasEnRiesgo <= 0) continue
    const base = { sitio, lote: l.lote, sku: l.sku, descripcion: estado.articulos[l.sku]?.descripcion ?? l.sku, cajas: l.cajas, venta, diasRestantes: l.dias, diasVendibles, diasInventario, cajasEnRiesgo, semaforo: l.semaforo }
    riesgos.push({ ...base, recomendacion: recomienda(estado, base, total, hoy, ventas) })
  }
  return riesgos.sort((a, b) => a.diasVendibles - b.diasVendibles || b.cajasEnRiesgo - a.cajasEnRiesgo)
}

type BaseRiesgo = Omit<Riesgo, 'recomendacion'>

/** Que sitio alcanza a vender mas de ese lote antes del rojo, contando lo que ya tiene. */
function mejorDestino(estado: EstadoAlmacen, r: BaseRiesgo, hoy: string, ventas: FuenteVentas): { sitio: string; capacidad: number; venta: number } | undefined {
  const utiles = r.diasVendibles - DIAS_TRANSITO
  if (utiles <= 0) return undefined
  const opciones = estado.configuracion.sitios.filter((s) => s.clave !== r.sitio).map((s) => {
    const venta = ventas.promedioDiario(s.clave, r.lote.gtin) ?? 0
    const delante = lotesVendibles(estado, s.clave, hoy).filter((l) => l.lote.gtin === r.lote.gtin && l.lote.caducidad <= r.lote.caducidad).reduce((t, l) => t + l.cajas, 0)
    return { sitio: s.clave, venta, capacidad: Math.floor(venta * utiles - delante) }
  }).filter((o) => o.venta > 0 && o.capacidad > 0)
  return opciones.sort((a, b) => b.capacidad - a.capacidad || b.venta - a.venta || a.sitio.localeCompare(b.sitio))[0]
}

function recomienda(estado: EstadoAlmacen, r: BaseRiesgo, acumulado: number, hoy: string, ventas: FuenteVentas): Recomendacion {
  const destino = mejorDestino(estado, r, hoy, ventas)
  if (destino && destino.capacidad * 2 >= r.cajasEnRiesgo) {
    const cajas = Math.min(r.cajasEnRiesgo, destino.capacidad)
    return { accion: 'transferir', cajas, destino: destino.sitio, texto: `Transferir ${cajas} caja(s) a ${destino.sitio}, que vende ${destino.venta} por día y alcanza a venderlas antes del bloqueo.` }
  }
  if (r.semaforo === 'promocion') {
    return { accion: 'exhibicion', cajas: r.cajasEnRiesgo, texto: `Exhibición especial identificada (cabecera o isla) para ${r.cajasEnRiesgo} caja(s): quedan ${r.diasVendibles} días de venta normal.` }
  }
  const alza = r.venta ? Math.ceil((acumulado / (r.venta * Math.max(1, r.diasVendibles)) - 1) * 100) : null
  const tercio = Math.max(1, Math.round(r.diasVendibles / 3))
  const escalones = [{ desdeDias: r.diasVendibles, descuento: 10 }, { desdeDias: tercio * 2, descuento: 20 }, { desdeDias: tercio, descuento: 30 }]
  const falta = alza === null ? 'en este sitio no se vende' : `hace falta vender ${alza} % más de lo normal`
  return { accion: 'promocion', cajas: r.cajasEnRiesgo, escalones, texto: `Promoción escalonada: 10 % desde hoy, 20 % con ${tercio * 2} días de venta por delante y 30 % en los últimos ${tercio}; ${falta}.` }
}

export type EstadoRecomendacion = 'pendiente' | 'ejecutada' | 'descartada'

export interface RecomendacionRegistrada {
  readonly evento: Evento
  readonly estado: EstadoRecomendacion
  readonly decision?: Evento
}

/** Las recomendaciones del sitio y como terminaron, leidas de la cadena. */
export function recomendaciones(estado: EstadoAlmacen, sitio: string): RecomendacionRegistrada[] {
  const cadena = cadenaDe(estado, sitio)
  const decisiones = new Map(cadena.filter((e) => e.tipo === 'RECOMENDACION_EJECUTADA' || e.tipo === 'RECOMENDACION_DESCARTADA').map((e) => [String(e.datos['recomendacion']), e]))
  return cadena.filter((e) => e.tipo === 'RECOMENDACION').map((evento) => {
    const d = decisiones.get(evento.hash)
    return { evento, estado: !d ? 'pendiente' : d.tipo === 'RECOMENDACION_EJECUTADA' ? 'ejecutada' : 'descartada', ...(d ? { decision: d } : {}) }
  })
}

export interface Integridad { readonly ok: boolean; readonly motivo?: string }

/** Seudonimo del propio agente: sus eventos no son de una persona. */
export const OPERADOR_AGENTE = 'agente-riesgo'
/** Tras una decision, el agente no repite la misma recomendacion del mismo lote en estos dias. */
export const DIAS_SILENCIO = 7

/**
 * La corrida diaria. Si la integridad del sitio no se sostiene, NO actua: devuelve el motivo para
 * que quien la llama abra el incidente en el central.
 */
export function corridaAgente(estado: EstadoAlmacen, sitio: string, hoy: string, ventas: FuenteVentas, cuando: string, integridad: Integridad): { estado: EstadoAlmacen; emitidas: Evento[]; riesgos: Riesgo[]; bloqueo?: string } {
  if (!integridad.ok) return { estado, emitidas: [], riesgos: [], bloqueo: integridad.motivo ?? 'la integridad del sitio no se sostiene' }
  const riesgos = evaluaRiesgo(estado, sitio, hoy, ventas)
  const previas = recomendaciones(estado, sitio)
  const limite = Date.parse(cuando) - DIAS_SILENCIO * 86_400_000
  let e = estado
  const emitidas: Evento[] = []
  for (const r of riesgos) {
    const repetida = previas.some((p) => idLote(p.evento.lote) === idLote(r.lote) && p.evento.datos['accion'] === r.recomendacion.accion
      && (p.estado === 'pendiente' || Date.parse(p.decision!.fecha) > limite))
    if (repetida) continue
    const { accion, cajas, destino, escalones, texto } = r.recomendacion
    const datos = {
      accion, cajas, texto, ...(destino ? { destino } : {}), ...(escalones ? { escalones: escalones as unknown as Json } : {}),
      venta: r.venta, diasInventario: r.diasInventario, diasVendibles: r.diasVendibles, diasRestantes: r.diasRestantes, cajasEnRiesgo: r.cajasEnRiesgo, semaforo: r.semaforo, fuente: ventas.nombre,
    }
    const reg = registra(e, sitio, { tipo: 'RECOMENDACION', lote: r.lote, datos, operador: OPERADOR_AGENTE, fecha: cuando })
    e = reg.estado
    emitidas.push(reg.evento)
  }
  return { estado: e, emitidas, riesgos }
}

export interface Decision {
  readonly sitio: string
  /** Hash del evento RECOMENDACION. */
  readonly recomendacion: string
  readonly decision: 'ejecutar' | 'descartar'
  /** Seudonimo de la persona que decide. */
  readonly persona: string
  readonly motivo?: string
}

/** Una persona ejecuta o descarta. Ejecutar una transferencia la registra en las dos cadenas. */
export function decide(estado: EstadoAlmacen, d: Decision, hoy: string, cuando: string, id: string, integridad: Integridad): Paso<Evento> {
  const no = (motivo: string): Paso<Evento> => ({ estado, resultado: { ok: false, motivo } })
  if (!integridad.ok) return no(`la cadena del sitio no se sostiene (${integridad.motivo ?? 'sin detalle'}): no se actúa`)
  const rec = recomendaciones(estado, d.sitio).find((r) => r.evento.hash === d.recomendacion)
  if (!rec) return no('esa recomendación no está en la cadena del sitio')
  if (rec.estado !== 'pendiente') return no(`esa recomendación ya se ${rec.estado === 'ejecutada' ? 'ejecutó' : 'descartó'}`)
  if (d.decision === 'descartar') {
    if (!d.motivo?.trim()) return no('descartar una recomendación lleva su motivo')
    const r = registra(estado, d.sitio, { tipo: 'RECOMENDACION_DESCARTADA', lote: rec.evento.lote, operador: d.persona, fecha: cuando, datos: { recomendacion: d.recomendacion, motivo: d.motivo } })
    return { estado: r.estado, resultado: { ok: true, valor: r.evento, eventos: [r.evento] } }
  }
  let e = estado
  const extra: Record<string, Json> = {}
  const previos: Evento[] = []
  if (rec.evento.datos['accion'] === 'transferir') {
    const t = transfiere(e, { origen: d.sitio, destino: String(rec.evento.datos['destino']), lote: rec.evento.lote, cajas: Number(rec.evento.datos['cajas']), recomendacion: d.recomendacion }, hoy, cuando, id, d.persona)
    if (!t.resultado.ok) return no(t.resultado.motivo)
    e = t.estado
    extra['transferencia'] = t.resultado.valor.salida.hash
    previos.push(...t.resultado.eventos)
  }
  const r = registra(e, d.sitio, { tipo: 'RECOMENDACION_EJECUTADA', lote: rec.evento.lote, operador: d.persona, fecha: cuando, datos: { recomendacion: d.recomendacion, ...extra, ...(d.motivo ? { nota: d.motivo } : {}) } })
  return { estado: r.estado, resultado: { ok: true, valor: r.evento, eventos: [...previos, r.evento] } }
}
