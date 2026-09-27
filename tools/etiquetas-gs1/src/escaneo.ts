/**
 * ESCANEAR por zona: la persona dice donde esta (la etiqueta de la zona o del rack) y cada escaneo
 * hace la accion de esa zona para su rol. Un gesto, la accion correcta:
 *
 * - RECIBO: con (17)(10) se recibe directo (regla de 2/3 incluida); con el codigo del proveedor
 *   se pide la foto de la caducidad (la recepcion con foto que ya existe).
 * - ALMACEN: lo que viene de recibo entra (y se ubica si la zona es un rack); lo que ya esta dice
 *   su lote, semaforo, rack y, si hay otro del mismo articulo que vence antes, «baja primero ese».
 * - PISO: lo que viene del almacen sube (con aviso FEFO); lo que ya esta dice si se vende o se
 *   retira, y RETIRAR ES EL ESCANEO: vencido a merma, rojo a almacen para decidir.
 * - MERMA: la baja, con su motivo.
 *
 * Si el escaneo corresponde a una tarea pendiente de la ronda, la cierra con un TAREA_CERRADA.
 * La VISTA que devuelve NO lleva cantidades del sistema: la puede recibir el almacenista, que cuenta
 * a ciegas. Lo unico con numero es lo que la persona misma escaneo.
 */
import type { Evento } from './cadena.js'
import { esErrorLectura, parseaLectura } from './elementos.js'
import { claveDe, mueveConExpediente, recibeConExpediente, registra, ubica, type Paso } from './expediente.js'
import { interpreta, type Interpretacion } from './existencias.js'
import { diasParaCaducar } from './fefo.js'
import type { Json } from './jcs.js'
import type { EstadoAlmacen, Existencia, Zona } from './modelo.js'
import { estadoDeTareas, type RondaDia, type Tarea } from './rondas.js'
import { categoriaPorId, estadoSemaforo, vendible, type EstadoSemaforo } from './semaforo.js'
import { leeUbicacion, nombreZona, ubicacionDe, zonaDe } from './ubicaciones.js'

export type RolZona = 'operacion' | 'recibo' | 'almacenista'

/** Donde opera cada rol. Lo decide el servidor: la pantalla solo lo ensena. */
export const ZONAS_DEL_ROL: Readonly<Record<RolZona, readonly Zona[]>> = {
  operacion: ['recibo', 'almacen', 'piso', 'merma'], recibo: ['recibo'], almacenista: ['almacen', 'piso', 'merma'],
}

export interface PedidoEscaneo {
  readonly sitio: string
  readonly zona: Zona
  readonly posicion?: string
  readonly texto: string
  /** Cajas que cuenta este escaneo (por defecto 1). */
  readonly veces?: number
  /** Todas las cajas de ese lote que haya en la zona de origen (sin decir cuantas). */
  readonly todas?: boolean
  /** Merma: por que. Si el lote esta vencido, «vencido». */
  readonly motivo?: string
  readonly rol: RolZona
  /** Seudonimo. */
  readonly operador: string
  readonly hoy: string
  readonly cuando: string
  readonly id: string
  readonly hora?: string
}

export type Sonido = 'ok' | 'aviso' | 'error'

