/**
 * La PROPUESTA de caducidad que se le ensena a quien recibe: se arma con una o dos lecturas del
 * motor (dos tomas de la rafaga) y el analizador determinista de `fechas-impresas.ts`.
 *
 * La maquina propone y la persona decide (decision del laboratorio): aqui nada se registra. Lo
 * unico que se decide es QUE se ensena:
 * - `propuesta`: una sola fecha, con rotulo, y las dos tomas de acuerdo;
 * - `ambigua`: la fecha admite dos lecturas (03/04/26, 241123) o no trae rotulo;
 * - `discrepancia`: las dos tomas no dicen lo mismo (o una no encontro fecha);
 * - `invalida`: se leyo una fecha imposible (38/10/26), con la sugerencia si la hay;
 * - `solo-fabricacion`: solo hay fecha de fabricacion y el articulo no tiene vida util;
 * - `remite`: el empaque dice que la fecha esta en otra cara;
 * - `sin-fecha`: no se encontro nada. Nunca se inventa una lectura para llenar el campo.
 */
import { fechaLarga, leeFechasImpresas, normalizaImpreso, sumaDiasIso, type CandidatoFecha, type FechasLeidas, type FormatoAprendido, type FormatoFecha, type LoteLeido, type TipoFecha } from './fechas-impresas.js'

export interface LineaLeida {
  readonly texto: string
  /** La que declara el motor. No se usa para aceptar nada (no esta calibrada): solo se muestra. */
  readonly confianza?: number
  /** x, y, ancho, alto en pixeles de la imagen que se leyo. */
  readonly caja?: readonly [number, number, number, number]
}

export interface LecturaDelMotor {
  /** Identificador PINEADO del motor (C1). */
  readonly motor: string
  readonly ms: number
  readonly lineas: readonly LineaLeida[]
}

export type EstadoPropuesta = 'propuesta' | 'ambigua' | 'discrepancia' | 'invalida' | 'solo-fabricacion' | 'remite' | 'sin-fecha'

export interface OpcionFecha {
  readonly iso: string
  readonly tipo: TipoFecha
  readonly formato: FormatoFecha
  readonly finDeMes?: boolean
  /** Calculada: fabricacion + vida util del articulo. */
  readonly derivada?: { readonly fabricacion: string; readonly vidaUtilDias: number }
  /** Sale de cambiar una cifra de una fecha imposible (posible cero con diagonal). */
  readonly sugerida?: boolean
  /** El formato aprendido del articulo resolvio la ambiguedad. */
  readonly aprendido?: boolean
}

export interface Propuesta {
  readonly estado: EstadoPropuesta
  /** En lenguaje llano, para la pantalla. */
  readonly mensaje: string
  /** Solo en `propuesta`: la fecha que se ensena para confirmar. */
  readonly fecha?: string
  readonly opciones: readonly OpcionFecha[]
  /** El lote rotulado en que coinciden las tomas. */
  readonly lote?: string
  /** Otros lotes posibles (sin rotulo, o en desacuerdo entre tomas). */
  readonly lotesPosibles: readonly LoteLeido[]
  /** Posiciones en que difieren los lotes de las dos tomas (para marcarlas). */
  readonly loteDifiere?: readonly string[]
  /** El texto de cada toma, en orden de lectura, tal como lo dio el motor. */
  readonly textoLeido: readonly string[]
  /** De donde salio la fecha: toma y caja en su imagen. */
  readonly zona?: { readonly toma: number; readonly caja: readonly [number, number, number, number] }
  readonly avisos: readonly string[]
  /** `true`/`false` si hubo dos tomas; ausente con una sola. */
  readonly coinciden?: boolean
  readonly motor: string
  readonly ms: readonly number[]
}

export interface ContextoPropuesta {
  readonly hoy: string
  readonly vidaUtilDias?: number
  readonly aprendido?: FormatoAprendido
}

interface Tramo { readonly inicio: number; readonly fin: number; readonly linea: LineaLeida }

