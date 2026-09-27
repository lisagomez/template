/**
 * Efectos de sonido sintetizados por código, deterministas, sin música: un barrido suave cuando entra
 * el titular, un golpe corto cuando aparece el precio y un golpe grave al entrar la marca. La música la
 * elige el dueño en la app de la red al publicar, con su licencia. Mono, 48 kHz, pico a -6 dBFS.
 */
import { huella } from '../comun/texto.js';
import type { Escena } from './escena.js';

export const FRECUENCIA_DE_MUESTREO = 48_000;

/** Ruido blanco reproducible (xorshift32 sembrado). */
function ruido(semilla: string): () => number {
  let s = parseInt(huella(semilla), 16) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s / 0xffffffff) * 2 - 1; };
}

function barrido(salida: Float32Array, inicio: number, semilla: string): void {
  const n = Math.round(0.28 * FRECUENCIA_DE_MUESTREO), aleatorio = ruido(semilla);
  let filtrado = 0;
  for (let i = 0; i < n && inicio + i < salida.length; i++) {
    const p = i / n, corte = 0.02 + 0.25 * p;
    filtrado += corte * (aleatorio() - filtrado);
    salida[inicio + i]! += filtrado * Math.sin(Math.PI * p) * 0.9;
  }
}

function golpe(salida: Float32Array, inicio: number, desde: number, hasta: number, segundos: number): void {
  const n = Math.round(segundos * FRECUENCIA_DE_MUESTREO);
  let fase = 0;
  for (let i = 0; i < n && inicio + i < salida.length; i++) {
    const p = i / n, f = desde * (hasta / desde) ** p;
    fase += (2 * Math.PI * f) / FRECUENCIA_DE_MUESTREO;
    salida[inicio + i]! += Math.sin(fase) * Math.exp(-6 * p) * Math.min(1, i / 96);
  }
}

export function sonidoDeEscena(e: Escena): Float32Array {
  const salida = new Float32Array(Math.round(e.duracion * FRECUENCIA_DE_MUESTREO));
  const en = (s: number) => Math.round(s * FRECUENCIA_DE_MUESTREO);
  const primero = e.capas.find((c) => c.tipo === 'titular');
  if (primero) barrido(salida, en(primero.entra), `${e.semilla}|barrido`);
  for (const c of e.capas) {
    if (c.tipo === 'precio') golpe(salida, en(c.entra + c.dura * 0.6), 880, 440, 0.14);
    if (c.tipo === 'marca') golpe(salida, en(c.entra), 140, 70, 0.3);
  }
  let pico = 0;
  for (const m of salida) pico = Math.max(pico, Math.abs(m));
  const g = pico > 0 ? 0.5 / pico : 1;
  for (let i = 0; i < salida.length; i++) salida[i] = Math.round(salida[i]! * g * 32767) / 32767;
  return salida;
}

/** WAV PCM de 16 bits, mono. */
export function wavDe(muestras: Float32Array, frecuencia = FRECUENCIA_DE_MUESTREO): Uint8Array {
  const datos = muestras.length * 2, b = new ArrayBuffer(44 + datos), v = new DataView(b);
  const escribe = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  escribe(0, 'RIFF'); v.setUint32(4, 36 + datos, true); escribe(8, 'WAVE'); escribe(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, frecuencia, true);
  v.setUint32(28, frecuencia * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); escribe(36, 'data'); v.setUint32(40, datos, true);
  muestras.forEach((m, i) => v.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(m * 32767))), true));
  return new Uint8Array(b);
}
