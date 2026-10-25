/**
 * El filtro de la mesa: en el laboratorio solo van datos sintéticos, y el experto escribe SUS casos. Todo texto de una
 * acción, a cualquier profundidad, pasa por el anonimizador del producto ANTES de llegar al laboratorio y antes de
 * guardarse; si algo tiene forma de dato personal (nombre en contexto, correo, teléfono, RFC, CURP, NSS, CLABE…), la
 * acción se rechaza con el motivo, sin repetir el dato. No es una lista de campos: un campo nuevo no se escapa por no
 * estar en ella (lo que el portero de la vitrina sí hace, con su lista fija).
 *
 * No es «cero datos reales»: un dato sin forma (el nombre de una empresa, lo que hace su negocio) pasa. Se declara.
 */
import { anonimiza, SENALES } from '../../../../../tools/soporte-sap/dist/index.js'
import { validaRfc, validaCurp, validaNss } from '../../../../../tools/extractor-documental/dist/index.js'

const VALIDADORES = { rfc: (x: string) => validaRfc(x), curp: validaCurp, nss: validaNss }
const PROFUNDIDAD = 8

/** Todos los textos de un valor: cadenas sueltas, en listas y en objetos, sin mirar cómo se llama el campo. */
export function textosDe(x: unknown, profundidad = 0): string[] {
  if (typeof x === 'string') return [x]
  if (profundidad > PROFUNDIDAD || typeof x !== 'object' || x === null) return []
  return Object.values(x).flatMap((v) => textosDe(v, profundidad + 1))
}

/** La forma de dato personal de un texto, en palabras (nunca el dato), o lista vacía. */
export function formasEn(texto: string): string[] {
  const a = anonimiza(texto, VALIDADORES)
  // Las señales son frases fijas del anonimizador (la cuarentena dice tipos de señal, nunca el dato): se pueden mostrar.
  const formas = [...Object.keys(a.reemplazos).map((k) => k.toLowerCase().replace(/[_\d]+/g, ' ').trim()), ...a.senales.filter((s) => s !== SENALES.personal)]
  return [...new Set(formas)]
}

/** El motivo para rechazar la acción, o `null` si ningún texto suyo tiene forma de dato personal. */
export function datoPersonalEn(accion: unknown): string | null {
  const formas = [...new Set(textosDe(accion).flatMap(formasEn))]
  return formas.length ? `En la mesa solo van datos sintéticos, y tu texto tiene forma de dato personal (${formas.join('; ')}). Escríbelo sin él: describe el caso, no a las personas ni a la empresa; si es un número de documento, abrévialo (por ejemplo, 4500…).` : null
}

/** Para la pantalla: qué campo tiene forma de dato, antes de enviar. */
export function revisaCampos(campos: Readonly<Record<string, unknown>>): Record<string, string[]> {
  const r: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(campos)) {
    const formas = [...new Set(textosDe(v).flatMap(formasEn))]
    if (formas.length) r[k] = formas
  }
  return r
}
