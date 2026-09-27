/**
 * Cuanto mide un GS1-128 en modulos, sin dibujarlo.
 *
 * Hace falta para dos revisiones que no pueden esperar al render: si el codigo CABE en la
 * etiqueta con su zona en blanco, y que grosor de barra (X) es el mayor posible. Se calcula la
 * codificacion MINIMA (cambios de juego B/C optimos por programacion dinamica): es lo que hacen
 * BWIPP y el modo D de Zebra con datos GS1, y las pruebas lo comparan contra los dos motores.
 *
 * Cada caracter de simbolo ocupa 11 modulos; la parada, 13 (GenSpecs §5.4.1). Total =
 * 11 × (inicio + FNC1 inicial + datos + control) + 13.
 */
import { llevaSeparador, type Simbolo } from './elementos.js'

type Token = { readonly fnc1: true } | { readonly car: string }

function tokens(simbolo: Simbolo): Token[] {
  const salida: Token[] = [{ fnc1: true }]
  simbolo.forEach((e, i) => {
    for (const c of e.ai + e.valor) salida.push({ car: c })
    if (llevaSeparador(simbolo, i)) salida.push({ fnc1: true })
  })
  return salida
}

const esDigito = (t: Token | undefined): boolean => t !== undefined && 'car' in t && t.car >= '0' && t.car <= '9'

/**
 * Minimo de caracteres de simbolo para los datos (sin inicio, control ni parada), empezando en
 * el juego B o C, lo que salga mas corto. Juego A no aporta nada con CSET 82 (sin control).
 */
export function caracteresDeSimbolo(simbolo: Simbolo): number {
  const t = tokens(simbolo)
  const n = t.length
  // costo[i][j]: minimo para codificar t[i..] estando en el juego j (0 = B, 1 = C).
  const costo: [number, number][] = Array.from({ length: n + 1 }, () => [0, 0])
  for (let i = n - 1; i >= 0; i--) {
    const actual = t[i]!
    // En B: cualquier caracter o FNC1 cuesta 1; o cambiar a C (1) y seguir desde C.
    const enB = 1 + costo[i + 1]![0]
    // En C: dos cifras o un FNC1 cuestan 1; o cambiar a B.
    let enC = Number.POSITIVE_INFINITY
    if ('fnc1' in actual) enC = 1 + costo[i + 1]![1]
    else if (esDigito(actual) && esDigito(t[i + 1])) enC = 1 + costo[i + 2]![1]
    costo[i] = [Math.min(enB, 1 + enC), Math.min(enC, 1 + enB)]
  }
  return Math.min(costo[0]![0], costo[0]![1])
}

/** Modulos del simbolo completo, SIN zonas en blanco. */
export function modulosGs1128(simbolo: Simbolo): number {
  // inicio + datos (ya incluye el FNC1 inicial) + control, a 11 modulos; parada a 13.
  return 11 * (1 + caracteresDeSimbolo(simbolo) + 1) + 13
}

/** Zona en blanco minima a cada lado de un GS1-128: 10X (GenSpecs §5.4.4.2). */
export const ZONA_BLANCA_MODULOS = 10