export interface VistaEscaneo {
  readonly tipo: 'zona' | 'recibido' | 'rechazado' | 'movido' | 'ubicado' | 'info' | 'retirado' | 'merma' | 'recibir-con-foto' | 'desconocido' | 'pieza-suelta' | 'error'
  /** El color de la pantalla completa: el del semaforo, o el del resultado. */
  readonly color: EstadoSemaforo | 'ok' | 'aviso' | 'error' | 'info'
  readonly titulo: string
  readonly detalle: readonly string[]
  readonly sonido: Sonido
  readonly zona?: { readonly sitio: string; readonly zona: Zona; readonly posicion?: string }
  readonly articulo?: { readonly sku: string; readonly descripcion: string; readonly nivel?: 'unidad' | 'caja'; readonly gtin: string }
  readonly lote?: { readonly lote: string; readonly caducidad: string; readonly semaforo: EstadoSemaforo; readonly dias: number; readonly ubicacion?: string }
  readonly fefo?: { readonly lote: string; readonly caducidad: string; readonly ubicacion: string }
  /** Lotes del articulo en el sitio (pieza suelta, codigo del proveedor): SIN cantidades. */
  readonly lotes?: readonly { readonly lote: string; readonly caducidad: string; readonly semaforo: EstadoSemaforo; readonly ubicacion: string }[]
  readonly tarea?: { readonly id: string; readonly tipo: string; readonly instruccion: string }
  /** Hash del MOVIDO que se puede deshacer (CORRECCION). */
  readonly deshacer?: string
  readonly evento?: { readonly seq: number; readonly hash: string; readonly tipo: string }
}

export interface ResultadoEscaneo { readonly estado: EstadoAlmacen; readonly vista: VistaEscaneo; readonly eventos: readonly Evento[] }

const json = (v: unknown): Json => JSON.parse(JSON.stringify(v)) as Json
const error = (estado: EstadoAlmacen, titulo: string, detalle: string[] = []): ResultadoEscaneo => ({ estado, vista: { tipo: 'error', color: 'error', titulo, detalle, sonido: 'error' }, eventos: [] })

/**
 * Quita de un motivo las cantidades del sistema («solo hay 3 caja(s)», «10 caja(s) de X siguen en
 * recibo»): el almacenista cuenta a ciegas y un mensaje de error tambien es una respuesta.
 */
export function sinCantidades(texto: string): string {
  return texto.replace(/solo hay \d+ caja\(s\)/g, 'no quedan cajas suficientes').replace(/\b\d+ caja\(s\)/g, 'cajas').replace(/\b\d+ cajas?\b/g, 'cajas')
}

function semaforoDe(estado: EstadoAlmacen, sku: string, caducidad: string, hoy: string): { semaforo: EstadoSemaforo; dias: number } {
  const dias = diasParaCaducar(caducidad, hoy)
  return { dias, semaforo: estadoSemaforo(dias, categoriaPorId(estado.configuracion.categorias, estado.articulos[sku]?.categoria)) }
}

const delLote = (estado: EstadoAlmacen, sitio: string, l: Interpretacion) =>
  estado.existencias.filter((e) => e.sitio === sitio && e.cantidad > 0 && e.gtin === l.gtin && e.lote === l.lote && e.caducidad === l.caducidadIso)

/** Los lotes del articulo en el sitio, sin cantidades, del que vence antes al que vence despues. */
function lotesDelArticulo(estado: EstadoAlmacen, sitio: string, sku: string, hoy: string, zonas: readonly Zona[]): NonNullable<VistaEscaneo['lotes']> {
  const vistos = new Set<string>()
  return estado.existencias.filter((e) => e.sitio === sitio && e.sku === sku && e.cantidad > 0 && zonas.includes(zonaDe(e)))
    .sort((a, b) => a.caducidad.localeCompare(b.caducidad))
    .filter((e) => { const k = `${e.lote}|${e.caducidad}|${zonaDe(e)}|${e.posicion ?? ''}`; if (vistos.has(k)) return false; vistos.add(k); return true })
    .map((e) => ({ lote: e.lote, caducidad: e.caducidad, semaforo: semaforoDe(estado, sku, e.caducidad, hoy).semaforo, ubicacion: ubicacionDe(zonaDe(e), e.posicion) }))
}

