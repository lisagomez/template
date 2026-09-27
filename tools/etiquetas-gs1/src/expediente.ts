/**
 * El expediente del lote: cada operacion que cambia el inventario deja su evento en la cadena del
 * sitio, con la HUELLA exacta de lo que cambio (`cambios`: cajas por zona, positivas o negativas).
 * Asi el estado es una proyeccion de la cadena (`proyeccion.ts`) y se puede comprobar.
 *
 * Nada se edita: un error se corrige con un evento CORRECCION que apunta al evento corregido.
 * Lo que decide sobre terceros (donar, liquidar) exige quien lo autoriza; el bloqueo de venta vive
 * aqui, en el sistema, porque la caja registradora no lee el lote en el EAN-13.
 *
 * `operador` es SIEMPRE un seudonimo: la cadena es inmutable y no puede guardar lo que alguien
 * tenga derecho a cancelar.
 */
import { idLote, nuevoEvento, type Borrador, type ClaveLote, type Evento, type TipoEvento } from './cadena.js'
import type { Json } from './jcs.js'
import { altaDeLote, recibe, type AltaLote, type Interpretacion } from './existencias.js'
import { diasParaCaducar } from './fefo.js'
import type { Devolucion, EstadoAlmacen, Existencia, Zona } from './modelo.js'
import { bloqueoPorRevision } from './revisiones.js'
import { categoriaPorId, estadoSemaforo, vendible, type EstadoSemaforo } from './semaforo.js'
import { mueve, zonaDe, type PedidoMovimiento, type ResultadoMovimiento } from './ubicaciones.js'

export type Cambio = { readonly zona: Zona; readonly cajas: number; readonly sscc?: string; readonly caducidad?: string }

export type Resultado<T> = { readonly ok: true; readonly valor: T; readonly eventos: readonly Evento[] } | { readonly ok: false; readonly motivo: string }
export interface Paso<T> { readonly estado: EstadoAlmacen; readonly resultado: Resultado<T> }

const json = (v: object): Json => v as unknown as Json
const falla = <T>(estado: EstadoAlmacen, motivo: string): Paso<T> => ({ estado, resultado: { ok: false, motivo } })
export const claveDe = (e: { readonly gtin: string; readonly lote: string; readonly caducidad: string }): ClaveLote => ({ gtin: e.gtin, lote: e.lote, caducidad: e.caducidad })
const esDe = (e: Existencia, sitio: string, l: ClaveLote) => e.sitio === sitio && e.gtin === l.gtin && e.lote === l.lote && e.caducidad === l.caducidad

export function cadenaDe(estado: EstadoAlmacen, sitio: string): readonly Evento[] {
  return estado.eventos?.[sitio] ?? []
}

/** Agrega un evento a la cadena del sitio. Es la UNICA via de escritura de la cadena. */
export function registra(estado: EstadoAlmacen, sitio: string, b: Borrador, enlace?: string): { estado: EstadoAlmacen; evento: Evento } {
  const cadena = cadenaDe(estado, sitio)
  const evento = nuevoEvento(sitio, cadena, b, enlace ?? enlaceCorreccion(cadena, b.lote))
  return { estado: { ...estado, version: estado.version + 1, eventos: { ...estado.eventos, [sitio]: [...cadena, evento] } }, evento }
}

/** Tras corregir una caducidad, el primer evento del lote con la clave nueva enlaza con la CORRECCION. */
function enlaceCorreccion(cadena: readonly Evento[], lote: ClaveLote): string | undefined {
  if (cadena.some((e) => idLote(e.lote) === idLote(lote))) return undefined
  return [...cadena].reverse().find((e) => e.tipo === 'CORRECCION' && e.datos['caducidadNueva'] === lote.caducidad && e.lote.gtin === lote.gtin && e.lote.lote === lote.lote)?.hash
}

/** Lo que cambio de un lote en un sitio entre dos estados, por zona y tarima. */
export function cambiosDe(antes: readonly Existencia[], despues: readonly Existencia[], sitio: string, l: ClaveLote): Cambio[] {
  const suma = (lista: readonly Existencia[]) => {
    const m = new Map<string, number>()
    for (const e of lista) if (esDe(e, sitio, l)) m.set(`${zonaDe(e)}|${e.sscc ?? ''}`, (m.get(`${zonaDe(e)}|${e.sscc ?? ''}`) ?? 0) + e.cantidad)
    return m
  }
  const a = suma(antes)
  const d = suma(despues)
  const cambios: Cambio[] = []
  for (const k of [...new Set([...a.keys(), ...d.keys()])].sort()) {
    const delta = (d.get(k) ?? 0) - (a.get(k) ?? 0)
    const [zona, sscc] = k.split('|') as [Zona, string]
    if (delta !== 0) cambios.push({ zona, cajas: delta, ...(sscc ? { sscc } : {}) })
  }
  return cambios
}

