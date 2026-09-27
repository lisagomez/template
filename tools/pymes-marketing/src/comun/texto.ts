/** Utilidades de texto deterministas, sin dependencias. */

/** Minúsculas, sin acentos ni signos, espacios colapsados: para comparar, nunca para mostrar. */
export function normaliza(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Huella FNV-1a de 32 bits en hex: semilla reproducible (mismo texto, misma pieza). */
export function huella(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Número pseudoaleatorio determinista en [0, 1) a partir de una semilla de texto. */
export function azarDe(semilla: string, indice = 0): number {
  return parseInt(huella(`${semilla}#${indice}`), 16) / 0x100000000;
}

/** Recorta a `maximo` caracteres en límite de palabra, con «…» si hizo falta. */
export function recorta(texto: string, maximo: number): string {
  const limpio = texto.trim();
  if (limpio.length <= maximo) return limpio;
  const corte = limpio.slice(0, Math.max(0, maximo - 1));
  const espacio = corte.lastIndexOf(' ');
  return `${(espacio > maximo * 0.4 ? corte.slice(0, espacio) : corte).trimEnd()}…`;
}

/** Primera letra en mayúscula, sin tocar el resto. */
export function capitaliza(texto: string): string {
  return texto.length === 0 ? texto : texto[0]!.toUpperCase() + texto.slice(1);
}

/** Escapa texto para meterlo en XML/SVG/HTML sin que se vuelva marcado. */
export function escapaXml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