/** El primer lote SURTIBLE del mismo articulo en almacen o recibo que vence antes que `l`. */
function fefoAntes(estado: EstadoAlmacen, sitio: string, l: Interpretacion, hoy: string): Existencia | undefined {
  return estado.existencias.filter((e) => e.sitio === sitio && e.cantidad > 0 && e.gtin === l.gtin && e.lote !== l.lote && ['almacen', 'recibo'].includes(zonaDe(e)) && e.caducidad < (l.caducidadIso ?? ''))
    .filter((e) => vendible(semaforoDe(estado, e.sku, e.caducidad, hoy).semaforo))
    .sort((a, b) => a.caducidad.localeCompare(b.caducidad))[0]
}

function vistaLote(estado: EstadoAlmacen, l: Interpretacion, hoy: string, ubicacion?: string): NonNullable<VistaEscaneo['lote']> {
  const s = semaforoDe(estado, l.articulo!.sku, l.caducidadIso!, hoy)
  return { lote: l.lote!, caducidad: l.caducidadIso!, ...s, ...(ubicacion ? { ubicacion } : {}) }
}

const articuloDe = (l: Interpretacion) => ({ sku: l.articulo!.sku, descripcion: l.articulo!.descripcion, gtin: l.gtin!, ...(l.nivel ? { nivel: l.nivel } : {}) })

/** La tarea pendiente de la ronda que este escaneo cierra, si la hay. */
function tareaQueCierra(estado: EstadoAlmacen, ronda: RondaDia | undefined, tipos: readonly Tarea['tipo'][], l: Interpretacion, hora: string): Tarea | undefined {
  if (!ronda) return undefined
  return estadoDeTareas(estado, ronda, hora).find((t) => (t.estado === 'pendiente' || t.estado === 'atrasada') && tipos.includes(t.tipo) && t.lote?.gtin === l.gtin && t.lote?.lote === l.lote && t.lote?.caducidad === l.caducidadIso)
}

/** Cierra la tarea con su evento: el escaneo que la prueba y la accion que la hizo. */
function cierra(estado: EstadoAlmacen, p: PedidoEscaneo, ronda: RondaDia, t: Tarea, accion?: Evento): { estado: EstadoAlmacen; evento: Evento } {
  return registra(estado, p.sitio, {
    tipo: 'TAREA_CERRADA', lote: t.lote!, operador: p.operador, fecha: p.cuando,
    datos: { ronda: ronda.id, tarea: t.id, tipoTarea: t.tipo, ubicacion: ubicacionDe(p.zona, p.posicion), evidencia: json({ zona: p.zona, texto: p.texto }), ...(accion ? { accion: accion.hash } : {}), cambios: [] },
  })
}

/** `antes`: el estado ANTES de la accion (despues, «retirar» ya no aplicaria: el lote salio de piso). */
function conTarea(antes: EstadoAlmacen, r: ResultadoEscaneo, p: PedidoEscaneo, ronda: RondaDia | undefined, tipos: readonly Tarea['tipo'][], l: Interpretacion): ResultadoEscaneo {
  const t = tareaQueCierra(antes, ronda, tipos, l, p.hora ?? '00:00')
  if (!t || !ronda) return r
  const accion = r.eventos.find((e) => e.tipo === 'MOVIDO')
  const c = cierra(r.estado, p, ronda, t, accion)
  return { estado: c.estado, eventos: [...r.eventos, c.evento], vista: { ...r.vista, tarea: { id: t.id, tipo: t.tipo, instruccion: t.instruccion }, detalle: [...r.vista.detalle, `Tarea de la ronda cerrada: ${t.instruccion}`] } }
}

/** Mueve el lote a `destino` (cajas escaneadas, o TODAS las de origen) y arma la vista. */
function mueveA(estado: EstadoAlmacen, p: PedidoEscaneo, l: Interpretacion, destino: Zona, posicion?: string, extra: Record<string, Json> = {}): Paso<{ avisos: readonly string[] }> {
  const origen = delLote(estado, p.sitio, l).filter((e) => zonaDe(e) !== destino)
  const veces = p.todas ? Math.max(1, origen.reduce((s, e) => s + e.cantidad, 0)) : Math.max(1, p.veces ?? 1)
  const m = mueveConExpediente(estado, { sitio: p.sitio, destino, lectura: { ...l, cajas: 1 }, veces, operador: p.operador }, p.cuando, p.id, p.hoy, destino === 'almacen' ? posicion : undefined, extra)
  if (!m.resultado.ok) return { estado, resultado: { ok: false, motivo: m.resultado.motivo } }
  return { estado: m.estado, resultado: { ok: true, valor: { avisos: m.resultado.valor.avisos }, eventos: m.resultado.eventos } }
}

