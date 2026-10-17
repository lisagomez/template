/**
 * Los ruidos con los que se mide el detector de voz, y la mezcla a una SNR dada. Todo determinista
 * (semilla fija): dos corridas del mismo código dan el mismo audio.
 *
 *  - `rosa`: ruido continuo (ventilador, aire acondicionado). El caso que la energía calibrada ya
 *    resolvía (README de voz, 2026-09-20); está como control.
 *  - `teclado`: tecleo a ráfagas y golpes sobre la mesa, sobre un suelo rosa. Transitorios que la
 *    energía toma por voz si pasan el margen.
 *  - `musica`: acordes, bajo y percusión sintéticos. Sin voz cantada: lo que Silero NO debería oír.
 *  - `murmullo`: seis voces REALES de FLEURS a la vez, de frases que no se usan como voz de prueba.
 *    Es voz: ningún detector de voz puede ignorarlo por naturaleza, solo por nivel.
 *  - las salas de DEMAND: ruido real grabado (`banco-ruido.ts`).
 */
import { readFileSync } from 'node:fs';
import { leeWav, preparaParaModelo } from '../../tools/voz/dist/node/index.js';

export const HZ = 16_000;

/** mulberry32: pequeño, rápido y con semilla. */
export function azar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function leeMono(ruta: string): Float32Array {
  const b = readFileSync(ruta);
  return preparaParaModelo(leeWav(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), HZ) as Float32Array;
}

/** Potencia media (lineal). */
export const potencia = (x: Float32Array, desde = 0, hasta = x.length): number => {
  let s = 0;
  for (let i = desde; i < hasta; i++) s += (x[i] ?? 0) ** 2;
  return s / Math.max(1, hasta - desde);
};

