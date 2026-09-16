/**
 * Transcripcion por lotes: un archivo (una reunion) ya cortado en turnos por `voz`, con o sin
 * hablante, pasa por el transcriptor en serie y sale como acta.
 *
 * Es el punto donde las dos herramientas se encuentran: `voz` pone QUIEN y CUANDO, este
 * paquete pone QUE. `transcribeTurnos` de `voz` ya hace la mitad; esto anade los tiempos por
 * turno (que es lo que se mide) y el formato del acta.
 */
import type { OpcionesTranscribe, Transcriptor, Turno } from './types.js';

export interface OpcionesLote extends OpcionesTranscribe {
  frecuenciaHz: number;
  /** Si un turno falla, se sigue y queda sin texto. Con `false` se propaga. Por defecto `true`. */
  continuaSiFalla?: boolean;
  alProgreso?: (hecho: number, total: number) => void;
  /** Reloj inyectable, en milisegundos. */
  ahora?: () => number;
}

export interface ResultadoLote {
  turnos: Turno[];
  ms: { total: number; porTurno: number[] };
  fallos: number;
}

export async function transcribeLote(turnos: readonly Turno[], transcriptor: Transcriptor, opciones: OpcionesLote): Promise<ResultadoLote> {
  const ahora = opciones.ahora ?? (() => performance.now());
  const continua = opciones.continuaSiFalla ?? true;
  const salida: Turno[] = [];
  const porTurno: number[] = [];
  let fallos = 0;
  const inicio = ahora();
  for (const [i, turno] of turnos.entries()) {
    const copia: Turno = { ...turno };
    if (copia.audio) {
      const t0 = ahora();
      try {
        copia.texto = (await transcriptor.transcribe(copia.audio, opciones.frecuenciaHz, { idioma: opciones.idioma, pista: opciones.pista })).texto.trim();
      } catch (error) {
        if (!continua) throw error;
        fallos += 1;
      }
      porTurno.push(ahora() - t0);
    } else {
      porTurno.push(0);
    }
    salida.push(copia);
    opciones.alProgreso?.(i + 1, turnos.length);
  }
  return { turnos: salida, ms: { total: ahora() - inicio, porTurno }, fallos };
}

/** `hh:mm:ss.d` a partir de milisegundos. */
export function formateaTiempo(ms: number): string {
  const total = Math.max(0, Math.round(ms / 100)) / 10;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = (total % 60).toFixed(1).padStart(4, '0');
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s}`;
}

/** Acta legible: una linea por turno, con tiempo, hablante y texto. Los turnos sin texto se marcan. */
export function formateaActa(turnos: readonly Turno[]): string {
  return turnos
    .map((t) => `[${formateaTiempo(t.inicioMs)} → ${formateaTiempo(t.finMs)}] ${t.hablante ?? '?'}: ${t.texto?.length ? t.texto : '(sin texto)'}`)
    .join('\n');
}
