/**
 * Audio en Node: el microfono por `ffmpeg` y los archivos por `leeWav` de `voz` (WAV) o por
 * `ffmpeg` (todo lo demas).
 *
 * `ffmpeg -f pulse` y no un binding nativo: en WSL2 el microfono de Windows llega por el
 * PulseAudio de WSLg (`PULSE_SERVER=unix:/mnt/wslg/PulseServer`, medido el 2026-09-14) y
 * `ffmpeg` ya sabe hablarle. Un binding (`node-record-lpcm16`, `naudiodon`) anadiria una
 * compilacion nativa por un socket que ya esta ahi.
 */
import { spawn, execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { leeWav, pcm16aFloat, preparaParaModelo } from '@tu-scope/voz/node';
import type { Muestras } from '../types.js';

export interface OpcionesCaptura {
  frecuenciaHz?: number;
  /** Dispositivo de PulseAudio; `default` es el microfono que Windows tenga elegido. */
  dispositivo?: string;
  ffmpeg?: string;
  alRecibir: (muestras: Muestras) => void | Promise<void>;
  alError?: (mensaje: string) => void;
}

export interface Captura {
  detiene(): void;
  /** Resuelve cuando `ffmpeg` termina; rechaza si murio por su cuenta. */
  readonly terminada: Promise<void>;
}

/** Abre el microfono y entrega PCM flotante a `frecuenciaHz`, en trozos del tamano que de ffmpeg. */
export function capturaMicrofono(opciones: OpcionesCaptura): Captura {
  const hz = opciones.frecuenciaHz ?? 16_000;
  // `-use_wallclock_as_timestamps`: tras una suspension o un salto de PulseAudio, ffmpeg recibe
  // marcas de tiempo hacia atras y protesta en cada paquete («non monotonically increasing dts»,
  // 2 500 lineas en una noche, medido el 2026-09-16). El PCM crudo no lleva marcas: da igual.
  const args = ['-hide_banner', '-loglevel', 'error', '-f', 'pulse', '-use_wallclock_as_timestamps', '1', '-i', opciones.dispositivo ?? 'default', '-ac', '1', '-ar', String(hz), '-f', 's16le', '-'];
  const proceso = spawn(opciones.ffmpeg ?? 'ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let resto: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let detenida = false;
  let errores = '';
  proceso.stdout.on('data', (trozo: Buffer) => {
    const junto = resto.length ? Buffer.concat([resto, trozo]) : trozo;
    const pares = junto.length - (junto.length % 2);
    resto = junto.subarray(pares);
    if (pares > 0) void opciones.alRecibir(pcm16aFloat(new Uint8Array(junto.buffer, junto.byteOffset, pares)));
  });
  proceso.stderr.on('data', (d: Buffer) => {
    errores += d.toString('utf8');
    // Tras `detiene()` ffmpeg protesta por el corte que le pedimos, y las marcas de tiempo
    // desordenadas no afectan al PCM crudo: ninguna de las dos es un error para quien dicta.
    const texto = d.toString('utf8').trim();
    if (!detenida && !/non monotonically increasing dts/.test(texto)) opciones.alError?.(texto);
  });
  const terminada = new Promise<void>((resuelve, rechaza) => {
    proceso.on('error', (e) => rechaza(new Error(`no se pudo lanzar ffmpeg: ${e.message}`)));
    proceso.on('close', (codigo) => {
      if (detenida || codigo === 0) resuelve();
      else rechaza(new Error(`ffmpeg termino con ${codigo}: ${errores.trim() || 'sin detalle'}`));
    });
  });
  return {
    detiene() {
      detenida = true;
      proceso.kill('SIGINT');
    },
    terminada,
  };
}

export interface AudioCargado {
  muestras: Muestras;
  frecuenciaHz: number;
  duracionMs: number;
}

/** Decodifica cualquier archivo de audio a mono flotante a `hz` con ffmpeg. */
function decodificaConFfmpeg(ruta: string, hz: number, ffmpeg: string): Promise<Muestras> {
  return new Promise((resuelve, rechaza) => {
    execFile(
      ffmpeg,
      ['-hide_banner', '-loglevel', 'error', '-i', ruta, '-ac', '1', '-ar', String(hz), '-f', 's16le', '-'],
      { encoding: 'buffer', maxBuffer: 1024 * 1024 * 1024 },
      (error, stdout) => {
        if (error) return rechaza(new Error(`ffmpeg no pudo leer ${ruta}: ${error.message}`));
        resuelve(pcm16aFloat(new Uint8Array(stdout.buffer, stdout.byteOffset, stdout.length - (stdout.length % 2))));
      },
    );
  });
}

/** Un archivo de audio → mono flotante a `frecuenciaHz`. WAV sin ffmpeg; el resto con el. */
export async function leeAudio(ruta: string, frecuenciaHz = 16_000, ffmpeg = 'ffmpeg'): Promise<AudioCargado> {
  let muestras: Muestras;
  if (/\.wav$/i.test(ruta)) {
    const bytes = await readFile(ruta);
    muestras = preparaParaModelo(leeWav(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), frecuenciaHz);
  } else {
    muestras = await decodificaConFfmpeg(ruta, frecuenciaHz, ffmpeg);
  }
  return { muestras, frecuenciaHz, duracionMs: (muestras.length / frecuenciaHz) * 1000 };
}

/** Mono flotante → PCM16LE, que es lo que viaja al servicio remoto y al motor por proceso. */
export function floatAPcm16(muestras: Muestras): Buffer {
  const salida = Buffer.alloc(muestras.length * 2);
  for (let i = 0; i < muestras.length; i++) {
    const v = Math.max(-1, Math.min(1, muestras[i] ?? 0));
    salida.writeInt16LE(Math.round(v < 0 ? v * 32768 : v * 32767), i * 2);
  }
  return salida;
}

/** RMS en dB relativo a plena escala. Para saber si el microfono esta vivo antes de dictar. */
export function nivelDb(muestras: Muestras): number {
  if (muestras.length === 0) return -Infinity;
  let suma = 0;
  for (let i = 0; i < muestras.length; i++) suma += (muestras[i] ?? 0) ** 2;
  return 20 * Math.log10(Math.sqrt(suma / muestras.length) + 1e-9);
}
