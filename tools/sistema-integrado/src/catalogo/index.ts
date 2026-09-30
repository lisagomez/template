/**
 * Catálogo: consultas y los dos gates que lo protegen.
 *   - L2 cobertura: cada número de la estructura de cada edición tiene al menos un requisito; IDs únicos; ninguna
 *     referencia apunta fuera de la estructura; el mapeo cruzado 9001↔42001 no deja huérfanos.
 *   - L1 derechos: con la copia licenciada de la norma (fuera del repo), cero fragmentos de N palabras seguidas en
 *     común. Sin copia, el resultado es «no medido», nunca «pasa».
 */
import { CATALOGO } from './datos.js';
import type { Catalogo, Fase, IdEdicion, Requisito } from './tipos.js';

export * from './tipos.js';
export { CATALOGO };

export const ID_ANEXO_A = 'iso-iec-42001:2023#anexo-a';

const indices = new WeakMap<Catalogo, Map<string, Requisito>>();
function indice(c: Catalogo): Map<string, Requisito> {
  let m = indices.get(c);
  if (!m) { m = new Map(c.requisitos.map((r) => [r.id, r])); indices.set(c, m); }
  return m;
}

export const requisito = (id: string, c: Catalogo = CATALOGO): Requisito | undefined => indice(c).get(id);
export const existe = (id: string, c: Catalogo = CATALOGO): boolean => indice(c).has(id);

/** Requisitos que aplican a un conjunto de ediciones (un requisito común aparece una sola vez). */
export function requisitosDe(ediciones: readonly IdEdicion[], c: Catalogo = CATALOGO): Requisito[] {
  return c.requisitos.filter((r) => r.refs.some((ref) => ediciones.includes(ref.edicion)));
}

export const deFase = (fase: Fase, ediciones: readonly IdEdicion[], c: Catalogo = CATALOGO): Requisito[] =>
  requisitosDe(ediciones, c).filter((r) => r.fase === fase);

/** Los controles del Anexo A (familia A). */
export const controlesAnexoA = (c: Catalogo = CATALOGO): Requisito[] => c.requisitos.filter((r) => r.familia === 'A');

/** Las normas que cubre un requisito (por edición). */
export const edicionesDe = (r: Requisito): IdEdicion[] => [...new Set(r.refs.map((x) => x.edicion))];

export interface ParejaCruzada {
  readonly clausula9001: string;
  readonly clausula42001: string;
  readonly requisitos: readonly string[];
}

/** Mapeo cruzado 9001 (edición dada) ↔ 42001: las cláusulas que comparten requisitos comunes. */
export function mapeoCruzado(edicion9001: IdEdicion = 'iso-9001:2015+a1:2024', c: Catalogo = CATALOGO): ParejaCruzada[] {
  const pares = new Map<string, string[]>();
  for (const r of c.requisitos) {
    const a = r.refs.filter((x) => x.edicion === edicion9001);
    const b = r.refs.filter((x) => x.edicion === 'iso-iec-42001:2023');
    for (const x of a) for (const y of b) {
      const k = `${x.clausula}|${y.clausula}`;
      pares.set(k, [...(pares.get(k) ?? []), r.id]);
    }
  }
  return [...pares.entries()]
    .map(([k, ids]) => { const [c9, c42] = k.split('|') as [string, string]; return { clausula9001: c9, clausula42001: c42, requisitos: ids }; })
    .sort((p, q) => comparaClausula(p.clausula9001, q.clausula9001) || comparaClausula(p.clausula42001, q.clausula42001));
}

