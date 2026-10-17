/**
 * «Cállate si te hablo» (barge-in) sin callarse con su propia voz. Pura y sin reloj: recibe un
 * marco por cada trozo del micrófono y dice qué hacer.
 *
 * Viene de `laboratorio-voz/services/interrupcion.ts` (confirmación y desarme medidos) y suma lo
 * que faltaba para que el micrófono pueda quedarse ABIERTO mientras la máquina habla (en la
 * fuente se cerraba, defecto 3):
 *  - **Atenuar al primer marco, cortar al confirmar**: la persona nota la reacción en ~30 ms y una
 *    tos o un golpe no se llevan la respuesta, solo la bajan un instante.
 *  - **Puerta de eco**: con la máquina sonando, un marco solo cuenta como voz si el micrófono
 *    supera al eco que se espera de lo que suena (`nivelSalidaDb − pérdida`) por `margenDb`. La
 *    pérdida se aprende sola de los marcos sin voz. Es la red bajo la cancelación de eco del
 *    navegador, que en Chrome no cubre lo que suena por Web Audio.
 */

export interface MarcoEscucha {
  /** Instante (reloj de la página) del marco. */
  ms: number;
  /** Probabilidad de voz del detector (0-1). */
  prob: number;
  nivelMicDb?: number;
  /** Lo que está sonando por el altavoz, si se sabe. */
  nivelSalidaDb?: number;
}

export type AccionInterrupcion =
  | { tipo: 'atenua'; ms: number }
  | { tipo: 'restaura'; ms: number }
  | { tipo: 'interrumpe'; ms: number; msDesdeInicio: number };

export type EstadoInterrupcion = 'calma' | 'armado' | 'interrumpido';

export interface OpcionesInterrupcion {
  msConfirmacion?: number;
  msDesarme?: number;
  msPorMarco?: number;
  umbralVoz?: number;
  margenDb?: number;
  perdidaInicialDb?: number;
  /** Lo menos que puede bajar el eco aprendido. */
  perdidaMinimaDb?: number;
  /** Por debajo de esto, la salida se considera muda (no hay eco que esperar). */
  salidaMudaDb?: number;
}

export interface MaquinaInterrupcion {
  procesa(marco: MarcoEscucha, maquinaHabla: boolean): AccionInterrupcion[];
  readonly estado: EstadoInterrupcion;
  /** Pérdida de eco aprendida (salida − micrófono, en dB). */
  readonly perdidaDb: number;
  reinicia(): void;
}

/**
 * `msConfirmacion` 120 (cuatro marcos): el laboratorio de voz midió 150 con el micrófono cerrado, pero con la puerta de
 * eco encima el arranque y la cola de un «Para.» corto quedan por debajo de ella: uno de 230 ms dejaba 4 marcos sobre la
 * puerta (128 ms) y con 150 no cortó 3 de 4 veces (medido el 2026-10-16). El eco intermitente no lo alcanza igual porque
 * un marco sin voz resta lo que sumó uno con voz.
 */
export const DEFECTOS_INTERRUPCION = {
  msConfirmacion: 120,
  msDesarme: 250,
  msPorMarco: 32,
  umbralVoz: 0.5,
  margenDb: 6,
  perdidaInicialDb: 15,
  perdidaMinimaDb: 12,
  salidaMudaDb: -60,
} as const;

