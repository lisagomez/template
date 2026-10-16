/**
 * El oído: traduce los eventos de un detector de voz (los de `@tu-scope/voz`: probabilidad por
 * marco, inicio y fin de habla, en tiempo de AUDIO) a las llamadas del bucle, en tiempo de PÁGINA.
 *
 *  - guarda el audio reciente para poder especular con lo dicho hasta la primera pausa;
 *  - detecta la pausa (silencio dentro de un tramo abierto) y la reanudación;
 *  - pasa el fin real del habla y el cierre del VAD por el reloj de audio;
 *  - con la máquina hablando, alimenta la máquina de interrupción (con puerta de eco) y aplica
 *    sus acciones: atenuar, restaurar, interrumpir.
 *
 * Puro y sin navegador: el detector, el reproductor y el reloj se inyectan.
 */
import type { Bucle } from './bucle.js';
import { creaInterrupcion, type MaquinaInterrupcion } from './interrupcion.js';
import { creaRelojAudio, type RelojAudio } from './reloj-audio.js';
import { nivelDb } from './audio.js';

export type EventoDetector =
  | { tipo: 'probabilidad'; valor: number; ms: number }
  | { tipo: 'inicioHabla'; ms: number }
  | { tipo: 'finHabla'; turno: { inicioMs: number; finMs: number; audio?: Float32Array } };

export interface OpcionesOido {
  bucle: Pick<Bucle, 'vozInicia' | 'pausa' | 'vozReanuda' | 'vozTermina' | 'interrumpe'>;
  hz: number;
  /** El silencio de cierre con el que está configurado el detector. */
  msSilencioCierre: number;
  /** El umbral de salida del detector (lo que cuenta como silencio dentro de un tramo). */
  umbralSalida?: number;
  /** Silencio dentro de un tramo que dispara la especulación. */
  msPausa?: number;
  msPorMarco?: number;
  /** ¿Está sonando la máquina ahora? */
  maquinaHabla(): boolean;
  atenua(activo: boolean): void;
  nivelSalidaDb?(): number | undefined;
  interrupcion?: MaquinaInterrupcion;
  /** Segundos de audio que se guardan para especular. */
  segundosBufer?: number;
}

export interface Oido {
  /** Cada trozo del micrófono, ANTES de dárselo al detector. `ahora`: reloj de la página. */
  alimenta(muestras: Float32Array, ahora: number): void;
  /** Los eventos que devolvió el detector para ese trozo. */
  procesa(eventos: readonly EventoDetector[], nivelMicDb?: number): void;
  readonly reloj: RelojAudio;
  readonly interrupcion: MaquinaInterrupcion;
  reinicia(): void;
}

export const DEFECTOS_OIDO = { umbralSalida: 0.35, msPausa: 200, msPorMarco: 32, segundosBufer: 30 } as const;