function conEvento(antes: EstadoAlmacen, despues: EstadoAlmacen, sitio: string, tipo: TipoEvento, l: ClaveLote, datos: Record<string, Json>, operador: string, cuando: string, enlace?: string) {
  const cambios = cambiosDe(antes.existencias, despues.existencias, sitio, l)
  return registra(despues, sitio, { tipo, lote: l, datos: { ...datos, cambios: json(cambios) }, operador, fecha: cuando }, enlace)
}

/** Estado del semaforo de un lote segun su articulo y categoria. */
export function semaforoDe(estado: EstadoAlmacen, sku: string, caducidad: string, hoy: string): { dias: number; estado: EstadoSemaforo } {
  const dias = diasParaCaducar(caducidad, hoy)
  return { dias, estado: estadoSemaforo(dias, categoriaPorId(estado.configuracion.categorias, estado.articulos[sku]?.categoria)) }
}

export type ValorRecepcion = { readonly existencia: Existencia; readonly rechazada?: undefined } | { readonly rechazada: Devolucion; readonly existencia?: undefined }

/**
 * Recepcion con expediente. Si no cumple la vida minima (regla de 2/3 o minimo de la categoria)
 * o esta vencido, queda RECHAZADO: el evento guarda lo leido y la regla, y se genera la
 * devolucion al proveedor con el hash del evento como evidencia. La cadena del lote se cierra ahi.
 */
export function recibeConExpediente(estado: EstadoAlmacen, l: Interpretacion, sitio: string, cuando: string, id: string, operador: string, lectura: string, extra: Record<string, Json> = {}): Paso<ValorRecepcion> {
  const basico = !estado.configuracion.sitios.some((s) => s.clave === sitio) ? `el sitio ${sitio} no existe`
    : !l.articulo || !l.gtin ? 'el código no corresponde a un artículo del catálogo'
      : !l.lote || !l.caducidadIso ? 'la lectura no trae lote y caducidad' : undefined
  if (basico || !l.articulo || !l.gtin || !l.lote || !l.caducidadIso) return falla(estado, basico ?? '')
  const lote: ClaveLote = { gtin: l.gtin, lote: l.lote, caducidad: l.caducidadIso }
  if (l.vida && (l.vida.dias < 0 || !l.vida.aceptableEnRecepcion)) {
    const regla = l.vida.dias < 0 ? 'vencido: no se recibe' : l.vida.minimo.texto
    const r = registra(estado, sitio, {
      tipo: 'RECHAZADO', lote, operador, fecha: cuando,
      datos: { cajas: l.cajas, sku: l.articulo.sku, lectura, diasRestantes: l.vida.dias, minimoDias: l.vida.minimo.dias, regla, devolucion: `DEV-${id}`, ...(l.sscc ? { sscc: l.sscc } : {}), ...extra },
    })
    const devolucion: Devolucion = {
      folio: `DEV-${id}`, fecha: cuando, sitio, sku: l.articulo.sku, ...lote, cajas: l.cajas, lectura, diasRestantes: l.vida.dias,
      minimoDias: l.vida.minimo.dias, regla, evento: { seq: r.evento.seq, hash: r.evento.hash },
    }
    return { estado: { ...r.estado, devoluciones: [...(r.estado.devoluciones ?? []), devolucion] }, resultado: { ok: true, valor: { rechazada: devolucion }, eventos: [r.evento] } }
  }
  const a = recibe(estado, l, sitio, cuando, id)
  if (!a.resultado.ok) return falla(estado, a.resultado.motivo)
  const datos = { cajas: l.cajas, zona: 'recibo', sku: l.articulo.sku, origen: 'recepcion', ...(l.vida ? { diasRestantes: l.vida.dias, minimoDias: l.vida.minimo.dias } : {}), ...(l.sscc ? { sscc: l.sscc } : {}), ...extra }
  const r = conEvento(estado, a.estado, sitio, 'RECIBIDO', lote, datos, operador, cuando)
  return { estado: r.estado, resultado: { ok: true, valor: { existencia: a.resultado.existencia }, eventos: [r.evento] } }
}