const cuantas = (p: PedidoEscaneo) => (p.todas ? 'todas las cajas del lote' : `${Math.max(1, p.veces ?? 1)} caja(s) escaneada(s)`)

function enRecibo(estado: EstadoAlmacen, p: PedidoEscaneo, l: Interpretacion): ResultadoEscaneo {
  if (!l.articulo) return { estado, vista: { tipo: 'desconocido', color: 'aviso', titulo: 'Código fuera del catálogo', detalle: ['Vincúlalo a un artículo (con su foto) antes de recibir.'], sonido: 'aviso', ...(l.gtin ? { articulo: { sku: '', descripcion: '', gtin: l.gtin } } : {}) }, eventos: [] }
  if (!(l.lote && l.caducidadIso) && !l.sscc) return { estado, vista: { tipo: 'recibir-con-foto', color: 'info', titulo: l.articulo.descripcion, detalle: [`Leíste ${l.nivel === 'caja' ? 'la caja' : 'la pieza'}. El código no trae lote ni caducidad: toma la foto de dónde viene la fecha.`], sonido: 'ok', articulo: articuloDe(l) }, eventos: [] }
  const r = recibeConExpediente(estado, { ...l, cajas: l.sscc ? l.cajas : l.cajas * Math.max(1, p.veces ?? 1) }, p.sitio, p.cuando, p.id, p.operador, p.texto)
  if (!r.resultado.ok) return error(estado, 'No se recibió', [r.resultado.motivo])
  const ev = r.resultado.eventos[0]!
  const rech = r.resultado.valor.rechazada
  if (rech) return { estado: r.estado, eventos: r.resultado.eventos, vista: { tipo: 'rechazado', color: 'error', titulo: 'RECHAZADO: no se recibe', detalle: [rech.regla, `Devolución ${rech.folio}.`], sonido: 'error', articulo: articuloDe(l), evento: { seq: ev.seq, hash: ev.hash, tipo: ev.tipo } }, }
  return { estado: r.estado, eventos: r.resultado.eventos, vista: { tipo: 'recibido', color: vistaLote(r.estado, l, p.hoy).semaforo, titulo: 'Recibido', detalle: [`${l.articulo.descripcion} · lote ${l.lote} · ${cuantas(p)}`], sonido: 'ok', articulo: articuloDe(l), lote: vistaLote(r.estado, l, p.hoy, 'RECIBO'), evento: { seq: ev.seq, hash: ev.hash, tipo: ev.tipo } } }
}

function infoAlmacen(estado: EstadoAlmacen, p: PedidoEscaneo, l: Interpretacion, aqui: Existencia): ResultadoEscaneo {
  const antes = fefoAntes(estado, p.sitio, l, p.hoy)
  const lote = vistaLote(estado, l, p.hoy, ubicacionDe('almacen', aqui.posicion))
  const detalle = [`${l.articulo!.descripcion} · lote ${l.lote} · ${aqui.posicion ? `rack ${aqui.posicion}` : 'sin rack'}`]
  if (antes) detalle.push(`Este no: baja primero el lote ${antes.lote} (vence antes) de ${ubicacionDe(zonaDe(antes), antes.posicion)}.`)
  return { estado, eventos: [], vista: { tipo: 'info', color: antes ? 'aviso' : lote.semaforo, titulo: antes ? 'Baja primero el otro' : 'En almacén', detalle, sonido: antes ? 'aviso' : 'ok', articulo: articuloDe(l), lote, ...(antes ? { fefo: { lote: antes.lote, caducidad: antes.caducidad, ubicacion: ubicacionDe(zonaDe(antes), antes.posicion) } } : {}) } }
}

