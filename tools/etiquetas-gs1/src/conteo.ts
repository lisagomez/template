/**
 * Inventario fisico: conteo CIEGO por ubicacion, conciliado contra la CADENA (no contra el estado
 * guardado), con reconteo por otra persona, autorizacion y un evento CONTEO por lote.
 *
 * - Antes de abrir se exige la integridad del sitio: si el estado ya no es la proyeccion de la
 *   cadena, contar serviria para «legalizar» una manipulacion. Se abre incidente, no conteo.
 * - Punto de corte: al abrir se guarda la cabeza de la cadena. Cada lectura guarda la cabeza del
 *   momento en que se leyo, y lo esperado de esa ubicacion es la proyeccion HASTA ahi: lo que se
 *   mueva o venda despues se suma encima y no aparece como faltante. No hay que parar la tienda.
 * - Ciego: quien cuenta solo ve lo que leyo; lo esperado aparece hasta que se cierran las rondas.
 * - Tolerancia en cajas: dentro, se ajusta; fuera, reconteo por OTRA persona; si persiste,
 *   autoriza alguien que no conto.
 * - El ajuste es un evento CONTEO por lote (tambien cuando cuadra: el acta queda anclada), con
 *   la huella de cajas; lo que no aparece se ajusta a cero y su expediente se cierra por conteo.
 */
import { hashDe, idLote, type ClaveLote, type Evento } from './cadena.js'
import type { Json } from './jcs.js'
import type { Interpretacion } from './existencias.js'
import { cadenaDe, cambiosDe, claveDe, registra, ubica, type Paso } from './expediente.js'
import type { EstadoAlmacen, Existencia, Zona } from './modelo.js'
import { proyecta } from './proyeccion.js'
import { ubicacionDe, zonaDe } from './ubicaciones.js'

export type Ronda = 1 | 2
export type EstadoConteo = 'contando' | 'reconteo' | 'por-aplicar' | 'aplicado' | 'cancelado'

export interface LecturaConteo {
  readonly ronda: Ronda
  readonly zona: Zona
  readonly posicion?: string
  readonly sku: string
  readonly lote: ClaveLote
  readonly sscc?: string
  readonly cajas: number
  readonly operador: string
  readonly fecha: string
  /** Cabeza de la cadena del sitio al leer: lo que se movio despues se suma encima. */
  readonly seq: number
  /** Tarima leida solo por su SSCC: entra completa con la cantidad REGISTRADA (al contador no se le dice). */
  readonly porRegistro?: true
}

export interface Conteo {
  readonly folio: string
  readonly sitio: string
  readonly zonas: readonly Zona[]
  /** Diferencia en cajas que se ajusta sin reconteo. */
  readonly tolerancia: number
  readonly abierto: string
  readonly abre: string
  readonly corte: { readonly seq: number; readonly cabeza: string }
  readonly ronda: Ronda
  readonly estado: EstadoConteo
  readonly lecturas: readonly LecturaConteo[]
  /** Claves que piden reconteo tras la ronda 1 (sin cantidades: el reconteo tambien es ciego). */
  readonly recontar: readonly string[]
  /** Cabeza de la cadena al cerrar cada ronda: lo esperado de lo que nadie leyo. */
  readonly cierres: Readonly<Partial<Record<Ronda, number>>>
  /** `renglones`: la conciliacion tal como se aplico y se sello en el acta (despues, la cadena ya incluye el ajuste). */
  readonly aplicado?: { readonly fecha: string; readonly autoriza?: string; readonly acta: string; readonly eventos: number; readonly renglones: readonly RenglonConteo[] }
  readonly cancelado?: { readonly fecha: string; readonly motivo: string; readonly operador: string }
  /**
   * Conteo CICLICO: solo estas ubicaciones (`ALMACEN-B-04-2`, `PISO`), no las zonas enteras. Las
   * elige el riesgo (`conteo-ciclico.ts`) y las cuenta el almacenista dentro de su ronda.
   */
  readonly ubicaciones?: readonly string[]
}

