/**
 * El hablante de una sesion de `dictar`: una voz sintetica y un altavoz que se abre una vez y se
 * queda (el PowerShell del altavoz tarda ~1 s en arrancar; abrirlo por respuesta seria pagarlo
 * cada vez). Las peticiones van en serie: dos respuestas seguidas suenan una tras otra, nunca
 * encima. `calla()` corta: sherpa deja de sintetizar lo que falta (`alTrozo` devuelve `false`,
 * medido el 2026-09-20) y lo ya encolado termina de sonar (una frase como mucho).
 */
import type { Altavoz, VozSintetica } from './habla.js';

export interface OpcionesHablante {
  voz: VozSintetica;
  /** Se llama una sola vez, al primer `di`. */
  abreAltavoz: () => Altavoz;
  /** Velocidad vigente (cambia en caliente). */
  velocidad?: () => number;
}

export interface OpcionesDi {
  /** En el instante en que el primer trozo va al altavoz. */
  alPrimerAudio?: () => void;
}

export interface ResultadoDi {
  /** Desde que se pidio hablar hasta que el primer trozo va al altavoz. */
  msPrimerAudio: number;
  msTotal: number;
  cortado: boolean;
}

export interface Hablante {
  readonly id: string;
  readonly hablando: boolean;
  di(texto: string, opciones?: OpcionesDi): Promise<ResultadoDi>;
  /** Corta lo que se esta diciendo; una peticion en cola sigue despues. */
  calla(): void;
  cierra(): Promise<void>;
}

export function creaHablante(o: OpcionesHablante): Hablante {
  let altavoz: Altavoz | undefined;
  let hablando = false;
  let cortar = false;
  let cola: Promise<unknown> = Promise.resolve();

  const uno = async (texto: string, op?: OpcionesDi): Promise<ResultadoDi> => {
    altavoz ??= o.abreAltavoz();
    const salida = altavoz;
    cortar = false;
    hablando = true;
    const t0 = performance.now();
    let msPrimerAudio = 0;
    try {
      await o.voz.sintetiza(
        texto,
        (trozo) => {
          if (cortar) return false;
          if (msPrimerAudio === 0) {
            msPrimerAudio = performance.now() - t0;
            op?.alPrimerAudio?.();
          }
          salida.escribe(trozo);
          return true;
        },
        { velocidad: o.velocidad?.() ?? 1 },
      );
      await salida.espera?.();
    } finally {
      hablando = false;
    }
    return { msPrimerAudio: msPrimerAudio || performance.now() - t0, msTotal: performance.now() - t0, cortado: cortar };
  };

  return {
    get id() {
      return o.voz.id;
    },
    get hablando() {
      return hablando;
    },
    di(texto, opciones) {
      const turno = cola.then(() => uno(texto, opciones));
      cola = turno.catch(() => undefined);
      return turno;
    },
    calla() {
      if (hablando) cortar = true;
    },
    async cierra() {
      cortar = true;
      await cola;
      await altavoz?.termina();
      altavoz = undefined;
    },
  };
}