function enAlmacen(estado: EstadoAlmacen, p: PedidoEscaneo, l: Interpretacion, ronda?: RondaDia): ResultadoEscaneo {
  const filas = delLote(estado, p.sitio, l)
  const enRec = filas.some((e) => zonaDe(e) === 'recibo')
  const aqui = filas.find((e) => zonaDe(e) === 'almacen')
  if (enRec && (!aqui || p.todas || p.veces)) {
    const m = mueveA(estado, p, l, 'almacen', p.posicion)
    if (!m.resultado.ok) return error(estado, 'No se movió', [m.resultado.motivo])
    const mov = m.resultado.eventos[0]!
    const r: ResultadoEscaneo = { estado: m.estado, eventos: m.resultado.eventos, vista: { tipo: 'movido', color: vistaLote(m.estado, l, p.hoy).semaforo, titulo: `Entra al almacén${p.posicion ? ` · rack ${p.posicion}` : ''}`, detalle: [`${l.articulo!.descripcion} · lote ${l.lote} · ${cuantas(p)}`], sonido: 'ok', articulo: articuloDe(l), lote: vistaLote(m.estado, l, p.hoy, ubicacionDe('almacen', p.posicion)), deshacer: mov.hash } }
    return conTarea(estado, r, p, ronda, ['ubicar'], l)
  }
  if (aqui && p.posicion && aqui.posicion !== p.posicion) {
    const u = ubica(estado, p.sitio, claveDe(aqui), p.posicion, p.cuando, p.operador)
    if (!u.resultado.ok) return error(estado, 'No se ubicó', [u.resultado.motivo])
    return { estado: u.estado, eventos: u.resultado.eventos, vista: { tipo: 'ubicado', color: 'ok', titulo: `Ubicado en rack ${p.posicion}`, detalle: [`${l.articulo!.descripcion} · lote ${l.lote}`], sonido: 'ok', articulo: articuloDe(l), lote: vistaLote(u.estado, l, p.hoy, ubicacionDe('almacen', p.posicion)) } }
  }
  if (aqui) return infoAlmacen(estado, p, l, aqui)
  return error(estado, filas.length ? `Ese lote está en ${nombreZona(zonaDe(filas[0]!)).toLowerCase()}, no en almacén` : 'Ese lote no está en este sitio', [`Lote ${l.lote}.`])
}

function retira(estado: EstadoAlmacen, p: PedidoEscaneo, l: Interpretacion, semaforo: EstadoSemaforo, ronda?: RondaDia): ResultadoEscaneo {
  const destino: Zona = semaforo === 'vencido' ? 'merma' : 'almacen'
  const m = mueveA(estado, { ...p, todas: true }, l, destino, undefined, { retiro: semaforo, motivo: semaforo === 'vencido' ? 'vencido' : 'rojo: separar para liquidación, donación o merma' })
  if (!m.resultado.ok) return error(estado, 'No se retiró', [m.resultado.motivo])
  const mov = m.resultado.eventos[0]!
  const r: ResultadoEscaneo = { estado: m.estado, eventos: m.resultado.eventos, vista: {
    tipo: 'retirado', color: semaforo, titulo: semaforo === 'vencido' ? 'VENCIDO: retirado a merma' : 'ROJO: retirado del anaquel',
    detalle: [`${l.articulo!.descripcion} · lote ${l.lote}`, semaforo === 'vencido' ? 'Todas sus cajas de piso van a merma.' : 'Todas sus cajas de piso se separan en almacén: liquidar o donar lo decide una persona.'],
    sonido: 'aviso', articulo: articuloDe(l), lote: vistaLote(m.estado, l, p.hoy), deshacer: mov.hash } }
  return conTarea(estado, r, p, ronda, ['retirar'], l)
}

