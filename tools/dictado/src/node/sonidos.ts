/**
 * Dos tonos cortos: al empezar a escuchar y al pegar. Apagados por defecto (ajustes
 * `sonidoAlEmpezar` / `sonidoAlTerminar`); suenan por el mismo altavoz que `dictado di`
 * (Windows por WSLg, o PulseAudio). Nada se descarga ni se lee del disco: la onda se genera.
 *
 * El altavoz de Windows es un PowerShell persistente que tarda ~1 s en arrancar: se abre la
 * primera vez que hace falta y se queda abierto la sesion entera; `cierra()` lo apaga.
 */
import { existsSync } from 'node:fs';
import { abreAltavozPulse, abreAltavozWindows, type Altavoz } from './habla.js';

export const FRECUENCIA_TONO_HZ = 16_000;

/** Un tono con ataque y caida suaves (sin clic). `notas` en Hz, cada una `ms` de largo. */
export function tono(notas: readonly number[], ms = 70, hz = FRECUENCIA_TONO_HZ, volumen = 0.25): Float32Array {
  const porNota = Math.round((hz * ms) / 1000);
  const salida = new Float32Array(porNota * notas.length);
  const rampa = Math.round(hz * 0.008);
  notas.forEach((f, n) => {
    for (let i = 0; i < porNota; i++) {
      const env = Math.min(1, i / rampa, (porNota - i) / rampa);
      salida[n * porNota + i] = Math.sin((2 * Math.PI * f * i) / hz) * volumen * env;
    }
  });
  return salida;
}

export const TONO_EMPIEZA = (): Float32Array => tono([660, 880]);
export const TONO_TERMINA = (): Float32Array => tono([880, 660]);

export interface Sonidos {
  empieza(): void;
  termina(): void;
  /** Cambia en caliente que suena y que no. */
  configura(o: { alEmpezar: boolean; alTerminar: boolean }): void;
  cierra(): Promise<void>;
}

export function creaSonidos(inicial: { alEmpezar: boolean; alTerminar: boolean }, abre: () => Altavoz = abreAltavozPorDefecto): Sonidos {
  let activo = { ...inicial };
  let altavoz: Altavoz | undefined;
  const suena = (muestras: Float32Array) => {
    try {
      altavoz ??= abre();
      altavoz.escribe(muestras);
    } catch (e) {
      console.error(`sonidos: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  return {
    empieza() {
      if (activo.alEmpezar) suena(TONO_EMPIEZA());
    },
    termina() {
      if (activo.alTerminar) suena(TONO_TERMINA());
    },
    configura(o) {
      activo = { ...o };
    },
    async cierra() {
      const a = altavoz;
      altavoz = undefined;
      await a?.termina();
    },
  };
}

function abreAltavozPorDefecto(): Altavoz {
  return existsSync('/mnt/c/Windows/System32/cmd.exe') ? abreAltavozWindows(FRECUENCIA_TONO_HZ) : abreAltavozPulse(FRECUENCIA_TONO_HZ);
}
