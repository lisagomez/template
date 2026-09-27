/**
 * Cadenas de elementos GS1: de texto a lista de (AI, valor) y de vuelta, en cada una de las
 * formas en que viajan.
 *
 * Una pistola USB en modo teclado puede mandar lo mismo de cuatro maneras: con el identificador
 * de simbologia `]C1` delante o sin el, con el separador GS como byte 0x1D, con el GS sustituido
 * por otro caracter (el teclado no sabe teclear un 0x1D), o ya "bonito", con parentesis. El
 * parser acepta todas; lo que devuelve dice cual llego, para poder diagnosticar la pistola.
 */
import { aiAlInicio, entradaAi } from './diccionario/index.js'

export interface Elemento {
  readonly ai: string
  readonly valor: string
}

/** Un simbolo GS1-128: los elementos que van en UN codigo de barras, en orden. */
export type Simbolo = readonly Elemento[]

export const GS = '\x1d'

/**
 * Lo que algunas pistolas o sus emuladores de teclado mandan en lugar del GS. Todos quedan
 * FUERA de CSET 82, CSET 39 y base64url: no pueden aparecer dentro de un valor GS1, asi que
 * tratarlos como separador nunca parte un dato bueno.
 */
export const SUSTITUTOS_GS_POR_DEFECTO: readonly string[] = ['␝', '<GS>', '{GS}', '[GS]', '\\x1d', '^]', '|', '~']

export type FormaLectura = 'hri' | 'cruda'

export interface Lectura {
  readonly elementos: readonly Elemento[]
  readonly forma: FormaLectura
  /** `]C1` (GS1-128), `]e0` (DataBar), `]d2` (DataMatrix), `]Q3` (QR)... si vino. */
  readonly simbologia?: string
  /** Que sustituto de GS se reconocio, si alguno: sirve para configurar la pistola. */
  readonly sustitutoGs?: string
}

export type CodigoErrorLectura = 'vacio' | 'ai-desconocido' | 'valor-corto' | 'falta-separador' | 'hri-mal-formado'

export interface ErrorLectura {
  readonly error: CodigoErrorLectura
  readonly posicion: number
  readonly mensaje: string
}

export function esErrorLectura<T extends object>(x: T | ErrorLectura): x is ErrorLectura {
  return !Array.isArray(x) && 'error' in x
}

const fallo = (error: CodigoErrorLectura, posicion: number, mensaje: string): ErrorLectura => ({ error, posicion, mensaje })

/** Lo que se lee de una pistola, de la camara o de un campo de texto. */
export function parseaLectura(texto: string, sustitutos: readonly string[] = SUSTITUTOS_GS_POR_DEFECTO): Lectura | ErrorLectura {
  let s = texto.replace(/^[\s\r\n]+|[\s\r\n]+$/g, '')
  let simbologia: string | undefined
  const id = /^\][A-Za-z][0-9A-Za-z]/.exec(s)
  if (id) {
    simbologia = id[0]
    s = s.slice(3)
  }
  let sustitutoGs: string | undefined
  for (const sub of sustitutos) {
    if (sub && s.includes(sub)) {
      sustitutoGs ??= sub
      s = s.split(sub).join(GS)
    }
  }
  if (s === '') return fallo('vacio', 0, 'no llegó ningún dato')
  const r = s.startsWith('(') ? parseaHri(s) : parseaCruda(s)
  if (esErrorLectura(r)) return r
  return { elementos: r, forma: s.startsWith('(') ? 'hri' : 'cruda', ...(simbologia ? { simbologia } : {}), ...(sustitutoGs ? { sustitutoGs } : {}) }
}