const TITULO_PISO: Readonly<Record<EstadoSemaforo, string>> = { vigente: 'Se vende', alerta: 'Se vende · véndelo primero', promocion: 'Promoción: a exhibición', retiro: 'Rojo', vencido: 'Vencido' }

function enPiso(estado: EstadoAlmacen, p: PedidoEscaneo, l: Interpretacion, ronda?: RondaDia): ResultadoEscaneo {
  const filas = delLote(estado, p.sitio, l)
  const { semaforo } = semaforoDe(estado, l.articulo!.sku, l.caducidadIso!, p.hoy)
  const enPisoYa = filas.some((e) => zonaDe(e) === 'piso')
  if (enPisoYa && (semaforo === 'vencido' || semaforo === 'retiro')) return retira(estado, p, l, semaforo, ronda)
  // Si la ronda pide RESURTIR este lote y aun quedan cajas arriba, el escaneo en piso baja una (aunque
  // ya haya del lote en piso): es la tarea que la persona esta haciendo, no una consulta.
  const bajaDeRonda = Boolean(tareaQueCierra(estado, ronda, ['resurtir'], l, p.hora ?? '00:00')) && filas.some((e) => zonaDe(e) === 'almacen' || zonaDe(e) === 'recibo')
  if (enPisoYa && !p.veces && !p.todas && !bajaDeRonda) {
    const r: ResultadoEscaneo = { estado, eventos: [], vista: { tipo: 'info', color: semaforo, titulo: TITULO_PISO[semaforo], detalle: [`${l.articulo!.descripcion} · lote ${l.lote}`], sonido: 'ok', articulo: articuloDe(l), lote: vistaLote(estado, l, p.hoy, 'PISO') } }
    return semaforo === 'promocion' ? conTarea(estado, r, p, ronda, ['promover'], l) : r
  }
  if (!filas.some((e) => zonaDe(e) === 'almacen' || zonaDe(e) === 'recibo')) return error(estado, filas.length ? 'Ese lote ya está en piso' : 'Ese lote no está en este sitio', [`Lote ${l.lote}. Si lo tienes en la mano y no está registrado, es un hallazgo.`])
  const m = mueveA(estado, p, l, 'piso')
  if (!m.resultado.ok) return error(estado, 'No sube a piso', [m.resultado.motivo])
  const mov = m.resultado.eventos[0]!
  const aviso = m.resultado.valor.avisos[0]
  const r: ResultadoEscaneo = { estado: m.estado, eventos: m.resultado.eventos, vista: { tipo: 'movido', color: aviso ? 'aviso' : semaforo, titulo: aviso ? 'Subió, pero había otro que vence antes' : 'Sube a piso', detalle: [`${l.articulo!.descripcion} · lote ${l.lote} · ${cuantas(p)}`, ...(aviso ? [aviso] : [])], sonido: aviso ? 'aviso' : 'ok', articulo: articuloDe(l), lote: vistaLote(m.estado, l, p.hoy, 'PISO'), deshacer: mov.hash } }
  return conTarea(estado, r, p, ronda, ['resurtir', 'promover'], l)
}

function enMerma(estado: EstadoAlmacen, p: PedidoEscaneo, l: Interpretacion): ResultadoEscaneo {
  const { semaforo } = semaforoDe(estado, l.articulo!.sku, l.caducidadIso!, p.hoy)
  const motivo = semaforo === 'vencido' ? (p.motivo?.trim() || 'vencido') : p.motivo?.trim()
  if (!motivo || motivo.length < 3) return error(estado, 'Falta el motivo de la merma', ['Elige el motivo (dañado, empaque roto…) y vuelve a escanear.'])
  const m = mueveA(estado, p, l, 'merma', undefined, { motivo })
  if (!m.resultado.ok) return error(estado, 'No se registró la merma', [m.resultado.motivo])
  const mov = m.resultado.eventos[0]!
  return { estado: m.estado, eventos: m.resultado.eventos, vista: { tipo: 'merma', color: 'vencido', titulo: 'A merma', detalle: [`${l.articulo!.descripcion} · lote ${l.lote} · ${cuantas(p)} · motivo: ${motivo}`], sonido: 'ok', articulo: articuloDe(l), lote: vistaLote(m.estado, l, p.hoy, 'MERMA'), deshacer: mov.hash } }
}

