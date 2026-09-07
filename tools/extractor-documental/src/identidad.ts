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
