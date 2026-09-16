/**
 * Normalizacion de texto para comparar y para buscar. Sin dependencias.
 *
 * `\b` de JavaScript solo conoce letras ASCII: «año» tiene frontera de palabra entre la ñ y la
 * o. Todo lo que aqui busca palabras usa clases Unicode (`\p{L}`), y por eso existen estas
 * funciones y no una regex suelta en cada modulo.
 */

const PUNTUACION = /[^\p{L}\p{N}\s]/gu;
const ESPACIOS = /\s+/g;

/** Minusculas, NFC, sin puntuacion, un solo espacio. Lo que se compara en el WER. */
export function normalizaParaComparar(texto: string): string {
  return texto.normalize('NFC').toLowerCase().replace(PUNTUACION, ' ').replace(ESPACIOS, ' ').trim();
}

/** Quita diacriticos (`camión` → `camion`). Para buscar tolerando acentos, no para escribir. */
export function quitaAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
}

/** Palabras (secuencias de letras y digitos), en el orden del texto. */
export function tokeniza(texto: string): string[] {
  return normalizaParaComparar(texto).split(' ').filter((t) => t.length > 0);
}

/** Escapa un texto para meterlo literal en una RegExp. */
export function escapaRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * RegExp que casa `frase` como palabra(s) completa(s), sin distinguir mayusculas y con
 * fronteras Unicode: no casa «casa» dentro de «casamiento» ni «año» dentro de «años».
 */
export function regexDePalabra(frase: string, banderas = 'giu'): RegExp {
  const cuerpo = escapaRegex(frase.trim()).replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${cuerpo}(?![\\p{L}\\p{N}])`, banderas);
}

/** Primera letra en mayuscula si el texto empieza por una letra (respeta «¿» y «¡»). */
export function capitalizaInicio(texto: string): string {
  return texto.replace(/^([¿¡"'(\s]*)(\p{Ll})/u, (_, prefijo: string, letra: string) => prefijo + letra.toUpperCase());
}