function soloCodigoDelProveedor(estado: EstadoAlmacen, p: PedidoEscaneo, l: Interpretacion): ResultadoEscaneo {
  const lotes = lotesDelArticulo(estado, p.sitio, l.articulo!.sku, p.hoy, p.zona === 'piso' ? ['piso', 'almacen'] : [p.zona])
  if (p.zona === 'piso') return { estado, eventos: [], vista: { tipo: 'pieza-suelta', color: 'info', titulo: `Pieza suelta · ${l.articulo!.descripcion}`, detalle: ['El código del proveedor no dice el lote: toma la foto de su fecha y te digo cuál es.'], sonido: 'ok', articulo: articuloDe(l), lotes } }
  return { estado, eventos: [], vista: { tipo: 'info', color: 'info', titulo: l.articulo!.descripcion, detalle: ['Ese código no dice el lote: lee la etiqueta de la caja (la de la casa).'], sonido: 'aviso', articulo: articuloDe(l), lotes } }
}

/** El escaneo en su zona, con su rol. Puro: devuelve el estado nuevo, la vista y los eventos. */
export function ejecutaEscaneo(estado: EstadoAlmacen, p: PedidoEscaneo, ronda?: RondaDia): ResultadoEscaneo {
  const lectura = parseaLectura(p.texto)
  if (esErrorLectura(lectura)) return error(estado, 'No se pudo leer', [lectura.mensaje])
  const ubic = leeUbicacion(lectura.elementos, estado.configuracion.sitios)
  if (ubic && 'error' in ubic) return error(estado, 'Etiqueta de ubicación ajena', [ubic.error])
  if (ubic) {
    if (!ZONAS_DEL_ROL[p.rol].includes(ubic.zona)) return error(estado, `Tu rol no opera en ${nombreZona(ubic.zona).toLowerCase()}`, ['El servidor no deja hacer ahí nada con este dispositivo.'])
    return { estado, eventos: [], vista: { tipo: 'zona', color: 'info', titulo: `Estás en ${nombreZona(ubic.zona)}${ubic.posicion ? ` · rack ${ubic.posicion}` : ''}`, detalle: [`${ubic.sitio.nombre}. Cada escaneo hace ahora la acción de esta zona.`], sonido: 'ok', zona: { sitio: ubic.sitio.clave, zona: ubic.zona, ...(ubic.posicion ? { posicion: ubic.posicion } : {}) } } }
  }
  if (!ZONAS_DEL_ROL[p.rol].includes(p.zona)) return error(estado, `Tu rol no opera en ${nombreZona(p.zona).toLowerCase()}`, ['El servidor no deja hacer ahí nada con este dispositivo.'])
  const l = interpreta(lectura.elementos, estado, p.hoy)
  if (p.zona === 'recibo') return enRecibo(estado, p, l)
  if (!l.articulo) return error(estado, 'Código fuera del catálogo', ['Vincúlalo en recibo antes de moverlo.'])
  if (!(l.lote && l.caducidadIso)) return soloCodigoDelProveedor(estado, p, l)
  if (p.zona === 'almacen') return enAlmacen(estado, p, l, ronda)
  if (p.zona === 'piso') return enPiso(estado, p, l, ronda)
  return enMerma(estado, p, l)
}

