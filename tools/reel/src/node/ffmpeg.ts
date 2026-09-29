/** ffmpeg y ffprobe como procesos locales. Nada sale de la máquina. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Medidas } from '../tipos.js';
import { FORMATO } from '../tipos.js';

export interface Salida { codigo: number; stdout: Buffer; stderr: string }

export function corre(bin: string, args: readonly string[], cwd?: string): Promise<Salida> {
  return new Promise((resolver, rechazar) => {
    const p = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = []; let err = '';
    p.stdout.on('data', (d: Buffer) => out.push(d));
    p.stderr.on('data', (d: Buffer) => { err += d.toString(); if (err.length > 2_000_000) err = err.slice(-1_000_000); });
    p.on('error', rechazar);
    p.on('close', (codigo) => resolver({ codigo: codigo ?? 1, stdout: Buffer.concat(out), stderr: err }));
  });
}

async function exige(bin: string, args: readonly string[], cwd?: string): Promise<Salida> {
  const s = await corre(bin, args, cwd);
  if (s.codigo !== 0) throw new Error(`${bin} falló (${s.codigo}): ${s.stderr.slice(-600)}`);
  return s;
}

interface Sonda { streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number; r_frame_rate?: string; sample_rate?: string; tags?: Record<string, string>; side_data_list?: Array<{ rotation?: number }> }>; format: { duration?: string; tags?: Record<string, string> } }

/** Medidas y TODAS las etiquetas (ahí vive la ubicación GPS que guarda el celular). */
export async function mide(ruta: string): Promise<{ medidas: Medidas; etiquetas: Record<string, string> }> {
  const s = await exige('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', ruta]);
  const j = JSON.parse(s.stdout.toString()) as Sonda;
  const v = j.streams.find((x) => x.codec_type === 'video'), a = j.streams.find((x) => x.codec_type === 'audio');
  const [num, den] = (v?.r_frame_rate ?? '0/1').split('/').map(Number);
  const girado = Math.abs(v?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0) === 90;
  const etiquetas = { ...j.format.tags, ...v?.tags, ...a?.tags };
  return {
    medidas: {
      ancho: (girado ? v?.height : v?.width) ?? 0, alto: (girado ? v?.width : v?.height) ?? 0,
      fps: den ? (num ?? 0) / den : 0, duracion: Number(j.format.duration ?? 0),
      ...(a?.sample_rate ? { audioHz: Number(a.sample_rate) } : {}), ...(v ? { codecVideo: v.codec_name } : {}), ...(a ? { codecAudio: a.codec_name } : {}),
    },
    etiquetas,
  };
}

/** Normaliza a 1080×1920, 30 fps, audio 48 kHz, y BORRA metadatos (ubicación incluida). */
export async function normaliza(entrada: string, salida: string): Promise<void> {
  await exige('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', entrada,
    '-vf', `scale=${FORMATO.ancho}:${FORMATO.alto}:force_original_aspect_ratio=increase,crop=${FORMATO.ancho}:${FORMATO.alto},fps=${FORMATO.fps},setsar=1`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-threads', '1',
    '-c:a', 'pcm_s16le', '-ar', String(FORMATO.audioHz), '-ac', '1',
    '-map_metadata', '-1', '-map_chapters', '-1', '-metadata:s:v', 'rotate=', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact', salida]);
}
export const rutaNormalizada = (carpeta: string): string => join(carpeta, 'normalizado.mov');

/** Audio mono a la frecuencia pedida, como Float32Array (sin archivo intermedio). */
export async function audio(entrada: string, hz = 16_000): Promise<Float32Array> {
  const s = await exige('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', entrada, '-vn', '-ac', '1', '-ar', String(hz), '-f', 'f32le', 'pipe:1']);
  return new Float32Array(s.stdout.buffer, s.stdout.byteOffset, Math.floor(s.stdout.byteLength / 4)).slice();
}

/** Un cuadro cada `cada` segundos, en PNG. Devuelve la ruta y el instante de cada uno. */
export async function cuadros(entrada: string, carpeta: string, cada: number, ancho = 540): Promise<Array<{ ruta: string; t: number }>> {
  await mkdir(carpeta, { recursive: true });
  await exige('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', entrada, '-vf', `fps=1/${cada},scale=${ancho}:-2`, join(carpeta, 'c%04d.png')]);
  const nombres = (await readdir(carpeta)).filter((n) => /^c\d{4}\.png$/.test(n)).sort();
  return nombres.map((n, i) => ({ ruta: join(carpeta, n), t: i * cada }));
}

/** Volumen integrado (EBU R128) en LUFS. */
export async function lufs(ruta: string): Promise<number | null> {
  const s = await corre('ffmpeg', ['-hide_banner', '-nostats', '-i', ruta, '-filter_complex', 'ebur128=framelog=quiet', '-f', 'null', '-']);
  const m = /Integrated loudness:\s*I:\s*(-?[\d.]+) LUFS/.exec(s.stderr);
  return m ? Number(m[1]) : null;
}

export function huella(ruta: string): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const h = createHash('sha256');
    createReadStream(ruta).on('data', (d) => h.update(d)).on('error', rechazar).on('end', () => resolver(`sha256:${h.digest('hex')}`));
  });
}

/** Hoja de cuadros 6×3 («ver con ojos»): para el dueño y para el laboratorio. */
export async function hojaDeCuadros(entrada: string, salida: string, duracion: number): Promise<void> {
  await exige('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', entrada, '-vf', `fps=${(18 / Math.max(1, duracion)).toFixed(4)},scale=240:-2,tile=6x3:padding=6:color=0x111111`, '-frames:v', '1', salida]);
}