/** Las lineas en orden de lectura: renglones por solape vertical, y en cada uno de izquierda a derecha. */
export function textoEnOrden(lineas: readonly LineaLeida[]): { texto: string; tramos: Tramo[] } {
  const conCaja = lineas.every((l) => l.caja)
  const renglones: LineaLeida[][] = []
  for (const l of conCaja ? [...lineas].sort((a, b) => a.caja![1] + a.caja![3] / 2 - (b.caja![1] + b.caja![3] / 2)) : lineas) {
    const centro = l.caja ? l.caja[1] + l.caja[3] / 2 : 0
    const r = conCaja ? renglones.find((x) => x.some((y) => centro >= y.caja![1] && centro <= y.caja![1] + y.caja![3])) : undefined
    if (r) r.push(l); else renglones.push([l])
  }
  let texto = ''
  const tramos: Tramo[] = []
  renglones.forEach((r, i) => {
    if (i > 0) texto += '\n'
    ;(conCaja ? r.sort((a, b) => a.caja![0] - b.caja![0]) : r).forEach((l, j) => {
      if (j > 0) texto += ' '
      const t = normalizaImpreso(l.texto).trim()
      tramos.push({ inicio: texto.length, fin: texto.length + t.length, linea: l })
      texto += t
    })
  })
  return { texto, tramos }
}

const PRIORIDAD: Readonly<Record<TipoFecha, number>> = { caducidad: 0, 'consumo-preferente': 1, 'sin-rotulo': 2, fabricacion: 3 }

/** La fecha que importa de una toma: la de caducidad antes que la de consumo, y valida antes que imposible. */
function principal(f: FechasLeidas): CandidatoFecha | undefined {
  return [...f.candidatos].sort((a, b) => Number(a.lecturas.length === 0) - Number(b.lecturas.length === 0) || PRIORIDAD[a.tipo] - PRIORIDAD[b.tipo] || a.inicio - b.inicio)[0]
}

function opcionesDe(c: CandidatoFecha, ctx: ContextoPropuesta): OpcionFecha[] {
  const extra = (o: { finDeMes?: boolean }) => ({ ...(o.finDeMes ? { finDeMes: true } : {}), ...(c.aprendido ? { aprendido: true } : {}) })
  if (c.tipo === 'fabricacion') {
    if (!ctx.vidaUtilDias) return []
    return c.lecturas.map((l) => ({ iso: sumaDiasIso(l.iso, ctx.vidaUtilDias!), tipo: 'caducidad' as const, formato: l.formato, derivada: { fabricacion: l.iso, vidaUtilDias: ctx.vidaUtilDias! } }))
  }
  if (c.lecturas.length > 0) return c.lecturas.map((l) => ({ iso: l.iso, tipo: c.tipo, formato: l.formato, ...extra(l) }))
  return (c.sugerencias ?? []).map((l) => ({ iso: l.iso, tipo: c.tipo, formato: l.formato, sugerida: true, ...extra(l) }))
}

const clave = (o: OpcionFecha) => `${o.iso}|${o.tipo}`

function unionDe(listas: readonly (readonly OpcionFecha[])[]): OpcionFecha[] {
  const m = new Map<string, OpcionFecha>()
  for (const l of listas) for (const o of l) if (!m.has(clave(o))) m.set(clave(o), o)
  return [...m.values()]
}

/** Posiciones (1-based) en que dos lotes difieren, para marcarlas en pantalla. */
export function diferenciasDeLote(a: string, b: string): string[] {
  const d: string[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) d.push(`posición ${i + 1}: «${a[i] ?? '∅'}» contra «${b[i] ?? '∅'}»`)
  return d
}

function loteDe(tomas: readonly FechasLeidas[]): Pick<Propuesta, 'lote' | 'lotesPosibles' | 'loteDifiere'> {
  const rotulados = tomas.map((t) => t.lotes.find((l) => l.rotulado)?.valor)
  const posibles = unionLotes(tomas.flatMap((t) => t.lotes))
  const [a, b] = rotulados
  if (tomas.length > 1 && a !== b) {
    return { lotesPosibles: posibles, ...(a && b ? { loteDifiere: diferenciasDeLote(a, b) } : {}) }
  }
  return a ? { lote: a, lotesPosibles: posibles.filter((l) => l.valor !== a) } : { lotesPosibles: posibles }
}

const unionLotes = (ls: readonly LoteLeido[]) => ls.filter((l, i) => ls.findIndex((x) => x.valor === l.valor) === i)

