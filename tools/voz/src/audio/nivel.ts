/**
 * Nivel de una senal, en dB relativos a plena escala (dBFS). Es la aritmetica que comparten
 * el modelo de energia, un medidor de microfono y una puerta de energia («¿hay algo que
 * transcribir?»): una sola formula para que dos consumidores no midan distinto la misma senal.
 */
import type { Muestras } from '../types.js';

/** Valor eficaz (RMS) lineal, en [0, 1]. Vacio → 0. */
export function rms(muestras: Muestras): number {
  if (muestras.length === 0) return 0;
  let suma = 0;
  for (let i = 0; i < muestras.length; i++) suma += muestras[i]! * muestras[i]!;
  return Math.sqrt(suma / muestras.length);
}

/** RMS en dBFS. Silencio digital → -180 (nunca -Infinity: se puede restar y comparar). */
export const nivelDb = (muestras: Muestras): number => 20 * Math.log10(rms(muestras) + 1e-9);

/**
 * El nivel mas alto que alcanza la senal, por ventanas: el pico de una escucha. Con ventanas
 * de ~30 ms (480 muestras a 16 kHz) una consonante corta cuenta y un clic aislado no domina.
 */
export function picoDb(muestras: Muestras, ventana: number): number {
  const paso = Math.max(1, Math.floor(ventana));
  let max = -180;
  for (let i = 0; i < muestras.length; i += paso) max = Math.max(max, nivelDb(muestras.subarray(i, i + paso)));
  return max;
}

/** dB → factor lineal de amplitud (+6 dB ≈ ×2). */
export const factorDeDb = (db: number): number => 10 ** (db / 20);
