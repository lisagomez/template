/**
 * Competencias orales POR REGLAS, medidas sobre la grabacion de la persona: ritmo (palabras
 * por minuto de habla), muletillas candidatas, pausas largas y proporcion de tiempo hablado.
 * Mide, no juzga: los rangos de referencia son orientativos y se muestran como tales.
 */
import type { Segmento } from '../types/index.ts';
import { tokeniza } from './texto.ts';

export interface Muletilla {
  palabra: string;
  veces: number;
}

export interface Pausa {
  inicioMs: number;
  finMs: number;
  ms: number;
}

/**
 * Motores que, MEDIDOS contra guiones con muletillas escritas (12 lecturas, dos voces Piper, el
 * 2026-09-20), las conservan: regla recall ≥ 80 % y precisión ≥ 90 %. Parakeet (el principal) dio
 * recall 76 % y queda fuera; faster-whisper small, 82 % / 100 %, entra. Lista cerrada: la llena la
 * medición (`scripts/laboratorio-voz/mide-competencias.mjs`), no una opinión.
 */
export const MOTORES_QUE_CONSERVAN_MULETILLAS: readonly string[] = ['faster-whisper'];

export type MedicionMuletillas = 'medida' | 'no-medible';

export interface Competencias {
  palabras: number;
  segundosHabla: number;
  segundosTotales: number;
  palabrasPorMinuto: number;
  ratioHabla: number;
  muletillas: Muletilla[];
  muletillasPorMinuto: number;
  /** «no-medible» cuando el motor que transcribio tiende a omitir las muletillas: la cifra no vale. */
  medicionMuletillas: MedicionMuletillas;
  pausasLargas: Pausa[];
  fraseMasLarga: number;
}

export const REFERENCIA = {
  palabrasPorMinuto: '120 a 160 en exposicion clara',
  muletillasPorMinuto: 'menos de 3',
  pausasLargas: 'pausas de mas de 1,5 s: pocas y con intencion',
  ratioHabla: 'en una presentacion, alto; en una conversacion, cerca de la mitad',
};

const MULETILLAS = ['este', 'eh', 'em', 'mmm', 'o sea', 'pues', 'bueno', 'digamos', 'como que', 'no?', 'vale', 'osea', 'basicamente', 'literal', 'tipo'];

export function cuentaMuletillas(texto: string): Muletilla[] {
  const t = ` ${tokeniza(texto).join(' ')} `;
  return MULETILLAS.map((m) => {
    const clave = ` ${m.replace('?', '')} `;
    let veces = 0;
    let desde = 0;
    for (let i = t.indexOf(clave, desde); i !== -1; i = t.indexOf(clave, desde)) {
      veces++;
      desde = i + 1;
    }
    return { palabra: m, veces };
  }).filter((m) => m.veces > 0);
}

export function pausasEntre(segmentos: readonly Segmento[], minimoMs = 1_500): Pausa[] {
  const salida: Pausa[] = [];
  for (let i = 1; i < segmentos.length; i++) {
    const previo = segmentos[i - 1];
    const actual = segmentos[i];
    if (!previo || !actual) continue;
    const hueco = actual.inicioMs - previo.finMs;
    if (hueco >= minimoMs) salida.push({ inicioMs: previo.finMs, finMs: actual.inicioMs, ms: hueco });
  }
  return salida;
}

export const motorConservaMuletillas = (motor: string | undefined): boolean => motor !== undefined && MOTORES_QUE_CONSERVAN_MULETILLAS.some((m) => motor.includes(m));

