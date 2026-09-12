/**
 * Que clase de hoja es una pagina, por lo que dice su titulo. Logica pura.
 *
 * Un expediente laboral trae acta, alta del IMSS, contrato, cartas... y no todas valen lo mismo:
 * unas llevan los identificadores y otras son prosa. Saber la clase permite dos cosas que ahorran
 * de verdad: no mandar al motor caro una carta de recomendacion, y esperar un identificador
 * concreto en la hoja que lo lleva (y declarar cuando no aparece).
 *
 * Las clases NO vienen puestas: las declara el proyecto, como los esquemas de XML. Una lista
 * embarcada seria un catalogo que envejece con cada formato nuevo, y se leeria como si fuera
 * completa.
 */
import type { PaginaExtraida } from './tipos.js'

export interface ClaseDePagina {
  readonly clase: string
  /** Se evalua sobre el texto de la pagina. Gana la primera que casa, en el orden declarado. */
  readonly titulo: RegExp
}

export interface ClasificacionDePagina {
  readonly clase: string
  /** El fragmento que caso, para que quien revise vea POR QUE. `null` si no caso ninguna. */
  readonly evidencia: string | null
}

export const SIN_CLASIFICAR = 'sin_clasificar'

/** Valida la lista una vez: una clase repetida o llamada `sin_clasificar` es un error de configuracion. */
export function declaraClases(clases: readonly ClaseDePagina[]): readonly ClaseDePagina[] {
  const vistas = new Set<string>()
  for (const { clase } of clases) {
    if (clase === SIN_CLASIFICAR) throw new Error(`"${SIN_CLASIFICAR}" es la clase reservada para lo que no casa: no se declara`)
    if (vistas.has(clase)) throw new Error(`clase de pagina repetida: "${clase}"`)
    vistas.add(clase)
  }
  return clases
}

export function clasePorTitulo(texto: string, clases: readonly ClaseDePagina[]): ClasificacionDePagina {
  for (const { clase, titulo } of clases) {
    // Se clona sin `g` para que un `lastIndex` heredado no haga fallar la segunda pagina.
    const encontrado = new RegExp(titulo.source, titulo.flags.replace('g', '')).exec(texto)
    if (encontrado !== null) return { clase, evidencia: encontrado[0] }
  }
  return { clase: SIN_CLASIFICAR, evidencia: null }
}

export function clasificaPaginas(paginas: readonly PaginaExtraida[], clases: readonly ClaseDePagina[]): readonly ClasificacionDePagina[] {
  return paginas.map((p) => clasePorTitulo(p.markdown, clases))
}
