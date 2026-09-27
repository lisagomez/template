/**
 * Digitos verificadores GS1 (GenSpecs §7.9): modulo 10 con pesos 3-1 alternados desde la
 * derecha. El mismo algoritmo vale para GTIN-8/12/13/14, SSCC, GLN, GSRN...
 */

/** Digito que corresponde a `cuerpo` (la clave SIN su digito). */
export function digitoVerificador(cuerpo: string): number {
  if (!/^\d+$/.test(cuerpo)) throw new Error('el cuerpo de una clave GS1 son solo digitos')
  let suma = 0
  for (let i = 0; i < cuerpo.length; i++) {
    const d = cuerpo.charCodeAt(cuerpo.length - 1 - i) - 48
    suma += d * (i % 2 === 0 ? 3 : 1)
  }
  return (10 - (suma % 10)) % 10
}

/** ¿La clave completa (con su digito al final) cuadra? */
export function digitoCorrecto(clave: string): boolean {
  if (!/^\d{2,}$/.test(clave)) return false
  return digitoVerificador(clave.slice(0, -1)) === Number(clave.at(-1))
}

/** La misma clave con el ultimo digito recalculado. */
export function corrigeDigito(clave: string): string {
  return clave.slice(0, -1) + String(digitoVerificador(clave.slice(0, -1)))
}

/** Completa con su digito un cuerpo de 13 (GTIN-14) o 17 (SSCC) cifras. */
export function completaClave(cuerpo: string): string {
  return cuerpo + String(digitoVerificador(cuerpo))
}

/**
 * Normaliza un GTIN a 14 cifras. GTIN-8/12/13 se rellenan con ceros a la izquierda (GenSpecs
 * §3.3.2): es la forma canonica, y es tambien la que sobrevive a Excel cuando se come los ceros.
 */
export function normalizaGtin(texto: string): string | undefined {
  const d = texto.replace(/[\s-]/g, '')
  if (!/^\d{8}$|^\d{12,14}$/.test(d)) return undefined
  return d.padStart(14, '0')
}

/**
 * Pares de pesos del "check character" alfanumerico (GenSpecs §7.9.5), usado por GMN (8013)
 * y MUDI (8014). Se incluye para no dar por buenas claves ajenas sin comprobar.
 */
const CSET82 = '!"%&\'()*+,-./0123456789:;<=>?ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz'
const CSET32 = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const PRIMOS = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83]

export function parDeControlCorrecto(valor: string): boolean {
  if (valor.length === 2) return valor === '22'
  if (valor.length < 2) return false
  const cuerpo = valor.slice(0, -2)
  let suma = 0
  for (let i = 0; i < cuerpo.length; i++) {
    const v = CSET82.indexOf(cuerpo[cuerpo.length - 1 - i] ?? '')
    const peso = PRIMOS[i]
    if (v < 0 || peso === undefined) return false
    suma += v * peso
  }
  suma %= 1021
  return valor.slice(-2) === (CSET32[suma >> 5] ?? '') + (CSET32[suma & 31] ?? '')
}
