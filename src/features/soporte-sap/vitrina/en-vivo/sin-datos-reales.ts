/**
 * En vivo solo van datos sintéticos. Un invitado podría escribir el ticket real de un cliente suyo; el texto que tiene
 * forma de dato personal se rechaza antes de cruzar el túnel (en Vercel) y otra vez antes de llegar al laboratorio (en
 * el portero). La forma la reconoce el mismo anonimizador del producto: nombre en contexto, correo, teléfono, RFC, CURP,
 * NSS, CLABE, y lo que deja con forma de dato. El tema solo (un caso de nómina) no se rechaza: no es un dato.
 *
 * No es «cero datos reales»: un dato sin forma (el nombre de una empresa, lo que hace su negocio) pasa. Eso se declara.
 */
import { anonimiza, SENALES } from '../../../../../tools/soporte-sap/dist/index.js'
import { validaRfc, validaCurp, validaNss } from '../../../../../tools/extractor-documental/dist/index.js'

const VALIDADORES = { rfc: (x: string) => validaRfc(x), curp: validaCurp, nss: validaNss }
/** Los campos de texto libre de las acciones del laboratorio (y de `levanta`, el alta con muestras). */
const CAMPOS = ['titulo', 'descripcion', 'texto', 'pide', 'motivo'] as const

function textosDe(accion: unknown): string[] {
  if (typeof accion !== 'object' || accion === null) return []
  const o = accion as Record<string, unknown>
  const propios = CAMPOS.map((c) => o[c]).filter((x): x is string => typeof x === 'string')
  return 'levanta' in o ? [...propios, ...textosDe(o['levanta'])] : propios
}

/** El motivo para rechazar la acción, o `null` si su texto no tiene forma de dato personal. */
export function datoRealEn(accion: unknown): string | null {
  for (const t of textosDe(accion)) {
    const a = anonimiza(t, VALIDADORES)
    const formas = [...Object.keys(a.reemplazos).map((k) => k.toLowerCase().replace(/_/g, ' ')), ...a.senales.filter((s) => s !== SENALES.personal).map(() => 'algo con forma de dato')]
    if (formas.length) return `En vivo solo van datos sintéticos, y este texto tiene forma de dato personal (${[...new Set(formas)].join(', ')}). Escríbelo sin él.`
  }
  return null
}
