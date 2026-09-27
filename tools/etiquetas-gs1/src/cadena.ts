/**
 * La cadena de eventos de un sitio: solo se agrega, cada evento lleva numero de secuencia y el hash
 * del anterior, y su propio hash es SHA-256 sobre el REGISTRO COMPLETO canonicalizado (RFC 8785):
 * sitio, secuencia, fecha, tipo, lote, datos, operador y los dos enlaces. Hashear solo
 * `datos + anterior` dejaria cambiar el operador o la fecha sin romper nada.
 *
 * Es tamper-EVIDENT, no tamper-proof: quien puede escribir el almacen puede recalcular la cadena
 * entera. Eso lo delata el anclaje (`anclaje.ts`). La cadena no guarda datos personales: el
 * operador es un seudonimo; el mapeo a la persona vive aparte y se puede borrar.
 *
 * Una cadena POR SITIO (no por lote): si fuera por lote, borrar un lote entero no dejaria rastro.
 * El expediente de un lote es una vista: el indice de sus eventos en todas las cadenas, con
 * `anteriorLote` enlazando cada evento con el anterior del mismo lote (y, en una transferencia,
 * con el evento TRANSFERIDO del sitio de origen).
 */
import { canonico, type Json } from './jcs.js'
import { comoHash, sha256, utf8 } from './sha256.js'

export type TipoEvento =
  | 'RECIBIDO' | 'RECHAZADO' | 'UBICADO' | 'MOVIDO' | 'TRANSFERIDO'
  | 'VENDIDO' | 'DEVUELTO' | 'DONADO' | 'MERMA'
  | 'RECOMENDACION' | 'RECOMENDACION_EJECUTADA' | 'RECOMENDACION_DESCARTADA' | 'CORRECCION' | 'CONTEO'
  /** Llego mercancia cuya caducidad se leyo de una foto y aun no se confirma: no mueve existencias. */
  | 'EN_REVISION'

export interface ClaveLote {
  readonly gtin: string
  readonly lote: string
  /** ISO `AAAA-MM-DD`. */
  readonly caducidad: string
}

export interface Evento {
  readonly v: 1
  readonly sitio: string
  readonly seq: number
  /** ISO con hora, UTC. */
  readonly fecha: string
  readonly tipo: TipoEvento
  readonly lote: ClaveLote
  readonly datos: { readonly [k: string]: Json }
  /** Seudonimo (`op-...`), nunca un nombre. */
  readonly operador: string
  /** Hash del evento anterior del sitio (el genesis del sitio en el primero). */
  readonly anterior: string
  /** Hash del evento anterior del mismo lote: en este sitio, o el TRANSFERIDO de origen. */
  readonly anteriorLote: string | null
  readonly hash: string
}

export type Borrador = Pick<Evento, 'tipo' | 'lote' | 'datos' | 'operador' | 'fecha'>

export const idLote = (l: ClaveLote): string => `${l.gtin}|${l.lote}|${l.caducidad}`
const mismoLote = (a: ClaveLote, b: ClaveLote) => idLote(a) === idLote(b)

export const hashDe = (valor: unknown): string => comoHash(sha256(utf8(canonico(valor))))

export function genesis(sitio: string): string {
  return hashDe({ genesis: sitio, v: 1 })
}

export function hashDeEvento(e: Omit<Evento, 'hash'>): string {
  const { v, sitio, seq, fecha, tipo, lote, datos, operador, anterior, anteriorLote } = e
  return hashDe({ v, sitio, seq, fecha, tipo, lote, datos, operador, anterior, anteriorLote })
}

/** El evento que sigue en la cadena del sitio. `enlaceExterno`: el TRANSFERIDO de origen. */
export function nuevoEvento(sitio: string, cadena: readonly Evento[], b: Borrador, enlaceExterno?: string): Evento {
  const ultimo = cadena.at(-1)
  const previoLote = [...cadena].reverse().find((e) => mismoLote(e.lote, b.lote))
  const base = {
    v: 1 as const, sitio, seq: (ultimo?.seq ?? 0) + 1, fecha: b.fecha, tipo: b.tipo, lote: b.lote, datos: b.datos, operador: b.operador,
    anterior: ultimo?.hash ?? genesis(sitio), anteriorLote: enlaceExterno ?? previoLote?.hash ?? null,
  }
  return { ...base, hash: hashDeEvento(base) }
}

export type MotivoRotura = 'hash' | 'enlace' | 'secuencia' | 'sitio' | 'enlace-lote'

export interface Rotura {
  readonly seq: number
  readonly motivo: MotivoRotura
  readonly detalle: string
}

export type VerificacionCadena = { readonly ok: true; readonly n: number; readonly cabeza: string } | { readonly ok: false; readonly n: number; readonly rotura: Rotura }

/**
 * Recalcula cada hash y cada enlace. Se detiene en el PRIMER evento que no cuadra: desde ahi la
 * cadena ya no prueba nada. Los enlaces a otro sitio (transferencias) se comprueban aparte.
 */
