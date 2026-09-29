/**
 * Los codigos que TRAE el proveedor, no los que imprime la casa: EAN-13, UPC-A, EAN-8 e ITF-14
 * (el DUN-14 del corrugado), con o sin identificador de simbologia, y GS1 Digital Link.
 *
 * Identificadores (ISO/IEC 15424): `]E0` EAN-13 (y UPC-A, que viaja como EAN-13 con un 0
 * delante), `]E3` EAN con suplemento, `]E4` EAN-8, `]I0`/`]I1` ITF. `]C1`, `]e0`, `]d2` y `]Q3`
 * son GS1 y los lee `parseaLectura`. `]C0`, `]d1` y `]Q1` son Code 128, DataMatrix y QR SIN
 * GS1: solo valen si llevan un Digital Link; si no, son de otra cosa (un folio interno, un QR de
 * publicidad) y se dice, en lugar de adivinar un producto.
 *
 * Sin identificador (la mayoria de las pistolas de fabrica), unas cifras sueltas de 8, 12, 13
 * o 14 con su digito correcto son un GTIN. Un GS1-128 sin `]C1` que midiera exactamente eso se
 * leeria como GTIN: por eso la pistola debe mandar el identificador (ver README).
 *
 * Digital Link (GS1 Digital Link Standard 1.4, forma SIN comprimir): la clave va en la ruta
 * (`/01/<gtin>`), los calificadores tambien (`/10/<lote>`, `/21/<serie>`, `/22/<variante>`), y
 * los atributos en la consulta (`?17=AAMMDD`). El dominio no importa: puede ser id.gs1.org o el
 * de la marca. La forma comprimida no se lee (se dice).
 */
import { digitoCorrecto } from './digito.js'
import type { Elemento } from './elementos.js'

export type FormatoCodigo = 'ean-13' | 'upc-a' | 'ean-8' | 'itf-14' | 'digital-link'

export interface CodigoDeProducto {
  readonly elementos: readonly Elemento[]
  readonly formato: FormatoCodigo
  /** El identificador de simbologia, si vino. */
  readonly simbologia?: string
}

export interface CodigoAjeno {
  readonly ajeno: true
  readonly motivo: string
}

const SIMBOLOGIA_EAN = /^\]E[0-4]/
const SIMBOLOGIA_ITF = /^\]I[0-3]/
const SIMBOLOGIA_SIN_GS1 = /^\](C0|d1|Q[0-2]|A[0-9])/

/** Un GTIN bien formado (8, 12, 13 o 14 cifras con su digito) a GTIN-14, con su formato. */
function gtinDe(cifras: string, pista?: FormatoCodigo): { gtin: string; formato: FormatoCodigo } | undefined {
  if (!/^(\d{8}|\d{12,14})$/.test(cifras) || !digitoCorrecto(cifras)) return undefined
  const formato: FormatoCodigo = pista ?? (cifras.length === 8 ? 'ean-8' : cifras.length === 12 ? 'upc-a' : cifras.length === 13 ? 'ean-13' : 'itf-14')
  return { gtin: cifras.padStart(14, '0'), formato }
}

/** EAN/UPC con `]E0`..`]E4`: el suplemento de 2 o 5 cifras (`]E3`) no es parte del GTIN. */
function leeEan(simbologia: string, datos: string): CodigoDeProducto | CodigoAjeno {
  const base = simbologia === ']E4' ? datos.slice(0, 8) : simbologia === ']E3' ? datos.slice(0, 13) : datos
  const upc = base.length === 12 || (base.length === 13 && base.startsWith('0'))
  const g = gtinDe(base, simbologia === ']E4' ? 'ean-8' : upc ? 'upc-a' : 'ean-13')
  if (!g) return { ajeno: true, motivo: `el EAN/UPC «${datos}» no trae un GTIN válido (largo o dígito verificador)` }
  return { elementos: [{ ai: '01', valor: g.gtin }], formato: g.formato, simbologia }
}

/** La ruta de un Digital Link sin comprimir, en pares (AI, valor). */
function paresDeRuta(ruta: string): [string, string][] | undefined {
  const partes = ruta.split('/').filter(Boolean).map((p) => decodeURIComponent(p))
  const i = partes.findIndex((p) => p === '01' || p === 'gtin')
  if (i < 0 || (partes.length - i) % 2 !== 0) return undefined
  const pares: [string, string][] = []
  for (let k = i; k < partes.length; k += 2) pares.push([partes[k] === 'gtin' ? '01' : partes[k]!, partes[k + 1]!])
  return pares
}

