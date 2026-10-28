/**
 * De qué cosa habla la persona, sin LLM: compara las palabras del pedido con los nombres de los candidatos (nodos,
 * agentes, ítems). Si hay uno claro, ese; si hay dos igual de buenos, NO adivina: dice cuáles son para preguntar; si
 * ninguno, lo dice.
 */
const VACIAS = new Set('a al de del el la las lo los en y o un una para por con que me mi muestrame muestra abre abrir llevame lleva quiero ver dile dime cuanto cual queda este esta'.split(' '));
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ');
const raiz = (t: string) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t).slice(0, 6);
export const palabras = (s: string): string[] => [...new Set(norm(s).split(/\s+/).filter((t) => t.length >= 3 && !VACIAS.has(t)).map(raiz))];

export type Resuelto<T> = { tipo: 'uno'; cual: T } | { tipo: 'ambiguo'; cuales: [T, T] } | { tipo: 'ninguno' };

export function resuelve<T>(texto: string, candidatos: readonly T[], nombre: (c: T) => string): Resuelto<T> {
  const pedido = new Set(palabras(texto));
  const puntos = candidatos.map((c) => {
    const suyas = palabras(nombre(c))
    return { c, n: suyas.filter((w) => pedido.has(w)).length, total: suyas.length }
  }).filter((x) => x.n > 0).sort((a, b) => b.n - a.n || a.total - b.total);
  const [a, b] = puntos;
  if (!a) return { tipo: 'ninguno' };
  if (b && b.n === a.n && b.total === a.total) return { tipo: 'ambiguo', cuales: [a.c, b.c] };
  return { tipo: 'uno', cual: a.c };
}
