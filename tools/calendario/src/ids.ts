/**
 * Ids deterministas a partir de una clave de idempotencia, validos para Google (base32hex: a-v y 0-9,
 * de 5 a 1024 caracteres). Mismo pedido → mismo id → el reintento choca con un 409 en vez de duplicar.
 * Sin `node:crypto`: el nucleo corre igual en el navegador.
 */
function mezcla53(texto: string, semilla: number): number {
  let h1 = 0xdeadbeef ^ semilla
  let h2 = 0x41c6ce57 ^ semilla
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

export function idDesdeClave(clave: string): string {
  const a = mezcla53(clave, 1).toString(32).padStart(11, '0')
  const b = mezcla53(clave, 2).toString(32).padStart(11, '0')
  return `cal${a}${b}`
}

let contador = 0
/** Una clave nueva para quien no trae la suya (una persona que pulsa «guardar»). */
export function claveNueva(prefijo = 'op'): string {
  contador = (contador + 1) % 1_000_000
  const azar = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  return `${prefijo}:${azar}:${contador}`
}
