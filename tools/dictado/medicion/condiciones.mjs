/**
 * Condiciones acusticas SINTETICAS de campo, como filtros de ffmpeg sobre un WAV limpio: las
 * comparten `fabrica-corpus.mjs --campo` (el corpus de calibracion) y `mide-picking.mjs` (las
 * confirmaciones del almacen). Sinteticas: se parecen al campo, no son el campo, y toda tabla que
 * salga de aqui lo dice.
 *
 * El SNR se declara y se calcula, no se adivina: `amplitudPara(snrDb, vozDb)` da la amplitud de
 * `anoisesrc` rosa para que el ruido quede `snrDb` por debajo del nivel medio de la voz. Constante
 * medida el 2026-09-20 con volumedetect: rosa a amplitud 0,1 → −34,4 dB; a 0,3 → −24,6 dB, o sea
 * −14,4 dB a amplitud 1 (20·log10 encaja: +9,5 dB por 3×).
 */
import { spawnSync } from 'node:child_process';

export const ROSA_A_AMPLITUD_1_DB = -14.4;

/** Amplitud de `anoisesrc=color=pink` para que su nivel medio quede `snrDb` por debajo de `vozDb`. Pura. */
export function amplitudPara(snrDb, vozDb) {
  const objetivoDb = vozDb - snrDb;
  return Math.min(1, Math.max(0, 10 ** ((objetivoDb - ROSA_A_AMPLITUD_1_DB) / 20)));
}

/** Nivel medio (dB) de un archivo, con volumedetect de ffmpeg. */
export function nivelMedioDb(ruta, tramo) {
  const filtro = `${tramo ? `atrim=${tramo[0]}:${tramo[1]},` : ''}volumedetect`;
  // volumedetect escribe en STDERR: con execFileSync solo llegaria stdout (vacio) y el nivel seria -Infinity.
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', ruta, '-af', filtro, '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/.exec(`${r.stderr ?? ''}${r.stdout ?? ''}`);
  return m ? Number(m[1]) : -Infinity;
}

/** Cadena `filter_complex` que mezcla `[0:a]` con ruido rosa al SNR pedido. */
export const rosaAlSnr = (snrDb, vozDb, duracionS = 30) =>
  `anoisesrc=color=pink:amplitude=${amplitudPara(snrDb, vozDb).toFixed(4)}:sample_rate=22050:duration=${duracionS}[n];[0:a][n]amix=inputs=2:duration=first:normalize=0`;

/**
 * Las condiciones de campo. Cada una es una funcion (vozDb, extra) → filter_complex sobre `[0:a]`.
 * `extra.babble` es la ruta de un WAV con otras voces (para el almacen); se mezcla a `babbleDb`.
 */
export const CONDICIONES = {
  /** Calle: rumor grave (brown) con un vaiven lento, como trafico. */
  calle: (vozDb) => `anoisesrc=color=brown:amplitude=${amplitudPara(8, vozDb).toFixed(4)}:sample_rate=22050:duration=30,lowpass=f=600,tremolo=f=0.3:d=0.6[n];[0:a][n]amix=inputs=2:duration=first:normalize=0`,
  /** Taller: rosa + zumbido de 50/100 Hz + una banda de 3 kHz que entra y sale (una herramienta). */
  taller: (vozDb) => `anoisesrc=color=pink:amplitude=${amplitudPara(12, vozDb).toFixed(4)}:sample_rate=22050:duration=30[p];sine=f=50:r=22050:d=30,volume=${(vozDb - 10).toFixed(1)}dB[z1];sine=f=100:r=22050:d=30,volume=${(vozDb - 16).toFixed(1)}dB[z2];anoisesrc=color=white:amplitude=${amplitudPara(10, vozDb).toFixed(4)}:sample_rate=22050:duration=30,bandpass=f=3000:w=800,tremolo=f=0.7:d=0.9[h];[0:a][p][z1][z2][h]amix=inputs=5:duration=first:normalize=0`,
  /** Almacen: otras voces de fondo (babble) a −18 dB de la voz y un eco de nave. */
  almacen: (vozDb, extra) => `[1:a]volume=${(vozDb - 18 - (extra?.babbleDb ?? vozDb)).toFixed(1)}dB[b];[0:a][b]amix=inputs=2:duration=first:normalize=0,aecho=0.8:0.6:60|120:0.25|0.15`,
  /** Reverberacion sola, sin ruido. */
  reverb: () => `[0:a]aecho=0.8:0.7:40|90|160:0.35|0.25|0.15`,
  snr20: (vozDb) => rosaAlSnr(20, vozDb),
  snr10: (vozDb) => rosaAlSnr(10, vozDb),
  snr05: (vozDb) => rosaAlSnr(5, vozDb),
  snr00: (vozDb) => rosaAlSnr(0, vozDb),
  /** Microfono flojo: −24 dB, para la ganancia automatica. */
  flojo: () => `[0:a]volume=-24dB`,
  /** Microfono fuerte: +12 dB con limitador, como un microfono que satura. */
  fuerte: () => `[0:a]volume=12dB,alimiter=limit=0.98:level=false`,
};

export const NOMBRES_CONDICION = Object.keys(CONDICIONES);
