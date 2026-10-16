/**
 * Del reloj del AUDIO (muestras capturadas desde que se abrió el micrófono) al reloj de la
 * PÁGINA (`performance.now()`). Hace falta para poner el fin real del habla —que el VAD da en
 * tiempo de audio— en la misma escala que el primer audio que suena.
 *
 * Cada trozo que llega dice «a esta hora del reloj ya tenía audio hasta este ms». La diferencia
 * mínima entre las dos es la mejor estimación del desfase (el trozo que llegó con menos retraso
 * de entrega). Al volver de una pestaña oculta los trozos pueden llegar en ráfaga: se reinicia
 * (la fuente re-anclaba sus relojes en `visibilitychange`, y es de lo bueno que se conserva).
 */

export interface RelojAudio {
  /** `msAudioFin`: ms de audio capturado hasta el final del trozo; `ahora`: reloj de la página al recibirlo. */
  anota(msAudioFin: number, ahora: number): void;
  /** Un instante del audio, en el reloj de la página. */
  aReloj(msAudio: number): number;
  readonly listo: boolean;
  reinicia(): void;
}

export function creaRelojAudio(ventana = 64): RelojAudio {
  let desfases: number[] = [];
  let minimo = Number.POSITIVE_INFINITY;
  return {
    get listo() {
      return desfases.length > 0;
    },
    anota(msAudioFin, ahora) {
      desfases.push(ahora - msAudioFin);
      if (desfases.length > ventana * 2) desfases = desfases.slice(-ventana);
      minimo = Math.min(minimo, ahora - msAudioFin);
      if (desfases.length === ventana + 1 || desfases.length === ventana * 2) minimo = Math.min(...desfases.slice(-ventana));
    },
    aReloj(msAudio) {
      if (desfases.length === 0) throw new Error('reloj de audio sin anclar: todavía no llegó ningún trozo');
      return msAudio + minimo;
    },
    reinicia() {
      desfases = [];
      minimo = Number.POSITIVE_INFINITY;
    },
  };
}
