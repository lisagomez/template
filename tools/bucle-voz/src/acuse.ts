/**
 * El acuse inmediato: cuando un turno va al cerebro (no es una orden local), suena YA una frase corta de un
 * repertorio fijo y SIN contenido factual («Va, déjame pensarlo.»), y después la respuesta. Así la conversación
 * empieza a sonar tan pronto como una orden, aunque el cerebro tarde.
 *
 * PROCEDENCIA (Apache-2.0; la atribución va en el NOTICE del template):
 *  - Arbrain v0.2.10, etiqueta firmada `v0.2.10`, commit `829a9e99f0f6805325e24bd851eb5d1e88c3c67c`.
 *  - `arbrain/server/src/live/capa-rapida.ts` (blob `752e6d80`) › `ACUSES`, `ESTADO`, `acuseDe`, `UMBRAL_RUTA`:
 *    el repertorio, el estado que se enseña mientras piensa, «sin contenido factual (nada que el modelo pueda
 *    contradecir)», no repetir el último y `trivial` sin acuse.
 *  - `arbrain/src/features/live/hooks/useLiveVoice.ts` › `speakAck` y `arbrain/server/src/chat-runtime/chat-job.ts`
 *    › `live_ack`: una vez por respuesta, solo si el modelo aún no dijo nada, por la misma cola de voz.
 *
 * QUÉ CAMBIÓ:
 *  - Lo elige NUESTRO enrutador sin LLM (su decisión `llm` y su motivo) más dos reglas de texto, no Jev por
 *    OpenRouter: para elegir un acuse no sale nada de la máquina y no hay ~200 ms de red delante.
 *  - Las frases se dan al sintetizador desde el arranque (`frases`): con la caché caliente suenan sin esperar a la
 *    voz. Allí el acuse se sintetizaba al llegar.
 *  - Va por el canal de voz del turno como frase 0: se retiene hasta confirmar el turno (especulación), y lo cortan la
 *    interrupción y «para» como a cualquier frase, con la misma puerta de eco.
 *  - Sin la clase `trabajo`: este bucle no ejecuta nada (la escritura queda en dry-run y no llega al cerebro). Las
 *    clases son `pregunta` (por la forma de lo dicho), `peticion` y `duda` (el enrutador dudó entre una orden y el
 *    cerebro).
 *  - Con `msGracia` > 0, si el cerebro ya dijo su primera frase antes de ese plazo, el acuse sobra y no suena (para
 *    cerebros rápidos, como la conversación de la capa); con 0 suena siempre que vaya al cerebro.
 *  - El acuse nunca entra al historial que se le manda al cerebro ni a «repite»: no es parte de la respuesta.
 */
import type { Decision } from './enrutador.js';
import { palabras } from './texto.js';

export type ClaseAcuse = 'pregunta' | 'peticion' | 'duda';

export interface EleccionAcuse {
  texto: string;
  clase: ClaseAcuse;
  /** Lo que la interfaz puede enseñar mientras piensa («Pensándolo»). */
  estado: string;
}

export interface Acuse {
  /** Lo que suena al mandar un turno al cerebro; `null` = sin acuse (un saludo o un «gracias»). */
  elige(d: Extract<Decision, { tipo: 'llm' }>): EleccionAcuse | null;
  /** Todas las frases del repertorio: se calientan en el sintetizador al arrancar. */
  readonly frases: readonly string[];
  /** Si el cerebro dice su primera frase antes de este plazo (ms desde la decisión), el acuse no suena. */
  readonly msGracia: number;
}

/** Sin contenido factual: nada que la respuesta pueda contradecir. Adaptado de `capa-rapida.ts › ACUSES`. */
export const REPERTORIO_ACUSE: Readonly<Record<ClaseAcuse, readonly string[]>> = {
  pregunta: ['Buena pregunta, déjame pensarlo.', 'Va, lo pienso un momento.', 'Déjame darle una vuelta.'],
  peticion: ['Va, déjame ver.', 'Dame un momento.', 'Va, lo preparo.'],
  duda: ['Va, déjame pensarlo.', 'Un momento, lo veo.'],
};

export const ESTADO_ACUSE: Readonly<Record<ClaseAcuse, string>> = { pregunta: 'Pensándolo', peticion: 'Preparándolo', duda: 'Pensándolo' };

export const FRASES_ACUSE: readonly string[] = Object.values(REPERTORIO_ACUSE).flat();

/** Lo que no merece acuse: la respuesta a un saludo o a un «gracias» llega igual de rápido (allí, `trivial`). */
const TRIVIAL = new Set([
  'hola', 'buenas', 'buenos', 'dias', 'tardes', 'noches', 'gracias', 'muchas', 'mil', 'ok', 'okay', 'vale', 'perfecto', 'genial',
  'listo', 'bien', 'muy', 'esta', 'de', 'nada', 'que', 'tal', 'como', 'estas', 'adios', 'saludos', 'excelente', 'entendido',
]);

const INTERROGATIVA = /^(que|como|cual|cuales|cuanto|cuanta|cuantos|cuantas|donde|cuando|quien|quienes|por|para|conviene|puedo|debo|es|son|hay|sabes)$/u;

export function esTrivial(texto: string): boolean {
  const ps = palabras(texto);
  return ps.length > 0 && ps.length <= 4 && ps.every((p) => TRIVIAL.has(p));
}

/** La clase sale de la decisión del enrutador y de la forma de lo dicho, sin modelo. */
export function claseDeAcuse(d: Extract<Decision, { tipo: 'llm' }>): ClaseAcuse {
  if (d.motivo === 'dudoso') return 'duda';
  const primera = palabras(d.texto)[0] ?? '';
  return /\?/u.test(d.texto) || INTERROGATIVA.test(primera) ? 'pregunta' : 'peticion';
}

export interface OpcionesAcuse {
  /** Para elegir dentro de la clase (las pruebas lo fijan). */
  azar?: () => number;
  msGracia?: number;
  repertorio?: Readonly<Record<ClaseAcuse, readonly string[]>>;
}

export function creaAcuse(o: OpcionesAcuse = {}): Acuse {
  const azar = o.azar ?? Math.random;
  const repertorio = o.repertorio ?? REPERTORIO_ACUSE;
  let ultimo = '';
  return {
    frases: Object.values(repertorio).flat(),
    msGracia: Math.max(0, o.msGracia ?? 0),
    elige(d) {
      if (esTrivial(d.texto)) return null;
      const clase = claseDeAcuse(d);
      const todas = repertorio[clase];
      const opciones = todas.filter((t) => t !== ultimo);
      const texto = opciones[Math.floor(azar() * opciones.length)] ?? todas[0];
      if (!texto) return null;
      ultimo = texto;
      return { texto, clase, estado: ESTADO_ACUSE[clase] };
    },
  };
}
