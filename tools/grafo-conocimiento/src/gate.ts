/**
 * El gate de siembra (spec 004 RF-12 y RF-14, PRP-005 Fase 4). Lo que `validaConocimiento` no puede
 * ver en una sola foto:
 *
 * - **Contenciones** (RF-12): una keyword que cabe dentro de otra de OTRA categoría del mismo ámbito,
 *   con frontera de palabra. Todo texto que casa la larga casa también la corta; hoy gana la larga
 *   por longitud, y nada vigila que eso siga siendo lo correcto. Cada contención queda cubierta por
 *   una exclusión o aceptada por escrito, con su porqué.
 * - **Historial** (RF-14): entre dos versiones publicadas no se borra nada, no se quita una keyword ni
 *   una palabra del vocabulario, y no se edita una regla en su sitio salvo que la versión nueva la
 *   declare FIRMADA (una corrección de modelado, nota en RF-14). Cerrar `vigente_hasta`, añadir
 *   `reemplaza` y añadir cualquier cosa se permite: eso es solo-añadir.
 *
 * Es una entrada aparte (`./gate`) porque usa `node:crypto`; el motor sigue sirviendo en el navegador.
 */
import { createHash } from 'node:crypto'
import type { Conocimiento, Regla } from './contrato.js'
import { normaliza } from './motor.js'

// --- Contenciones ------------------------------------------------------------------------------

export interface Contencion {
  corta: string
  categoria_corta: string
  larga: string
  categoria_larga: string
  /** Una exclusión de la categoría corta casa la frase larga: la corta queda descartada. */
  cubierta: boolean
}

const casa = (texto: string, kw: string) =>
  new RegExp(`(?<![a-z0-9])${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`).test(texto)

function ambitosPorCategoria(c: Conocimiento): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>()
  for (const r of c.reglas) {
    for (const i of r.impactos) {
      if (i.categoria === null) continue
      m.set(i.categoria, (m.get(i.categoria) ?? new Set()).add(`${r.jurisdiccion}/${r.dimension}`))
    }
  }
  return m
}

/** Contenciones entre categorías que compiten en algún ámbito, ordenadas para comparar listas. */
export function contenciones(c: Conocimiento): Contencion[] {
  const ambitos = ambitosPorCategoria(c)
  const compiten = (a: string, b: string) => [...(ambitos.get(a) ?? [])].some((x) => ambitos.get(b)?.has(x))
  const out: Contencion[] = []
  for (const x of c.categorias) {
    for (const y of c.categorias) {
      if (x.clave === y.clave || !compiten(x.clave, y.clave)) continue
      for (const k1 of x.keywords) {
        for (const k2 of y.keywords) {
          const [corta, larga] = [normaliza(k1), normaliza(k2)]
          if (corta === larga || !casa(larga, corta)) continue
          const cubierta = x.exclusiones.some((e) => casa(larga, normaliza(e)))
          out.push({ corta: k1, categoria_corta: x.clave, larga: k2, categoria_larga: y.clave, cubierta })
        }
      }
    }
  }
  return out.sort((a, b) => `${a.corta}|${a.larga}`.localeCompare(`${b.corta}|${b.larga}`))
}

// --- Huellas de una versión --------------------------------------------------------------------

