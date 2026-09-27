/**
 * Recepcion con foto de la caducidad: la mercancia llega con el codigo del proveedor (sin lote ni
 * fecha dentro), se fotografia donde viene impresa la fecha, la maquina PROPONE y la persona que
 * registra CONFIRMA o CORRIGE. Solo entonces el lote entra (decision del laboratorio).
 *
 * En la cadena queda asi, y los dos eventos se anclan como cualquier otro:
 * 1. EN_REVISION (clave: el folio, sin caducidad; no mueve existencias): las huellas de las
 *    fotos, lo que leyo el motor y lo que propuso. Se registra ANTES de que decida la persona:
 *    la propuesta no se puede reescribir despues para que parezca que la maquina acerto.
 * 2. RECIBIDO (clave: GTIN de caja, lote y caducidad confirmados) con `revision` = hash del 1,
 *    lo confirmado, si se corrigio (lo calcula esto, no el navegador) y el motor. O RECHAZADO si
 *    la fecha confirmada no cumple la vida minima, o si la revision se descarta.
 * Tomar otra foto abre un EN_REVISION nuevo con `reemplaza` = el anterior.
 */
import { recibeConExpediente, registra, type Paso, type ValorRecepcion } from './expediente.js'
import type { Evento } from './cadena.js'
import { validaCodigo, reglaDeExistente } from './catalogo.js'
import type { Interpretacion } from './existencias.js'
import { aAammdd } from './fechas.js'
import type { FormatoFecha } from './fechas-impresas.js'
import type { Json } from './jcs.js'
import { fueCorregida, type Propuesta } from './lectura-caducidad.js'
import { CSET82 } from './linters.js'
import type { Articulo, EstadoAlmacen, FormatoFechaArticulo, FotoArticulo, Nivel, VistaFoto } from './modelo.js'
import { revisionesAbiertas } from './revisiones.js'
import { categoriaPorId, vidaRestante } from './semaforo.js'

