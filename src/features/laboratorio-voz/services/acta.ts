/**
 * Lectura de lo que imprime el CLI de dictado: el acta de `lote` (una linea por turno) y las
 * metricas que `archivo`, `lote` y `di` escriben por stderr. Puro y probado: si el formato
 * cambia, falla aqui y no en la pantalla.
 */
import type { Segmento } from '../types/index.ts';

const LINEA = /^\[(\d+):(\d+):(\d+(?:\.\d+)?)\s*→\s*(\d+):(\d+):(\d+(?:\.\d+)?)\]\s*(.+?):\s*(.*)$/;

const aMs = (h: string, m: string, s: string): number => Math.round((Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000);

export function parseaActa(texto: string): Segmento[] {
  const salida: Segmento[] = [];
  for (const linea of texto.split('\n')) {
    const m = LINEA.exec(linea.trim());
    if (!m) continue;
    const [, h1, m1, s1, h2, m2, s2, hablante, cuerpo] = m;
    const textoTurno = (cuerpo ?? '').trim();
    salida.push({ inicioMs: aMs(h1 ?? '0', m1 ?? '0', s1 ?? '0'), finMs: aMs(h2 ?? '0', m2 ?? '0', s2 ?? '0'), hablante: (hablante ?? '?').trim(), texto: textoTurno === '(sin texto)' ? '' : textoTurno });
  }
  return salida;
}

export { metricasDeSintesis, metricasDeTranscripcion, parseaClaves } from '../../../shared/lib/dictado-metricas.ts';