/** Orden natural de números de cláusula («7.1.5.2» antes que «7.10»). */
export function comparaClausula(a: string, b: string): number {
  const pa = a.replace(/^A\./, '').split('.').map(Number), pb = b.replace(/^A\./, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

// ───────────────────────── L2 · cobertura ─────────────────────────

export interface ResultadoCobertura {
  readonly ok: boolean;
  /** Números de la estructura sin ningún requisito. */
  readonly sinCubrir: readonly { edicion: string; clausula: string }[];
  readonly idsDuplicados: readonly string[];
  readonly idsMalFormados: readonly string[];
  /** Referencias a números que no están en la estructura de su edición. */
  readonly refsFuera: readonly { id: string; edicion: string; clausula: string }[];
  /** Cláusulas del cuerpo de 42001 sin pareja en 9001 (o al revés) que NO están declaradas como propias. */
  readonly huerfanosMapeo: readonly string[];
  readonly conteo: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

const FORMATO_ID = /^SGI-(C|Q|IA|A)-[0-9][0-9.]*-\d{2}$/;

export function verificaCobertura(c: Catalogo = CATALOGO): ResultadoCobertura {
  const vistos = new Set<string>(), dup: string[] = [], mal: string[] = [];
  for (const r of c.requisitos) {
    if (vistos.has(r.id)) dup.push(r.id);
    vistos.add(r.id);
    if (!FORMATO_ID.test(r.id)) mal.push(r.id);
  }
  const conteo: Record<string, Record<string, number>> = {};
  const sinCubrir: { edicion: string; clausula: string }[] = [];
  const refsFuera: { id: string; edicion: string; clausula: string }[] = [];
  for (const [clave, lista] of Object.entries(c.estructura)) {
    const [edicion, anexo] = clave.split('#');
    const cuenta: Record<string, number> = Object.fromEntries(lista.map((n) => [n, 0]));
    for (const r of c.requisitos) for (const ref of r.refs) {
      if (ref.edicion !== edicion) continue;
      const esAnexo = ref.clausula.startsWith('A.');
      if (Boolean(anexo) !== esAnexo) continue;
      if (ref.clausula in cuenta) cuenta[ref.clausula] = (cuenta[ref.clausula] ?? 0) + 1;
      else refsFuera.push({ id: r.id, edicion: clave, clausula: ref.clausula });
    }
    for (const [n, k] of Object.entries(cuenta)) if (k === 0) sinCubrir.push({ edicion: clave, clausula: n });
    conteo[clave] = cuenta;
  }
  // Mapeo cruzado: toda cláusula del cuerpo de 42001 debe compartir al menos un requisito con 9001:2015+A1, salvo
  // las que son propias de la IA (solo tienen requisitos IA). Y viceversa para 9001 con requisitos Q.
  const huerfanos: string[] = [];
  const pares = mapeoCruzado('iso-9001:2015+a1:2024', c);
  const con42 = new Set(pares.map((p) => p.clausula42001)), con9 = new Set(pares.map((p) => p.clausula9001));
  for (const n of c.estructura['iso-iec-42001:2023'] ?? []) {
    const propios = c.requisitos.filter((r) => r.refs.some((x) => x.edicion === 'iso-iec-42001:2023' && x.clausula === n));
    if (!con42.has(n) && !propios.every((r) => r.familia === 'IA')) huerfanos.push(`42001 ${n}`);
  }
  for (const n of c.estructura['iso-9001:2015+a1:2024'] ?? []) {
    const propios = c.requisitos.filter((r) => r.refs.some((x) => x.edicion === 'iso-9001:2015+a1:2024' && x.clausula === n));
    if (!con9.has(n) && !propios.every((r) => r.familia === 'Q')) huerfanos.push(`9001 ${n}`);
  }
  const ok = !sinCubrir.length && !dup.length && !mal.length && !refsFuera.length && !huerfanos.length;
  return { ok, sinCubrir, idsDuplicados: dup, idsMalFormados: mal, refsFuera, huerfanosMapeo: huerfanos, conteo };
}

// ───────────────────────── L1 · derechos de autor ─────────────────────────

export interface ResultadoDerechos {
  /** `false` = no había copia licenciada con qué comparar: el gate NO pasa ni falla, queda «no medido». */
  readonly medido: boolean;
  readonly n: number;
  /** Coincidencias de N palabras seguidas. Solo se reporta dónde, nunca el fragmento (sería copiar la norma aquí). */
  readonly coincidencias: readonly { id: string; campo: 'tema' | 'pregunta' | 'sencillo'; palabras: number }[];
  readonly ok: boolean | null;
}

/** Normaliza para comparar: minúsculas, sin acentos ni puntuación. */
export function normaliza(texto: string): string[] {
  return texto.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
}

function ngramas(palabras: string[], n: number): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i + n <= palabras.length; i++) s.add(palabras.slice(i, i + n).join(' '));
  return s;
}

/**
 * Compara cada texto propio del catálogo contra la copia licenciada. `referencia = null` → no medido. La copia
 * relevante para paráfrasis en español es la versión en español de la norma: contra la inglesa el solapamiento es
 * trivialmente cero y el resultado no demuestra nada (se reporta igual como medido, con esa salvedad en la
 * documentación).
 */
export function verificaDerechos(referencia: string | null, n = 8, c: Catalogo = CATALOGO): ResultadoDerechos {
  if (referencia === null) return { medido: false, n, coincidencias: [], ok: null };
  const ref = ngramas(normaliza(referencia), n);
  const coincidencias: { id: string; campo: 'tema' | 'pregunta' | 'sencillo'; palabras: number }[] = [];
  for (const r of c.requisitos) for (const campo of ['tema', 'pregunta', 'sencillo'] as const) {
    const propios = normaliza(r[campo]);
    let largo = 0;
    for (let i = 0; i + n <= propios.length; i++) {
      if (ref.has(propios.slice(i, i + n).join(' '))) largo = Math.max(largo, n);
    }
    if (largo) coincidencias.push({ id: r.id, campo, palabras: largo });
  }
  return { medido: true, n, coincidencias, ok: coincidencias.length === 0 };
}