/** Avisos de plausibilidad de una fecha: vencida, mas lejos que la vida util, fin de mes, consumo preferente. */
export function avisosDeFecha(o: OpcionFecha, ctx: ContextoPropuesta): string[] {
  const dias = Math.round((Date.parse(o.iso) - Date.parse(ctx.hoy)) / 86_400_000)
  const avisos: string[] = []
  if (dias < 0) avisos.push(`Esa fecha ya pasó (hace ${-dias} días): el lote está vencido y no se recibe.`)
  if (ctx.vidaUtilDias && dias > ctx.vidaUtilDias * 1.1) avisos.push(`Está más lejos de lo que permite la vida útil del artículo (${ctx.vidaUtilDias} días): revisa que no sea otra fecha.`)
  if (o.finDeMes) avisos.push('Trae mes y año sin día: vale hasta el último día del mes.')
  if (o.tipo === 'consumo-preferente') avisos.push('Es «consumo preferente», no caducidad: se registra como la fecha del lote y así se dice.')
  if (o.derivada) avisos.push(`Calculada: fabricación ${o.derivada.fabricacion} + ${o.derivada.vidaUtilDias} días de vida útil.`)
  if (o.sugerida) avisos.push('Sugerida cambiando una cifra de una fecha imposible: confírmala con la caja en la mano.')
  return avisos
}

function mensajeDe(estado: EstadoPropuesta, p: { fecha?: string; invalida?: CandidatoFecha; tipo?: TipoFecha }): string {
  switch (estado) {
    case 'propuesta': return `Leí ${p.tipo === 'consumo-preferente' ? 'consumo preferente' : 'caducidad'}: ${fechaLarga(p.fecha!)}. Confírmala o corrígela.`
    case 'ambigua': return p.tipo === 'sin-rotulo' ? 'Encontré una fecha sin rótulo: no sé si es caducidad o fabricación. Elige.' : 'La fecha se puede leer de dos maneras. Elige la que dice la caja.'
    case 'discrepancia': return 'Las dos tomas no dicen lo mismo. Elige la fecha correcta o tómala otra vez.'
    case 'invalida': return `Se leyó «${p.invalida?.texto}»: ${p.invalida?.invalida}.${p.invalida?.sugerencias?.length ? ' ¿Es la fecha sugerida (un cero con diagonal leído como 8)?' : ' Tecléala.'}`
    case 'solo-fabricacion': return 'Solo encontré la fecha de fabricación y el artículo no tiene vida útil en el catálogo: no se puede calcular la caducidad. Tecléala.'
    case 'remite': return 'El empaque dice que la fecha no está en esta cara: búscala en el envase y toma otra foto.'
    case 'sin-fecha': return 'No encontré una fecha. Toma otra foto encuadrando solo la fecha, o tecléala.'
  }
}

function estadoDe(pr: readonly (CandidatoFecha | undefined)[], opciones: readonly OpcionFecha[], tomas: readonly FechasLeidas[]): EstadoPropuesta {
  const hallados = pr.filter((c): c is CandidatoFecha => c !== undefined)
  if (hallados.length === 0) return tomas.some((t) => t.remite) ? 'remite' : 'sin-fecha'
  if (hallados.every((c) => c.lecturas.length === 0)) return 'invalida'
  if (hallados.every((c) => c.tipo === 'fabricacion') && opciones.length === 0) return 'solo-fabricacion'
  const porToma = pr.map((c) => (c ? new Set(c.lecturas.map((l) => l.iso)) : new Set<string>()))
  const acuerdo = porToma.every((s) => s.size === porToma[0]!.size && [...s].every((x) => porToma[0]!.has(x)))
  if (pr.length > 1 && !acuerdo) return 'discrepancia'
  if (opciones.length !== 1 || opciones[0]!.tipo === 'sin-rotulo') return 'ambigua'
  return 'propuesta'
}

