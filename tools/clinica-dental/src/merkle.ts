/**
 * Arbol de Merkle de RFC 6962 / RFC 9162 §2.1, el de la casa (`tools/etiquetas-gs1/src/merkle.ts`):
 * hoja = SHA-256(0x00 || d), nodo = SHA-256(0x01 || izq || der); la separacion de dominio da resistencia a
 * segunda preimagen. Aqui cada hoja es el hash de 32 bytes de un eslabon del libro.
 */
import { createHash } from 'node:crypto';

const sha256 = (...partes: Uint8Array[]): Uint8Array => {
  const h = createHash('sha256');
  for (const p of partes) h.update(p);
  return new Uint8Array(h.digest());
};
const HOJA = new Uint8Array([0x00]);
const NODO = new Uint8Array([0x01]);

export const hashHoja = (d: Uint8Array): Uint8Array => sha256(HOJA, d);
export const hashNodo = (izq: Uint8Array, der: Uint8Array): Uint8Array => sha256(NODO, izq, der);

/** La mayor potencia de dos estrictamente menor que n (n > 1). */
function corte(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

/** MTH(D_n). La lista vacia da SHA-256 de la cadena vacia. */
export function raizMerkle(hojas: readonly Uint8Array[]): Uint8Array {
  if (hojas.length === 0) return sha256(new Uint8Array(0));
  if (hojas.length === 1) return hashHoja(hojas[0]!);
  const k = corte(hojas.length);
  return hashNodo(raizMerkle(hojas.slice(0, k)), raizMerkle(hojas.slice(k)));
}

export const deHex = (h: string): Uint8Array => new Uint8Array(Buffer.from(h, 'hex'));
export const aHex = (b: Uint8Array): string => Buffer.from(b).toString('hex');
export const raizDeHashes = (hashes: readonly string[]): string => aHex(raizMerkle(hashes.map(deHex)));