const AIS_DE_DIGITAL_LINK = new Set(['01', '10', '15', '17', '21', '22'])

/** Un URL: GS1 Digital Link si su ruta lleva `/01/<gtin>`; cualquier otro enlace es ajeno. */
export function leeDigitalLink(texto: string, simbologia?: string): CodigoDeProducto | CodigoAjeno {
  let url: URL
  try { url = new URL(texto) } catch { return { ajeno: true, motivo: 'no es un enlace válido' } }
  let pares: [string, string][] | undefined
  try { pares = paresDeRuta(url.pathname) } catch { pares = undefined }
  if (!pares) return { ajeno: true, motivo: `un enlace que no es GS1 Digital Link (${url.hostname}): parece publicidad, no identifica un producto` }
  for (const [ai, valor] of url.searchParams) if (/^\d{2,4}$/.test(ai)) pares.push([ai, valor])
  const clave = pares[0]![1]
  const g = /^\d+$/.test(clave) ? gtinDe(clave) : undefined
  if (!g) return { ajeno: true, motivo: 'el Digital Link no trae un GTIN válido' }
  const elementos: Elemento[] = [{ ai: '01', valor: g.gtin }]
  for (const [ai, valor] of pares.slice(1)) {
    if (!AIS_DE_DIGITAL_LINK.has(ai)) continue
    if ((ai === '17' || ai === '15') && !/^\d{6}$/.test(valor)) return { ajeno: true, motivo: `la fecha (${ai}) del Digital Link no es AAMMDD` }
    if ((ai === '10' || ai === '21' || ai === '22') && (valor.length === 0 || valor.length > 20)) return { ajeno: true, motivo: `el dato (${ai}) del Digital Link mide ${valor.length}` }
    elementos.push({ ai, valor })
  }
  return { elementos, formato: 'digital-link', ...(simbologia ? { simbologia } : {}) }
}

/**
 * ¿Es un codigo de producto del proveedor (y no un GS1-128/DataMatrix que ya sabe leer el parser)?
 * `undefined` = no tiene esa forma: que lo intente el parser GS1.
 */
export function leeCodigoDeProducto(texto: string): CodigoDeProducto | CodigoAjeno | undefined {
  const s = texto.trim()
  const id = /^\][A-Za-z][0-9A-Za-z]/.exec(s)?.[0]
  const datos = id ? s.slice(3) : s
  if (id && SIMBOLOGIA_EAN.test(id)) return leeEan(id, datos)
  if (id && SIMBOLOGIA_ITF.test(id)) {
    const g = gtinDe(datos, 'itf-14')
    return g && datos.length === 14 ? { elementos: [{ ai: '01', valor: g.gtin }], formato: 'itf-14', simbologia: id } : { ajeno: true, motivo: `el ITF «${datos}» no es un ITF-14 con GTIN válido` }
  }
  if (/^https?:\/\//i.test(datos)) return leeDigitalLink(datos, id)
  if (id && SIMBOLOGIA_SIN_GS1.test(id)) return { ajeno: true, motivo: `un código ${id} sin datos GS1: no identifica un producto de la casa ni del proveedor` }
  if (id) return undefined
  const g = gtinDe(datos)
  return g ? { elementos: [{ ai: '01', valor: g.gtin }], formato: g.formato } : undefined
}

export const esAjeno = (x: CodigoDeProducto | CodigoAjeno): x is CodigoAjeno => 'ajeno' in x

/** Parece un EAN/UPC (solo cifras de ese largo) aunque su digito no cuadre: para explicar el error. */
export const pareceGtinSinDigito = (texto: string): boolean => /^(\d{8}|\d{12,14})$/.test(texto.trim())

/** Nombre legible del formato, para la pantalla. */
export const TEXTO_FORMATO: Readonly<Record<FormatoCodigo, string>> = {
  'ean-13': 'EAN-13', 'upc-a': 'UPC-A', 'ean-8': 'EAN-8', 'itf-14': 'ITF-14 (DUN-14 del corrugado)', 'digital-link': 'GS1 Digital Link',
}
