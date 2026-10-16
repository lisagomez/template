/**
 * El enrutador decide, SIN modelo de lenguaje, si lo dicho es una orden que el bucle resuelve
 * solo (callar, repetir, la hora, la agenda) o una conversación para el cerebro. Va delante del
 * LLM por tres razones: la latencia (una orden se contesta en local en menos de un segundo), el
 * gasto (no paga tokens) y la privacidad (el texto de una orden no sale de la máquina).
 *
 * Es intercambiable (`Enrutador`): esta es la línea base local por reglas y parecido. Otro
 * enrutador (un clasificador, Jev) se mide contra el mismo corpus antes de sustituirla.
 *
 * Reglas de decisión, en este orden:
 *  1. Una petición de ESCRITURA (agendar, mandar, borrar…) se reconoce por su verbo al inicio y
 *     sale como orden de escritura: el bucle la deja en dry-run y pide confirmación. Nunca va al
 *     cerebro, que no tiene manos, ni se ejecuta.
 *  2. Lo que se parece a un ejemplo del catálogo por encima de `umbralOrden`, con margen sobre la
 *     segunda orden más parecida, es esa orden.
 *  3. Lo que se le parece a medias (entre `umbralDudoso` y `umbralOrden`) es DUDOSO y va al
 *     cerebro: equivocarse de orden en local es peor que pagar una vuelta del modelo.
 *  4. Lo demás es conversación.
 */
import { palabras, parecido } from './texto.js';

export type ClaseOrden = 'control' | 'lectura' | 'escritura';

export interface DefinicionOrden {
  id: string;
  clase: Exclude<ClaseOrden, 'escritura'>;
  ejemplos: readonly string[];
  /** Palabras que TIENEN que oírse (ya normalizadas): «agenda de mañana» sin «mañana» no lo es. */
  requiere?: readonly string[];
}

export type Decision =
  | { tipo: 'orden'; orden: string; clase: ClaseOrden; confianza: number; texto: string }
  | { tipo: 'llm'; motivo: 'conversacion' | 'dudoso'; confianza: number; texto: string; parecidaA?: string }
  | { tipo: 'nada' };

export interface Enrutador {
  readonly id: string;
  /** `candidatos`: transcripciones alternativas de lo mismo, la preferida primero. */
  decide(candidatos: readonly string[]): Decision;
}

export interface OpcionesEnrutador {
  ordenes: readonly DefinicionOrden[];
  umbralOrden?: number;
  umbralDudoso?: number;
  /** Ventaja mínima de la mejor orden sobre la segunda para no dudar. */
  margen?: number;
  /** Verbos que, al inicio, convierten la petición en escritura. */
  verbosEscritura?: readonly string[];
  /** Cómo se llama al asistente («mando»): llamarlo por su nombre no cambia la orden. */
  vocativos?: readonly string[];
}

export const DEFECTOS_ENRUTADOR = { umbralOrden: 0.8, umbralDudoso: 0.55, margen: 0.08 } as const;

/** Palabras que no cambian la orden: cortesía, muletillas y llamadas de atención. */
const RELLENO = new Set([
  'por', 'favor', 'porfa', 'porfavor', 'oye', 'eh', 'em', 'mm', 'este', 'bueno', 'pues', 'a', 'ver', 'ya', 'ahora', 'ahorita',
  'oiga', 'mira', 'dime', 'me', 'puedes', 'podrias', 'podria', 'quieres', 'quiero', 'que', 'la', 'el', 'lo', 'los', 'las', 'un', 'una',
  'mi', 'mis', 'tu', 'de', 'del', 'en', 'y', 'o', 'si', 'gracias', 'hola', 'tantito', 'poquito', 'favorcito', 'es', 'son',
  'dices', 'decirme', 'dame', 'sabes', 'tienes', 'puedo',
]);

export const VERBOS_ESCRITURA: readonly string[] = [
  'agenda', 'agendame', 'programa', 'programame', 'crea', 'creame', 'anade', 'agrega', 'apunta', 'anota', 'manda', 'mandale', 'envia',
  'enviale', 'escribe', 'escribele', 'responde', 'contesta', 'borra', 'elimina', 'cancela', 'mueve', 'cambia', 'reprograma', 'pospon',
  'recuerdame', 'notifica', 'avisa', 'avisale', 'publica', 'compra', 'paga', 'transfiere', 'reserva', 'invita',
];