/** La vista para el ALMACENISTA: el mismo resultado sin cifras del sistema en ningun texto. */
export function vistaSinCantidades(v: VistaEscaneo): VistaEscaneo {
  return { ...v, titulo: sinCantidades(v.titulo), detalle: v.detalle.map((d) => (/caja\(s\) escaneada\(s\)/.test(d) ? d : sinCantidades(d))) }
}

const skuDe = (estado: EstadoAlmacen, gtin: string): string => Object.values(estado.articulos).find((a) => a.gtinCaja === gtin || a.gtinUnidad === gtin)?.sku ?? ''

/**
 * «Deshacer el ultimo»: una CORRECCION que revierte la huella del MOVIDO (no un borrado). Solo el
 * propio, solo si nada mas toco ese lote despues, y en los primeros 15 minutos.
 */
export function deshazMovimiento(estado: EstadoAlmacen, sitio: string, hash: string, operador: string, cuando: string, id: string): Paso<Evento> {
  const cadena = estado.eventos?.[sitio] ?? []
  const ev = cadena.find((e) => e.hash === hash)
  const falla = (motivo: string): Paso<Evento> => ({ estado, resultado: { ok: false, motivo } })
  if (!ev || ev.tipo !== 'MOVIDO') return falla('solo se deshace un movimiento de este sitio')
  if (ev.operador !== operador) return falla('solo se deshace un movimiento propio')
  if (Date.parse(cuando) - Date.parse(ev.fecha) > 15 * 60_000) return falla('pasaron más de 15 minutos: corrígelo desde el expediente con su motivo')
  // Lo que salio en la MISMA operacion (UBICADO del rack, TAREA_CERRADA) no cuenta como «despues».
  const mismaOperacion = (e: Evento) => e.fecha === ev.fecha && e.operador === ev.operador && (e.tipo === 'UBICADO' || e.tipo === 'TAREA_CERRADA')
  if (cadena.some((e) => e.seq > ev.seq && e.lote.gtin === ev.lote.gtin && e.lote.lote === ev.lote.lote && !mismaOperacion(e))) return falla('ese lote ya se movió después: corrígelo desde el expediente')
  if (cadena.some((e) => e.tipo === 'CORRECCION' && e.datos['corrige'] === hash)) return falla('ese movimiento ya se deshizo')
  const cambios = (Array.isArray(ev.datos['cambios']) ? ev.datos['cambios'] : []) as { zona: Zona; cajas: number; sscc?: string }[]
  let existencias = [...estado.existencias]
  for (const c of cambios) {
    const fila = existencias.find((e) => e.sitio === sitio && e.gtin === ev.lote.gtin && e.lote === ev.lote.lote && e.caducidad === ev.lote.caducidad && zonaDe(e) === c.zona && (e.sscc ?? '') === (c.sscc ?? ''))
    const nueva = (fila?.cantidad ?? 0) - c.cajas
    if (nueva < 0) return falla('ya no hay esas cajas donde quedaron: corrígelo desde el expediente')
    existencias = fila ? existencias.map((e) => (e === fila ? { ...e, cantidad: nueva, actualizado: cuando } : e)).filter((e) => e.cantidad > 0)
      : [...existencias, { id: `${id}-${c.zona}`, sitio, sku: skuDe(estado, ev.lote.gtin), ...ev.lote, cantidad: nueva, origen: 'recepcion' as const, actualizado: cuando, zona: c.zona, ...(c.sscc ? { sscc: c.sscc } : {}) }]
  }
  const r = registra({ ...estado, existencias }, sitio, { tipo: 'CORRECCION', lote: ev.lote, operador, fecha: cuando, datos: { corrige: hash, seqCorregido: ev.seq, motivo: 'deshacer el último escaneo', deshace: true, cambios: json(cambios.map((c) => ({ ...c, cajas: -c.cajas }))) } })
  return { estado: r.estado, resultado: { ok: true, valor: r.evento, eventos: [r.evento] } }
}
