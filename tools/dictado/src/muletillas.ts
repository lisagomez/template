/**
 * Muletillas: lo que se dice y no se quiere escrito. Dos clases, porque el riesgo es distinto:
 *
 *  - **no lexicas** («mm», «mhm», «eh», «ah», «um»…): no son palabras de nadie. Se quitan donde
 *    esten, con la puntuacion que las acompanaba («Mm. Podemos» → «Podemos»; «ver, eh, la» →
 *    «ver, la»).
 *  - **lexicas** («este», «o sea», «bueno», «pues», «digamos», «tipo», «vale», «basicamente»,
 *    «como que», «literal»): tambien son palabras de verdad («este documento», «vale la pena», «tipo de
 *    cambio»). Solo se quitan cuando van AISLADAS, con puntuacion o borde del texto a los DOS
 *    lados («, este,», «Bueno, …», «…, o sea.»). Sin esa señal no se tocan: quitar una palabra
 *    buena es peor que dejar una muletilla, y el motor no siempre pone la coma (Parakeet, medido
 *    el 2026-09-21: «Buenos días, este hoy vamos a ver»).
 *
 * La lista lexica es la del corpus propio (`medicion/corpus-propio/muletillas/guiones.json`) y el
 * filtro esta medido contra sus 24 transcripciones (`medicion/mide-filtro-muletillas.mjs`).
 * Sin dependencias; fronteras Unicode (ver `texto/normaliza.ts`).
 */
import { tokeniza } from './texto/normaliza.js';

const FRONTERA_INICIO = '(?<![\\p{L}\\p{N}])';
const FRONTERA_FIN = '(?![\\p{L}\\p{N}])';
const PUNTUACION = '[,;:.…!?]';
/** Marca donde empezaba una frase cuya primera palabra se fue: la siguiente se capitaliza. */
const MARCA = '\u0000';

/** Vocalizaciones sin significado, como patrones. */
export const MULETILLAS_NO_LEXICAS: readonly string[] = ['mm+', 'mhm', 'mjm', 'hm+', 'eh+m?', 'ah+', 'uh+m?', 'um+'];
/** Palabras de verdad que tambien hacen de muletilla: solo cuentan aisladas por puntuacion. */
export const MULETILLAS_LEXICAS: readonly string[] = ['este', 'o\\s+sea', 'bueno', 'pues', 'digamos', 'tipo', 'vale', 'b[aá]sicamente', 'como\\s+que', 'literal'];

const RE_NO_LEXICA = new RegExp(
  `[ \\t]*([¿¡])?[ \\t]*${FRONTERA_INICIO}(?:${MULETILLAS_NO_LEXICAS.join('|')})${FRONTERA_FIN}[ \\t]*(${PUNTUACION})?[ \\t]*`,
  'giu',
);
const RE_LEXICA = new RegExp(
  `(?<=^|${PUNTUACION}[ \\t]*|[¿¡\u0000][ \\t]*)[ \\t]*([¿¡])?[ \\t]*${FRONTERA_INICIO}(?:${MULETILLAS_LEXICAS.join('|')})${FRONTERA_FIN}[ \\t]*(?:(${PUNTUACION})|$)[ \\t]*`,
  'giu',
);
const RE_SOLO = new RegExp(`^(?:${[...MULETILLAS_NO_LEXICAS, 'aj[aá]'].join('|')})$`, 'iu');

const LIMPIEZA: ReadonlyArray<[RegExp, string]> = [
  [/[ \t]{2,}/g, ' '],
  [/[ \t]+([,;:.!?…])/g, '$1'],
  [/[,;:]\s*([.!?…])/g, '$1'], // «Hola,.» → «Hola.»: la muletilla se llevo el final de frase
  [/([,;:.!?…])\s*[,;:]/g, '$1'],
  [/[¿¡](?=\s*$)/g, ''],
];

export interface ResultadoMuletillas {
  texto: string;
  /** Lo que se quito, en orden, tal como venia (para el registro y para medir). */
  quitadas: string[];
}

/** El caracter no blanco anterior a `indice`, o '' si el texto empieza ahi. */
function izquierda(texto: string, indice: number): string {
  let i = indice - 1;
  while (i >= 0 && /[ \t]/.test(texto[i] ?? '')) i--;
  return i >= 0 ? (texto[i] ?? '') : '';
}

/**
 * Que se deja en el hueco: si la muletilla abria una frase, una marca para capitalizar lo que
 * sigue; si iba tras una coma, nada; si se llevo el punto final de la frase, el punto vuelve.
 */
function hueco(izq: string, puntuacionDerecha: string | undefined): string {
  if (izq === '' || izq === MARCA) return MARCA;
  if (/[.!?…¿¡]/.test(izq)) return ` ${MARCA}`;
  if (puntuacionDerecha && /[.!?…]/.test(puntuacionDerecha)) return `${puntuacionDerecha} `;
  return ' ';
}

export function quitaMuletillas(texto: string): ResultadoMuletillas {
  const quitadas: string[] = [];
  const quita = (re: RegExp, entrada: string): string =>
    entrada.replace(re, (todo: string, _apertura: string | undefined, punt: string | undefined, indice: number, original: string) => {
      const izq = izquierda(original, indice);
      if (/\p{N}/u.test(izq)) return todo; // «5 mm de grosor»: una unidad, no una muletilla
      quitadas.push(todo.trim());
      return hueco(izq, punt);
    });
  let salida = quita(RE_NO_LEXICA, texto);
  salida = quita(RE_LEXICA, salida);
  if (quitadas.length === 0) return { texto, quitadas };
  salida = salida.replace(/\u0000[ \t]*([¿¡"'(]*)(\p{Ll})/gu, (_, prefijo: string, letra: string) => prefijo + letra.toUpperCase()).replace(/\u0000[ \t]*/g, '');
  for (const [re, con] of LIMPIEZA) salida = salida.replace(re, con);
  salida = salida.trim().replace(/^[,;:.!?…]+\s*/u, '');
  return { texto: salida, quitadas };
}

/** Un turno que es SOLO muletilla («eh», «mm», «ajá») no se pega: en sala se dictan ideas, no carraspeos. */
export function esSoloMuletilla(texto: string): boolean {
  const palabras = tokeniza(texto);
  return palabras.length > 0 && palabras.length <= 3 && palabras.every((p) => RE_SOLO.test(p));
}
