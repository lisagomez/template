/**
 * WAV PCM16 sin dependencias: leer, escribir y mezclar en estereo (una voz por canal), para
 * fabricar la llamada de muestra del call center con las voces sinteticas de la maquina.
 * Puro: corre en Node y en el navegador, y se prueba sin audio real.
 */

export interface WavPcm16 {
  frecuenciaHz: number;
  canales: number;
  /** Intercalado si hay mas de un canal. */
  muestras: Int16Array;
}

export function leeWavPcm16(bytes: Uint8Array): WavPcm16 {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (vista.getUint32(0, false) !== 0x52494646 || vista.getUint32(8, false) !== 0x57415645) throw new Error('no es un WAV');
  let pos = 12;
  let frecuenciaHz = 0;
  let canales = 0;
  let bits = 0;
  while (pos + 8 <= vista.byteLength) {
    const id = vista.getUint32(pos, false);
    const largo = vista.getUint32(pos + 4, true);
    if (id === 0x666d7420) {
      canales = vista.getUint16(pos + 10, true);
      frecuenciaHz = vista.getUint32(pos + 12, true);
      bits = vista.getUint16(pos + 22, true);
    } else if (id === 0x64617461) {
      if (bits !== 16) throw new Error(`WAV de ${bits} bits: solo se lee PCM16`);
      const fin = Math.min(pos + 8 + largo, vista.byteLength);
      const muestras = new Int16Array((fin - (pos + 8)) >> 1);
      for (let i = 0; i < muestras.length; i++) muestras[i] = vista.getInt16(pos + 8 + i * 2, true);
      return { frecuenciaHz, canales, muestras };
    }
    pos += 8 + largo + (largo & 1);
  }
  throw new Error('WAV sin bloque de datos');
}

export function escribeWavPcm16(muestras: Int16Array, frecuenciaHz: number, canales: number): Uint8Array {
  const bytesDatos = muestras.length * 2;
  const salida = new Uint8Array(44 + bytesDatos);
  const v = new DataView(salida.buffer);
  const texto = (pos: number, s: string) => [...s].forEach((c, i) => v.setUint8(pos + i, c.charCodeAt(0)));
  texto(0, 'RIFF');
  v.setUint32(4, 36 + bytesDatos, true);
  texto(8, 'WAVE');
  texto(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, canales, true);
  v.setUint32(24, frecuenciaHz, true);
  v.setUint32(28, frecuenciaHz * canales * 2, true);
  v.setUint16(32, canales * 2, true);
  v.setUint16(34, 16, true);
  texto(36, 'data');
  v.setUint32(40, bytesDatos, true);
  for (let i = 0; i < muestras.length; i++) v.setInt16(44 + i * 2, muestras[i] ?? 0, true);
  return salida;
}

export type Canal = 'izquierdo' | 'derecho';

export interface TramoEstereo {
  canal: Canal;
  muestras: Int16Array;
}

/**
 * Tramos mono, uno detras de otro con un silencio entre ellos, cada uno en SU canal y el otro
 * en silencio. Es como suena una llamada grabada a dos canales: agente a la izquierda, cliente
 * a la derecha, nunca los dos a la vez.
 */
export function mezclaEstereo(tramos: readonly TramoEstereo[], frecuenciaHz: number, silencioMs = 400): Int16Array {
  const hueco = Math.round((frecuenciaHz * silencioMs) / 1000);
  const total = tramos.reduce((s, t) => s + t.muestras.length + hueco, 0);
  const salida = new Int16Array(total * 2);
  let pos = 0;
  for (const t of tramos) {
    const desplazamiento = t.canal === 'izquierdo' ? 0 : 1;
    for (let i = 0; i < t.muestras.length; i++) salida[(pos + i) * 2 + desplazamiento] = t.muestras[i] ?? 0;
    pos += t.muestras.length + hueco;
  }
  return salida;
}

/** Tramos mono seguidos, con silencio entre ellos: una sola pista con varias voces. */
export function concatenaMono(tramos: readonly Int16Array[], frecuenciaHz: number, silencioMs = 400): Int16Array {
  const hueco = Math.round((frecuenciaHz * silencioMs) / 1000);
  const salida = new Int16Array(tramos.reduce((s, t) => s + t.length + hueco, 0));
  let pos = 0;
  for (const t of tramos) {
    salida.set(t, pos);
    pos += t.length + hueco;
  }
  return salida;
}