/** Con el prefijo `sha256:`: es un ancla pública (audita-secretos). */
const sha256 = (x: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(x)).digest('hex')}`

export interface Huellas {
  reglas: Record<string, { huella: string; vigente_hasta: string | null; reemplaza: string | null }>
  categorias: Record<string, { keywords: string[]; exclusiones: string[] }>
  dominios: Record<string, { categorias: string[] }>
  vocabulario: Record<string, string[]>
}

/** Lo que una regla AFIRMA: todo menos cerrar su vigencia y declarar a quién reemplaza. */
function huellaRegla(r: Regla): string {
  return sha256(Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'vigente_hasta' && k !== 'reemplaza')))
}

export function huellas(c: Conocimiento): Huellas {
  const ordena = (xs: readonly string[]) => [...xs].sort()
  return {
    reglas: Object.fromEntries(
      c.reglas.map((r) => [r.clave, { huella: huellaRegla(r), vigente_hasta: r.vigente_hasta, reemplaza: r.reemplaza ?? null }]),
    ),
    categorias: Object.fromEntries(
      c.categorias.map((k) => [k.clave, { keywords: ordena(k.keywords), exclusiones: ordena(k.exclusiones) }]),
    ),
    dominios: Object.fromEntries(c.dominios.map((d) => [d.clave, { categorias: ordena(d.categorias) }])),
    vocabulario: Object.fromEntries(c.dimensiones.map((d) => [d.codigo, ordena(d.vocabulario)])),
  }
}

// --- Historial: de una versión a la siguiente ---------------------------------------------------

export type TipoRetroceso =
  | 'regla_borrada'
  | 'regla_editada'
  | 'vigencia_editada'
  | 'reemplazo_editado'
  | 'categoria_borrada'
  | 'keyword_quitada'
  | 'exclusion_quitada'
  | 'dominio_borrado'
  | 'categoria_sacada_de_dominio'
  | 'dimension_borrada'
  | 'veredicto_quitado_del_vocabulario'

export interface Retroceso {
  tipo: TipoRetroceso
  clave: string
  detalle: string
}

const faltan = (antes: readonly string[], ahora: readonly string[]) => antes.filter((x) => !ahora.includes(x))

function retrocesosDeReglas(antes: Huellas, ahora: Huellas, firmada: (k: string) => boolean): Retroceso[] {
  const out: Retroceso[] = []
  for (const [clave, a] of Object.entries(antes.reglas)) {
    const b = ahora.reglas[clave]
    if (!b) {
      out.push({ tipo: 'regla_borrada', clave, detalle: 'se retira cerrando vigente_hasta, nunca borrándola' })
      continue
    }
    if (firmada(clave)) continue
    if (a.huella !== b.huella) out.push({ tipo: 'regla_editada', clave, detalle: 'editada en su sitio sin firma en la versión' })
    if (a.vigente_hasta !== null && a.vigente_hasta !== b.vigente_hasta) {
      out.push({ tipo: 'vigencia_editada', clave, detalle: `vigente_hasta ${a.vigente_hasta} → ${b.vigente_hasta}` })
    }
    if (a.reemplaza !== null && a.reemplaza !== b.reemplaza) {
      out.push({ tipo: 'reemplazo_editado', clave, detalle: `reemplaza ${a.reemplaza} → ${b.reemplaza}` })
    }
  }
  return out
}

function retrocesosDeCatalogo(antes: Huellas, ahora: Huellas, firmada: (k: string) => boolean): Retroceso[] {
  const out: Retroceso[] = []
  for (const [clave, a] of Object.entries(antes.categorias)) {
    const b = ahora.categorias[clave]
    if (!b) out.push({ tipo: 'categoria_borrada', clave, detalle: 'una categoría usada no se borra' })
    else if (!firmada(clave)) {
      for (const k of faltan(a.keywords, b.keywords)) out.push({ tipo: 'keyword_quitada', clave, detalle: k })
      for (const k of faltan(a.exclusiones, b.exclusiones)) out.push({ tipo: 'exclusion_quitada', clave, detalle: k })
    }
  }
  for (const [clave, a] of Object.entries(antes.dominios)) {
    const b = ahora.dominios[clave]
    if (!b) out.push({ tipo: 'dominio_borrado', clave, detalle: 'un proyecto puede tenerlo registrado' })
    else if (!firmada(clave)) {
      for (const k of faltan(a.categorias, b.categorias)) out.push({ tipo: 'categoria_sacada_de_dominio', clave, detalle: k })
    }
  }
  for (const [codigo, a] of Object.entries(antes.vocabulario)) {
    const b = ahora.vocabulario[codigo]
    if (!b) out.push({ tipo: 'dimension_borrada', clave: codigo, detalle: 'una dimensión usada no se borra' })
    else if (!firmada(codigo)) {
      for (const v of faltan(a, b)) out.push({ tipo: 'veredicto_quitado_del_vocabulario', clave: codigo, detalle: v })
    }
  }
  return out
}

/**
 * Lo que la versión nueva deshace de la anterior. `firmadas`: claves de reglas, categorías,
 * dominios o dimensiones que la versión nueva cambia EN SU SITIO con firma (correcciones de
 * modelado). Borrar no se firma: nunca.
 */
export function comparaVersiones(antes: Huellas, ahora: Huellas, firmadas: readonly string[] = []): Retroceso[] {
  const firmada = (k: string) => firmadas.includes(k)
  return [...retrocesosDeReglas(antes, ahora, firmada), ...retrocesosDeCatalogo(antes, ahora, firmada)]
}
