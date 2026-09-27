/**
 * Perfil de voz del dueño, aprendido UNA vez de muestras reales y compartido por todo lo que
 * escribe en su nombre (regla `voice-profile` de la fuente: una corrección aquí arregla todas
 * las herramientas). Adaptado al español de México: tú o usted, emojis, saludo y despedida
 * exactos, y sobre todo **lo que nunca usa**, que es lo que delata que escribió otro.
 */
import { normaliza } from './texto.js';

export type Trato = 'tu' | 'usted' | 'mixto';
export type Frecuencia = 'nunca' | 'pocas' | 'frecuentes';

export interface PerfilDeVoz {
  readonly muestras: number;
  readonly saludo: string | null;
  readonly despedida: string | null;
  readonly palabrasPorFrase: number;
  readonly trato: Trato;
  readonly exclamaciones: Frecuencia;
  readonly emojis: Frecuencia;
  readonly frasesPropias: readonly string[];
  readonly nuncaUsa: readonly string[];
  readonly muestra: string | null;
}

/** Muletillas de oficina que delatan a un redactor ajeno. Solo entran al perfil si NINGUNA muestra las usa. */
export const CLICHES_CANDIDATOS: readonly string[] = [
  'estimado cliente', 'me pongo en contacto', 'le escribo para', 'sin mas por el momento',
  'de antemano gracias', 'espero que se encuentre bien', 'espero que te encuentres bien',
  'no dudes en contactarnos', 'lamentamos cualquier inconveniente', 'tu opinion es muy importante',
  'en nombre de todo el equipo', 'soluciones integrales', 'sinergia', 'apalancar', 'experiencia unica',
  'dar seguimiento', 'quedamos atentos', 'calidad y calidez',
];

/** Perfil neutro para cuando no hay muestras: se declara, no se finge una voz. */
export const VOZ_NEUTRA: PerfilDeVoz = {
  muestras: 0, saludo: null, despedida: null, palabrasPorFrase: 14, trato: 'tu',
  exclamaciones: 'pocas', emojis: 'pocas', frasesPropias: [], nuncaUsa: CLICHES_CANDIDATOS, muestra: null,
};

const EMOJI = /\p{Extended_Pictographic}/gu;
const HAY_EMOJI = /\p{Extended_Pictographic}/u;
const TU = /\b(tu|tus|te|ti|tienes|puedes|quieres|vienes|pasate|pidelo|escribenos|visitanos|aprovecha)\b/g;
const USTED = /\b(usted|ustedes|su|sus|le|puede|tiene|quiere|pidalo|visitenos|escribanos)\b/g;
const SALUDO = /^(hola|buen[oa]s|que tal|hey|saludos)\b/;

function frecuencia(porMuestra: number): Frecuencia {
  return porMuestra === 0 ? 'nunca' : porMuestra < 1 ? 'pocas' : 'frecuentes';
}

function masComun(lista: readonly string[]): string | null {
  const cuenta = new Map<string, number>();
  for (const x of lista) cuenta.set(x, (cuenta.get(x) ?? 0) + 1);
  let mejor: string | null = null;
  for (const [x, n] of cuenta) if (mejor === null || n > (cuenta.get(mejor) ?? 0)) mejor = x;
  return mejor;
}

