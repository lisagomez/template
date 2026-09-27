/**
 * Render de una escena a MP4, SOLO SERVIDOR (lo usan la ruta /api/contenido/video y los scripts del
 * laboratorio). Chromium sin ventana fotografía cada cuadro con TODA la red bloqueada; ffmpeg codifica
 * H.264 + AAC 48 kHz con parámetros deterministas (un hilo, sin metadatos): misma escena → mismo
 * archivo, byte a byte. Requiere Playwright (dependencia de desarrollo) y ffmpeg: en producción no
 * están, y llevarlos es una decisión de infraestructura (PRP-006, fase 10).
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { cuadroSvg, planDeRender, sonidoDeEscena, wavDe, type Escena } from '../../../../../tools/pymes-marketing/dist/video/index.js';

const corre = promisify(execFile);

export interface VideoRenderizado {
  readonly mp4: Buffer;
  readonly huella: string;
  readonly cuadros: number;
  readonly ms: number;
}

async function fotografiaCuadros(e: Escena, dir: string): Promise<number> {
  const { chromium } = await import('playwright');
  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage({ viewport: { width: e.ancho, height: e.alto }, deviceScaleFactor: 1 });
    await pagina.route('**/*', (r) => (r.request().url().startsWith('data:') ? r.continue() : r.abort()));
    await pagina.setContent('<!doctype html><html><body style="margin:0;background:#000"><div id="c"></div></body></html>');
    const plan = planDeRender(e);
    for (let i = 0; i < plan.cuadros; i++) {
      await pagina.evaluate((svg) => { document.getElementById('c')!.innerHTML = svg; }, cuadroSvg(e, plan.tiempo(i)));
      await pagina.screenshot({ path: join(dir, `c${String(i).padStart(4, '0')}.png`), clip: { x: 0, y: 0, width: e.ancho, height: e.alto } });
    }
    return plan.cuadros;
  } finally {
    await navegador.close();
  }
}

export async function renderizaVideo(e: Escena): Promise<VideoRenderizado> {
  const t0 = Date.now();
  const dir = await mkdtemp(join(tmpdir(), 'promo-'));
  try {
    const cuadros = await fotografiaCuadros(e, dir);
    await writeFile(join(dir, 'sonido.wav'), wavDe(sonidoDeEscena(e)));
    const salida = join(dir, 'promo.mp4');
    await corre('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(e.fps), '-i', join(dir, 'c%04d.png'), '-i', join(dir, 'sonido.wav'),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-threads', '1', '-x264-params', 'threads=1:sliced-threads=0',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-shortest', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact',
      '-movflags', '+faststart', salida]);
    const mp4 = await readFile(salida);
    return { mp4, huella: createHash('sha256').update(mp4).digest('hex'), cuadros, ms: Date.now() - t0 };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Hoja de cuadros del MP4 real (lo que de verdad quedó codificado): 6×3 cuadros repartidos. */
export async function hojaDeCuadrosPng(mp4: Buffer, duracion: number): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'hoja-'));
  try {
    await writeFile(join(dir, 'v.mp4'), mp4);
    await corre('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(dir, 'v.mp4'), '-vf', `fps=${(18 / duracion).toFixed(4)},scale=240:-2,tile=6x3:padding=6:color=0x111111`, '-frames:v', '1', join(dir, 'hoja.png')]);
    return await readFile(join(dir, 'hoja.png'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function ffprobeJson(mp4: Buffer): Promise<unknown> {
  const dir = await mkdtemp(join(tmpdir(), 'probe-'));
  try {
    await writeFile(join(dir, 'v.mp4'), mp4);
    const { stdout } = await corre('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,sample_rate,channels:format=duration', '-of', 'json', join(dir, 'v.mp4')]);
    return JSON.parse(stdout);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