/** Arma la propuesta con una o dos tomas. */
export function proponCaducidad(lecturas: readonly LecturaDelMotor[], ctx: ContextoPropuesta): Propuesta {
  const ordenadas = lecturas.map((l) => textoEnOrden(l.lineas))
  const tomas = ordenadas.map((o) => leeFechasImpresas(o.texto, ctx.aprendido, ctx.hoy))
  const pr = tomas.map(principal)
  const opciones = unionDe(pr.map((c) => (c ? opcionesDe(c, ctx) : [])))
  const estado = estadoDe(pr, opciones, tomas)
  const i = pr.findIndex((c) => c !== undefined)
  const caja = i >= 0 ? ordenadas[i]!.tramos.find((t) => pr[i]!.inicio >= t.inicio && pr[i]!.inicio < Math.max(t.fin, t.inicio + 1))?.linea.caja : undefined
  const fecha = estado === 'propuesta' ? opciones[0]!.iso : undefined
  const invalida = pr.find((c) => c && c.lecturas.length === 0)
  return {
    estado, mensaje: mensajeDe(estado, { ...(fecha ? { fecha } : {}), ...(invalida ? { invalida } : {}), ...(pr[i]?.tipo ? { tipo: pr[i]!.tipo } : {}) }),
    ...(fecha ? { fecha } : {}), opciones, ...loteDe(tomas),
    textoLeido: lecturas.map((l) => l.lineas.map((x) => x.texto).join(' ')),
    ...(caja ? { zona: { toma: i, caja } } : {}),
    avisos: fecha ? avisosDeFecha(opciones[0]!, ctx) : [],
    ...(lecturas.length > 1 ? { coinciden: estado !== 'discrepancia' && (!tomas[1] || loteDe(tomas).loteDifiere === undefined) } : {}),
    motor: lecturas[0]?.motor ?? 'ninguno', ms: lecturas.map((l) => l.ms),
  }
}

/** ¿La fecha que confirma la persona es la que propuso la maquina? Lo calcula el SERVIDOR, no el navegador. */
export function fueCorregida(p: Pick<Propuesta, 'fecha' | 'lote'>, confirmada: { readonly caducidad: string; readonly lote: string }): { fecha: boolean; lote: boolean } {
  return { fecha: p.fecha !== confirmada.caducidad, lote: p.lote !== confirmada.lote }
}

/**
 * El puerto del motor de lectura: una imagen (el RECORTE de la guia de encuadre) y sus lineas de
 * texto. Se inyecta: RapidOCR por proceso local (`./motores/proceso`), otro motor local, o
 * ninguno (la persona teclea y la foto queda como evidencia). Un motor que saque la foto del
 * perimetro (una API ajena) es decision de flujo de datos (C4) y, si es un modelo de lenguaje,
 * pasa por el routing (C8): no hay adaptador asi en la herramienta.
 */
export interface MotorFechas {
  /** Identificador PINEADO (C1): `rapidocr-onnxruntime-1.4.4/ppocrv4`, nunca `latest`. */
  readonly modelo: string
  lee(imagen: Uint8Array, opciones?: { readonly variante?: 'cruda' | 'puntos' }): Promise<LecturaDelMotor>
}

/** Rechaza un identificador que no fije la version (C1). */
export function exigeModeloPineado(modelo: string): string {
  if (!modelo.trim() || /(^|[:@/-])latest$|:latest|\blatest\b/i.test(modelo) || !/\d/.test(modelo)) throw new Error(`el motor «${modelo}» no está pineado a una versión (C1)`)
  return modelo
}

const NADA: readonly EstadoPropuesta[] = ['sin-fecha', 'invalida']

/**
 * La lectura que usa la app, medida en el banco (`banco/mide-caducidades.mjs`, «rapidocr-producto»):
 * 1. cada toma (recorte de la guia) se lee tal cual; si no aparece una fecha, se vuelve a leer
 *    uniendo los puntos (la tinta de inyeccion que el motor no ve suelta);
 * 2. las tomas se cotejan (`proponCaducidad`);
 * 3. si NINGUNA toma encontro nada, se lee la foto entera (el motor detecta el texto donde este)
 *    y la propuesta lo dice: `enFotoEntera`.
 */
export async function leeYPropone(motor: MotorFechas, tomas: readonly Uint8Array[], ctx: ContextoPropuesta, fotoEntera?: Uint8Array): Promise<Propuesta & { readonly enFotoEntera?: boolean }> {
  const lecturas: LecturaDelMotor[] = []
  for (const t of tomas) {
    const cruda = await motor.lee(t)
    const sola = proponCaducidad([cruda], ctx)
    lecturas.push(sola.estado === 'sin-fecha' ? await motor.lee(t, { variante: 'puntos' }) : cruda)
  }
  const p = proponCaducidad(lecturas, ctx)
  if (!fotoEntera || lecturas.some((l) => !NADA.includes(proponCaducidad([l], ctx).estado))) return p
  const entera = proponCaducidad([await motor.lee(fotoEntera)], ctx)
  if (NADA.includes(entera.estado) && p.estado === 'invalida') return p
  const { zona: _zona, ...sinZona } = entera
  void _zona
  return { ...sinZona, enFotoEntera: true, ms: [...p.ms, ...entera.ms] }
}
