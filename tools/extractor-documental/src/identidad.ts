/**
 * Identidad de un documento, derivada de SU CONTENIDO.
 *
 * Con un contador autoincremental, el primer reintento de un lote a medio fallar duplica el
 * archivo, y se descubre tres meses despues con los datos ya cruzados. Con el hash del contenido,
 * reprocesar es idempotente y el mismo documento subido dos veces se detecta sin volver a pagarlo.
 *
 * Usa Web Crypto (`globalThis.crypto.subtle`), que existe igual en Node 22 y en el navegador. Es
 * lo que mantiene el nucleo con cero dependencias y ejecutable en los dos sitios.
 */
import type { ClaseDeFuente } from './tipos.js'

function aHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * SHA-256 del contenido, en hexadecimal.
 *
 * Sirve tal cual como `custom_id` de un lote: la API de OCR lo devuelve en la respuesta y permite
 * reintentar por documento en vez de relanzar el lote entero.
 */
export async function identidadDe(contenido: Uint8Array): Promise<string> {
  const cripto = globalThis.crypto
  if (!cripto?.subtle) {
    throw new Error('No hay Web Crypto disponible: se necesita Node >= 22 o un navegador moderno')
  }
  // `slice()` normaliza el respaldo del array: una vista sobre un buffer mayor produciria otro hash.
  const digest = await cripto.subtle.digest('SHA-256', contenido.slice())
  return aHex(digest)
}

/** Dos contenidos identicos tienen la misma identidad. Es la propiedad entera de este modulo. */
export async function esElMismoDocumento(a: Uint8Array, b: Uint8Array): Promise<boolean> {
  const [ha, hb] = await Promise.all([identidadDe(a), identidadDe(b)])
  return ha === hb
}

/**
 * Identidad de una LECTURA, que no es lo mismo que la de un documento.
 *
 * `identidadDe()` hashea el contenido y deduplica: correcto para una factura. Aplicado a una
 * lectura de trazabilidad seria catastrofico — escanear la misma guia de FedEx dos veces son
 * legitimamente DOS eventos (salida de almacen y llegada), y deduplicar por el codigo
 * **descartaria el segundo en silencio**. Perder un evento es exactamente lo que vuelve inutil un
 * sistema de trazabilidad, y no da ningun error.
 *
 * Por eso la identidad depende de la CLASE de fuente y no del contenido a secas.
 */
export interface LecturaDeCodigo {
  clase: ClaseDeFuente
  /** La carga decodificada tal cual vino. */
  carga: string
  /**
   * Instante del escaneo **en el dispositivo**, no el de la sincronizacion.
   *
   * Sellar al llegar al servidor desplaza toda la trazabilidad, y ademas hace COLAPSAR esta
   * identidad: varios eventos encolados sin conexion y sincronizados a la vez compartirian
   * instante y se deduplicarian entre si. Se sella al escanear (§2.13 del SDD).
   */
  instanteDispositivo: string
  /** Puesto, terminal o ubicacion donde se escaneo. Parte de la identidad de un evento. */
  puesto?: string
  /** Para `etiqueta`: lo que la hace unica. GTIN + lote + serie. */
  claves?: Readonly<Record<string, string>>
}

function claveDeEtiqueta(lectura: LecturaDeCodigo): string {
  const claves = lectura.claves ?? {}
  const partes = Object.keys(claves)
    .sort()
    .map((k) => `${k}=${claves[k]}`)
  // Sin claves declaradas se cae a la carga entera: es menos preciso, pero nunca inventa unicidad.
  return partes.length > 0 ? partes.join('|') : lectura.carga
}

/**
 * Identidad de una lectura segun su clase:
 *
 *   documento → la carga (equivale a deduplicar por contenido)
 *   etiqueta  → GTIN + lote + serie: dos cajas del mismo lote y serie son la misma caja
 *   evento    → carga + instante + puesto: **nunca deduplica por el codigo solo**
 */
export async function identidadDeLectura(lectura: LecturaDeCodigo): Promise<string> {
  const material =
    lectura.clase === 'documento'
      ? `documento|${lectura.carga}`
      : lectura.clase === 'etiqueta'
        ? `etiqueta|${claveDeEtiqueta(lectura)}`
        : `evento|${lectura.carga}|${lectura.instanteDispositivo}|${lectura.puesto ?? ''}`
  return identidadDe(new TextEncoder().encode(material))
}