/** Objetos que solo señalan lo que ya está pendiente («cancela eso»): no son una escritura nueva. */
const PRONOMBRES = new Set(['eso', 'esto', 'aquello', 'todo', 'ello']);

/** Lo que puede seguir a «agenda» cuando es verbo; «agenda de hoy» o «agenda?» son lectura. */
const TRAS_AGENDA_VERBO = new Set(['un', 'una', 'el', 'la', 'a', 'me', 'nos', 'para', 'mañana', 'cita', 'reunion', 'junta', 'llamada', 'evento']);

/** Interjecciones y titubeos («mmm», «ehh», «ajá»): nunca cambian la intención. */
const INTERJECCION = /^(m+|mh+m*|e+h*|a+h+|u+m+|aja|aha)$/u;
/** Demostrativos y lugares sueltos («repite eso», «detente ahí»). */
const DEICTICOS = new Set(['eso', 'esto', 'ahi', 'aqui', 'alla', 'aca']);

/**
 * Clases de sinónimos del dominio: se aplican igual al ejemplo y a lo oído, así «¿hay juntas
 * hoy?» y «¿tengo reuniones hoy?» comparan las mismas palabras.
 */
const SINONIMOS: Record<string, string> = Object.fromEntries(
  Object.entries({
    cita: ['citas', 'junta', 'juntas', 'reunion', 'reuniones', 'evento', 'eventos', 'pendiente', 'pendientes', 'compromiso', 'compromisos'],
    agenda: ['agendado', 'agendada', 'calendario'],
    basta: ['suficiente'],
    despacio: ['lento', 'lenta', 'pausado', 'despaci'],
    rapido: ['deprisa', 'aprisa', 'veloz', 'rapida'],
    acelera: ['apura'],
    gasto: ['gastos', 'gastado', 'gastaste', 'costado', 'cuestas', 'presupuesto'],
    latencia: ['rapidez', 'tardas', 'tardaste', 'tarda'],
    hora: ['horas'],
  }).flatMap(([canonica, otras]) => otras.map((o) => [o, canonica])),
);

const CLITICO = /(me|te|se|nos|le|les|lo|la|los|las)$/u;
/** «párale» → «para», «olvídalo» → «olvida», «léeme» → «lee»: el verbo sin el pronombre pegado. */
function sinClitico(p: string): string {
  let raiz = p;
  for (let i = 0; i < 3 && raiz.length >= 5; i++) {
    const m = CLITICO.exec(raiz);
    const resto = m ? raiz.slice(0, -m[0].length) : raiz;
    if (!m || resto.length < 3 || !/[aeir]$/u.test(resto)) break;
    raiz = resto;
  }
  return raiz;
}

/** «lentito» → «lento», «rapidito» → «rapido». */
const sinDiminutivo = (p: string) => (p.length >= 6 ? p.replace(/c?it(o|a)s?$/u, '$1') : p);

export function normalizaPalabra(p: string): string {
  const base = sinDiminutivo(sinClitico(p));
  return SINONIMOS[base] ?? SINONIMOS[p] ?? base;
}

function contenido(texto: string, vocativos: ReadonlySet<string> = new Set()): string[] {
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const p of palabras(texto)) {
    if (RELLENO.has(p) || DEICTICOS.has(p) || vocativos.has(p) || INTERJECCION.test(p)) continue;
    const n = normalizaPalabra(p);
    if (RELLENO.has(n) || vistas.has(n)) continue;
    vistas.add(n);
    salida.push(n);
  }
  return salida;
}

/** «¿Qué?», «¿cómo?», «¿mande?», «¿perdón?» dichos solos piden repetir. */
const PIDE_REPETIR = new Set(['que', 'como', 'mande', 'perdon', 'eh']);

