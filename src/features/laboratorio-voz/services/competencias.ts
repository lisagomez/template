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

export interface Competencias {
  palabras: number;
  segundosHabla: number;
  segundosTotales: number;
  palabrasPorMinuto: number;
  ratioHabla: number;
  muletillas: Muletilla[];
  muletillasPorMinuto: number;
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

export function evaluaCompetencias(segmentos: readonly Segmento[], duracionTotalMs?: number): Competencias {
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
    pausasLargas: pausasEntre(segmentos),
    fraseMasLarga: Math.max(0, ...segmentos.map((s) => tokeniza(s.texto).length)),
  };
}