/** Datos crudos: AIs pegados, con GS (0x1D) tras cada campo variable que no sea el ultimo. */
export function parseaCruda(s: string): Elemento[] | ErrorLectura {
  const salida: Elemento[] = []
  let i = 0
  while (i < s.length) {
    if (s[i] === GS) { i++; continue }
    const ai = aiAlInicio(s, i)
    if (!ai) return fallo('ai-desconocido', i, `no hay ningún identificador GS1 (AI) que empiece por «${s.slice(i, i + 4)}»`)
    const e = entradaAi(ai)
    if (!e) return fallo('ai-desconocido', i, `AI ${ai} desconocido`)
    i += ai.length
    if (e.longitudPredefinida) {
      const valor = s.slice(i, i + e.longitudMax)
      if (valor.length < e.longitudMax || valor.includes(GS)) return fallo('valor-corto', i, `el dato del AI (${ai}) debe medir ${e.longitudMax} y llegó más corto`)
      salida.push({ ai, valor })
      i += e.longitudMax
    } else {
      const fin = s.indexOf(GS, i)
      const valor = s.slice(i, fin < 0 ? s.length : fin)
      if (valor.length > e.longitudMax) return fallo('falta-separador', i, `el dato del AI (${ai}) mide ${valor.length} y el máximo es ${e.longitudMax}: probablemente falta el separador FNC1/GS`)
      salida.push({ ai, valor })
      i += valor.length
    }
  }
  return salida
}

const AI_ENTRE_PARENTESIS = /\((\d{2,4})\)/g

/** Texto legible: `(01)09521234000013(17)261030(10)L4471`. */
export function parseaHri(s: string): Elemento[] | ErrorLectura {
  const salida: Elemento[] = []
  let i = 0
  while (i < s.length) {
    const m = /^\((\d{2,4})\)/.exec(s.slice(i))
    if (!m || !m[1]) return fallo('hri-mal-formado', i, 'se esperaba un AI entre paréntesis, como (01)')
    const ai = m[1]
    const e = entradaAi(ai)
    if (!e) return fallo('ai-desconocido', i, `AI (${ai}) desconocido`)
    i += m[0].length
    let fin: number
    if (e.longitudPredefinida) {
      fin = i + e.longitudMax
    } else {
      // El valor llega hasta el siguiente "(NN)" que sea un AI conocido, o hasta el final.
      fin = s.length
      AI_ENTRE_PARENTESIS.lastIndex = i
      for (let x = AI_ENTRE_PARENTESIS.exec(s); x; x = AI_ENTRE_PARENTESIS.exec(s)) {
        if (x[1] && entradaAi(x[1])) { fin = x.index; break }
      }
    }
    const valor = s.slice(i, fin).replace(new RegExp(GS, 'g'), '')
    if (e.longitudPredefinida && valor.length < e.longitudMax) return fallo('valor-corto', i, `el dato del AI (${ai}) debe medir ${e.longitudMax}`)
    salida.push({ ai, valor })
    i = fin
  }
  return salida
}

/** ¿Lleva FNC1 detras? Solo si no es de longitud predefinida y no es el ultimo del simbolo. */
export function llevaSeparador(simbolo: Simbolo, indice: number): boolean {
  const e = simbolo[indice]
  if (!e || indice === simbolo.length - 1) return false
  return !(entradaAi(e.ai)?.longitudPredefinida ?? false)
}

/** `(01)09521234000013(17)261030(10)L4471` — lo que se imprime debajo de las barras. */
export function aHri(simbolo: Simbolo): string {
  return simbolo.map((e) => `(${e.ai})${e.valor}`).join('')
}

/** Lo que transmite un lector: `]C1` + datos, con GS donde hay FNC1 separador. */
export function aTransmitida(simbolo: Simbolo, conIdentificador = true): string {
  const datos = simbolo.map((e, i) => e.ai + e.valor + (llevaSeparador(simbolo, i) ? GS : '')).join('')
  return (conIdentificador ? ']C1' : '') + datos
}

/**
 * Caracteres de datos segun GenSpecs §5.4.4.3: AIs + valores + cada FNC1 SEPARADOR. No cuentan
 * el caracter de inicio, el FNC1 inicial, el de control ni el de parada. Maximo 48.
 */
export function caracteresDeDatos(simbolo: Simbolo): number {
  return simbolo.reduce((n, e, i) => n + e.ai.length + e.valor.length + (llevaSeparador(simbolo, i) ? 1 : 0), 0)
}

export const MAXIMO_CARACTERES_GS1_128 = 48

/** Dos listas de elementos dicen lo mismo (mismo orden, mismos AIs, mismos valores). */
export function mismosElementos(a: readonly Elemento[], b: readonly Elemento[]): boolean {
  return a.length === b.length && a.every((e, i) => e.ai === b[i]?.ai && e.valor === b[i]?.valor)
}

export function valorDe(elementos: readonly Elemento[], ai: string): string | undefined {
  return elementos.find((e) => e.ai === ai)?.valor
}
