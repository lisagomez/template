/**
 * El reproductor del navegador: cada frase es un WAV en un `<audio>` NATIVO.
 *
 * Por qué `<audio>` y no Web Audio: Chrome no cancela el eco de lo que suena por Web Audio, y el
 * micrófono se queda abierto mientras la máquina habla. Por qué dos elementos alternos que se
 * reutilizan: iOS solo deja sonar sin gesto a un elemento que ya sonó en un gesto (`desbloquea`).
 * Lo que se conserva de la fuente (business-os, `audio-engine.ts`, MIT): `preservesPitch` con
 * `playbackRate` (velocidad sin cambiar el tono) y liberar cada URL al terminar.
 *
 * «Suena» no es «empezó a reproducir»: la voz sintética trae silencio delante. El instante que se
 * reporta es `playing` + el silencio inicial de esa frase (calculado sobre su PCM) / velocidad +
 * la latencia de salida que sepa la página.
 */
import { codificaWav, msPrimerSonido, nivelDb, nivelMaximoReciente, recortaSilencio } from '../audio.js';
import type { PiezaReproducir } from '../canal-voz.js';
import type { EventoReproductor, Reproductor } from '../tipos.js';

export interface OpcionesReproductorNavegador {
  reloj?: () => number;
  /** Latencia de salida conocida (p. ej. `AudioContext.outputLatency`), en ms. */
  latenciaSalidaMs?: () => number;
  volumenAtenuado?: number;
  umbralAudibleDb?: number;
  /** Quitar el silencio que la voz sintética trae en los bordes (por defecto, sí). */
  recorta?: boolean;
}

export interface ReproductorNavegador extends Reproductor {
  /** Llamar dentro de un gesto (toque, tecla): deja los elementos listos para sonar en iOS. */
  desbloquea(): void;
  /** Nivel de lo que suena ahora (dBFS, sobre el PCM en la posición de reproducción). */
  nivelDb(): number | undefined;
  /**
   * La referencia de la puerta de eco: el máximo de lo que sonó en los últimos 300 ms (el eco llega tarde), y
   * durante 300 ms después de callar (la cola de la sala).
   */
  nivelReferenciaEcoDb(): number | undefined;
  readonly sonando: boolean;
  destruye(): void;
}

interface EnCola {
  pieza: PiezaReproducir;
  url: string;
  primerSonidoMs: number;
  sono: boolean;
}

const WAV_MUDO = (() => {
  if (typeof URL === 'undefined' || typeof Blob === 'undefined') return '';
  return URL.createObjectURL(new Blob([codificaWav(new Float32Array(800), 16_000)], { type: 'audio/wav' }));
})();