/** Alta de un lote (al etiquetar en origen, o inventario inicial) con su evento RECIBIDO. */
export function altaConExpediente(estado: EstadoAlmacen, a: AltaLote, origen: Existencia['origen'], cuando: string, id: string, operador: string, extra: Record<string, Json> = {}, enlace?: string): Paso<Existencia> {
  const r = altaDeLote(estado, a, origen, cuando, id)
  if (!r.resultado.ok) return falla(estado, r.resultado.motivo)
  const datos = { cajas: a.cantidad, zona: a.zona ?? 'recibo', sku: a.sku, origen, ...(a.sscc ? { sscc: a.sscc } : {}), ...extra }
  const ev = conEvento(estado, r.estado, a.sitio, 'RECIBIDO', claveDe(a), datos, operador, cuando, enlace)
  return { estado: ev.estado, resultado: { ok: true, valor: r.resultado.existencia, eventos: [ev.evento] } }
}

/** Movimiento entre zonas (con la regla de no subir a piso lo bloqueado) y, al almacen, su posicion. */
export function mueveConExpediente(estado: EstadoAlmacen, p: PedidoMovimiento, cuando: string, id: string, hoy: string, posicion?: string): Paso<Extract<ResultadoMovimiento, { ok: true }>> {
  if (posicion !== undefined && (p.destino !== 'almacen' || !esPosicion(posicion))) return falla(estado, posicion && p.destino !== 'almacen' ? 'la posición rack-nivel-posición solo existe en el almacén' : `la posición «${posicion}» no es rack-nivel-posición (p. ej. B-04-2)`)
  // Cajas por confirmar (caducidad leida de una foto y sin confirmar): no se mueven, y se dice por que.
  const l = p.lectura
  const sinExistencia = !estado.existencias.some((e) => e.sitio === p.sitio && e.gtin === l.gtin && (!l.lote || e.lote === l.lote) && e.cantidad > 0)
  const pendiente = l.gtin && !l.sscc && (!l.lote || sinExistencia) ? bloqueoPorRevision(estado, p.sitio, l.gtin, cuando) : undefined
  if (pendiente) return falla(estado, pendiente)
  const m = mueve(estado, p, cuando, id, hoy)
  if (!m.resultado.ok) return falla(estado, m.resultado.motivo)
  const mov = m.resultado.movimiento
  const lote = claveDe(mov)
  // La posicion es del almacen: lo que sale de el (una tarima entera) ya no la lleva.
  const sinPosicion = { ...m.estado, existencias: m.estado.existencias.map(({ posicion, ...e }) => (posicion && zonaDe(e) !== 'almacen' ? e : { ...e, ...(posicion ? { posicion } : {}) })) }
  const r = conEvento(estado, sinPosicion, p.sitio, 'MOVIDO', lote, { cajas: mov.cajas, a: mov.a, de: [...mov.de], ...(mov.sscc ? { sscc: mov.sscc } : {}) }, p.operador, cuando)
  if (posicion === undefined) return { estado: r.estado, resultado: { ok: true, valor: m.resultado, eventos: [r.evento] } }
  const u = ubica(r.estado, p.sitio, lote, posicion, cuando, p.operador, mov.sscc)
  if (!u.resultado.ok) return falla(estado, u.resultado.motivo)
  return { estado: u.estado, resultado: { ok: true, valor: m.resultado, eventos: [r.evento, ...u.resultado.eventos] } }
}

/** Rack-nivel-posicion: letra(s) de rack, nivel de 2 cifras y posicion (B-04-2). */
export const esPosicion = (p: string): boolean => /^[A-Z]{1,2}-\d{2}-\d{1,2}$/.test(p)

/** UBICADO: asigna rack-nivel-posicion al lote en el almacen del sitio (o solo a su tarima). */
export function ubica(estado: EstadoAlmacen, sitio: string, lote: ClaveLote, posicion: string, cuando: string, operador: string, sscc?: string): Paso<string> {
  if (!esPosicion(posicion)) return falla(estado, `la posición «${posicion}» no es rack-nivel-posición (p. ej. B-04-2)`)
  const filas = estado.existencias.filter((e) => esDe(e, sitio, lote) && zonaDe(e) === 'almacen' && e.cantidad > 0 && (!sscc || e.sscc === sscc))
  if (filas.length === 0) return falla(estado, 'ese lote no está en el almacén de ese sitio')
  const existencias = estado.existencias.map((e) => (filas.includes(e) ? { ...e, posicion, actualizado: cuando } : e))
  const r = registra({ ...estado, existencias }, sitio, {
    tipo: 'UBICADO', lote, operador, fecha: cuando,
    datos: { posicion, cajas: filas.reduce((s, e) => s + e.cantidad, 0), filas: json(filas.map((e) => ({ zona: 'almacen', ...(e.sscc ? { sscc: e.sscc } : {}) }))) },
  })
  return { estado: r.estado, resultado: { ok: true, valor: posicion, eventos: [r.evento] } }
}

