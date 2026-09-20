/**
 * Lectura de lo que imprime el CLI de dictado: el acta de `lote` (una linea por turno) y las
 * metricas que `archivo`, `lote` y `di` escriben por stderr. Puro y probado: si el formato
 * cambia, falla aqui y no en la pantalla.
 */
import type { MetricasSintesis, Segmento } from '../types/index.ts';

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

/** `clave=valor` separados por espacios, como los escribe el CLI en su ultima linea de stderr. */
export function parseaClaves(stderr: string): Record<string, string> {
  const ultima = stderr.trim().split('\n').filter((l) => l.includes('=')).at(-1) ?? '';
  const salida: Record<string, string> = {};
  for (const m of ultima.matchAll(/(\S+?)=(\S+)/g)) salida[m[1] ?? ''] = m[2] ?? '';
  return salida;
}

const numeroDe = (v: string | undefined): number | undefined => {
  if (v === undefined) return undefined;
  const n = Number(v.replace(/[a-z%]+$/i, ''));
  return Number.isFinite(n) ? n : undefined;
};

export function metricasDeTranscripcion(stderr: string): { motor: string; segundosAudio: number; msMotor?: number; hablantes?: number } {
  const c = parseaClaves(stderr);
  const msMotor = numeroDe(c['transcribe']) ?? numeroDe(c['transcripcion']);
  const hablantes = numeroDe(c['hablantes']);
  return {
    motor: c['motor'] ?? 'desconocido',
    segundosAudio: numeroDe(c['audio']) ?? 0,
    ...(msMotor !== undefined ? { msMotor } : {}),
    ...(hablantes !== undefined ? { hablantes } : {}),
  };
}

export function metricasDeSintesis(stderr: string, msTotal: number): MetricasSintesis {
  const c = parseaClaves(stderr);
  return {
    voz: c['voz'] ?? 'desconocida',
    segundosAudio: numeroDe(c['audio']) ?? 0,
    msSintesis: numeroDe(c['sintesis']) ?? 0,
    msPrimerAudio: numeroDe(c['primer-audio']) ?? 0,
    ms: msTotal,
  };
}