export function creaOido(o: OpcionesOido): Oido {
  const umbralSalida = o.umbralSalida ?? DEFECTOS_OIDO.umbralSalida;
  const msPausa = o.msPausa ?? DEFECTOS_OIDO.msPausa;
  const msPorMarco = o.msPorMarco ?? DEFECTOS_OIDO.msPorMarco;
  const maxMuestras = Math.round((o.segundosBufer ?? DEFECTOS_OIDO.segundosBufer) * o.hz);
  const reloj = creaRelojAudio();
  const interrupcion = o.interrupcion ?? creaInterrupcion({ msPorMarco });
  // Cola de trozos con su índice absoluto: alimentar es O(1) por trozo. (Concatenar el búfer entero en
  // cada trozo —375 por segundo a 16 kHz— saturaba el hilo principal en cuanto el búfer se llenaba.)
  let trozos: { inicio: number; datos: Float32Array }[] = [];
  let primero = 0;
  let total = 0;
  let enTramo = false;
  let inicioTramo = 0;
  let primerSilencio: number | undefined;
  let enPausa = false;

  const recorta = (desdeMs: number, hastaMs: number): Float32Array => {
    const desde = Math.max(0, Math.floor((desdeMs / 1000) * o.hz));
    const hasta = Math.min(total, Math.ceil((hastaMs / 1000) * o.hz));
    const salida = new Float32Array(Math.max(0, hasta - desde));
    for (let i = primero; i < trozos.length; i++) {
      const t = trozos[i];
      if (!t || t.inicio + t.datos.length <= desde) continue;
      if (t.inicio >= hasta) break;
      const a = Math.max(desde, t.inicio);
      const b = Math.min(hasta, t.inicio + t.datos.length);
      salida.set(t.datos.subarray(a - t.inicio, b - t.inicio), a - desde);
    }
    return salida;
  };

  const olvidaViejo = () => {
    while (primero < trozos.length) {
      const t = trozos[primero];
      if (!t || total - (t.inicio + t.datos.length) <= maxMuestras) break;
      primero++;
    }
    if (primero > 4096) {
      trozos = trozos.slice(primero);
      primero = 0;
    }
  };

  const alProbabilidad = (valor: number, ms: number, nivelMicDb: number | undefined) => {
    const habla = o.maquinaHabla();
    // El nivel del micrófono, del MISMO marco que juzgó el detector (32 ms del búfer), no del último trozo suelto
    // (2,7 ms a 16 kHz: demasiado ruidoso para compararlo con el eco esperado).
    const nivelMarco = habla ? nivelDb(recorta(ms, ms + msPorMarco)) : nivelMicDb;
    for (const a of interrupcion.procesa({ ms: reloj.aReloj(ms), prob: valor, nivelMicDb: nivelMarco, nivelSalidaDb: o.nivelSalidaDb?.() }, habla)) {
      if (a.tipo === 'atenua') o.atenua(true);
      else if (a.tipo === 'restaura') o.atenua(false);
      else {
        o.atenua(false);
        o.bucle.interrumpe(a.ms);
      }
    }
    if (!enTramo) return;
    if (valor < umbralSalida) {
      primerSilencio ??= ms;
      if (!enPausa && ms + msPorMarco - primerSilencio >= msPausa) {
        enPausa = true;
        o.bucle.pausa({ muestras: recorta(inicioTramo, ms + msPorMarco), hz: o.hz }, reloj.aReloj(primerSilencio));
      }
      return;
    }
    if (enPausa) o.bucle.vozReanuda();
    enPausa = false;
    primerSilencio = undefined;
  };

  return {
    reloj,
    interrupcion,
    alimenta(muestras, ahora) {
      trozos.push({ inicio: total, datos: muestras });
      total += muestras.length;
      olvidaViejo();
      reloj.anota((total / o.hz) * 1000, ahora);
    },
    procesa(eventos, nivelMicDb) {
      for (const e of eventos) {
        if (e.tipo === 'probabilidad') alProbabilidad(e.valor, e.ms, nivelMicDb);
        else if (e.tipo === 'inicioHabla') {
          enTramo = true;
          enPausa = false;
          primerSilencio = undefined;
          inicioTramo = e.ms;
          o.bucle.vozInicia(reloj.aReloj(e.ms));
        } else {
          enTramo = false;
          enPausa = false;
          primerSilencio = undefined;
          const audio = e.turno.audio ?? recorta(e.turno.inicioMs, e.turno.finMs);
          const finReal = reloj.aReloj(e.turno.finMs);
          o.bucle.vozTermina({ muestras: audio, hz: o.hz }, finReal, reloj.aReloj(e.turno.finMs + o.msSilencioCierre));
        }
      }
    },
    reinicia() {
      trozos = [];
      primero = 0;
      total = 0;
      enTramo = false;
      enPausa = false;
      primerSilencio = undefined;
      reloj.reinicia();
      interrupcion.reinicia();
    },
  };
}