/** Parecido de Dice con emparejamiento difuso de palabras: 1 = las mismas palabras. */
export function parecidoFrases(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const usadas = new Set<number>();
  let suma = 0;
  for (const pb of b) {
    let mejor = 0;
    let indice = -1;
    a.forEach((pa, i) => {
      if (usadas.has(i)) return;
      const s = parecido(pa, pb);
      if (s > mejor) {
        mejor = s;
        indice = i;
      }
    });
    if (indice >= 0 && mejor >= 0.75) {
      usadas.add(indice);
      suma += mejor;
    }
  }
  return (2 * suma) / (a.length + b.length);
}

function esEscritura(todas: readonly string[], verbos: ReadonlySet<string>): boolean {
  const i = todas.findIndex((p) => !RELLENO.has(p) || p === 'me');
  const primera = todas[i];
  if (!primera) return false;
  const verbo = [...verbos].find((v) => parecido(primera, v) >= 0.88);
  if (!verbo) return false;
  // Sin objeto no es una petición de escritura: «cancela» o «cancela eso» es descartar lo pendiente.
  if (!todas.slice(i + 1).some((p) => (!RELLENO.has(p) && !PRONOMBRES.has(p)) || TRAS_AGENDA_VERBO.has(p))) return false;
  if (verbo !== 'agenda') return true;
  return TRAS_AGENDA_VERBO.has(todas[i + 1] ?? '');
}

interface Puntuacion {
  orden: DefinicionOrden;
  valor: number;
}

function puntua(tokens: readonly string[], ordenes: readonly DefinicionOrden[], vocativos: ReadonlySet<string>): Puntuacion[] {
  return ordenes
    .map((orden) => ({
      orden,
      valor: orden.requiere && !orden.requiere.every((r) => tokens.includes(r)) ? 0 : Math.max(...orden.ejemplos.map((e) => parecidoFrases(tokens, contenido(e, vocativos)))),
    }))
    .sort((x, y) => y.valor - x.valor);
}

export function creaEnrutadorLocal(opciones: OpcionesEnrutador): Enrutador {
  const umbralOrden = opciones.umbralOrden ?? DEFECTOS_ENRUTADOR.umbralOrden;
  const umbralDudoso = opciones.umbralDudoso ?? DEFECTOS_ENRUTADOR.umbralDudoso;
  const margen = opciones.margen ?? DEFECTOS_ENRUTADOR.margen;
  const verbos = new Set(opciones.verbosEscritura ?? VERBOS_ESCRITURA);
  const vocativos = new Set((opciones.vocativos ?? ['mando']).flatMap((v) => palabras(v)));

  const decideUno = (texto: string): Decision => {
    const todas = palabras(texto);
    if (todas.length === 0) return { tipo: 'nada' };
    if (todas.length === 1 && PIDE_REPETIR.has(todas[0] ?? '') && /\?/u.test(texto)) return { tipo: 'orden', orden: 'repite', clase: 'control', confianza: 0.85, texto };
    if (esEscritura(todas, verbos)) return { tipo: 'orden', orden: 'escritura', clase: 'escritura', confianza: 0.9, texto };
    const tokens = contenido(texto, vocativos);
    if (tokens.length === 0) return { tipo: 'nada' };
    const [primera, segunda] = puntua(tokens, opciones.ordenes, vocativos);
    if (!primera) return { tipo: 'llm', motivo: 'conversacion', confianza: 0, texto };
    const ventaja = primera.valor - (segunda?.valor ?? 0);
    if (primera.valor >= umbralOrden && ventaja >= margen) {
      return { tipo: 'orden', orden: primera.orden.id, clase: primera.orden.clase, confianza: primera.valor, texto };
    }
    if (primera.valor >= umbralDudoso) return { tipo: 'llm', motivo: 'dudoso', confianza: primera.valor, texto, parecidaA: primera.orden.id };
    return { tipo: 'llm', motivo: 'conversacion', confianza: primera.valor, texto };
  };

  return {
    id: 'local-reglas-0.3',
    decide(candidatos) {
      const decisiones = candidatos.map(decideUno);
      const ordenes = decisiones.filter((d): d is Extract<Decision, { tipo: 'orden' }> => d.tipo === 'orden');
      if (ordenes.length > 0) return ordenes.reduce((a, b) => (b.confianza > a.confianza ? b : a));
      return decisiones.find((d) => d.tipo === 'llm') ?? { tipo: 'nada' };
    },
  };
}