export type Clase = 'cuadra' | 'faltante' | 'sobrante' | 'desconocido'

export interface RenglonConteo {
  readonly clave: string
  readonly lote: ClaveLote
  readonly sku: string
  readonly zona: Zona
  readonly sscc?: string
  readonly posicion?: string
  readonly esperado: number
  readonly contado: number
  readonly ronda: Ronda
  readonly diferencia: number
  readonly clase: Clase
  readonly dentroTolerancia: boolean
}

const falla = <T>(estado: EstadoAlmacen, motivo: string): Paso<T> => ({ estado, resultado: { ok: false, motivo } })
export const claveConteo = (l: ClaveLote, zona: Zona, sscc?: string): string => `${idLote(l)}|${zona}|${sscc ?? ''}`
const cabeza = (estado: EstadoAlmacen, sitio: string) => cadenaDe(estado, sitio).at(-1)
const cambia = (estado: EstadoAlmacen, c: Conteo): EstadoAlmacen => ({ ...estado, version: estado.version + 1, conteos: (estado.conteos ?? []).map((x) => (x.folio === c.folio ? c : x)) })
export const conteoDe = (estado: EstadoAlmacen, folio: string): Conteo | undefined => estado.conteos?.find((c) => c.folio === folio)

export interface PedidoConteo { readonly sitio: string; readonly zonas: readonly Zona[]; readonly tolerancia: number; readonly ubicaciones?: readonly string[] }

/** ¿La ubicacion (zona y rack) entra en el conteo? Sin lista de ubicaciones, toda la zona entra. */
export const cubreUbicacion = (c: Pick<Conteo, 'zonas' | 'ubicaciones'>, zona: Zona, posicion?: string): boolean =>
  c.zonas.includes(zona) && (!c.ubicaciones || c.ubicaciones.includes(ubicacionDe(zona, posicion)) || c.ubicaciones.includes(ubicacionDe(zona)))

/** Abre el conteo si la cadena del sitio se sostiene. Guarda el punto de corte. */
export function abreConteo(estado: EstadoAlmacen, p: PedidoConteo, folio: string, cuando: string, operador: string, integridad: { ok: boolean; motivo?: string }): Paso<Conteo> {
  if (!integridad.ok) return falla(estado, `no se abre el conteo: la cadena de ${p.sitio} no se sostiene (${integridad.motivo ?? 'sin detalle'}); primero el incidente`)
  if (!estado.configuracion.sitios.some((s) => s.clave === p.sitio)) return falla(estado, `el sitio ${p.sitio} no existe`)
  if (p.zonas.length === 0) return falla(estado, 'el conteo necesita al menos una zona')
  if (!Number.isInteger(p.tolerancia) || p.tolerancia < 0) return falla(estado, 'la tolerancia va en cajas enteras')
  if (p.ubicaciones && p.ubicaciones.length === 0) return falla(estado, 'el conteo cíclico necesita al menos una ubicación')
  const toca = (c: Conteo) => (p.ubicaciones && c.ubicaciones ? c.ubicaciones.some((u) => p.ubicaciones!.includes(u)) : c.zonas.some((z) => p.zonas.includes(z)))
  const abierto = (estado.conteos ?? []).find((c) => c.sitio === p.sitio && (c.estado === 'contando' || c.estado === 'reconteo' || c.estado === 'por-aplicar') && toca(c))
  if (abierto) return falla(estado, `ya hay un conteo abierto en esas zonas (${abierto.folio})`)
  const u = cabeza(estado, p.sitio)
  const c: Conteo = {
    folio, sitio: p.sitio, zonas: [...p.zonas], tolerancia: p.tolerancia, abierto: cuando, abre: operador, corte: { seq: u?.seq ?? 0, cabeza: u?.hash ?? '' },
    ronda: 1, estado: 'contando', lecturas: [], recontar: [], cierres: {}, ...(p.ubicaciones ? { ubicaciones: [...p.ubicaciones] } : {}),
  }
  return { estado: { ...estado, version: estado.version + 1, conteos: [...(estado.conteos ?? []), c] }, resultado: { ok: true, valor: c, eventos: [] } }
}