export function evaluaCompetencias(segmentos: readonly Segmento[], duracionTotalMs?: number, motor?: string): Competencias {
  const texto = segmentos.map((s) => s.texto).join(' ');
  const palabras = tokeniza(texto).length;
  const msHabla = segmentos.reduce((s, x) => s + Math.max(0, x.finMs - x.inicioMs), 0);
  const fin = duracionTotalMs ?? Math.max(0, ...segmentos.map((s) => s.finMs));
  const minutos = msHabla / 60_000;
  const muletillas = cuentaMuletillas(texto);
  const totalMuletillas = muletillas.reduce((s, m) => s + m.veces, 0);
  return {
    palabras,
    segundosHabla: Math.round(msHabla / 100) / 10,
    segundosTotales: Math.round(fin / 100) / 10,
    palabrasPorMinuto: minutos > 0 ? Math.round(palabras / minutos) : 0,
    ratioHabla: fin > 0 ? Math.round((msHabla / fin) * 100) / 100 : 0,
    muletillas,
    muletillasPorMinuto: minutos > 0 ? Math.round((totalMuletillas / minutos) * 10) / 10 : 0,
    medicionMuletillas: motorConservaMuletillas(motor) ? 'medida' : 'no-medible',
    pausasLargas: pausasEntre(segmentos),
    fraseMasLarga: Math.max(0, ...segmentos.map((s) => tokeniza(s.texto).length)),
  };
}

export type Franja = 'bajo' | 'en-rango' | 'alto';

export interface Rubrica {
  ritmo: { franja: Franja; texto: string };
  muletillas: { franja: Franja | 'no-medible'; texto: string };
  pausas: { franja: Franja; texto: string };
  tiempoHablado: { franja: Franja; texto: string };
  /** Siempre presente: la rubrica orienta, no califica. */
  aviso: string;
}

export const AVISO_RUBRICA = 'Orientativa, no es una calificación: son rangos de una exposición clara para adultos; un examen lo pone una persona.';

/**
 * Rubrica por franjas, nunca un numero global: cada medida cae en «bajo», «en rango» o «alto»
 * frente a los rangos de REFERENCIA, y las muletillas solo se juzgan si el motor las conserva.
 */
export function rubrica(c: Competencias): Rubrica {
  const ritmo: Franja = c.palabrasPorMinuto < 120 ? 'bajo' : c.palabrasPorMinuto > 160 ? 'alto' : 'en-rango';
  const pausasPorMinuto = c.segundosHabla > 0 ? c.pausasLargas.length / (c.segundosTotales / 60) : 0;
  const pausas: Franja = pausasPorMinuto > 4 ? 'alto' : pausasPorMinuto < 0.5 ? 'bajo' : 'en-rango';
  const tiempo: Franja = c.ratioHabla < 0.5 ? 'bajo' : c.ratioHabla > 0.95 ? 'alto' : 'en-rango';
  const muletillas: Franja | 'no-medible' = c.medicionMuletillas === 'no-medible' ? 'no-medible' : c.muletillasPorMinuto < 3 ? 'en-rango' : c.muletillasPorMinuto < 6 ? 'alto' : 'alto';
  return {
    ritmo: { franja: ritmo, texto: ritmo === 'bajo' ? 'ritmo pausado: por debajo de 120 palabras por minuto' : ritmo === 'alto' ? 'ritmo rápido: por encima de 160 palabras por minuto' : 'ritmo en el rango de una exposición clara (120 a 160)' },
    muletillas: { franja: muletillas, texto: muletillas === 'no-medible' ? 'no medible con este motor: tiende a omitir las muletillas al transcribir' : muletillas === 'en-rango' ? 'pocas muletillas (menos de 3 por minuto)' : 'muletillas frecuentes (3 o más por minuto)' },
    pausas: { franja: pausas, texto: pausas === 'alto' ? 'muchas pausas largas (más de 4 por minuto)' : pausas === 'bajo' ? 'casi sin pausas largas: puede faltar aire al discurso' : 'pausas largas en un rango razonable' },
    tiempoHablado: { franja: tiempo, texto: tiempo === 'bajo' ? 'hablaste menos de la mitad del tiempo' : tiempo === 'alto' ? 'hablaste casi todo el tiempo, sin silencios' : 'proporción de habla razonable' },
    aviso: AVISO_RUBRICA,
  };
}