/** Ruido rosa por el filtro de Paul Kellet, normalizado a potencia 1. */
export function rosa(n: number, r: () => number): Float32Array {
  const y = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    y[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
  return normaliza(y);
}

function normaliza(y: Float32Array): Float32Array {
  const g = 1 / Math.sqrt(potencia(y) + 1e-20);
  for (let i = 0; i < y.length; i++) y[i]! *= g;
  return y;
}

/** Suma `fuente` a `y` desde `en`, con ganancia. */
function suma(y: Float32Array, fuente: Float32Array, en: number, g = 1): void {
  for (let i = 0; i < fuente.length && en + i < y.length; i++) if (en + i >= 0) y[en + i]! += (fuente[i] ?? 0) * g;
}

function clic(r: () => number): Float32Array {
  const n = Math.round(HZ * 0.012);
  const x = new Float32Array(n);
  const f = 2500 + r() * 1500;
  for (let i = 0; i < n; i++) {
    const t = i / HZ;
    x[i] = ((r() * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * f * t) * 0.4) * Math.exp(-t / 0.0025);
  }
  return x;
}

function golpe(r: () => number): Float32Array {
  const n = Math.round(HZ * 0.15);
  const x = new Float32Array(n);
  const f = 60 + r() * 70;
  for (let i = 0; i < n; i++) {
    const t = i / HZ;
    x[i] = (Math.sin(2 * Math.PI * f * t) + (r() * 2 - 1) * 0.3 * Math.exp(-t / 0.004)) * Math.exp(-t / 0.035);
  }
  return x;
}

/** Tecleo a ráfagas (palabras de 3 a 8 teclas) y golpes cada 3-8 s, sobre un suelo rosa 30 dB abajo. */
export function teclado(n: number, r: () => number): Float32Array {
  const y = rosa(n, r);
  for (let i = 0; i < n; i++) y[i]! *= 0.03;
  let t = 0;
  while (t < n) {
    const teclas = 3 + Math.floor(r() * 6);
    for (let k = 0; k < teclas && t < n; k++) {
      suma(y, clic(r), t, 0.5 + r() * 0.5);
      t += Math.round(HZ * (0.09 + r() * 0.16));
    }
    t += Math.round(HZ * (0.4 + r() * 1.6));
  }
  for (let g = Math.round(HZ * (1 + r() * 3)); g < n; g += Math.round(HZ * (3 + r() * 5))) suma(y, golpe(r), g, 1.5 + r());
  return normaliza(y);
}

/** Acordes (I-V-vi-IV en do) con armónicos, bajo, bombo y charles, a 110 por minuto. */
export function musica(n: number, r: () => number): Float32Array {
  const y = new Float32Array(n);
  const acordes = [[261.6, 329.6, 392.0], [196.0, 246.9, 293.7], [220.0, 261.6, 329.6], [174.6, 220.0, 261.6]];
  const tiempo = 60 / 110;
  const compas = Math.round(HZ * tiempo * 4);
  for (let i = 0; i < n; i++) {
    const c = acordes[Math.floor(i / compas) % acordes.length] ?? acordes[0]!;
    const t = i / HZ;
    const dentro = (i % compas) / HZ;
    const env = Math.min(1, dentro / 0.05) * (0.6 + 0.4 * Math.exp(-dentro / 0.8));
    let v = 0;
    for (const f of c) for (let k = 1; k <= 5; k++) v += Math.sin(2 * Math.PI * f * k * t) / k;
    v += 1.5 * Math.sin(2 * Math.PI * ((c[0] ?? 220) / 2) * t);
    y[i] = v * env * 0.15;
  }
  const pulso = Math.round(HZ * tiempo);
  for (let p = 0; p < n; p += pulso) {
    const bombo = new Float32Array(Math.round(HZ * 0.12)).map((_, i) => Math.sin(2 * Math.PI * (50 + 80 * Math.exp(-i / 400)) * (i / HZ)) * Math.exp(-i / 900));
    suma(y, bombo, p, 1.2);
    const charles = new Float32Array(Math.round(HZ * 0.03)).map((_, i) => (r() * 2 - 1) * Math.exp(-i / 60));
    suma(y, charles, p + Math.round(pulso / 2), 0.4);
  }
  return normaliza(y);
}

/** `voces` frases reales sonando a la vez, cada una en bucle con su propio desfase. */
export function murmullo(n: number, frases: readonly Float32Array[], r: () => number, voces = 6): Float32Array {
  const y = new Float32Array(n);
  for (let v = 0; v < voces; v++) {
    let t = -Math.floor(r() * HZ * 5);
    while (t < n) {
      const f = frases[Math.floor(r() * frases.length)];
      if (!f) break;
      suma(y, f, t);
      t += f.length + Math.round(HZ * r() * 0.3);
    }
  }
  return normaliza(y);
}

/** Un trozo de `n` muestras de una grabación, en bucle desde un punto al azar, a potencia 1. */
export function trozoDe(grabacion: Float32Array, n: number, r: () => number): Float32Array {
  const y = new Float32Array(n);
  let p = Math.floor(r() * grabacion.length);
  for (let i = 0; i < n; i++) {
    y[i] = grabacion[p] ?? 0;
    p = (p + 1) % grabacion.length;
  }
  return normaliza(y);
}

/** Un ruido por nombre: los sintéticos de aquí o una sala de DEMAND (`salas`). `fondo`: frases del murmullo. */
export function ruidoDe(nombre: string, n: number, fondo: () => readonly Float32Array[], salas: Readonly<Record<string, string>>): Float32Array {
  const r = azar(nombre.length * 97 + 3);
  if (nombre === 'rosa') return rosa(n, r);
  if (nombre === 'teclado') return teclado(n, r);
  if (nombre === 'musica') return musica(n, r);
  if (nombre === 'murmullo') return murmullo(n, fondo(), r);
  const ruta = salas[nombre];
  if (!ruta) throw new Error(`ruido desconocido: ${nombre}`);
  return trozoDe(leeMono(ruta), n, r);
}

/**
 * Nivel ACTIVO de la voz: potencia media de las ventanas de 10 ms que están a menos de 35 dB de la
 * más fuerte (las pausas no cuentan, como en la P.56 de la UIT). Es contra lo que se mide la SNR.
 */
export function potenciaActiva(voz: Float32Array): number {
  const v = HZ / 100;
  const ventanas: number[] = [];
  for (let i = 0; i + v <= voz.length; i += v) ventanas.push(potencia(voz, i, i + v));
  const max = Math.max(...ventanas, 1e-20);
  const activas = ventanas.filter((p) => p >= max * 10 ** (-35 / 10));
  return activas.reduce((s, p) => s + p, 0) / Math.max(1, activas.length);
}
