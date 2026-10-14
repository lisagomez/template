/**
 * JSON canónico y huellas. Todo lo que se sella (Γ, la spec, una derivación, un certificado) pasa
 * por aquí, y por eso el determinismo empieza aquí: claves ordenadas sin `localeCompare` (depende
 * del idioma de la máquina), sin espacios, y SOLO valores que serializan igual en cualquier
 * corrida. Un flotante no entra a un sellado: se rechaza, porque `0.1 + 0.2` es una trampa de
 * replay. Las razones viajan como fracción de enteros o como texto con decimales fijos.
 */
import { createHash, createHmac } from 'node:crypto';

export type Canonizable = string | number | boolean | null | readonly Canonizable[] | { readonly [k: string]: Canonizable | undefined };

/** Orden de claves por código de unidad, igual en todas las máquinas. */
const porCodigo = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function canoniza(valor: Canonizable): string {
  if (valor === null || typeof valor === 'boolean' || typeof valor === 'string') return JSON.stringify(valor);
  if (typeof valor === 'number') {
    if (!Number.isSafeInteger(valor)) throw new Error(`no canonizable: ${valor} no es entero seguro (un flotante no se sella)`);
    return String(valor);
  }
  if (Array.isArray(valor)) return `[${valor.map((v) => canoniza(v as Canonizable)).join(',')}]`;
  const objeto = valor as { readonly [k: string]: Canonizable | undefined };
  const claves = Object.keys(objeto).filter((k) => objeto[k] !== undefined).sort(porCodigo);
  return `{${claves.map((k) => `${JSON.stringify(k)}:${canoniza(objeto[k] as Canonizable)}`).join(',')}}`;
}

export const sha256 = (texto: string | Uint8Array): string => createHash('sha256').update(texto).digest('hex');

/** Huella con prefijo legible: `snap:…`, `spec:…`, `der:…`, `cert:…`, `hecho:…`. */
export const huellaDe = (prefijo: string, valor: Canonizable): string => `${prefijo}:${sha256(canoniza(valor)).slice(0, 32)}`;

/**
 * Seudónimo de un cliente: HMAC con la llave de la pyme. Sin llave, el RFC de una persona moral es
 * enumerable y una huella simple se revierte con un diccionario (C4). La llave NO entra a Γ.
 */
export const seudonimo = (llave: string, rfc: string): string => `cli_${createHmac('sha256', llave).update(rfc.trim().toUpperCase()).digest('hex').slice(0, 16)}`;

export const porTexto = porCodigo;
