/**
 * Lo que el agente dice en voz alta de una respuesta (RF-42): el PRIMER parrafo de prosa, sin
 * codigo, tablas, listas ni titulos, acotado cortando en fin de frase, mas la pregunta final si
 * es corta. Puro y sin dependencias: lo usa el hook `Stop` (`scripts/habla-respuesta.mjs`) y se
 * prueba sin arnes. Si no hay prosa, devuelve '' y el hook no dice nada.
 */
export interface OpcionesParaVoz {
  /** Tope del primer parrafo; se corta en el ultimo fin de frase que quepa. */
  maxCaracteres?: number;
  /** La pregunta final se anade solo si no pasa de esto. */
  maxPregunta?: number;
}

export const DEFECTOS_PARA_VOZ = { maxCaracteres: 350, maxPregunta: 120 };

const sinBloquesDeCodigo = (md: string): string => md.replace(/```[\s\S]*?(?:```|$)/g, '\n\n');

/** Un bloque es prosa si ninguna de sus lineas es titulo, lista, cita, tabla, regla ni html. */
const esProsa = (bloque: string): boolean => {
  const lineas = bloque.split('\n').map((l) => l.trim()).filter(Boolean);
  return lineas.length > 0 && lineas.every((l) => !/^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||---+\s*$|\*\*\*+\s*$|<)/.test(l));
};

/** Deja el texto tal como se lee: sin marcas de markdown, enlaces por su texto, sin emoji. */
const limpia = (texto: string): string =>
  texto
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

const frasesDe = (texto: string): string[] => texto.split(/(?<=[.!?…»")])\s+/).filter(Boolean);

/** Corta en el ultimo fin de frase que quepa; si ni la primera cabe, en la ultima palabra, con puntos suspensivos. */
function acota(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  let salida = '';
  for (const frase of frasesDe(texto)) {
    const candidata = salida ? `${salida} ${frase}` : frase;
    if (candidata.length > max) break;
    salida = candidata;
  }
  if (salida) return salida;
  const corte = texto.slice(0, max);
  const espacio = corte.lastIndexOf(' ');
  return `${(espacio > 0 ? corte.slice(0, espacio) : corte).trim()}…`;
}

export function paraVoz(markdown: string, opciones: OpcionesParaVoz = {}): string {
  const max = opciones.maxCaracteres ?? DEFECTOS_PARA_VOZ.maxCaracteres;
  const maxPregunta = opciones.maxPregunta ?? DEFECTOS_PARA_VOZ.maxPregunta;
  const prosa = sinBloquesDeCodigo(markdown)
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0 && esProsa(b))
    .map(limpia)
    .filter((b) => b.length > 0);
  const primero = prosa[0];
  if (primero === undefined) return '';
  let voz = acota(primero, max);
  const ultimo = prosa[prosa.length - 1] ?? '';
  const frases = frasesDe(ultimo);
  const pregunta = frases[frases.length - 1] ?? '';
  if (pregunta.endsWith('?') && pregunta.length <= maxPregunta && !voz.includes(pregunta)) voz = `${voz} ${pregunta}`;
  return voz;
}
