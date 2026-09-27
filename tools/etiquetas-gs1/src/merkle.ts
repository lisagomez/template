/**
 * Arbol de Merkle de RFC 6962 / RFC 9162 §2.1: hoja = SHA-256(0x00 || d), nodo =
 * SHA-256(0x01 || izq || der), y la separacion de dominio es la que da resistencia a segunda
 * preimagen. Se implementa tal cual el texto: MTH, PATH (prueba de inclusion) y el algoritmo de
 * verificacion de §2.1.3.2.
 *
 * Aqui cada hoja es el hash de 32 bytes de un evento: la raiz del dia compromete TODOS los eventos
 * de ese periodo, y una prueba de inclusion demuestra que un evento de un lote estaba en la raiz
 * sin revelar los demas.
 */
import { sha256 } from './sha256.js'

const une = (...partes: Uint8Array[]): Uint8Array => {
  const r = new Uint8Array(partes.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of partes) { r.set(p, o); o += p.length }
  return r
}
const HOJA = new Uint8Array([0x00])
const NODO = new Uint8Array([0x01])

export const hashHoja = (d: Uint8Array): Uint8Array => sha256(une(HOJA, d))
export const hashNodo = (izq: Uint8Array, der: Uint8Array): Uint8Array => sha256(une(NODO, izq, der))

/** La mayor potencia de dos estrictamente menor que n (n > 1). */
function corte(n: number): number {
  let k = 1
  while (k * 2 < n) k *= 2
  return k
}

/** MTH(D_n). La lista vacia da SHA-256 de la cadena vacia. */
export function raizMerkle(hojas: readonly Uint8Array[]): Uint8Array {
  if (hojas.length === 0) return sha256(new Uint8Array(0))
  if (hojas.length === 1) return hashHoja(hojas[0]!)
  const k = corte(hojas.length)
  return hashNodo(raizMerkle(hojas.slice(0, k)), raizMerkle(hojas.slice(k)))
}

/** PATH(m, D_n): los nodos que faltan para subir de la hoja m a la raiz. */
export function pruebaInclusion(m: number, hojas: readonly Uint8Array[]): Uint8Array[] {
  if (m < 0 || m >= hojas.length) throw new Error('indice fuera del arbol')
  if (hojas.length === 1) return []
  const k = corte(hojas.length)
  return m < k
    ? [...pruebaInclusion(m, hojas.slice(0, k)), raizMerkle(hojas.slice(k))]
    : [...pruebaInclusion(m - k, hojas.slice(k)), raizMerkle(hojas.slice(0, k))]
}

/** RFC 9162 §2.1.3.2, paso por paso. `hoja` es el dato de la hoja (se le aplica hashHoja). */
export function verificaInclusion(hoja: Uint8Array, indice: number, tamano: number, ruta: readonly Uint8Array[], raiz: Uint8Array): boolean {
  if (indice >= tamano || indice < 0) return false
  let fn = indice
  let sn = tamano - 1
  let r = hashHoja(hoja)
  for (const p of ruta) {
    if (sn === 0) return false
    if ((fn & 1) === 1 || fn === sn) {
      r = hashNodo(p, r)
      if ((fn & 1) === 0) while ((fn & 1) === 0 && fn !== 0) { fn >>= 1; sn >>= 1 }
    } else {
      r = hashNodo(r, p)
    }
    fn >>= 1
    sn >>= 1
  }
  return sn === 0 && r.length === raiz.length && r.every((b, i) => b === raiz[i])
}
