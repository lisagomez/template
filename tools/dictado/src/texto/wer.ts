/**
 * Tasa de error por palabra (WER). Es el numero que decide el motor por defecto, asi que se
 * calcula aqui, con el mismo normalizador que ve el resto del nucleo, y no en un script
 * suelto que nadie prueba.
 *
 * WER = (sustituciones + inserciones + borrados) / palabras de la referencia. Sobre un corpus
 * se ACUMULAN errores y palabras antes de dividir: promediar el WER de cada frase pesa igual
 * una de tres palabras que una de treinta.
 */
import { tokeniza } from './normaliza.js';

export interface ResultadoWer {
  errores: number;
  palabras: number;
  /** errores / palabras. `Infinity` si la referencia esta vacia y la hipotesis no. */
  wer: number;
}

/** Distancia de Levenshtein entre dos secuencias, con dos filas de memoria. */
export function distanciaEdicion(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j);
  let actual = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    actual[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min((anterior[j] ?? 0) + 1, (actual[j - 1] ?? 0) + 1, (anterior[j - 1] ?? 0) + coste);
    }
    [anterior, actual] = [actual, anterior];
  }
  return anterior[b.length] ?? 0;
}

export function wer(referencia: string, hipotesis: string): ResultadoWer {
  const ref = tokeniza(referencia);
  const hip = tokeniza(hipotesis);
  const errores = distanciaEdicion(ref, hip);
  return { errores, palabras: ref.length, wer: ref.length === 0 ? (hip.length === 0 ? 0 : Infinity) : errores / ref.length };
}

/** WER acumulado de un corpus: suma de errores entre suma de palabras de referencia. */
export function werAcumulado(pares: ReadonlyArray<{ referencia: string; hipotesis: string }>): ResultadoWer {
  let errores = 0;
  let palabras = 0;
  for (const par of pares) {
    const r = wer(par.referencia, par.hipotesis);
    errores += r.errores;
    palabras += r.palabras;
  }
  return { errores, palabras, wer: palabras === 0 ? 0 : errores / palabras };
}

/** Tasa de error por caracter, para idiomas o motores donde la palabra engaña. */
export function cer(referencia: string, hipotesis: string): ResultadoWer {
  const ref = Array.from(referencia.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim());
  const hip = Array.from(hipotesis.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim());
  const errores = distanciaEdicion(ref, hip);
  return { errores, palabras: ref.length, wer: ref.length === 0 ? (hip.length === 0 ? 0 : Infinity) : errores / ref.length };
}

/** Percentil por interpolacion al vecino mas cercano, sobre una copia ordenada. */
export function percentil(valores: readonly number[], p: number): number {
  if (valores.length === 0) return NaN;
  const ordenados = [...valores].sort((x, y) => x - y);
  const indice = Math.min(ordenados.length - 1, Math.max(0, Math.ceil((p / 100) * ordenados.length) - 1));
  return ordenados[indice] ?? NaN;
}