/** Quita cajas de un lote en un sitio, zona por zona en el orden dado. */
function quita(estado: EstadoAlmacen, sitio: string, l: ClaveLote, cajas: number, orden: readonly Zona[], cuando: string): EstadoAlmacen | string {
  const fuentes = estado.existencias.filter((e) => esDe(e, sitio, l) && e.cantidad > 0 && orden.includes(zonaDe(e)))
    .sort((a, b) => orden.indexOf(zonaDe(a)) - orden.indexOf(zonaDe(b)) || Number(Boolean(a.sscc)) - Number(Boolean(b.sscc)))
  const hay = fuentes.reduce((s, e) => s + e.cantidad, 0)
  if (hay < cajas) return `solo hay ${hay} caja(s) de ese lote en ${sitio}`
  let faltan = cajas
  const quitadas = new Map<Existencia, number>()
  for (const f of fuentes) {
    if (faltan === 0) break
    const n = Math.min(f.cantidad, faltan)
    quitadas.set(f, n)
    faltan -= n
  }
  const existencias = estado.existencias
    .map((e) => (quitadas.has(e) ? { ...e, cantidad: e.cantidad - quitadas.get(e)!, actualizado: cuando } : e))
    .filter((e) => e.cantidad > 0)
  return { ...estado, version: estado.version + 1, existencias }
}

export type TipoSalida = 'VENDIDO' | 'DEVUELTO' | 'DONADO' | 'MERMA'

export interface PedidoSalida {
  readonly sitio: string
  readonly tipo: TipoSalida
  readonly lote: ClaveLote
  readonly cajas: number
  /** Venta: `normal` o `liquidacion` (esta solo en rojo y con quien la autoriza). */
  readonly canal?: 'normal' | 'liquidacion'
  /** Seudonimo de la PERSONA que decide donar o liquidar. */
  readonly autoriza?: string
  readonly motivo?: string
}

const ORDEN_SALIDA: Readonly<Record<TipoSalida, readonly Zona[]>> = {
  VENDIDO: ['piso', 'almacen', 'recibo'],
  DEVUELTO: ['recibo', 'almacen', 'piso', 'merma'],
  DONADO: ['merma', 'almacen', 'piso', 'recibo'],
  MERMA: ['merma', 'piso', 'almacen', 'recibo'],
}

/** Lo que el semaforo permite a cada salida. Devuelve el motivo del bloqueo, o undefined. */
export function bloqueoDeSalida(p: PedidoSalida, semaforo: EstadoSemaforo): string | undefined {
  if (p.tipo === 'VENDIDO') {
    if (semaforo === 'vencido') return 'vencido: no se vende, va a merma'
    if ((p.canal ?? 'normal') === 'normal' && !vendible(semaforo)) return 'bloqueado para venta normal (rojo): solo liquidación, donación o merma'
    if (p.canal === 'liquidacion' && semaforo !== 'retiro') return 'la liquidación es para lotes en rojo; este se vende normal'
    if (p.canal === 'liquidacion' && !p.autoriza) return 'liquidar lo decide una persona: falta quién lo autoriza'
  }
  if (p.tipo === 'DONADO' && semaforo === 'vencido') return 'vencido: no se dona, va a merma'
  if (p.tipo === 'DONADO' && !p.autoriza) return 'donar lo decide una persona: falta quién lo autoriza'
  if (p.tipo === 'DEVUELTO' && !p.motivo) return 'una devolución lleva su motivo'
  return undefined
}

