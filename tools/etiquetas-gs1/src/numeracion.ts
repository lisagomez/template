/**
 * Emision de numeros: GTIN de marca propia, codigos internos de circulacion restringida y SSCC.
 *
 * Tres reglas que no se negocian:
 * - **Nunca un prefijo ajeno.** Lo propio se numera SOLO con el prefijo de empresa configurado
 *   (el GCP que GS1 Mexico asigno a la casa, parametro de instalacion). Sin prefijo, no hay
 *   marca propia: error, no un numero inventado.
 * - **Nunca se reusa un numero.** Los contadores solo avanzan, y ademas se salta todo lo que ya
 *   este en `emitidos` (lo que llego en un archivo con nuestro prefijo tambien cuenta).
 * - **Se respeta la capacidad.** Un GCP de 7 cifras da 99 999 GTIN-13; al agotarse, se dice.
 */
import { completaClave, digitoVerificador } from './digito.js'
import { clasificaPrefijo } from './prefijos.js'

export interface ProblemaPrefijo {
  readonly mensaje: string
}

/** Valida el GCP de instalacion. GS1 Mexico asigna prefijos de 7 a 10 cifras que empiezan por 750-759. */
export function revisaPrefijoEmpresa(gcp: string): { ok: true; avisos: string[] } | { ok: false; mensaje: string } {
  if (!/^\d{6,12}$/.test(gcp)) return { ok: false, mensaje: 'El prefijo de empresa GS1 son de 6 a 12 cifras (el que viene en el certificado de GS1 México).' }
  const clase = clasificaPrefijo('0' + gcp.padEnd(13, '0')).clase
  if (clase === 'restringido-empresa' || clase === 'restringido-region') return { ok: false, mensaje: 'Ese prefijo es de circulación restringida, no un prefijo de empresa.' }
  const avisos: string[] = []
  if (clase === 'demostracion') avisos.push('Prefijo 952 de demostración: sirve para probar, nunca para etiquetas reales.')
  else if (!/^75[0-9]/.test(gcp)) avisos.push('No empieza por 750-759 (México). Si es de otro país, confirma que sea el de la casa: nunca se numera con un prefijo ajeno.')
  return { ok: true, avisos }
}

export function capacidadGtin13(gcp: string): number {
  return 10 ** (12 - gcp.length) - 1
}

export interface Emision {
  readonly numero: string
  readonly siguiente: number
}

type Resultado = Emision | { readonly error: string }

function emite(prefijo: string, cifras: number, desde: number, usados: ReadonlySet<string>, arma: (cuerpo: string) => string): Resultado {
  const limite = 10 ** cifras
  for (let n = Math.max(1, desde); n < limite; n++) {
    const numero = arma(prefijo + String(n).padStart(cifras, '0'))
    if (!usados.has(numero)) return { numero, siguiente: n + 1 }
  }
  return { error: `se agotó la capacidad del prefijo ${prefijo} (${limite - 1} números)` }
}

const gtin14DeCuerpo12 = (cuerpo12: string): string => '0' + completaClave(cuerpo12)

/** GTIN-13 de marca propia (se devuelve en 14 cifras, con 0 delante). */
export function emitePropio(gcp: string, desde: number, usados: ReadonlySet<string>): Resultado {
  const r = revisaPrefijoEmpresa(gcp)
  if (!r.ok) return { error: r.mensaje }
  return emite(gcp, 12 - gcp.length, desde, usados, gtin14DeCuerpo12)
}

/** Codigo interno de circulacion restringida: GTIN-13 con el prefijo 04 (o 02/20-29). */
export function emiteInterno(prefijoInterno: string, desde: number, usados: ReadonlySet<string>): Resultado {
  if (!/^(04|02|2\d)$/.test(prefijoInterno)) return { error: 'el prefijo interno debe ser 04, 02 o 20-29' }
  return emite(prefijoInterno, 10, desde, usados, gtin14DeCuerpo12)
}

/** SSCC: extension + GCP + referencia seriada + digito = 18 cifras. */
export function emiteSscc(gcp: string, extension: number, desde: number, usados: ReadonlySet<string>): Resultado {
  const r = revisaPrefijoEmpresa(gcp)
  if (!r.ok) return { error: r.mensaje }
  if (!Number.isInteger(extension) || extension < 0 || extension > 9) return { error: 'el dígito de extensión del SSCC va de 0 a 9' }
  return emite(String(extension) + gcp, 16 - gcp.length, desde, usados, completaClave)
}

/**
 * GTIN-14 de la caja a partir del GTIN-13 de la pieza: indicador 1-8 + las 12 cifras + digito.
 * Solo lo puede hacer el DUEÑO de la marca (por eso solo se usa con marca propia).
 */
export function derivaCaja(gtinUnidad14: string, usados: ReadonlySet<string>): string | undefined {
  const base = gtinUnidad14.slice(1, 13)
  for (let indicador = 1; indicador <= 8; indicador++) {
    const cuerpo = String(indicador) + base
    const gtin = cuerpo + String(digitoVerificador(cuerpo))
    if (!usados.has(gtin)) return gtin
  }
  return undefined
}

export function esEmision(r: Resultado): r is Emision {
  return 'numero' in r
}