const json = (v: unknown): Json => JSON.parse(JSON.stringify(v)) as Json
const falla = <T>(estado: EstadoAlmacen, motivo: string): Paso<T> => ({ estado, resultado: { ok: false, motivo } })
export const esHuella = (h: string): boolean => /^sha256:[0-9a-f]{64}$/.test(h)
export const esFechaIsoValida = (iso: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(iso) && new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso

export interface FotosDeRevision {
  /** La foto completa, tal cual se tomo (normalizada, sin EXIF): la evidencia. */
  readonly completa: string
  /** Los recortes de la guia de encuadre que leyo el motor (uno por toma). */
  readonly recortes: readonly string[]
}

export interface PedidoRevision {
  readonly sitio: string
  readonly sku: string
  readonly cajas: number
  /** Lo que se escaneo: GTIN-14, nivel y formato del codigo. */
  readonly codigo: { readonly gtin: string; readonly nivel: Nivel; readonly formato?: string }
  readonly fotos: FotosDeRevision
  readonly propuesta: Propuesta
  /** Hash del EN_REVISION que esta toma sustituye («tomar otra foto»). */
  readonly reemplaza?: string
}

/** Lo que de la propuesta entra a la cadena: sin las cajas de pixeles, que viven en la foto. */
function propuestaCompacta(p: Propuesta): Json {
  return json({
    estado: p.estado, fecha: p.fecha, lote: p.lote, opciones: p.opciones, lotesPosibles: p.lotesPosibles.map((l) => l.valor),
    loteDifiere: p.loteDifiere, textoLeido: p.textoLeido, coinciden: p.coinciden, motor: p.motor, ms: p.ms,
  })
}

function revisaPedido(estado: EstadoAlmacen, p: PedidoRevision, operador: string): string | undefined {
  if (!estado.configuracion.sitios.some((s) => s.clave === p.sitio)) return `el sitio ${p.sitio} no existe`
  const art = estado.articulos[p.sku]
  if (!art) return `el artículo ${p.sku} no está en el catálogo`
  if (!art.gtinCaja) return `el artículo ${p.sku} no tiene GTIN de caja: sin él no se etiqueta la caja`
  if (!Number.isInteger(p.cajas) || p.cajas < 1 || p.cajas > 100_000) return 'las cajas van en enteros positivos'
  if (!esHuella(p.fotos.completa) || !p.fotos.recortes.every(esHuella)) return 'falta la foto (o su huella no es SHA-256)'
  if (p.reemplaza) {
    const previa = revisionesAbiertas(estado, p.sitio).find((r) => r.evento.hash === p.reemplaza)
    if (!previa) return 'la toma que se quiere sustituir ya no está abierta'
    if (previa.operador !== operador || previa.sku !== p.sku) return 'solo quien registró la recepción puede tomar otra foto de ella'
  }
  return undefined
}

/** Abre la revision: EN_REVISION con las fotos y la propuesta. No toca existencias. */
export function abreRevision(estado: EstadoAlmacen, p: PedidoRevision, cuando: string, folio: string, operador: string): Paso<{ folio: string; revision: string }> {
  const error = revisaPedido(estado, p, operador)
  if (error) return falla(estado, error)
  if (!CSET82.test(folio) || folio.length > 20) return falla(estado, 'el folio no es un valor de lote GS1')
  const art = estado.articulos[p.sku]!
  const datos = {
    sku: p.sku, cajas: p.cajas, zona: 'recibo', codigo: json(p.codigo), fotos: json(p.fotos), propuesta: propuestaCompacta(p.propuesta),
    ...(p.reemplaza ? { reemplaza: p.reemplaza } : {}), cambios: [],
  }
  const r = registra(estado, p.sitio, { tipo: 'EN_REVISION', lote: { gtin: art.gtinCaja!, lote: folio, caducidad: '' }, datos, operador, fecha: cuando })
  return { estado: r.estado, resultado: { ok: true, valor: { folio, revision: r.evento.hash }, eventos: [r.evento] } }
}

export interface Confirmacion {
  readonly sitio: string
  readonly revision: string
  readonly caducidad: string
  readonly lote: string
  /** Si la persona eligio una de las opciones, su formato: se aprende para el articulo. */
  readonly formato?: FormatoFecha
  readonly tipo?: 'caducidad' | 'consumo-preferente'
}

export type ValorConfirmacion = ValorRecepcion & { readonly corregida: { readonly fecha: boolean; readonly lote: boolean } }

function interpretacionConfirmada(art: Articulo, c: Confirmacion, cajas: number, estado: EstadoAlmacen, hoy: string): Interpretacion {
  const vida = vidaRestante(aAammdd(c.caducidad), hoy, categoriaPorId(estado.configuracion.categorias, art.categoria), art.vidaUtilDias)
  return { gtin: art.gtinCaja!, lote: c.lote, caducidadIso: c.caducidad, cajas, articulo: art, nivel: 'caja', ...(vida ? { vida } : {}), sitios: [], ubicaciones: [], avisos: [] }
}

/** El formato vigente de un articulo: el ultimo aprendido. */
export function formatoDe(estado: EstadoAlmacen, sku: string): FormatoFechaArticulo | undefined {
  return [...(estado.formatosFecha ?? [])].reverse().find((f) => f.sku === sku)
}

/**
 * Confirma (o corrige) la caducidad y el lote de una revision abierta. La confirma QUIEN LA
 * REGISTRO. Aplica la regla de recepcion (vencido, vida minima) sobre la fecha CONFIRMADA.
 */
export function confirmaRevision(estado: EstadoAlmacen, c: Confirmacion, hoy: string, cuando: string, id: string, operador: string): Paso<ValorConfirmacion> {
  const abierta = revisionesAbiertas(estado, c.sitio).find((r) => r.evento.hash === c.revision)
  if (!abierta) return falla(estado, 'esa revisión no está abierta en ese sitio: ya se confirmó, se descartó o se tomó otra foto')
  if (abierta.operador !== operador) return falla(estado, 'la caducidad la confirma quien registró la recepción; si no puede, se descarta con su motivo y se registra de nuevo')
  if (!esFechaIsoValida(c.caducidad)) return falla(estado, `la caducidad «${c.caducidad}» no es una fecha válida`)
  if (!c.lote || c.lote.length > 20 || !CSET82.test(c.lote)) return falla(estado, 'el lote va de 1 a 20 caracteres GS1 (sin espacios ni acentos)')
  const art = estado.articulos[abierta.sku]
  if (!art?.gtinCaja) return falla(estado, `el artículo ${abierta.sku} ya no tiene GTIN de caja`)
  const d = abierta.evento.datos
  const prop = (d['propuesta'] ?? {}) as { fecha?: string; lote?: string; estado?: string; motor?: string }
  const corregida = fueCorregida({ ...(prop.fecha ? { fecha: prop.fecha } : {}), ...(prop.lote ? { lote: prop.lote } : {}) }, c)
  const lectura = json({ fotos: d['fotos'], propuesta: { estado: prop.estado, fecha: prop.fecha, lote: prop.lote }, confirmada: { caducidad: c.caducidad, lote: c.lote, tipo: c.tipo ?? 'caducidad' }, corregida, motor: prop.motor })
  const fotos = d['fotos'] as { completa?: string } | undefined
  const r = recibeConExpediente(estado, interpretacionConfirmada(art, c, abierta.cajas, estado, hoy), c.sitio, cuando, id, operador, `foto ${String(fotos?.completa ?? '').slice(7, 19)} · folio ${abierta.folio}`, { revision: c.revision, lectura })
  if (!r.resultado.ok) return falla(estado, r.resultado.motivo)
  const evento = r.resultado.eventos[0]!
  const previo = formatoDe(r.estado, art.sku)
  const aprende = c.formato && c.tipo && (previo?.formato !== c.formato || previo.tipo !== c.tipo)
  const estado2 = aprende ? { ...r.estado, formatosFecha: [...(r.estado.formatosFecha ?? []), { sku: art.sku, formato: c.formato!, tipo: c.tipo!, operador, fecha: cuando, evento: evento.hash }] } : r.estado
  return { estado: estado2, resultado: { ok: true, valor: { ...r.resultado.valor, corregida }, eventos: r.resultado.eventos } }
}

/** Descarta una revision (se registro por error, la mercancia se devolvio): RECHAZADO con su motivo. */
export function descartaRevision(estado: EstadoAlmacen, p: { readonly sitio: string; readonly revision: string; readonly motivo: string }, cuando: string, operador: string): Paso<Evento> {
  const abierta = revisionesAbiertas(estado, p.sitio).find((r) => r.evento.hash === p.revision)
  if (!abierta) return falla(estado, 'esa revisión no está abierta en ese sitio')
  if (p.motivo.trim().length < 3) return falla(estado, 'descartar lleva su motivo')
  const r = registra(estado, p.sitio, { tipo: 'RECHAZADO', lote: abierta.evento.lote, operador, fecha: cuando, datos: { revision: p.revision, descartada: true, motivo: p.motivo.trim(), sku: abierta.sku, cajas: abierta.cajas, cambios: [] } })
  return { estado: r.estado, resultado: { ok: true, valor: r.evento, eventos: [r.evento] } }
}

/** Lo que las recepciones por foto dicen del motor: confirmadas tal cual y corregidas, por motor y formato. */
export function medicionEnUso(estado: EstadoAlmacen): { motor: string; formato: string; tal: number; corregidas: number }[] {
  const m = new Map<string, { motor: string; formato: string; tal: number; corregidas: number }>()
  const revisiones = new Map(Object.values(estado.eventos ?? {}).flat().filter((e) => e.tipo === 'EN_REVISION').map((e) => [e.hash, e]))
  for (const e of Object.values(estado.eventos ?? {}).flat()) {
    const lectura = e.datos['lectura'] as { corregida?: { fecha?: boolean }; motor?: string } | undefined
    if (e.tipo !== 'RECIBIDO' || typeof e.datos['revision'] !== 'string' || !lectura) continue
    const prop = revisiones.get(e.datos['revision'])?.datos['propuesta'] as { opciones?: { formato?: string }[] } | undefined
    const formato = prop?.opciones?.[0]?.formato ?? 'sin fecha leída'
    const k = `${lectura.motor ?? 'ninguno'}|${formato}`
    const x = m.get(k) ?? { motor: lectura.motor ?? 'ninguno', formato, tal: 0, corregidas: 0 }
    if (lectura.corregida?.fecha) x.corregidas++; else x.tal++
    m.set(k, x)
  }
  return [...m.values()]
}

// --- Vincular un GTIN desconocido ----------------------------------------------------------

export interface PedidoVinculo { readonly sku: string; readonly gtin: string; readonly nivel: Nivel }

function conflictoDeVinculo(estado: EstadoAlmacen, art: Articulo, gtin: string, nivel: Nivel): string | undefined {
  const cfg = estado.configuracion
  const dueno = Object.values(estado.articulos).find((a) => a.sku !== art.sku && (a.gtinUnidad === gtin || a.gtinCaja === gtin))
  if (dueno) return `el GTIN ${gtin} ya es del artículo ${dueno.sku} (${dueno.descripcion})`
  if (art.marcaPropia && reglaDeExistente(gtin, cfg.prefijoEmpresa, cfg.prefijoInterno) === 'fabricante') return `${art.sku} es marca propia y ${gtin} no está bajo el prefijo de la casa: nunca se etiqueta con un prefijo ajeno`
  if (nivel === 'caja' && art.unidadesPorCaja > 1 && art.gtinUnidad === gtin) return `la caja trae ${art.unidadesPorCaja} piezas y no puede llevar el GTIN de la pieza`
  const actual = nivel === 'caja' ? { g: art.gtinCaja, r: art.reglaCaja } : { g: art.gtinUnidad, r: art.reglaUnidad }
  if (actual.g && actual.g !== gtin && !['interno', 'interno-existente', undefined].includes(actual.r)) return `${art.sku} ya tiene el GTIN ${actual.g} (${actual.r}) en ese nivel: cambiarlo es una decisión de catálogo (confírmalo con el fabricante y súbelo en la plantilla)`
  return undefined
}

/**
 * Vincula a un articulo el GTIN que trae el proveedor y que el catalogo no conocia. Es un cambio
 * de catalogo con traza (asignacion `fabricante`), y respeta los conflictos del importador.
 */
export function vinculaGtin(estado: EstadoAlmacen, p: PedidoVinculo, operador: string, cuando: string, id: string): { estado: EstadoAlmacen; resultado: { ok: true; articulo: Articulo } | { ok: false; motivo: string } } {
  const art = estado.articulos[p.sku]
  const v = validaCodigo(p.gtin)
  if (!art) return { estado, resultado: { ok: false, motivo: `el artículo ${p.sku} no está en el catálogo` } }
  if (v.estado !== 'valido') return { estado, resultado: { ok: false, motivo: v.estado === 'vacio' ? 'falta el GTIN' : `GTIN inválido: ${v.motivo}` } }
  const conflicto = conflictoDeVinculo(estado, art, v.gtin, p.nivel)
  if (conflicto) return { estado, resultado: { ok: false, motivo: conflicto } }
  const anterior = p.nivel === 'caja' ? art.gtinCaja : art.gtinUnidad
  if (anterior === v.gtin) return { estado, resultado: { ok: true, articulo: art } }
  const nuevo: Articulo = p.nivel === 'caja' ? { ...art, gtinCaja: v.gtin, reglaCaja: 'fabricante' } : { ...art, gtinUnidad: v.gtin, reglaUnidad: 'fabricante' }
  const asignacion = { gtin: v.gtin, sku: art.sku, nivel: p.nivel, regla: 'fabricante' as const, operador, fecha: cuando, importacion: `vinculo-${id}`, ...(anterior ? { anterior } : {}) }
  return { estado: { ...estado, version: estado.version + 1, articulos: { ...estado.articulos, [art.sku]: nuevo }, asignaciones: [...estado.asignaciones, asignacion] }, resultado: { ok: true, articulo: nuevo } }
}

// --- Fotos del articulo --------------------------------------------------------------------

/** La foto vigente de una vista del articulo (la ultima; ninguna si se retiro). */
export function fotoVigente(estado: EstadoAlmacen, sku: string, vista: VistaFoto = 'principal'): FotoArticulo | undefined {
  const f = [...(estado.fotos ?? [])].reverse().find((x) => x.sku === sku && x.vista === vista)
  return f && !f.retirada ? f : undefined
}

/** Pone (o retira) la foto de una vista. La anterior queda en el historial. */
export function registraFoto(estado: EstadoAlmacen, f: FotoArticulo): { estado: EstadoAlmacen; resultado: { ok: true; foto: FotoArticulo } | { ok: false; motivo: string } } {
  if (!estado.articulos[f.sku]) return { estado, resultado: { ok: false, motivo: `el artículo ${f.sku} no está en el catálogo` } }
  if (!f.retirada && (!esHuella(f.huella) || (f.miniatura !== undefined && !esHuella(f.miniatura)))) return { estado, resultado: { ok: false, motivo: 'la foto no tiene una huella SHA-256 válida' } }
  if ((f.nota ?? '').length > 200) return { estado, resultado: { ok: false, motivo: 'la nota mide más de 200 caracteres' } }
  return { estado: { ...estado, version: estado.version + 1, fotos: [...(estado.fotos ?? []), f] }, resultado: { ok: true, foto: f } }
}

/** Las huellas que el estado todavia referencia (fotos de articulos y evidencia de la cadena). */
export function huellasReferidas(estado: EstadoAlmacen): Set<string> {
  const s = new Set<string>()
  for (const f of estado.fotos ?? []) { if (f.huella) s.add(f.huella); if (f.miniatura) s.add(f.miniatura) }
  for (const e of Object.values(estado.eventos ?? {}).flat()) {
    const fotos = (e.datos['fotos'] ?? (e.datos['evidencia'] as { fotos?: unknown } | undefined)?.fotos) as { completa?: string; recortes?: string[] } | undefined
    if (fotos?.completa) s.add(fotos.completa)
    for (const r of fotos?.recortes ?? []) s.add(r)
  }
  return s
}

