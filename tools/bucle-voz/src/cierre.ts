/**
 * Corte de turno por SENTIDO, barato y sin modelo: con la transcripción especulativa (la que se
 * pide en la primera pausa) se decide si cerrar antes, a su hora o esperar un poco más.
 *
 *  - `ya`: una orden reconocida con confianza está completa; esperar el silencio entero del VAD
 *    solo añade latencia.
 *  - `espera`: termina en conjunción, preposición, artículo o muletilla («…y», «…de la», «este»):
 *    la persona va a seguir. Es la regla que usan los cortes semánticos (LiveKit, AssemblyAI)
 *    reducida a su versión de texto, sin modelo.
 *  - `normal`: lo demás cierra con el silencio del VAD.
 *
 * Un juez con modelo (Smart Turn v3, ONNX de 8 MB, ~90 % en español según su autor) se puede
 * enchufar en el mismo sitio: recibe el texto y el audio y devuelve el mismo veredicto.
 */
import { palabras } from './texto.js';

export type VeredictoCierre = 'ya' | 'normal' | 'espera';

export interface JuezCierre {
  juzga(texto: string, contexto: { esOrdenSegura: boolean }): VeredictoCierre;
}

const QUEDA_ABIERTO = new Set([
  'y', 'e', 'o', 'u', 'ni', 'pero', 'sino', 'que', 'porque', 'pues', 'entonces', 'aunque', 'cuando', 'como', 'si', 'mientras',
  'de', 'del', 'a', 'al', 'en', 'con', 'sin', 'para', 'por', 'sobre', 'entre', 'hacia', 'hasta', 'desde', 'segun',
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'mi', 'mis', 'tu', 'tus', 'su', 'sus', 'este', 'esta', 'ese', 'esa',
  'eh', 'em', 'mm', 'mmm', 'osea', 'digamos', 'tipo', 'bueno',
]);

export const DEFECTOS_CIERRE = { msYa: 300, msEsperaExtra: 700 } as const;

export function juzgaCierre(texto: string, contexto: { esOrdenSegura: boolean }): VeredictoCierre {
  const ps = palabras(texto);
  const ultima = ps.at(-1);
  if (!ultima) return 'normal';
  if (QUEDA_ABIERTO.has(ultima) && !/[.?!…]\s*$/u.test(texto)) return 'espera';
  if (contexto.esOrdenSegura) return 'ya';
  return 'normal';
}

export const juezPorTexto: JuezCierre = { juzga: juzgaCierre };

/**
 * Una pregunta que el motor ya cerró con «?» y que no queda abierta también está completa: cierra como una orden
 * segura (`msCierreYa`) en vez de esperar el silencio entero del VAD. Es lo que deja sonar el acuse de la
 * conversación tan pronto como una orden. El riesgo es partir una pregunta que seguía tras una pausa de más de
 * `msCierreYa`: la persona que sigue hablando interrumpe y lo dicho entra como turno nuevo (se mide en la medición
 * del centro de mando, «preguntas con pausa»). Mínimo tres palabras: «¿Qué?» o «¿Cómo?» solos piden repetir.
 */
export function juzgaCierreConPregunta(texto: string, contexto: { esOrdenSegura: boolean }): VeredictoCierre {
  const base = juzgaCierre(texto, contexto);
  if (base !== 'normal') return base;
  return /\?\s*$/u.test(texto) && palabras(texto).length >= 3 ? 'ya' : 'normal';
}

export const juezConPregunta: JuezCierre = { juzga: juzgaCierreConPregunta };
