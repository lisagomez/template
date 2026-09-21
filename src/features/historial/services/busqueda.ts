/**
 * Buscar y ordenar el historial, puro: sin acentos ni mayusculas, por campos, con el termino
 * resaltado en el texto ORIGINAL (se guarda el mapa de cada caracter normalizado a su posicion
 * original, porque «á» → «a» cambia largos), y agrupado por dia local. Lo usan la maquina de
 * sondeo (en el servidor, sobre el JSONL entero) y la pagina (para resaltar).
 */
import type { Dictado, Filtros } from './tipos.ts';

/** Minusculas y sin marcas diacriticas; conserva la ñ (NFD la parte, se vuelve a juntar). */
export const normaliza = (s: string): string => s.toLowerCase().normalize('NFD').replace(/̃(?=[^\p{M}])|(?<=n)̃/gu, 'Ñ').replace(/\p{M}/gu, '').replace(/nÑ/g, 'ñ').normalize('NFC');

interface Normalizado {
  texto: string;
  /** Para cada caracter del texto normalizado, el indice del caracter original del que salio. */
  origen: number[];
}

function normalizaConMapa(texto: string): Normalizado {
  let salida = '';
  const origen: number[] = [];
  const caracteres = Array.from(texto);
  let posicion = 0;
  for (const c of caracteres) {
    const n = normaliza(c);
    for (const cn of n) {
      salida += cn;
      origen.push(posicion);
    }
    posicion += c.length;
  }
  return { texto: salida, origen };
}

export interface Segmento {
  texto: string;
  coincide: boolean;
}

/** Parte el texto en segmentos, marcando los que coinciden con la consulta (sin acentos, sin mayusculas). */
export function resalta(texto: string, consulta: string): Segmento[] {
  const q = normaliza(consulta.trim());
  if (q.length === 0 || texto.length === 0) return [{ texto, coincide: false }];
  const n = normalizaConMapa(texto);
  const segmentos: Segmento[] = [];
  let desde = 0;
  let i = n.texto.indexOf(q);
  while (i !== -1) {
    const inicio = n.origen[i] ?? 0;
    const finNorm = i + q.length;
    const fin = finNorm < n.origen.length ? (n.origen[finNorm] ?? texto.length) : texto.length;
    if (inicio > desde) segmentos.push({ texto: texto.slice(desde, inicio), coincide: false });
    segmentos.push({ texto: texto.slice(inicio, fin), coincide: true });
    desde = fin;
    i = n.texto.indexOf(q, finNorm);
  }
  if (desde < texto.length) segmentos.push({ texto: texto.slice(desde), coincide: false });
  return segmentos;
}

/** Dia local YYYY-MM-DD de una fecha ISO. */
export function diaLocal(fechaIso: string): string {
  const d = new Date(fechaIso);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function coincide(e: Dictado, f: Filtros): boolean {
  if (f.consulta && f.consulta.trim()) {
    const q = normaliza(f.consulta.trim());
    if (!normaliza(e.texto).includes(q) && !(e.textoCrudo && normaliza(e.textoCrudo).includes(q))) return false;
  }
  if (f.motor && e.motor !== f.motor) return false;
  if (f.soloCorregidos && !e.textoCrudo) return false;
  if (f.latenciaMinMs !== undefined && (e.latenciaMs === null || e.latenciaMs < f.latenciaMinMs)) return false;
  if (f.desde || f.hasta) {
    const dia = diaLocal(e.fecha);
    if (f.desde && dia < f.desde) return false;
    if (f.hasta && dia > f.hasta) return false;
  }
  return true;
}

/** Los que coinciden, del mas reciente al mas antiguo. */
export function filtra(entradas: readonly Dictado[], f: Filtros): Dictado[] {
  return entradas.filter((e) => coincide(e, f)).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));
}

export interface GrupoDia {
  dia: string;
  entradas: Dictado[];
}

/** Agrupa (ya ordenadas) por dia local, conservando el orden. */
export function agrupaPorDia(entradas: readonly Dictado[]): GrupoDia[] {
  const grupos: GrupoDia[] = [];
  for (const e of entradas) {
    const dia = diaLocal(e.fecha);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.entradas.push(e);
    else grupos.push({ dia, entradas: [e] });
  }
  return grupos;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** «Hoy», «Ayer», o «jueves 18 de septiembre», segun el dia local de referencia. */
export function etiquetaDia(dia: string, hoy: string): string {
  if (dia === hoy) return 'Hoy';
  const [a, m, d] = dia.split('-').map(Number);
  const [ha, hm, hd] = hoy.split('-').map(Number);
  const fecha = new Date(a ?? 0, (m ?? 1) - 1, d ?? 1);
  const ref = new Date(ha ?? 0, (hm ?? 1) - 1, hd ?? 1);
  const diff = Math.round((ref.getTime() - fecha.getTime()) / 86_400_000);
  if (diff === 1) return 'Ayer';
  const nombre = `${DIAS[fecha.getDay()]} ${fecha.getDate()} de ${MESES[fecha.getMonth()]}`;
  return a === ha ? nombre : `${nombre} de ${a}`;
}

/** Huella barata del historial: cambia si cambia el numero de entradas o la ultima. */
export const huellaDe = (entradas: readonly Dictado[]): string => {
  const ultima = entradas.reduce<Dictado | undefined>((m, e) => (!m || e.fecha > m.fecha || (e.fecha === m.fecha && e.id > m.id) ? e : m), undefined);
  return `${entradas.length}:${ultima?.id ?? '-'}:${ultima?.texto.length ?? 0}`;
};