function lineas(m: string): string[] {
  return m.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function frasesRepetidas(muestras: readonly string[]): string[] {
  const porFrase = new Map<string, Set<number>>();
  muestras.forEach((m, i) => {
    const p = normaliza(m).split(' ');
    for (let k = 0; k + 2 < p.length; k++) {
      const f = p.slice(k, k + 3).join(' ');
      if (f.length < 10) continue;
      porFrase.set(f, (porFrase.get(f) ?? new Set()).add(i));
    }
  });
  return [...porFrase].filter(([, s]) => s.size >= 2).sort((a, b) => b[1].size - a[1].size).slice(0, 6).map(([f]) => f);
}

/** Construye el perfil a partir de 3 a 30 mensajes o publicaciones reales del dueño. */
export function construyeVoz(muestras: readonly string[]): PerfilDeVoz {
  const validas = muestras.map((m) => m.trim()).filter((m) => m.length > 0);
  if (validas.length === 0) return VOZ_NEUTRA;
  const frases = validas.flatMap((m) => m.split(/[.!?¡¿\n]+/)).map((f) => f.trim()).filter((f) => f.split(' ').length > 2);
  const palabras = frases.reduce((s, f) => s + f.split(/\s+/).length, 0);
  const todo = normaliza(validas.join('\n'));
  const tu = (todo.match(TU) ?? []).length, usted = (todo.match(USTED) ?? []).length;
  const saludos = validas.map((m) => lineas(m)[0] ?? '').filter((l) => SALUDO.test(normaliza(l)) && l.split(' ').length <= 5);
  const despedidas = validas.map((m) => lineas(m).at(-1) ?? '').filter((l, i) => l.split(' ').length <= 5 && lineas(validas[i]!).length > 1);
  return {
    muestras: validas.length,
    saludo: masComun(saludos.map((s) => s.replace(/\s+[A-ZÁÉÍÓÚ][\p{L}]+([,!]?)$/u, ' <nombre>$1'))),
    despedida: despedidas.length >= 2 ? masComun(despedidas) : null,
    palabrasPorFrase: frases.length ? Math.round(palabras / frases.length) : 14,
    trato: tu > usted * 2 ? 'tu' : usted > tu * 2 ? 'usted' : 'mixto',
    exclamaciones: frecuencia((validas.join('').match(/!/g) ?? []).length / validas.length),
    emojis: frecuencia((validas.join('').match(EMOJI) ?? []).length / validas.length),
    frasesPropias: frasesRepetidas(validas),
    nuncaUsa: CLICHES_CANDIDATOS.filter((c) => !todo.includes(c)),
    muestra: [...validas].sort((a, b) => a.length - b.length)[Math.floor(validas.length / 2)] ?? null,
  };
}

/** Una corrección del dueño («nunca digas X») se vuelve regla para todas las herramientas. */
export function prohibeFrase(voz: PerfilDeVoz, frase: string): PerfilDeVoz {
  const f = normaliza(frase);
  return f === '' || voz.nuncaUsa.includes(f) ? voz : { ...voz, nuncaUsa: [...voz.nuncaUsa, f] };
}

export interface FaltaDeVoz {
  readonly regla: 'nunca-usa' | 'frase-larga' | 'emojis' | 'exclamaciones';
  readonly detalle: string;
}

/** Revisa un borrador contra la voz: lo que suene a otro se señala, no se corrige a escondidas. */
export function revisaContraVoz(texto: string, voz: PerfilDeVoz): FaltaDeVoz[] {
  const faltas: FaltaDeVoz[] = [];
  const n = normaliza(texto);
  for (const f of voz.nuncaUsa) if (n.includes(f)) faltas.push({ regla: 'nunca-usa', detalle: `usa «${f}», que el dueño nunca escribe` });
  const larga = texto.split(/[.!?\n]+/).find((f) => f.trim().split(/\s+/).length > Math.max(25, voz.palabrasPorFrase * 2));
  if (larga) faltas.push({ regla: 'frase-larga', detalle: `una frase de ${larga.trim().split(/\s+/).length} palabras; el dueño promedia ${voz.palabrasPorFrase}` });
  if (voz.emojis === 'nunca' && HAY_EMOJI.test(texto)) faltas.push({ regla: 'emojis', detalle: 'lleva emojis y el dueño nunca los usa' });
  if (voz.exclamaciones === 'nunca' && texto.includes('!')) faltas.push({ regla: 'exclamaciones', detalle: 'lleva exclamaciones y el dueño no las usa' });
  return faltas;
}
