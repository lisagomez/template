/**
 * Aritmética de audio que el reproductor y la medición comparten, sin navegador: WAV PCM16, nivel
 * en dBFS y dónde empieza a SONAR una frase (la voz sintética trae silencio delante, y el «primer
 * audio audible» no es el primer byte).
 */
import type { AudioTurno } from './tipos.js';

/** Dos tramos de audio seguidos (lo retenido en una pausa más lo que vino después). */
export function concatena(a: AudioTurno, b: AudioTurno): AudioTurno {
  const muestras = new Float32Array(a.muestras.length + b.muestras.length);
  muestras.set(a.muestras);
  muestras.set(b.muestras, a.muestras.length);
  return { muestras, hz: b.hz };
}

/** Flotante → PCM16 con una sola escala (×32768 con tope), la misma que `voz/node`. */
export function aPcm16(muestras: Float32Array): Int16Array<ArrayBuffer> {
  const salida = new Int16Array(muestras.length);
  for (let i = 0; i < muestras.length; i++) salida[i] = Math.max(-32768, Math.min(32767, Math.round((muestras[i] ?? 0) * 32768)));
  return salida;
}

/** PCM16LE → flotante, la inversa exacta de `aPcm16`. */
export function dePcm16(bytes: Uint8Array): Float32Array<ArrayBuffer> {
  const n = bytes.length >> 1;
  const vista = new DataView(bytes.buffer, bytes.byteOffset, n * 2);
  const salida = new Float32Array(n);
  for (let i = 0; i < n; i++) salida[i] = vista.getInt16(i * 2, true) / 32768;
  return salida;
}

/** WAV mono PCM16 en memoria. */
export function codificaWav(muestras: Float32Array, hz: number): ArrayBuffer {
  const pcm = aPcm16(muestras);
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const texto = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  texto(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length * 2, true);
  texto(8, 'WAVE');
  texto(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, hz, true);
  v.setUint32(28, hz * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  texto(36, 'data');
  v.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return buf;
}

/** RMS en dBFS de un tramo (silencio digital: −180). */
export function nivelDb(muestras: Float32Array, desde = 0, hasta = muestras.length): number {
  let suma = 0;
  const n = Math.max(0, Math.min(hasta, muestras.length) - desde);
  for (let i = desde; i < desde + n; i++) suma += (muestras[i] ?? 0) ** 2;
  return n === 0 || suma === 0 ? -180 : 10 * Math.log10(suma / n);
}

/** ms desde el inicio hasta la primera ventana de 10 ms por encima de `umbralDb`; `undefined` si nunca suena. */
export function msPrimerSonido(muestras: Float32Array, hz: number, umbralDb = -45): number | undefined {
  const ventana = Math.max(1, Math.round(hz / 100));
  for (let i = 0; i + ventana <= muestras.length; i += ventana) {
    if (nivelDb(muestras, i, i + ventana) >= umbralDb) return (i / hz) * 1000;
  }
  return undefined;
}

/**
 * Recorta el silencio de los bordes de una frase sintética: Piper pone ~50-100 ms mudos delante
 * (es latencia pura antes del primer sonido) y algo más detrás. Se deja `msMargenInicio` delante
 * para no comerse el ataque de la primera consonante y hasta `msMaxFinal` detrás (la pausa entre
 * frases suena natural).
 */
export function recortaSilencio(muestras: Float32Array, hz: number, msMargenInicio = 15, msMaxFinal = 120, umbralDb = -45): Float32Array {
  const v = Math.max(1, Math.round(hz / 100));
  let primera = -1;
  let ultima = -1;
  for (let i = 0; i + v <= muestras.length; i += v) {
    if (nivelDb(muestras, i, i + v) >= umbralDb) {
      if (primera < 0) primera = i;
      ultima = i + v;
    }
  }
  if (primera < 0) return muestras;
  const desde = Math.max(0, primera - Math.round((msMargenInicio / 1000) * hz));
  const hasta = Math.min(muestras.length, ultima + Math.round((msMaxFinal / 1000) * hz));
  return muestras.subarray(desde, hasta);
}

/**
 * El nivel MÁS ALTO de lo que sonó en la ventana [i − msAtras, i + msAdelante]. Es la referencia de la puerta de eco:
 * el eco llega al micrófono con retraso (altavoz, sala, captura), y comparar con el nivel del instante exacto deja
 * pasar el eco de la sílaba anterior durante una pausa entre palabras (medido: 6 de 6 auto-interrupciones a −20 dB).
 * La ventana mira también hacia delante: `currentTime` del `<audio>` no va exacto con lo que sale por el altavoz, y el
 * eco llegó a veces antes de que la posición marcara la sílaba fuerte (medido en Chromium).
 */
export function nivelMaximoReciente(muestras: Float32Array, hz: number, i: number, msAtras = 300, msAdelante = 200): number {
  const v = Math.max(1, Math.round(hz / 100));
  const desde = Math.max(0, i - Math.round((msAtras / 1000) * hz));
  const hasta = Math.min(muestras.length, i + Math.round((msAdelante / 1000) * hz));
  let maximo = -180;
  for (let k = desde; k < hasta; k += v) maximo = Math.max(maximo, nivelDb(muestras, k, Math.min(hasta, k + v)));
  return maximo;
}
