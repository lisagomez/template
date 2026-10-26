/**
 * La composición de un producto en la capa: qué módulos lleva, quién llena cada ranura, de quién es la
 * memoria, con qué modelo se resuelve (C8), qué motores de voz lleva y su marca (marca blanca). Es DATO: un
 * producto nuevo es una composición nueva, e intercambiar un módulo es editar este dato, nunca la capa.
 *
 * `resuelveComposicion` cruza la composición con los enchufes de sus módulos y decide, para cada ranura, quién
 * la llena y por qué. Lo que no cuadra sale como problema, no como un hueco callado.
 */
import { z } from 'zod'
import { KEBAB, type Enchufe } from './enchufe.js'
import type { IntencionRuteable } from './intencion.js'
import { INTENCIONES_DE_LA_CAPA } from './conversacion.js'
import type { Permisos } from './memoria.js'
import { FICHAS, RANURAS, RANURAS_DE_LA_CAPA, RANURAS_SIN_RESPALDO, type Ranura } from './ranuras.js'
import { decideRanuraVoz, type RanuraVoz } from './voz.js'

/** Lo que un producto puede encender. El freno no está: no se apaga. */
export const FUNCIONES = ['conversacion', 'intencion', 'memoria', 'plan', 'voz', 'lienzo', 'explorador', 'panel', 'primer-arranque', 'ajustes'] as const
export type Funcion = (typeof FUNCIONES)[number]

/** La capa misma, como quien llena una ranura con su respaldo. */
export const CAPA = 'capa'

const HEX = /^#[0-9a-fA-F]{6}$/

export const EsquemaComposicion = z.strictObject({
  composicion: z.literal(1),
  producto: z.string().regex(KEBAB),
  marca: z.strictObject({
    nombre: z.string().min(2),
    /** El nombre del asistente del producto. Ni «Levy» ni «Arbrain»: cada producto lleva el suyo. */
    asistente: z.string().min(2),
    acento: z.string().regex(HEX),
    saludo: z.string().min(3),
  }),
  funciones: z.array(z.enum(FUNCIONES)).min(1),
  modulos: z.array(z.string().regex(KEBAB)).min(1),
  /** Ranura → módulo (o «capa»). Lo que no se dice lo llena el primer módulo que la declare, o la capa. */
  ranuras: z.partialRecord(z.enum(RANURAS), z.string().regex(KEBAB)),
  /** Dónde vive la memoria: el navegador de la persona, un archivo (Node), solo en memoria, o el almacén propio
   *  del producto detrás de su servidor (la mesa: lo que escribe el experto no sale de su almacén). */
  memoria: z.strictObject({ duena: z.enum(['producto', 'inquilino']), almacen: z.enum(['navegador', 'archivo', 'memoria', 'servidor']) }),
  /** C8: la clase de routing con la que se resolvería con un modelo. En el HECHO no hay modelo: «sin-llm». */
  modelo: z.strictObject({ clase: z.string().regex(KEBAB).nullable(), estado: z.enum(['sin-llm', 'inyectado']) }),
  /** Los motores de voz, o `{ no: motivo }` si el producto no puede llevar voz local (y el botón lo explica). */
  voz: z.union([
    z.strictObject({ stt: z.string(), tts: z.string(), vad: z.string(), nube: z.array(z.string()) }),
    z.strictObject({ no: z.string().min(10) }),
  ]).nullable(),
  /** Si guarda datos sensibles de terceros (pacientes, por ejemplo): entonces nunca hay nube en la voz. */
  datosSensibles: z.boolean(),
  /** Lo que el producto expone hacia fuera como lectura de SOLO conteos (o null si no expone nada). */
  resumen: z.strictObject({ conteos: z.array(z.string().regex(KEBAB)).min(1), enlaces: z.array(z.string().regex(KEBAB)) }).nullable(),
})

export type Composicion = z.infer<typeof EsquemaComposicion>

export interface Llenado { quien: string | null; motivo: string }

export interface ProductoResuelto {
  composicion: Composicion
  ranuras: Record<Ranura, Llenado>
  intenciones: IntencionRuteable[]
  permisos: Permisos
  pantallas: Array<{ modulo: string; ruta: string }>
  /** El nombre corto de cada módulo compuesto (el de su enchufe, sin la explicación entre paréntesis). */
  nombres: Record<string, string>
  /** Lo que sale de la máquina cuando trabajan los módulos compuestos, según su enchufe (C4). La voz va aparte. */
  sale: Array<{ modulo: string; que: string; aQuien: string; cuando: string }>
  voz: RanuraVoz
  problemas: string[]
}

const FUNCION_DE: Partial<Record<Ranura, Funcion>> = {
  conversacion: 'conversacion', intencion: 'intencion', memoria: 'memoria', plan: 'plan', voz: 'voz', lienzo: 'lienzo',
  explorador: 'explorador', panel: 'panel', 'primer-arranque': 'primer-arranque', ajustes: 'ajustes',
}

