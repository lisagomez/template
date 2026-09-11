/**
 * La segunda lectura: cotejar los campos que devolvio el motor contra SU PROPIA transcripcion.
 *
 * PARA QUE. Un escaneo no trae una segunda fuente —ni XML ni codigo impreso— contra la que
 * corroborar. Y un modelo de vision al que se le piden veinticinco campos devuelve veinticinco,
 * existan o no en el papel: rellenar le cuesta menos que admitir un hueco. Medido el 2026-09-10
 * sobre un escaneo real: 24 de 25 valores estaban en la transcripcion y el que faltaba era una
 * recomposicion del modelo, no una lectura.
 *
 * La tecnica (SDD §5.2.1): al motor se le pide la transcripcion completa Y los campos. Un campo
 * cuyo valor no aparece en la transcripcion no lo leyo del documento: lo compuso. Ese campo no
 * entra al resultado: va a la cola humana, con nombre y motivo.
 *
 * No sustituye a la corroboracion con una segunda fuente cuando la hay. La complementa donde no
 * la hay, que es en la mayoria de los escaneos.
 */
import type { CampoExtraido, PaginaExtraida } from './tipos.js'
import { normaliza } from './reconciliacion.js'

export interface CotejoDeTranscripcion {
  /** Su valor esta en la transcripcion: se leyo del documento. */
  readonly coinciden: readonly CampoExtraido[]
  /** Su valor NO esta en la transcripcion: van a revision humana, no al resultado. */
  readonly noCoinciden: readonly CampoExtraido[]
  /** Sin transcripcion no hay contra que cotejar. Se dice, y entonces NADA coincide. */
  readonly sinTranscripcion: boolean
}

/**
 * Huella comparable de un valor o de un texto: sin acentos, sin mayusculas, sin puntuacion ni
 * espacios. Un importe se reduce a sus digitos, porque «1,160.00» y «1160.00» son el mismo numero
 * escrito por dos manos.
 */
export function huella(texto: string): string {
  const base = normaliza(texto).replace(/\s+/g, '')
  return /^-?[\d.,]+$/.test(texto.trim()) ? base.replace(/\D/g, '') : base
}

export function cotejaContraTranscripcion(paginas: readonly PaginaExtraida[]): CotejoDeTranscripcion {
  const transcripcion = huella(paginas.map((p) => p.markdown).join('\n'))
  const campos = paginas.flatMap((p) => p.campos)
  if (transcripcion.length === 0) return { coinciden: [], noCoinciden: campos, sinTranscripcion: true }
  const coinciden: CampoExtraido[] = []
  const noCoinciden: CampoExtraido[] = []
  for (const campo of campos) {
    const valor = huella(campo.valor)
    // Un valor vacio no se puede haber leido de ningun sitio.
    if (valor.length > 0 && transcripcion.includes(valor)) coinciden.push(campo)
    else noCoinciden.push(campo)
  }
  return { coinciden, noCoinciden, sinTranscripcion: false }
}
