/**
 * Un estructurador SIN modelo (PRP-005 Fase 6): determinista, gratis y sin red. RF-4 hace el modelo
 * opcional («si el modelo de lenguaje interviene…»); este es el camino sin él.
 *
 * Toma la pregunta tal cual como descripción (el motor la clasifica por keywords), elige la
 * dimensión en la que el texto casa alguna categoría y lee la fecha y el importe si vienen
 * escritos. Lo que no hace: entender una paráfrasis. Si la pregunta no usa ninguna keyword, el motor
 * responde «sin regla», que es el fail-safe honesto. Para paráfrasis hace falta un modelo.
 */
import type { Conocimiento } from '../contrato.js'
import { clasifica } from '../motor.js'
import type { Estructurador } from './parser.js'

function categoriasDelAmbito(c: Conocimiento, jurisdiccion: string, dimension: string) {
  const usadas = new Set(
    c.reglas.filter((r) => r.jurisdiccion === jurisdiccion && r.dimension === dimension).flatMap((r) => r.impactos.map((i) => i.categoria)),
  )
  return c.categorias.filter((k) => usadas.has(k.clave))
}

/** `2024-06-01` o `01/06/2024`. Una fecha que no existe no se inventa: null. */
function fechaEn(texto: string): string | null {
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(texto)
  const dmy = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(texto)
  const [a, m, d] = iso ? [iso[1], iso[2], iso[3]] : dmy ? [dmy[3], dmy[2]!.padStart(2, '0'), dmy[1]!.padStart(2, '0')] : []
  if (!a) return null
  const f = `${a}-${m}-${d}`
  // Date.UTC y no una hora ISO literal: esa forma la toma verifica-gobernanza por identificador de caso-trampa.
  return new Date(Date.UTC(Number(a), Number(m) - 1, Number(d))).toISOString().slice(0, 10) === f ? f : null
}

/** `$2,400` o `$ 2400.50`: solo con signo de pesos, para no confundir años ni plazos con importes. */
function importeEn(texto: string): number | null {
  const m = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/.exec(texto)
  return m ? Number(`${m[1]!.replaceAll(',', '')}${m[2] ?? ''}`) : null
}

export interface OpcionesSinModelo {
  /** Fija la dimensión si el proyecto ya la sabe; si no, se deduce de las keywords. */
  dimension?: string
}

export function estructuradorSinModelo(c: Conocimiento, jurisdiccion: string, o: OpcionesSinModelo = {}): Estructurador {
  const dimensiones = [...new Set(c.dominios.filter((d) => d.jurisdiccion === jurisdiccion).map((d) => d.dimension))].sort()
  return async ({ texto }) => {
    const descripcion = texto.trim().slice(0, 300)
    const casan = dimensiones.filter((dim) => clasifica(descripcion, categoriasDelAmbito(c, jurisdiccion, dim)) !== null)
    return {
      // Si el texto casa en dos dimensiones, la duda se queda en null: no se elige una a ciegas.
      dimension: o.dimension ?? (casan.length === 1 ? casan[0] : null),
      fecha: fechaEn(texto),
      conceptos: [{ descripcion, categoria: null, importe: importeEn(texto) }],
    }
  }
}