export interface PedidoLectura { readonly zona: Zona; readonly posicion?: string; readonly lectura: Interpretacion; readonly veces: number }

/** Una lectura del conteo. Responde SOLO lo leido: nada de lo que dice el sistema. */
export function leeEnConteo(estado: EstadoAlmacen, folio: string, p: PedidoLectura, cuando: string, operador: string): Paso<LecturaConteo> {
  const c = conteoDe(estado, folio)
  if (!c || (c.estado !== 'contando' && c.estado !== 'reconteo')) return falla(estado, 'ese conteo no está abierto para leer')
  if (!c.zonas.includes(p.zona)) return falla(estado, `la zona ${p.zona} no está en este conteo`)
  if (!cubreUbicacion(c, p.zona, p.posicion)) return falla(estado, `la ubicación ${ubicacionDe(p.zona, p.posicion)} no es de este conteo cíclico (cuenta: ${c.ubicaciones!.join(', ')})`)
  if (c.ronda === 2 && c.lecturas.some((x) => x.ronda === 1 && x.operador === operador)) return falla(estado, 'el reconteo lo hace otra persona, no quien contó la primera vez')
  const l = p.lectura
  let lote: ClaveLote
  let sku: string
  let cajas: number
  let sscc: string | undefined
  let porRegistro = false
  if (l.sscc && !l.gtin) {
    const t = estado.existencias.find((e) => e.sitio === c.sitio && e.sscc === l.sscc)
    if (!t) return falla(estado, `la tarima ${l.sscc} no es de este sitio: lee también su código de contenido`)
    sku = t.sku; lote = claveDe(t); cajas = t.cantidad; sscc = t.sscc; porRegistro = true
  } else {
    if (!l.gtin || !l.lote || !l.caducidadIso || !l.articulo) return falla(estado, 'la lectura no trae GTIN, lote y caducidad de un artículo del catálogo')
    lote = { gtin: l.gtin, lote: l.lote, caducidad: l.caducidadIso }; sku = l.articulo.sku; cajas = l.cajas * Math.max(1, p.veces); sscc = l.sscc
  }
  const x: LecturaConteo = { ronda: c.ronda, zona: p.zona, ...(p.posicion ? { posicion: p.posicion } : {}), sku, lote, ...(sscc ? { sscc } : {}), cajas, operador, fecha: cuando, seq: cabeza(estado, c.sitio)?.seq ?? 0, ...(porRegistro ? { porRegistro: true as const } : {}) }
  return { estado: cambia(estado, { ...c, lecturas: [...c.lecturas, x] }), resultado: { ok: true, valor: x, eventos: [] } }
}

/** Lo esperado por clave con la cadena hasta `hastaSeq`. */
function esperadoHasta(estado: EstadoAlmacen, sitio: string, hastaSeq: number) {
  const m = new Map<string, { cajas: number; posicion?: string; lote: ClaveLote; zona: Zona; sscc?: string }>()
  for (const r of proyecta(sitio, cadenaDe(estado, sitio).filter((e) => e.seq <= hastaSeq)).renglones) {
    const lote = { gtin: r.gtin, lote: r.lote, caducidad: r.caducidad }
    m.set(claveConteo(lote, r.zona, r.sscc), { cajas: r.cajas, lote, zona: r.zona, ...(r.sscc ? { sscc: r.sscc } : {}), ...(r.posicion ? { posicion: r.posicion } : {}) })
  }
  return m
}

/**
 * Conciliacion: por cada lote, zona y tarima, lo contado contra lo que dice la CADENA en el
 * momento de su ultima lectura (o del cierre de la ronda, si nadie lo leyo).
 */
