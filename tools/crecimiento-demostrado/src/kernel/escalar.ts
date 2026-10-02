/**
 * Aritmética exacta del kernel: racionales con BigInt. Ni un flotante decide un veredicto.
 */
import type { Valor } from '../motor/evalua.js';

export type Unidad = 'centavos' | 'conteo' | 'fraccion';
export interface Escalar { readonly num: bigint; readonly den: bigint; readonly unidad: Unidad }

const mcd = (a: bigint, b: bigint): bigint => { a = a < BigInt(0) ? -a : a; b = b < BigInt(0) ? -b : b; while (b) [a, b] = [b, a % b]; return a || BigInt(1); };

export function normaliza(num: bigint, den: bigint, unidad: Unidad): Escalar {
  if (den === BigInt(0)) throw new Error('denominador cero');
  const s = den < BigInt(0) ? -BigInt(1) : BigInt(1);
  const g = mcd(num, den);
  return { num: (s * num) / g, den: (s * den) / g, unidad };
}

export function escalarDe(v: Valor): Escalar | null {
  if (v.tipo === 'centavos' || v.tipo === 'conteo') return { num: BigInt(v.v), den: BigInt(1), unidad: v.tipo };
  if (v.tipo === 'fraccion') return v.den === 0 ? null : normaliza(BigInt(v.num), BigInt(v.den), 'fraccion');
  return null;
}

export const suma = (a: Escalar, b: Escalar): Escalar => normaliza(a.num * b.den + b.num * a.den, a.den * b.den, a.unidad === b.unidad ? a.unidad : 'fraccion');
export const resta = (a: Escalar, b: Escalar): Escalar => suma(a, { ...b, num: -b.num });
export const divide = (a: Escalar, b: Escalar): Escalar => normaliza(a.num * b.den, a.den * b.num, 'fraccion');
export const signo = (a: Escalar): number => (a.num > BigInt(0) ? 1 : a.num < BigInt(0) ? -1 : 0);
export const absoluto = (a: Escalar): Escalar => ({ ...a, num: a.num < BigInt(0) ? -a.num : a.num });

/** Compara a con b exactamente: −1, 0 o 1. */
export function compara(a: Escalar, b: Escalar): number {
  const x = a.num * b.den;
  const y = b.num * a.den;
  return x < y ? -1 : x > y ? 1 : 0;
}

export function cumple(a: Escalar, op: '=' | '>' | '>=' | '<' | '<=', b: Escalar): boolean {
  const c = compara(a, b);
  return op === '=' ? c === 0 : op === '>' ? c > 0 : op === '>=' ? c >= 0 : op === '<' ? c < 0 : c <= 0;
}

export const porMil = (n: number): Escalar => normaliza(BigInt(n), BigInt(1000), 'fraccion');
export const entero = (n: number | bigint, unidad: Unidad = 'conteo'): Escalar => ({ num: BigInt(n), den: BigInt(1), unidad });

/** "0.700" con tres decimales, truncado hacia cero: solo para mostrar, nunca para decidir. */
export function decimal(a: Escalar, decimales = 3): string {
  const escala = BigInt(10) ** BigInt(decimales);
  const neg = a.num < BigInt(0);
  const abs = (neg ? -a.num : a.num) * escala / a.den;
  const ent = abs / escala;
  const frac = String(abs % escala).padStart(decimales, '0');
  return `${neg ? '-' : ''}${ent}.${frac}`;
}
