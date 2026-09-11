/**
 * Campos por patron sobre TEXTO exacto: lo que convierte la capa 0 en datos sin llamar al motor.
 *
 * La capa 0 devuelve el texto de un PDF generado por software, y ese texto es exacto: no hay
 * lectura que revisar. Pero texto no es campos. Convertirlo en campos con un modelo seria pagar
 * una llamada —y meter una estimacion— donde no hace falta ninguna: un RFC tiene forma fija, un
 * UUID tambien, y un importe etiquetado se reconoce con una expresion.
 *
 * Los patrones los pone el PROYECTO, no esta herramienta: aqui no se sabe si el corpus es de
 * facturas mexicanas o de albaranes. Lo que sale lleva `procedencia: 'codigo'`, que es
 * determinista, y por eso la barrera de revision le exige cotejo antes de auto-validarse.
 */
import type { CampoExtraido, FormatoDeCampo, Procedencia } from './tipos.js'

export interface Patron {
  readonly clave: string
  /** Con bandera `g` se toman TODAS las apariciones distintas; sin ella, la primera. El grupo 1, si lo hay. */
  readonly expresion: RegExp
  readonly formato?: FormatoDeCampo
}

function valoresDe(texto: string, patron: Patron): string[] {
  const expresion = new RegExp(patron.expresion.source, patron.expresion.flags.replace('g', '') + 'g')
  const salida: string[] = []
  for (const encontrado of texto.matchAll(expresion)) {
    const valor = (encontrado[1] ?? encontrado[0]).trim()
    if (valor.length > 0 && !salida.includes(valor)) salida.push(valor)
    if (!patron.expresion.global) break
  }
  return salida
}

export interface OrigenDelTexto {
  readonly procedencia: Procedencia
  /** Lo que se sabe del texto de partida. Para texto exacto, 1. Para una transcripcion de OCR sin confianza declarada, 0: la minima, y todo pasa por revision. */
  readonly confianza: number
}

const TEXTO_EXACTO: OrigenDelTexto = { procedencia: 'codigo', confianza: 1 }

/**
 * Aplica los patrones al texto. Un patron que no casa no produce campo: un campo ausente se ve, y
 * un campo vacio con confianza 1 pasaria por dato.
 *
 * `origen` dice de donde viene el texto. Por defecto es exacto (capa 0, `codigo`, confianza 1).
 * Sobre una transcripcion de OCR va `{ procedencia: 'ocr', confianza: 0 }`: el patron es
 * determinista, pero el texto no lo es, y un campo asi no se auto-valida nunca.
 */
export function camposPorPatron(texto: string, patrones: readonly Patron[], origen: OrigenDelTexto = TEXTO_EXACTO): CampoExtraido[] {
  const salida: CampoExtraido[] = []
  for (const patron of patrones) {
    for (const valor of valoresDe(texto, patron)) {
      const campo: CampoExtraido = { clave: patron.clave, valor, confianza: origen.confianza, procedencia: origen.procedencia }
      if (patron.formato !== undefined) campo.formato = patron.formato
      salida.push(campo)
    }
  }
  return salida
}