export function concilia(estado: EstadoAlmacen, c: Conteo, ronda: Ronda = c.ronda): RenglonConteo[] {
  const actual = cabeza(estado, c.sitio)?.seq ?? 0
  const cierre = c.cierres[ronda] ?? actual
  const universo = [...esperadoHasta(estado, c.sitio, actual).entries()].filter(([, v]) => cubreUbicacion(c, v.zona, v.posicion) && v.cajas > 0).map(([k]) => k)
  const leidas = c.lecturas.filter((x) => x.ronda === 1 || (ronda === 2 && x.ronda === 2))
  const claves = [...new Set([...universo, ...leidas.map((x) => claveConteo(x.lote, x.zona, x.sscc))])].sort()
  const conocidos = new Set(cadenaDe(estado, c.sitio).map((e) => idLote(e.lote)))
  const memo = new Map<number, ReturnType<typeof esperadoHasta>>()
  const al = (seq: number) => { if (!memo.has(seq)) memo.set(seq, esperadoHasta(estado, c.sitio, seq)); return memo.get(seq)! }
  return claves.map((clave) => {
    const decide: Ronda = ronda === 2 && c.recontar.includes(clave) ? 2 : 1
    const suyas = c.lecturas.filter((x) => x.ronda === decide && claveConteo(x.lote, x.zona, x.sscc) === clave)
    const hasta = suyas.length ? Math.max(...suyas.map((x) => x.seq)) : (decide === 2 ? c.cierres[2] ?? cierre : c.cierres[1] ?? cierre)
    const e = al(hasta).get(clave)
    const base = e ?? { lote: suyas[0]!.lote, zona: suyas[0]!.zona, ...(suyas[0]!.sscc ? { sscc: suyas[0]!.sscc } : {}) }
    const esperado = e?.cajas ?? 0
    const contado = suyas.reduce((s, x) => s + x.cajas, 0)
    const diferencia = contado - esperado
    const posiciones = [...new Set(suyas.map((x) => x.posicion).filter((x): x is string => Boolean(x)))]
    const posicion = posiciones.length === 1 ? posiciones[0] : e?.posicion
    const sku = suyas[0]?.sku ?? estado.existencias.find((x) => x.sitio === c.sitio && idLote(claveDe(x)) === idLote(base.lote))?.sku ?? ''
    const clase: Clase = diferencia === 0 ? 'cuadra' : !conocidos.has(idLote(base.lote)) ? 'desconocido' : diferencia < 0 ? 'faltante' : 'sobrante'
    return { clave, lote: base.lote, sku, zona: base.zona, ...(base.sscc ? { sscc: base.sscc } : {}), ...(posicion ? { posicion } : {}), esperado, contado, ronda: decide, diferencia, clase, dentroTolerancia: Math.abs(diferencia) <= c.tolerancia }
  })
}

/** Cierra la ronda. Tras la 1, lo que sale de la tolerancia se recuenta (ciego) por otra persona. */
export function cierraRonda(estado: EstadoAlmacen, folio: string): Paso<{ recontar: readonly { lote: ClaveLote; zona: Zona; sscc?: string }[] }> {
  const c = conteoDe(estado, folio)
  if (!c || (c.estado !== 'contando' && c.estado !== 'reconteo')) return falla(estado, 'ese conteo no está abierto')
  const seq = cabeza(estado, c.sitio)?.seq ?? 0
  const cerrado = { ...c, cierres: { ...c.cierres, [c.ronda]: seq } }
  if (c.ronda === 2) return { estado: cambia(estado, { ...cerrado, estado: 'por-aplicar' }), resultado: { ok: true, valor: { recontar: [] }, eventos: [] } }
  const fuera = concilia(estado, cerrado, 1).filter((r) => !r.dentroTolerancia)
  const siguiente: Conteo = fuera.length ? { ...cerrado, ronda: 2, estado: 'reconteo', recontar: fuera.map((r) => r.clave) } : { ...cerrado, estado: 'por-aplicar' }
  return { estado: cambia(estado, siguiente), resultado: { ok: true, valor: { recontar: fuera.map((r) => ({ lote: r.lote, zona: r.zona, ...(r.sscc ? { sscc: r.sscc } : {}) })) }, eventos: [] } }
}

