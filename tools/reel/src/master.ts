/**
 * Máster declarativo: UNA fuente (lo que se conserva, lo que se desenfoca, los rótulos, el volumen) de
 * la que salen el MP4 y lo que ve la sala. Determinista: mismos datos, mismos bytes (libx264 de un hilo,
 * bitexact, sin metadatos) — así se puede aprobar por huella.
 */
import type { Desenfoque, MarcaDeNegocio } from './tipos.js';
import { FORMATO } from './tipos.js';
import type { Edl } from './cortes.js';
import type { Rotulo } from './subtitulos.js';

export interface Master { version: 1; edl: Edl; desenfoques: Desenfoque[]; rotulos: Rotulo[]; marca: MarcaDeNegocio; lufs: number }

/** Medición del primer paso de loudnorm (ffmpeg la imprime en JSON). */
export interface MedidaDeVolumen { input_i: string; input_tp: string; input_lra: string; input_thresh: string; target_offset: string }

const n = (x: number): string => x.toFixed(3);
const seleccion = (edl: Edl): string => edl.conservar.map((c) => `between(t,${n(c.inicio)},${n(c.fin)})`).join('+') || '0';

export function filtroDeVideo(m: Master, ass: string | null): string {
  const pasos: string[] = [];
  let entrada = '[0:v]';
  m.desenfoques.forEach((d, i) => {
    const c = d.caja, radio = Math.max(4, Math.min(40, Math.floor(Math.min(c.ancho, c.alto) / 4)));
    pasos.push(`${entrada}split=2[b${i}a][b${i}b]`, `[b${i}b]crop=${c.ancho}:${c.alto}:${c.x}:${c.y},boxblur=luma_radius=${radio}:luma_power=3:chroma_radius=${Math.min(radio, 20)}:chroma_power=3[b${i}c]`,
      `[b${i}a][b${i}c]overlay=${c.x}:${c.y}:enable='between(t,${n(d.inicio)},${n(d.fin)})'[v${i}]`);
    entrada = `[v${i}]`;
  });
  const sub = ass ? `,subtitles=filename=${ass}` : '';
  pasos.push(`${entrada}select='${seleccion(m.edl)}',setpts=N/FRAME_RATE/TB${sub},format=yuv420p[vout]`);
  return pasos.join(';');
}

export function filtroDeAudio(m: Master, medida?: MedidaDeVolumen): string {
  const base = `[0:a]aselect='${seleccion(m.edl)}',asetpts=N/SR/TB,loudnorm=I=${m.lufs}:TP=-1.5:LRA=11`;
  const lineal = medida ? `:measured_I=${medida.input_i}:measured_TP=${medida.input_tp}:measured_LRA=${medida.input_lra}:measured_thresh=${medida.input_thresh}:offset=${medida.target_offset}:linear=true` : ':print_format=json';
  return `${base}${lineal},aresample=${FORMATO.audioHz}[aout]`;
}

/** Primer paso: medir el volumen del audio ya cortado (sin escribir archivo). */
export const argumentosDeMedicion = (m: Master, entrada: string): string[] =>
  ['-hide_banner', '-nostats', '-i', entrada, '-filter_complex', filtroDeAudio(m), '-map', '[aout]', '-f', 'null', '-'];

export function argumentosDelMaster(m: Master, rutas: { entrada: string; ass: string | null; salida: string }, medida: MedidaDeVolumen): string[] {
  return [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', rutas.entrada,
    '-filter_complex', `${filtroDeVideo(m, rutas.ass)};${filtroDeAudio(m, medida)}`,
    '-map', '[vout]', '-map', '[aout]', '-r', String(FORMATO.fps),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-threads', '1', '-x264-params', 'threads=1:sliced-threads=0',
    '-c:a', 'aac', '-b:a', '128k', '-ar', String(FORMATO.audioHz), '-ac', '1',
    '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact', '-movflags', '+faststart', rutas.salida,
  ];
}

/** Lee el JSON que loudnorm deja en stderr. */
export function leeMedidaDeVolumen(stderr: string): MedidaDeVolumen | null {
  const m = /\{[^{}]*"input_i"[^{}]*\}/.exec(stderr);
  if (!m) return null;
  try { return JSON.parse(m[0]) as MedidaDeVolumen; } catch { return null; }
}
