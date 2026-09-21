/**
 * PCM16LE → flotante por trozos, para reproducir la voz segun llega. Puro: el byte suelto de un
 * trozo impar se guarda y se junta con el siguiente, asi ninguna muestra se pierde ni se lee a
 * medias. Y flotante → Int16 para guardar como WAV lo que la persona dijo.
 */

export interface DecodificadorPcm16 {
  /** Devuelve las muestras completas que hay en `bytes` (mas el byte pendiente del trozo anterior). */
  decodifica(bytes: Uint8Array): Float32Array<ArrayBuffer>;
  readonly bytesPendientes: number;
}

export function creaDecodificadorPcm16(): DecodificadorPcm16 {
  let resto: Uint8Array | undefined;
  return {
    get bytesPendientes() {
      return resto?.length ?? 0;
    },
    decodifica(bytes) {
      let entrada = bytes;
      if (resto) {
        const junto = new Uint8Array(resto.length + bytes.length);
        junto.set(resto);
        junto.set(bytes, resto.length);
        entrada = junto;
        resto = undefined;
      }
      const pares = entrada.length >> 1;
      if (entrada.length & 1) resto = entrada.slice(pares * 2);
      const salida = new Float32Array(pares);
      const vista = new DataView(entrada.buffer, entrada.byteOffset, pares * 2);
      for (let i = 0; i < pares; i++) salida[i] = vista.getInt16(i * 2, true) / 32768;
      return salida;
    },
  };
}

export function flotanteAInt16(muestras: Float32Array): Int16Array {
  const salida = new Int16Array(muestras.length);
  for (let i = 0; i < muestras.length; i++) {
    const v = Math.max(-1, Math.min(1, muestras[i] ?? 0));
    salida[i] = Math.round(v < 0 ? v * 32768 : v * 32767);
  }
  return salida;
}