export function cancelaConteo(estado: EstadoAlmacen, folio: string, motivo: string, cuando: string, operador: string): Paso<Conteo> {
  const c = conteoDe(estado, folio)
  if (!c || c.estado === 'aplicado' || c.estado === 'cancelado') return falla(estado, 'ese conteo ya no se puede cancelar')
  if (motivo.trim().length < 3) return falla(estado, 'cancelar un conteo lleva su motivo')
  const x: Conteo = { ...c, estado: 'cancelado', cancelado: { fecha: cuando, motivo, operador } }
  return { estado: cambia(estado, x), resultado: { ok: true, valor: x, eventos: [] } }
}

/** Aplica la diferencia a una fila (lote, zona, tarima) del estado. */
function ajusta(existencias: readonly Existencia[], sitio: string, r: RenglonConteo, cuando: string, id: string): Existencia[] | string {
  const fila = existencias.find((e) => e.sitio === sitio && idLote(claveDe(e)) === idLote(r.lote) && zonaDe(e) === r.zona && (e.sscc ?? '') === (r.sscc ?? ''))
  const nueva = (fila?.cantidad ?? 0) + r.diferencia
  if (nueva < 0) return `el lote ${r.lote.lote} en ${r.zona} quedaría negativo: se movió después del conteo, hay que recontarlo`
  if (fila) return existencias.map((e) => (e === fila ? { ...e, cantidad: nueva, actualizado: cuando } : e)).filter((e) => e.cantidad > 0)
  return [...existencias, { id, sitio, sku: r.sku, ...r.lote, cantidad: nueva, origen: 'conteo', actualizado: cuando, zona: r.zona, ...(r.sscc ? { sscc: r.sscc } : {}) }]
}

const json = (v: object): Json => v as unknown as Json

/**
 * Aplica el conteo: un CONTEO por lote con su acta (hash de todas las lecturas y la conciliacion)
 * y la huella de cajas; y la posicion donde se encontro, si cambio (UBICADO).
 */
export function aplicaConteo(estado: EstadoAlmacen, folio: string, autoriza: string | undefined, cuando: string, operador: string, integridad: { ok: boolean; motivo?: string }): Paso<{ acta: string; renglones: RenglonConteo[] }> {
  const c = conteoDe(estado, folio)
  if (!c || c.estado !== 'por-aplicar') return falla(estado, 'ese conteo no está listo para aplicar (cierra sus rondas)')
  if (!integridad.ok) return falla(estado, `no se aplica: la cadena de ${c.sitio} no se sostiene (${integridad.motivo ?? 'sin detalle'})`)
  const renglones = concilia(estado, c)
  const contadores = [...new Set(c.lecturas.map((x) => x.operador))]
  const fuera = renglones.filter((r) => !r.dentroTolerancia)
  if (fuera.length && !autoriza) return falla(estado, `${fuera.length} diferencia(s) fuera de tolerancia tras el reconteo: las autoriza una persona`)
  if (autoriza && contadores.includes(autoriza)) return falla(estado, 'autoriza alguien que no contó')
  const acta = hashDe({ folio, sitio: c.sitio, zonas: c.zonas, tolerancia: c.tolerancia, corte: c.corte, lecturas: c.lecturas, renglones })
  let e = estado
  const eventos: Evento[] = []
  const porLote = new Map<string, RenglonConteo[]>()
  for (const r of renglones) porLote.set(idLote(r.lote), [...(porLote.get(idLote(r.lote)) ?? []), r])
  for (const [, rs] of porLote) {
    let existencias: Existencia[] = [...e.existencias]
    for (const [i, r] of rs.entries()) {
      if (r.diferencia === 0) continue
      const x = ajusta(existencias, c.sitio, r, cuando, `${folio}-${eventos.length}-${i}`)
      if (typeof x === 'string') return falla(estado, x)
      existencias = x
    }
    const lote = rs[0]!.lote
    const detalle = rs.map((r) => ({ zona: r.zona, ...(r.sscc ? { sscc: r.sscc } : {}), ...(r.posicion ? { posicion: r.posicion } : {}), esperado: r.esperado, contado: r.contado, diferencia: r.diferencia, clase: r.clase, ronda: r.ronda }))
    const datos = { folio, acta, corte: c.corte.seq, sku: rs[0]!.sku, renglones: json(detalle), contadores: json(contadores), ...(autoriza ? { autoriza } : {}), cambios: json(cambiosDe(e.existencias, existencias, c.sitio, lote)) }
    const reg = registra({ ...e, existencias }, c.sitio, { tipo: 'CONTEO', lote, datos, operador, fecha: cuando })
    e = reg.estado
    eventos.push(reg.evento)
    for (const r of rs.filter((y) => y.zona === 'almacen' && y.posicion && y.contado > 0)) {
      const actual = e.existencias.find((y) => y.sitio === c.sitio && idLote(claveDe(y)) === idLote(r.lote) && zonaDe(y) === 'almacen' && (y.sscc ?? '') === (r.sscc ?? ''))
      if (!actual || actual.posicion === r.posicion) continue
      const u = ubica(e, c.sitio, r.lote, r.posicion!, cuando, operador, r.sscc)
      if (u.resultado.ok) { e = u.estado; eventos.push(...u.resultado.eventos) }
    }
  }
  const hecho: Conteo = { ...c, estado: 'aplicado', aplicado: { fecha: cuando, ...(autoriza ? { autoriza } : {}), acta, eventos: eventos.length, renglones } }
  return { estado: cambia(e, hecho), resultado: { ok: true, valor: { acta, renglones }, eventos } }
}

