/**
 * Lectura de lo que imprime el CLI de dictado por stderr (`clave=valor` en su ultima linea):
 * `archivo`, `lote` y `di`. Puro y sin dependencias; lo comparten la ruta movil, el laboratorio
 * y sus pruebas. Si el formato del CLI cambia, falla aqui y no en la pantalla.
 */

export interface MetricasSintesis {
  voz: string;
  segundosAudio: number;
  msSintesis: number;
  msPrimerAudio: number;
  ms: number;
}

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