export function creaInterrupcion(opciones: OpcionesInterrupcion = {}): MaquinaInterrupcion {
  const o = { ...DEFECTOS_INTERRUPCION, ...opciones };
  let estado: EstadoInterrupcion = 'calma';
  let perdida: number = o.perdidaInicialDb;
  let msVoz = 0;
  let msSilencio = 0;
  let inicio = 0;

  const esVozPropia = (m: MarcoEscucha): boolean => {
    if (m.prob < o.umbralVoz) return false;
    if (m.nivelSalidaDb === undefined || m.nivelMicDb === undefined || m.nivelSalidaDb < o.salidaMudaDb) return true;
    return m.nivelMicDb >= m.nivelSalidaDb - perdida + o.margenDb;
  };

  /**
   * Aprende cuánto baja el eco del altavoz al micrófono. Solo de marcos con SONIDO (el detector oye algo) que la
   * puerta no dio por voz: eso es eco. Un marco con el micrófono en el suelo de ruido no dice nada del eco (medido: con
   * esos marcos la pérdida «aprendida» subió a 34 dB y la puerta dejó pasar el eco). OJO con un detector que SOSTIENE
   * la probabilidad tras la voz (Silero): marca como «con sonido» marcos en el suelo, y vuelve a pasar lo mismo (28 dB,
   * 6 de 6 auto-interrupciones, medido el 2026-10-17). Quien lo use debe darle aquí una probabilidad que caiga con el
   * sonido, p. ej. el mínimo con una puerta de nivel mientras la máquina habla. Seguimiento del mínimo: baja
   * enseguida si el eco se hace más fuerte, sube despacio.
   */
  const aprende = (m: MarcoEscucha) => {
    if (m.prob < o.umbralVoz || m.nivelSalidaDb === undefined || m.nivelMicDb === undefined || m.nivelSalidaDb < o.salidaMudaDb) return;
    const observada = m.nivelSalidaDb - m.nivelMicDb;
    // Despacio y con suelo: un marco con sonido que la puerta no dejó pasar puede ser la PERSONA hablando bajo, no eco.
    // Con ataque instantáneo, un «Para.» que no llegó a confirmar bajó la pérdida a ~2 dB y desde ahí ya nadie podía
    // interrumpir (medido: 3 de 8 cortes fallidos). Un eco a menos de 12 dB de lo que suena no es realista con la
    // cancelación del navegador encendida.
    // Y sube a la quinta parte: los valles entre sílabas también llegan aquí (la salida es el máximo de una ventana, el
    // micrófono el marco) y, subiendo tan rápido como baja, la pérdida iba a la MEDIA de lo observado y no al eco. Con
    // Silero, 28 dB contra los ~21 reales; así, ~24 (y la energía, de 23 a 22). Medido el 2026-10-17.
    const ritmo = observada < perdida ? 0.05 : 0.01;
    perdida = Math.max(o.perdidaMinimaDb, Math.min(40, perdida + (observada - perdida) * ritmo));
  };

  const reinicia = () => {
    estado = 'calma';
    msVoz = 0;
    msSilencio = 0;
  };

  return {
    get estado() {
      return estado;
    },
    get perdidaDb() {
      return perdida;
    },
    reinicia,
    procesa(m, maquinaHabla) {
      if (!maquinaHabla) {
        const restaurar = estado === 'armado';
        reinicia();
        return restaurar ? [{ tipo: 'restaura', ms: m.ms }] : [];
      }
      if (estado === 'interrumpido') return [];
      const voz = esVozPropia(m);
      if (estado === 'calma') {
        if (!voz) {
          aprende(m);
          return [];
        }
        estado = 'armado';
        inicio = m.ms;
        msVoz = o.msPorMarco;
        msSilencio = 0;
        return msVoz >= o.msConfirmacion ? [{ tipo: 'atenua', ms: m.ms }, ...confirma(m)] : [{ tipo: 'atenua', ms: m.ms }];
      }
      if (voz) {
        msVoz += o.msPorMarco;
        msSilencio = 0;
      } else {
        // Voz CASI continua: un marco sin voz resta lo que sumó uno con voz. Así el eco que se cuela por la puerta en
        // marcos sueltos no acumula la confirmación (medido: 6 de 6 auto-interrupciones cuando sumaba sin restar).
        msVoz = Math.max(0, msVoz - o.msPorMarco);
        msSilencio += o.msPorMarco;
      }
      if (msVoz >= o.msConfirmacion) return confirma(m);
      if (msSilencio >= o.msDesarme) {
        reinicia();
        return [{ tipo: 'restaura', ms: m.ms }];
      }
      return [];
    },
  };

  function confirma(m: MarcoEscucha): AccionInterrupcion[] {
    estado = 'interrumpido';
    return [{ tipo: 'interrumpe', ms: m.ms, msDesdeInicio: m.ms - inicio }];
  }
}