export function verificaCadena(sitio: string, eventos: readonly Evento[]): VerificacionCadena {
  let anterior = genesis(sitio)
  const ultimoDeLote = new Map<string, string>()
  const propios = new Set<string>()
  // Una CORRECCION de caducidad re-etiqueta el lote: el primer evento con la clave nueva la enlaza.
  const porCorreccion = new Map<string, string>()
  for (let i = 0; i < eventos.length; i++) {
    const e = eventos[i]!
    const falla = (motivo: MotivoRotura, detalle: string): VerificacionCadena => ({ ok: false, n: eventos.length, rotura: { seq: e.seq, motivo, detalle } })
    if (e.sitio !== sitio) return falla('sitio', `el evento dice ser de ${e.sitio}`)
    if (e.seq !== i + 1) return falla('secuencia', `se esperaba la secuencia ${i + 1}: falta o sobra un evento`)
    const { hash, ...resto } = e
    if (hashDeEvento(resto) !== hash) return falla('hash', 'el contenido no corresponde a su hash: se modificó después de registrarse')
    if (e.anterior !== anterior) return falla('enlace', 'no apunta al evento anterior de la cadena')
    const previo = ultimoDeLote.get(idLote(e.lote)) ?? null
    const valido = previo !== null ? e.anteriorLote === previo
      : e.anteriorLote === null || !propios.has(e.anteriorLote) || e.anteriorLote === porCorreccion.get(idLote(e.lote))
    if (!valido) return falla('enlace-lote', 'no apunta al evento anterior del mismo lote')
    ultimoDeLote.set(idLote(e.lote), hash)
    const nueva = e.tipo === 'CORRECCION' ? e.datos['caducidadNueva'] : undefined
    if (typeof nueva === 'string') porCorreccion.set(idLote({ ...e.lote, caducidad: nueva }), hash)
    propios.add(hash)
    anterior = hash
  }
  return { ok: true, n: eventos.length, cabeza: anterior }
}

/**
 * Enlaces entre sitios: un RECIBIDO por transferencia apunta al TRANSFERIDO de origen. Se exige que
 * exista, que sea del mismo lote, hacia este sitio y por las mismas cajas.
 */
export function verificaTransferencias(cadenas: Readonly<Record<string, readonly Evento[]>>): { sitio: string; seq: number; detalle: string }[] {
  const porHash = new Map<string, Evento>()
  for (const evs of Object.values(cadenas)) for (const e of evs) porHash.set(e.hash, e)
  const fallos: { sitio: string; seq: number; detalle: string }[] = []
  for (const [sitio, evs] of Object.entries(cadenas)) {
    const propios = new Set(evs.map((e) => e.hash))
    const vistos = new Set<string>()
    for (const e of evs) {
      const primeroDelLote = !vistos.has(idLote(e.lote))
      vistos.add(idLote(e.lote))
      if (!primeroDelLote || e.anteriorLote === null || propios.has(e.anteriorLote)) continue
      const origen = porHash.get(e.anteriorLote)
      if (!origen) fallos.push({ sitio, seq: e.seq, detalle: 'apunta a un evento de origen que no existe en ninguna cadena' })
      else if (origen.tipo !== 'TRANSFERIDO' || !mismoLote(origen.lote, e.lote) || origen.datos['destino'] !== sitio || origen.datos['cajas'] !== e.datos['cajas']) {
        fallos.push({ sitio, seq: e.seq, detalle: `no coincide con la transferencia de ${origen.sitio} #${origen.seq}` })
      }
    }
  }
  return fallos
}

/**
 * Todos los eventos de un lote en todos los sitios, en orden de tiempo. Sigue las correcciones de
 * caducidad en los dos sentidos: el expediente del lote mal capturado y el del bien capturado son
 * el mismo.
 */
export function expedienteDe(cadenas: Readonly<Record<string, readonly Evento[]>>, lote: ClaveLote): Evento[] {
  const todos = Object.values(cadenas).flat()
  const claves = new Set([idLote(lote)])
  for (let crecio = true; crecio;) {
    crecio = false
    for (const e of todos) {
      const nueva = e.tipo === 'CORRECCION' ? e.datos['caducidadNueva'] : undefined
      if (typeof nueva !== 'string') continue
      const a = idLote(e.lote)
      const b = idLote({ ...e.lote, caducidad: nueva })
      if (claves.has(a) !== claves.has(b)) { claves.add(a); claves.add(b); crecio = true }
    }
  }
  // La revision de la foto (EN_REVISION) es de otra clave (el folio): entra por su enlace.
  const propios = todos.filter((e) => claves.has(idLote(e.lote)))
  const revisiones = new Set(propios.map((e) => e.datos['revision']).filter((h): h is string => typeof h === 'string'))
  return [...propios, ...todos.filter((e) => revisiones.has(e.hash))]
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.sitio.localeCompare(b.sitio) || a.seq - b.seq)
}

/** Estado del expediente: abierto o cerrado, y por que evento. */
export function cierreDe(eventos: readonly Evento[], cajasEnExistencia: number): { cerrado: boolean; por?: TipoEvento } {
  const ultimo = eventos.at(-1)
  if (ultimo?.tipo === 'RECHAZADO') return { cerrado: true, por: 'RECHAZADO' }
  if (eventos.length > 0 && cajasEnExistencia === 0) {
    const salida = [...eventos].reverse().find((e) => ['VENDIDO', 'DEVUELTO', 'DONADO', 'MERMA', 'TRANSFERIDO', 'CONTEO'].includes(e.tipo))
    return salida ? { cerrado: true, por: salida.tipo } : { cerrado: false }
  }
  return { cerrado: false }
}