function llena(r: Ranura, c: Composicion, enchufes: ReadonlyMap<string, Enchufe>, problemas: string[]): Llenado {
  if ((RANURAS_DE_LA_CAPA as readonly Ranura[]).includes(r)) {
    if (c.ranuras[r] && c.ranuras[r] !== CAPA) problemas.push(`«${r}» la pide ${c.ranuras[r]}, y esa ranura solo la llena la capa`)
    return { quien: CAPA, motivo: 'de la capa, no se reemplaza' }
  }
  const funcion = FUNCION_DE[r]
  if (funcion && !c.funciones.includes(funcion)) return { quien: null, motivo: 'apagada por el producto' }
  const pedido = c.ranuras[r]
  if (pedido === CAPA) {
    if ((RANURAS_SIN_RESPALDO as readonly Ranura[]).includes(r)) problemas.push(`«${r}» no tiene versión de la capa: la llena un módulo`)
    return { quien: CAPA, motivo: FICHAS[r].respaldo ?? 'sin respaldo' }
  }
  if (pedido) {
    const e = enchufes.get(pedido)
    if (!c.modulos.includes(pedido)) problemas.push(`«${r}» la pide ${pedido}, que no está entre los módulos del producto`)
    else if (!e?.ranuras.includes(r)) problemas.push(`«${r}» la pide ${pedido}, y su enchufe no declara esa ranura`)
    return { quien: pedido, motivo: 'la elige el producto' }
  }
  const primero = c.modulos.find((m) => enchufes.get(m)?.ranuras.includes(r))
  if (primero) return { quien: primero, motivo: 'el primer módulo del producto que la declara' }
  const respaldo = FICHAS[r].respaldo
  return respaldo ? { quien: CAPA, motivo: respaldo } : { quien: null, motivo: 'ningún módulo la llena y la capa no tiene versión propia' }
}

export function resuelveComposicion(c: Composicion, enchufes: readonly Enchufe[]): ProductoResuelto {
  const problemas: string[] = []
  const porModulo = new Map(enchufes.map((e) => [e.modulo, e]))
  for (const m of c.modulos) if (!porModulo.has(m)) problemas.push(`el módulo ${m} no tiene enchufe`)
  const ranuras = Object.fromEntries(RANURAS.map((r) => [r, llena(r, c, porModulo, problemas)])) as Record<Ranura, Llenado>
  const declarada = c.funciones.includes('voz') ? c.voz : null
  const voz = declarada && 'no' in declarada
    ? { visible: false, motivo: declarada.no, puede: { dictar: false, escuchar: false, conversar: false }, sale: [], problemas: [] }
    : decideRanuraVoz(declarada, { datosSensibles: c.datosSensibles })
  problemas.push(...voz.problemas)
  if (c.funciones.includes('voz')) {
    if (!voz.visible) ranuras.voz = { quien: null, motivo: voz.motivo }
    else if (!ranuras.voz.quien) problemas.push('la voz declara motores y ningún módulo de voz llena la ranura (el botón necesita quien lo mueva)')
    else ranuras.voz = { quien: ranuras.voz.quien, motivo: voz.motivo }
  }
  const compuestos = c.modulos.map((m) => porModulo.get(m)).filter((e): e is Enchufe => Boolean(e))
  const deLaCapa = c.funciones.includes('memoria') ? INTENCIONES_DE_LA_CAPA : []
  const intenciones = [...compuestos.flatMap((e) => e.intenciones.map((i) => ({ ...i, modulo: e.modulo }))), ...deLaCapa]
  const ids = intenciones.map((i) => i.id)
  for (const id of ids.filter((x, k) => ids.indexOf(x) !== k)) problemas.push(`dos módulos atienden la misma intención: ${id}`)
  const permisos = Object.fromEntries(compuestos.map((e) => [e.modulo, { lee: e.memoria.lee, escribe: e.memoria.escribe }]))
  const pantallas = compuestos.flatMap((e) => e.pantallas.map((ruta) => ({ modulo: e.modulo, ruta })))
  const nombres = Object.fromEntries(compuestos.map((e) => [e.modulo, e.nombre.replace(/\s*\(.*\)\s*$/, '').trim() || e.nombre]))
  const sale = compuestos.flatMap((e) => e.sale.map((s) => ({ modulo: e.modulo, ...s })))
  if (c.modelo.estado === 'inyectado' && !c.modelo.clase) problemas.push('un modelo inyectado necesita su clase de routing (C8)')
  return { composicion: c, ranuras, intenciones, permisos, pantallas, nombres, sale, voz, problemas }
}

/** Valida y resuelve de una vez: lo que usa el producto al arrancar y lo que usa el verificador. */
export function compone(x: unknown, enchufes: readonly Enchufe[]): { ok: true; producto: ProductoResuelto } | { ok: false; problemas: string[] } {
  const r = EsquemaComposicion.safeParse(x)
  if (!r.success) return { ok: false, problemas: r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`) }
  const producto = resuelveComposicion(r.data, enchufes)
  return producto.problemas.length ? { ok: false, problemas: producto.problemas } : { ok: true, producto }
}
