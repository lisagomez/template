/**
 * Modelo de voz por energia: cero MB, cero modelos, TypeScript puro.
 *
 * No compite con Silero y no pretende hacerlo. Esta aqui por dos razones concretas:
 *
 *  1. **Probar el nucleo sin descargar nada.** Toda la maquina de estados del detector se
 *     ejercita con esto, en milisegundos y sin red.
 *  2. **Auriculares y audio limpio.** Con un microfono cerca de la boca y poco ruido de
 *     fondo, un umbral de energia con suelo adaptativo acierta de sobra, y ahorra 2 MB y
 *     un runtime entero al proyecto que lo instale.
 *
 * En una sala con ruido, musica de fondo o varios hablantes lejanos, esto FALLA. Ahi se usa
 * Silero. Decirlo aqui es parte del trato: un modelo que no sabe sus limites los descubre
 * en produccion.
 */

import type { ModeloVoz, Muestras } from '../types.js';

export interface OpcionesEnergia {
  frecuenciaHz?: number;
  tamMarco?: number;
  /** Cuanto por encima del suelo de ruido (en dB) se considera voz. */
  margenDb?: number;
  /** Con que rapidez el suelo de ruido sigue al ambiente. 0 = congelado, 1 = sin memoria. */
  adaptacion?: number;
  /**
   * Marcos iniciales que se toman como ruido de fondo, sin decidir: el suelo sale de su nivel
   * medio. Sin esto (0, el defecto) el suelo es el PRIMER marco, y si el primer marco es silencio
   * digital y luego entra ruido continuo, el ruido abre un turno que nunca cierra (medido el
   * 2026-09-20 en el navegador con ruido rosa: 0/10 interrupciones). Con la calibracion, el
   * ruido es suelo y solo lo que lo supere por `margenDb` es voz.
   */
  marcosCalibracion?: number;
}

export function modeloEnergia(opciones: OpcionesEnergia = {}): ModeloVoz {
  const frecuenciaHz = opciones.frecuenciaHz ?? 16_000;
  const tamMarco = opciones.tamMarco ?? 512;
  const margenDb = opciones.margenDb ?? 9;
  const adaptacion = opciones.adaptacion ?? 0.02;
  const marcosCalibracion = opciones.marcosCalibracion ?? 0;
  let sueloDb = -60;
  let visto = false;
  let calibrados = 0;
  /** Potencia media (lineal, no dB): un marco de silencio digital no arrastra la media a -180 dB. */
  let sumaPotencia = 0;

  return {
    tamMarco,
    frecuenciaHz,
    async probabilidad(marco: Muestras): Promise<number> {
      let suma = 0;
      for (let i = 0; i < marco.length; i++) suma += marco[i]! * marco[i]!;
      const rms = Math.sqrt(suma / Math.max(1, marco.length));
      const db = 20 * Math.log10(rms + 1e-9);
      if (calibrados < marcosCalibracion) {
        calibrados++;
        sumaPotencia += rms * rms;
        sueloDb = 10 * Math.log10(sumaPotencia / calibrados + 1e-18);
        visto = true;
        return 0;
      }
      if (!visto) {
        sueloDb = db;
        visto = true;
      }
      const exceso = db - (sueloDb + margenDb);
      // El suelo solo sube despacio y solo con marcos que NO parecen voz: si se adaptara
      // durante el habla, una frase larga acabaria elevando el suelo hasta silenciarse sola.
      if (exceso <= 0) sueloDb = sueloDb * (1 - adaptacion) + db * adaptacion;
      // Rampa suave de 12 dB en vez de un escalon: el detector aplica histeresis sobre
      // esta probabilidad, y con un 0/1 duro la histeresis no tendria nada que morder.
      return Math.max(0, Math.min(1, exceso / 12));
    },
    reinicia() {
      sueloDb = -60;
      visto = false;
      calibrados = 0;
      sumaPotencia = 0;
    },
  };
}
