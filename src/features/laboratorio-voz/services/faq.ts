/**
 * Consultas frecuentes POR REGLAS: la persona trae su lista de preguntas y respuestas; una
 * pregunta nueva se compara por palabras (sin las vacias) y gana la mas parecida si supera un
 * umbral. Sin modelo de lenguaje: si no hay parecido, dice que no sabe en vez de inventar.
 */
import { tokeniza } from './texto.ts';

export interface EntradaFaq {
  pregunta: string;
  respuesta: string;
}

export interface Coincidencia {
  entrada: EntradaFaq;
  parecido: number;
}

export interface RespuestaFaq {
  mejor?: Coincidencia;
  alternativas: Coincidencia[];
  /** Por debajo del umbral no se responde: es mejor un «no se» que una respuesta inventada. */
  umbral: number;
}

const VACIAS = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a', 'en', 'y', 'o', 'que', 'como', 'cual', 'cuales', 'es', 'son', 'se', 'me', 'mi', 'su', 'para', 'por', 'con', 'sin', 'puedo', 'hay', 'tiene', 'tienen', 'donde', 'cuando', 'cuanto', 'cuanta', 'quiero', 'saber', 'si', 'lo', 'le', 'ustedes', 'yo', 'tu']);

const raiz = (t: string): string => (t.length > 5 ? t.slice(0, 5) : t);
const significativas = (s: string): Set<string> => new Set(tokeniza(s).filter((t) => !VACIAS.has(t) && t.length > 1).map(raiz));

/** Jaccard sobre raices de palabras significativas: 0 sin nada en comun, 1 identicas. */
export function parecido(a: string, b: string): number {
  const A = significativas(a);
  const B = significativas(b);
  if (A.size === 0 || B.size === 0) return 0;
  let comunes = 0;
  for (const t of A) if (B.has(t)) comunes++;
  return Math.round((comunes / (A.size + B.size - comunes)) * 100) / 100;
}

/** «Pregunta | Respuesta» por linea, o «P: … / R: …» en lineas alternas. */
export function parseaFaq(texto: string): EntradaFaq[] {
  const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
  const salida: EntradaFaq[] = [];
  let pendiente: string | undefined;
  for (const l of lineas) {
    if (l.includes('|')) {
      const [p, ...r] = l.split('|');
      if (p?.trim() && r.join('|').trim()) salida.push({ pregunta: p.trim(), respuesta: r.join('|').trim() });
    } else if (/^p\s*[:.]/i.test(l)) pendiente = l.replace(/^p\s*[:.]\s*/i, '');
    else if (/^r\s*[:.]/i.test(l) && pendiente) {
      salida.push({ pregunta: pendiente, respuesta: l.replace(/^r\s*[:.]\s*/i, '') });
      pendiente = undefined;
    }
  }
  return salida;
}

export function respondeFaq(pregunta: string, entradas: readonly EntradaFaq[], umbral = 0.2): RespuestaFaq {
  const puntuadas = entradas.map((entrada) => ({ entrada, parecido: parecido(pregunta, entrada.pregunta) })).sort((a, b) => b.parecido - a.parecido);
  const mejor = puntuadas[0];
  return { mejor: mejor && mejor.parecido >= umbral ? mejor : undefined, alternativas: puntuadas.slice(0, 3), umbral };
}