/** Salida (venta, devolucion, donacion o merma): cierra el expediente cuando no queda nada. */
export function salida(estado: EstadoAlmacen, p: PedidoSalida, hoy: string, cuando: string, operador: string): Paso<{ cajas: number }> {
  if (!Number.isInteger(p.cajas) || p.cajas < 1) return falla(estado, 'las cajas van en enteros positivos')
  const fila = estado.existencias.find((e) => esDe(e, p.sitio, p.lote))
  if (!fila) return falla(estado, bloqueoPorRevision(estado, p.sitio, p.lote.gtin, cuando) ?? `ese lote no está en ${p.sitio}`)
  const s = semaforoDe(estado, fila.sku, p.lote.caducidad, hoy)
  const bloqueo = bloqueoDeSalida(p, s.estado)
  if (bloqueo) return falla(estado, bloqueo)
  const despues = quita(estado, p.sitio, p.lote, p.cajas, ORDEN_SALIDA[p.tipo], cuando)
  if (typeof despues === 'string') return falla(estado, despues)
  const datos = { cajas: p.cajas, semaforo: s.estado, ...(p.canal ? { canal: p.canal } : {}), ...(p.autoriza ? { autoriza: p.autoriza } : {}), ...(p.motivo ? { motivo: p.motivo } : {}) }
  const r = conEvento(estado, despues, p.sitio, p.tipo, p.lote, datos, operador, cuando)
  return { estado: r.estado, resultado: { ok: true, valor: { cajas: p.cajas }, eventos: [r.evento] } }
}

export interface PedidoTransferencia {
  readonly origen: string
  readonly destino: string
  readonly lote: ClaveLote
  readonly cajas: number
  /** La recomendacion del agente que la origino, si la hubo. */
  readonly recomendacion?: string
}

/**
 * Transferencia entre sitios: TRANSFERIDO en la cadena de origen y RECIBIDO en la de destino,
 * que apunta por hash al de origen. Asi las dos cadenas quedan enlazadas y ninguna de las dos
 * puede negar la otra mitad.
 */
export function transfiere(estado: EstadoAlmacen, p: PedidoTransferencia, hoy: string, cuando: string, id: string, operador: string): Paso<{ salida: Evento; entrada: Evento }> {
  if (p.origen === p.destino) return falla(estado, 'origen y destino son el mismo sitio')
  if (!estado.configuracion.sitios.some((s) => s.clave === p.destino)) return falla(estado, `el sitio ${p.destino} no existe`)
  const fila = estado.existencias.find((e) => esDe(e, p.origen, p.lote))
  if (!fila) return falla(estado, bloqueoPorRevision(estado, p.origen, p.lote.gtin, cuando) ?? `ese lote no está en ${p.origen}`)
  const s = semaforoDe(estado, fila.sku, p.lote.caducidad, hoy)
  if (!vendible(s.estado)) return falla(estado, 'un lote bloqueado o vencido no se transfiere para venta')
  const despues = quita(estado, p.origen, p.lote, p.cajas, ['almacen', 'recibo', 'piso'], cuando)
  if (typeof despues === 'string') return falla(estado, despues)
  const sale = conEvento(estado, despues, p.origen, 'TRANSFERIDO', p.lote, { cajas: p.cajas, destino: p.destino, ...(p.recomendacion ? { recomendacion: p.recomendacion } : {}) }, operador, cuando)
  const entra = altaConExpediente(sale.estado, { sitio: p.destino, sku: fila.sku, ...p.lote, cantidad: p.cajas, zona: 'recibo' }, 'recepcion', cuando, id, operador, { desde: p.origen }, sale.evento.hash)
  if (!entra.resultado.ok) return falla(estado, entra.resultado.motivo)
  return { estado: entra.estado, resultado: { ok: true, valor: { salida: sale.evento, entrada: entra.resultado.eventos[0]! }, eventos: [sale.evento, ...entra.resultado.eventos] } }
}

export interface PedidoCorreccion {
  readonly sitio: string
  /** Hash del evento que se corrige. */
  readonly corrige: string
  readonly motivo: string
  /** Ajuste de cajas en una zona (positivo o negativo). */
  readonly ajuste?: { readonly zona: Zona; readonly cajas: number }
  /** Caducidad correcta, si la capturada estaba mal. */
  readonly caducidad?: string
  /** La foto que prueba la correccion (huellas; las fotos viven fuera de la cadena). */
  readonly evidencia?: { readonly fotos: { readonly completa: string; readonly recortes: readonly string[] }; readonly texto?: string }
}

/**
 * CORRECCION: la unica forma de arreglar un error. El evento original se queda como estaba; la
 * correccion lo referencia por hash y deja su propia huella. Cambiar la caducidad re-etiqueta el
 * lote: sus eventos siguientes enlazan con esta correccion.
 */
