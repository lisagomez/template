/**
 * Remuestreo a la frecuencia que exige el modelo.
 *
 * El navegador entrega 44.1 o 48 kHz y los modelos de voz quieren 16 kHz. Bajar de
 * frecuencia tirando muestras sin filtrar primero **pliega** todo lo que hay por encima de
 * 8 kHz sobre la banda que si te importa: el resultado suena limpio al oido pero mete
 * energia falsa justo donde el VAD y los embeddings miran. Por eso aqui hay un filtro.
 */

import type { Muestras } from '../types.js';

/**
 * Filtro paso-bajo FIR por sinc enventanado (Hann).
 *
 * `corte` va normalizado a la frecuencia de muestreo de ENTRADA (0.5 = Nyquist).
 */
function disenaPasoBajo(corte: number, taps: number): Float32Array {
  const h = new Float32Array(taps);
  const medio = (taps - 1) / 2;
  let suma = 0;
  for (let i = 0; i < taps; i++) {
    const x = i - medio;
    // sinc(2*corte*x), con el limite en x=0 resuelto a mano.
    const sinc = x === 0 ? 2 * corte : Math.sin(2 * Math.PI * corte * x) / (Math.PI * x);
    const ventana = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (taps - 1));
    const v = sinc * ventana;
    h[i] = v;
    suma += v;
  }
  // Normalizar a ganancia 1 en continua: sin esto el remuestreo cambia el volumen y los
  // umbrales del detector dejan de significar lo mismo.
  for (let i = 0; i < taps; i++) h[i] = h[i]! / suma;
  return h;
}

export interface Remuestreador {
  /** Consume audio y devuelve lo que ya esta listo a la frecuencia de salida. */
  procesa(entrada: Muestras): Muestras;
  reinicia(): void;
}

/**
 * Remuestreador con estado: mantiene la cola del filtro y la fase entre llamadas, asi que
 * se le puede dar audio en trozos de cualquier tamano sin que aparezcan clics en las
 * costuras. Un remuestreo sin estado por bloque los produce siempre.
 */
export function creaRemuestreador(desdeHz: number, haciaHz: number, taps = 63): Remuestreador {
  if (desdeHz <= 0 || haciaHz <= 0) throw new Error('frecuencias de muestreo invalidas');
  const paso = desdeHz / haciaHz;
  // Solo filtramos cuando bajamos de frecuencia; al subir no hay nada que plegar.
  const corte = paso > 1 ? 0.5 / paso : 0.5;
  const h = disenaPasoBajo(corte * 0.9, taps);
  let cola = new Float32Array(taps - 1);
  let fase = 0;

  return {
    procesa(entrada: Muestras): Muestras {
      if (desdeHz === haciaHz) return entrada;
      const buf = new Float32Array(cola.length + entrada.length);
      buf.set(cola, 0);
      buf.set(entrada, cola.length);

      // Solo son utiles las posiciones con el filtro entero dentro del buffer.
      const ultima = buf.length - taps;
      const salida: number[] = [];
      for (let pos = fase; pos <= ultima; pos += paso) {
        const base = Math.floor(pos);
        const frac = pos - base;
        // Interpolacion lineal entre dos salidas del FIR: suficiente aqui, porque el
        // aliasing ya lo mato el filtro y lo que queda es error de fase muy por debajo
        // de lo que cualquiera de estos modelos distingue.
        let a = 0;
        let b = 0;
        for (let k = 0; k < taps; k++) {
          const c = h[k]!;
          a += buf[base + k]! * c;
          b += buf[Math.min(base + 1 + k, buf.length - 1)]! * c;
        }
        salida.push(a + (b - a) * frac);
      }

      const consumidas = salida.length === 0 ? 0 : Math.floor(fase + (salida.length - 1) * paso) + 1;
      fase = fase + salida.length * paso - consumidas;
      const guarda = Math.max(0, buf.length - consumidas);
      cola = buf.slice(buf.length - Math.min(guarda, taps - 1 + Math.ceil(paso)));
      return Float32Array.from(salida);
    },
    reinicia() {
      cola = new Float32Array(taps - 1);
      fase = 0;
    },
  };
}

/** Mezcla a mono promediando canales. Un canal se devuelve tal cual. */
export function aMono(canales: readonly Muestras[]): Muestras {
  const primero = canales[0];
  if (!primero) throw new Error('aMono necesita al menos un canal');
  if (canales.length === 1) return primero;
  const salida = new Float32Array(primero.length);
  for (let i = 0; i < salida.length; i++) {
    let suma = 0;
    for (const canal of canales) suma += canal[i] ?? 0;
    salida[i] = suma / canales.length;
  }
  return salida;
}
