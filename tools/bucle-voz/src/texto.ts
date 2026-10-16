/**
 * Texto en español para comparar lo que oye un motor con lo que se esperaba: minúsculas, sin
 * puntuación, sin acentos y con la ñ intacta. Todo con clases Unicode (`\p{L}`, bandera `u`):
 * el `\b` de JavaScript solo entiende ASCII, y con él «José» o «Begoña» no tienen límite de
 * palabra (medido en la fuente de business-os: añadir la bandera `u` no lo arregla, `\b` sigue
 * siendo ASCII).
 */

const PALABRA = /[\p{L}\p{N}]+/gu;
const MARCAS = /\p{M}+/gu;
const EÑE_MIN = 'ñ';
const GUARDA = '\u0000';

/** Minúsculas, sin acentos ni diéresis, con la ñ conservada (no es una «n» con acento). */
export function pliega(texto: string): string {
  return texto
    .normalize('NFC')
    .toLowerCase()
    .replaceAll(EÑE_MIN, GUARDA)
    .normalize('NFD')
    .replace(MARCAS, '')
    .normalize('NFC')
    .replaceAll(GUARDA, EÑE_MIN);
}

/** Palabras plegadas, en orden. La puntuación (también «¿» y «¡») desaparece. */
export function palabras(texto: string): string[] {
  return pliega(texto).match(PALABRA) ?? [];
}

/** Distancia de edición con transposición adyacente (Damerau restringida). */
export function distancia(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let antes = new Array<number>(b.length + 1).fill(0);
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const fila = new Array<number>(b.length + 1).fill(0);
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min((previa[j] ?? 0) + 1, (fila[j - 1] ?? 0) + 1, (previa[j - 1] ?? 0) + coste);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, (antes[j - 2] ?? 0) + 1);
      fila[j] = v;
    }
    antes = previa;
    previa = fila;
  }
  return previa[b.length] ?? 0;
}

/**
 * Parecido entre dos palabras YA plegadas, de 0 a 1. Una ñ oída como n cuesta poco (el motor
 * escribe «Begona» por «Begoña» a menudo); el resto es distancia de edición normalizada. Las
 * palabras de 1-3 letras solo valen iguales: «para» y «pare» se parecen, «sí» y «no» no deben.
 */
export function parecido(a: string, b: string): number {
  if (a === b) return 1;
  const sinEñe = (s: string) => s.replaceAll(EÑE_MIN, 'n');
  if (sinEñe(a) === sinEñe(b)) return 0.95;
  const largo = Math.max(a.length, b.length);
  if (largo <= 3) return 0;
  return Math.max(0, 1 - distancia(sinEñe(a), sinEñe(b)) / largo);
}