export function corrige(estado: EstadoAlmacen, p: PedidoCorreccion, cuando: string, id: string, operador: string): Paso<Evento> {
  const original = cadenaDe(estado, p.sitio).find((e) => e.hash === p.corrige)
  if (!original) return falla(estado, 'no hay en la cadena de ese sitio un evento con ese hash')
  if (!p.motivo.trim()) return falla(estado, 'una corrección lleva su motivo')
  if (!p.ajuste && !p.caducidad) return falla(estado, 'la corrección no cambia nada')
  const l = original.lote
  let existencias = estado.existencias
  if (p.ajuste) {
    const { zona, cajas } = p.ajuste
    const fila = existencias.find((e) => esDe(e, p.sitio, l) && zonaDe(e) === zona && !e.sscc)
    const nueva = (fila?.cantidad ?? 0) + cajas
    if (!Number.isInteger(cajas) || cajas === 0 || nueva < 0) return falla(estado, 'el ajuste deja una cantidad imposible')
    const sku = fila?.sku ?? existencias.find((e) => esDe(e, p.sitio, l))?.sku ?? String(original.datos['sku'] ?? '')
    existencias = fila
      ? existencias.map((e) => (e === fila ? { ...e, cantidad: nueva, actualizado: cuando } : e)).filter((e) => e.cantidad > 0)
      : [...existencias, { id, sitio: p.sitio, sku, ...l, cantidad: nueva, origen: 'recepcion' as const, actualizado: cuando, zona }]
  }
  const cambios: Cambio[] = cambiosDe(estado.existencias, existencias, p.sitio, l)
  if (p.caducidad) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.caducidad) || p.caducidad === l.caducidad) return falla(estado, 'la caducidad nueva no es válida')
    const antes = existencias
    existencias = existencias.map((e) => (esDe(e, p.sitio, l) ? { ...e, caducidad: p.caducidad!, actualizado: cuando } : e))
    cambios.push(...cambiosDe(antes, existencias, p.sitio, l), ...cambiosDe(antes, existencias, p.sitio, { ...l, caducidad: p.caducidad }).map((c) => ({ ...c, caducidad: p.caducidad! })))
  }
  if (p.evidencia && ![p.evidencia.fotos.completa, ...p.evidencia.fotos.recortes].every((h) => /^sha256:[0-9a-f]{64}$/.test(h))) return falla(estado, 'la foto de la corrección no tiene una huella SHA-256 válida')
  const evidencia: Record<string, Json> = p.evidencia ? { evidencia: json({ fotos: { completa: p.evidencia.fotos.completa, recortes: [...p.evidencia.fotos.recortes] }, ...(p.evidencia.texto ? { texto: p.evidencia.texto } : {}) }) } : {}
  const datos = { corrige: p.corrige, seqCorregido: original.seq, motivo: p.motivo, ...(p.ajuste ? { ajuste: json(p.ajuste) } : {}), ...(p.caducidad ? { caducidadAnterior: l.caducidad, caducidadNueva: p.caducidad } : {}), ...evidencia, cambios: json(cambios) }
  const r = registra({ ...estado, existencias }, p.sitio, { tipo: 'CORRECCION', lote: l, datos, operador, fecha: cuando })
  return { estado: r.estado, resultado: { ok: true, valor: r.evento, eventos: [r.evento] } }
}

/**
 * Apertura: un almacen que ya tenia existencias antes del expediente abre la cadena de cada sitio
 * con un RECIBIDO por existencia (`apertura: true`). Lo anterior a la apertura no tiene prueba, y
 * se dice asi en el expediente.
 */
export function apertura(estado: EstadoAlmacen, cuando: string, operador: string): EstadoAlmacen {
  let e = estado
  for (const s of estado.configuracion.sitios) {
    if (cadenaDe(e, s.clave).length > 0) continue
    for (const x of estado.existencias.filter((y) => y.sitio === s.clave && y.cantidad > 0)) {
      const cambios = [{ zona: zonaDe(x), cajas: x.cantidad, ...(x.sscc ? { sscc: x.sscc } : {}) }]
      e = registra(e, s.clave, { tipo: 'RECIBIDO', lote: claveDe(x), operador, fecha: cuando, datos: { cajas: x.cantidad, zona: zonaDe(x), sku: x.sku, origen: x.origen, apertura: true, cambios: json(cambios), ...(x.sscc ? { sscc: x.sscc } : {}) } }).estado
      if (x.posicion) e = registra(e, s.clave, { tipo: 'UBICADO', lote: claveDe(x), operador, fecha: cuando, datos: { posicion: x.posicion, cajas: x.cantidad, apertura: true, filas: json([{ zona: zonaDe(x), ...(x.sscc ? { sscc: x.sscc } : {}) }]) } }).estado
    }
  }
  return e
}