export function creaReproductorNavegador(o: OpcionesReproductorNavegador = {}): ReproductorNavegador {
  const reloj = o.reloj ?? (() => performance.now());
  const atenuado = o.volumenAtenuado ?? 0.25;
  const elementos = [new Audio(), new Audio()];
  const oyentes = new Set<(e: EventoReproductor) => void>();
  let cola: EnCola[] = [];
  let actual: { item: EnCola; el: HTMLAudioElement } | undefined;
  let turno = 0;
  let velocidad = 1;
  let volumen = 1;
  let cuadro = 0;
  let ultimaFraccion = -1;
  let ultimoNivel = { db: -180, cuando: Number.NEGATIVE_INFINITY };

  for (const el of elementos) {
    el.preload = 'auto';
    el.preservesPitch = true;
  }
  const emite = (e: EventoReproductor) => {
    for (const f of oyentes) f(e);
  };

  const progreso = () => {
    cuadro = 0;
    if (!actual) return;
    const { el, item } = actual;
    if (el.duration > 0 && Number.isFinite(el.duration)) {
      const fraccion = Math.min(1, el.currentTime / el.duration);
      if (Math.abs(fraccion - ultimaFraccion) >= 0.01) {
        ultimaFraccion = fraccion;
        emite({ tipo: 'progreso', turno: item.pieza.turno, indice: item.pieza.indice, fraccion });
      }
    }
    cuadro = requestAnimationFrame(progreso);
  };

  const fin = (item: EnCola, error?: string) => {
    if (actual?.item !== item) return;
    URL.revokeObjectURL(item.url);
    actual = undefined;
    const { turno: t, indice } = item.pieza;
    emite(error ? { tipo: 'error', turno: t, indice, mensaje: error } : { tipo: 'termina', turno: t, indice, t: reloj() });
    siguiente();
  };

  const siguiente = () => {
    const item = cola.shift();
    if (!item) return;
    const el = elementos[item.pieza.indice % 2] ?? (elementos[0] as HTMLAudioElement);
    actual = { item, el };
    ultimaFraccion = -1;
    el.onplaying = () => {
      if (actual?.item !== item || item.sono) return;
      item.sono = true;
      const t = reloj() + item.primerSonidoMs / velocidad + (o.latenciaSalidaMs?.() ?? 0);
      emite({ tipo: 'suena', turno: item.pieza.turno, indice: item.pieza.indice, t });
      if (!cuadro) cuadro = requestAnimationFrame(progreso);
    };
    el.onended = () => fin(item);
    el.onerror = () => fin(item, 'el navegador no pudo reproducir la frase');
    el.src = item.url;
    el.playbackRate = velocidad;
    el.volume = volumen;
    el.play().catch((e: unknown) => fin(item, e instanceof Error ? e.message : 'play() rechazado'));
  };

  const limpia = () => {
    for (const item of cola) URL.revokeObjectURL(item.url);
    cola = [];
    if (actual) {
      actual.el.pause();
      URL.revokeObjectURL(actual.item.url);
      actual = undefined;
    }
    if (cuadro) cancelAnimationFrame(cuadro);
    cuadro = 0;
  };

  return {
    get sonando() {
      return actual !== undefined;
    },
    reproduce(p) {
      if (p.turno !== turno) {
        limpia(); // un turno nuevo nunca se mezcla con lo que quedaba del anterior
        turno = p.turno;
      }
      const muestras = o.recorta === false ? p.audio.muestras : recortaSilencio(p.audio.muestras, p.audio.hz);
      const pieza = { ...p, audio: { muestras, hz: p.audio.hz } };
      const url = URL.createObjectURL(new Blob([codificaWav(muestras, p.audio.hz)], { type: 'audio/wav' }));
      cola.push({ pieza, url, primerSonidoMs: msPrimerSonido(muestras, p.audio.hz, o.umbralAudibleDb) ?? 0, sono: false });
      if (!actual) siguiente();
    },
    detiene() {
      limpia();
      volumen = 1;
    },
    atenua(activo) {
      volumen = activo ? atenuado : 1;
      if (actual) actual.el.volume = volumen;
    },
    velocidad(v) {
      velocidad = v;
      if (actual) actual.el.playbackRate = v;
    },
    alEvento(f) {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    desbloquea() {
      if (!WAV_MUDO) return;
      for (const el of elementos) {
        if (actual?.el === el) continue;
        el.src = WAV_MUDO;
        el.play().catch(() => undefined);
      }
    },
    nivelDb() {
      if (!actual) return undefined;
      const { muestras, hz } = actual.item.pieza.audio;
      const i = Math.round(actual.el.currentTime * hz);
      return nivelDb(muestras, Math.max(0, i - Math.round(hz * 0.015)), i + Math.round(hz * 0.015));
    },
    nivelReferenciaEcoDb() {
      if (!actual) return ultimoNivel.cuando > reloj() - 300 ? ultimoNivel.db : undefined;
      const { muestras, hz } = actual.item.pieza.audio;
      const db = nivelMaximoReciente(muestras, hz, Math.round(actual.el.currentTime * hz));
      ultimoNivel = { db, cuando: reloj() };
      return db;
    },
    destruye() {
      limpia();
      oyentes.clear();
      for (const el of elementos) el.removeAttribute('src');
    },
  };
}