/** Faltantes que se repiten en la misma ubicacion en conteos distintos: patron, no ajuste. */
export function faltantesRepetidos(estado: EstadoAlmacen, sitio: string): { ubicacion: string; folios: string[]; cajas: number }[] {
  const m = new Map<string, { folios: Set<string>; cajas: number }>()
  for (const ev of cadenaDe(estado, sitio).filter((x) => x.tipo === 'CONTEO')) {
    const rs = ev.datos['renglones']
    if (!Array.isArray(rs)) continue
    for (const r of rs) {
      const o = r as Readonly<Record<string, unknown>>
      if (typeof o['diferencia'] !== 'number' || o['diferencia'] >= 0) continue
      const k = `${String(o['zona'])}${o['posicion'] ? ` ${String(o['posicion'])}` : ''}`
      const g = m.get(k) ?? { folios: new Set<string>(), cajas: 0 }
      g.folios.add(String(ev.datos['folio']))
      g.cajas -= o['diferencia']
      m.set(k, g)
    }
  }
  return [...m.entries()].filter(([, g]) => g.folios.size >= 2).map(([ubicacion, g]) => ({ ubicacion, folios: [...g.folios], cajas: g.cajas }))
}

/**
 * Lo que ve de un conteo quien cuenta a CIEGAS (dispositivo de conteo o almacenista): nada de lo
 * esperado, ni la conciliacion, ni lo que mide una tarima leida por su SSCC, y solo SUS lecturas
 * de la ronda en curso (el reconteo de otra persona, casi la cifra del sistema, tampoco).
 */
export function vistaConteoSinCantidades(c: Conteo, operador?: string) {
  const { lecturas, recontar, aplicado, ...resto } = c
  const contando = c.estado === 'contando' || c.estado === 'reconteo'
  const propias = contando ? lecturas.filter((x) => x.ronda === c.ronda && (!operador || x.operador === operador)).map((x) => (x.porRegistro ? { ...x, cajas: 0 } : x)) : []
  const recontarLegible = recontar.map((k) => { const [gtin = '', lote = '', caducidad = '', zona = '', sscc = ''] = k.split('|'); return { gtin, lote, caducidad, zona, ...(sscc ? { sscc } : {}) } })
  return { ...resto, recontar: contando ? recontarLegible : [], lecturas: propias, ...(aplicado ? { aplicado: { fecha: aplicado.fecha } } : {}) }
}
