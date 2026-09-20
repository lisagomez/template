/**
 * Sentimiento POR REGLAS: un diccionario en espanol, negaciones que invierten y refuerzos que
 * multiplican. No entiende contexto ni ironia, y la tarjeta lo dice. Cada frase muestra las
 * palabras que pesaron: sin evidencia no hay tono.
 */
import { parteEnFrases, quitaAcentos } from './texto.ts';

export type Tono = 'positivo' | 'neutro' | 'negativo';

export interface PalabraPesada {
  palabra: string;
  peso: number;
}

export interface FraseConTono {
  texto: string;
  puntaje: number;
  tono: Tono;
  palabras: PalabraPesada[];
}

export interface ResultadoSentimiento {
  frases: FraseConTono[];
  global: { tono: Tono; puntaje: number; positivas: number; negativas: number };
}

/** Raices sin acento; se comparan por prefijo de palabra. Pesos -3..3. */
const LEXICO: Record<string, number> = {
  excelente: 3, encanta: 3, perfecto: 3, maravill: 3, genial: 3, feliz: 2, content: 2, agradec: 2, gracias: 1, bien: 1, buen: 2,
  rapid: 1, facil: 1, claro: 1, util: 2, funciona: 1, resuelt: 2, recomend: 2, satisf: 2, confi: 1, ayud: 1, mejor: 1, exito: 2, interes: 1,
  pesim: -3, horrible: -3, terrible: -3, fatal: -3, odio: -3, inaceptable: -3, molest: -2, enoj: -2, frustr: -2, decepcion: -2, queja: -2,
  problem: -1, error: -1, fall: -2, lent: -1, caro: -1, dificil: -1, confus: -1, tard: -1, mal: -2, peor: -2, nunca: -1, cancel: -2,
  esper: -1, urgent: -1, preocup: -2, duda: -1, complic: -1, imposible: -2, roto: -2, perd: -2,
};
const NEGACIONES = new Set(['no', 'ni', 'nunca', 'jamas', 'tampoco', 'sin']);
const REFUERZOS: Record<string, number> = { muy: 1.5, super: 1.5, demasiado: 1.5, bastante: 1.3, realmente: 1.3, totalmente: 1.5, poco: 0.5, algo: 0.7 };

function pesoDe(palabra: string): number | undefined {
  for (const [raiz, peso] of Object.entries(LEXICO)) if (palabra.startsWith(raiz)) return peso;
  return undefined;
}

export function tonoDeFrase(texto: string): FraseConTono {
  const tokens = quitaAcentos(texto.toLowerCase()).replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter(Boolean);
  const palabras: PalabraPesada[] = [];
  tokens.forEach((t, i) => {
    const base = pesoDe(t);
    if (base === undefined) return;
    const previas = tokens.slice(Math.max(0, i - 3), i);
    const negada = previas.some((p) => NEGACIONES.has(p));
    const refuerzo = previas.reduce((acc, p) => acc * (REFUERZOS[p] ?? 1), 1);
    const peso = Math.round((negada ? -base : base) * refuerzo * 10) / 10;
    palabras.push({ palabra: negada ? `no ${t}` : t, peso });
  });
  const puntaje = Math.round(palabras.reduce((s, p) => s + p.peso, 0) * 10) / 10;
  return { texto, puntaje, tono: puntaje > 0.5 ? 'positivo' : puntaje < -0.5 ? 'negativo' : 'neutro', palabras };
}

export function analizaSentimiento(texto: string): ResultadoSentimiento {
  const frases = parteEnFrases(texto).map(tonoDeFrase);
  const puntaje = Math.round(frases.reduce((s, f) => s + f.puntaje, 0) * 10) / 10;
  return {
    frases,
    global: {
      tono: puntaje > 0.5 ? 'positivo' : puntaje < -0.5 ? 'negativo' : 'neutro',
      puntaje,
      positivas: frases.filter((f) => f.tono === 'positivo').length,
      negativas: frases.filter((f) => f.tono === 'negativo').length,
    },
  };
}
