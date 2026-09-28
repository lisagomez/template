/**
 * Sonido de fondo continuo (posible música ajena, respuesta 12: el reel no lleva música incrustada).
 * Se mide en las PAUSAS del habla: la voz calla y algo sigue sonando. Solo energía: no reconoce ninguna
 * canción ni identifica a nadie.
 */
import type { Palabra } from './tipos.js';

export function sonidoEnPausas(muestras: Float32Array, hz: number, palabras: readonly Palabra[], umbralDb = -40): { fraccion: number; segundos: number } {
  const marco = Math.round(hz * 0.05);
  let pausas = 0, conSonido = 0;
  for (let i = 0; i + marco <= muestras.length; i += marco) {
    const t0 = i / hz, t1 = (i + marco) / hz;
    if (palabras.some((p) => t1 > p.inicio - 0.1 && t0 < p.fin + 0.1)) continue;
    let s = 0;
    for (let k = i; k < i + marco; k++) { const v = muestras[k] ?? 0; s += v * v; }
    const db = 10 * Math.log10(s / marco + 1e-12);
    pausas++;
    if (db > umbralDb) conSonido++;
  }
  return { fraccion: pausas ? conSonido / pausas : 0, segundos: conSonido * 0.05 };
}
