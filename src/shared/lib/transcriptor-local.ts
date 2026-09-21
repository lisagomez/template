/**
 * Solo servidor: audio → texto con el pipeline LOCAL, por dos caminos y en este orden:
 *
 *  1. **El demonio** (`tools/dictado/servicio/` en 127.0.0.1, modelo cargado una vez): la ruta
 *     paga solo el motor. Bearer = `DICTADO_MOVIL_TOKEN`, el mismo del celular (C3).
 *  2. **El CLI por proceso** (`dictado archivo`), si el demonio no responde: lo de siempre,
 *     ~3 s de arranque por peticion. Nunca se queda sin transcribir por no tener demonio.
 *
 * Lo comparten `/api/dictado/movil` y `/api/laboratorio/*`. Template strings para las rutas y
 * NINGUNA llamada a `fs` sobre el banco desde el bundle: Turbopack rastrea el disco que el
 * codigo toca y tropieza con el symlink del venv (aprendizaje del 2026-09-20). Solo temporales.
 */
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { metricasDeSintesis, metricasDeTranscripcion } from './dictado-metricas';

const ejecuta = promisify(execFile);

export const RAIZ_DICTADO = process.env['DICTADO_RAIZ'] ?? `${process.cwd()}/tools/dictado`;
export const CLI_DICTADO = `${RAIZ_DICTADO}/dist/node/cli.js`;
const BANCO = `${RAIZ_DICTADO}/medicion/banco`;
const PUERTO_DEMONIO = process.env['DICTADO_DEMONIO_PUERTO'] ?? '47125';
const URL_DEMONIO = `http://127.0.0.1:${PUERTO_DEMONIO}`;

export const entornoDictado = () => ({
  ...process.env,
  DICTADO_MODELOS: process.env['DICTADO_MODELOS'] ?? `${BANCO}/modelos`,
  DICTADO_RUNTIME: process.env['DICTADO_RUNTIME'] ?? BANCO,
  DICTADO_DATOS: process.env['DICTADO_DATOS'] ?? `${BANCO}/datos`,
  DICTADO_PYTHON: process.env['DICTADO_PYTHON'] ?? `${BANCO}/venv/bin/python`,
});

export type ViaTranscripcion = 'demonio' | 'cli';

/** `principal` = Parakeet; `respaldo` = faster-whisper con el idioma forzado, para audio corto que el principal oyo en ingles. */
export type MotorTranscripcion = 'principal' | 'respaldo';
export const MOTOR_RESPALDO_CLI = 'faster-whisper:small';

export interface Transcrito {
  texto: string;
  /** Tiempo total del lado del servidor, con lectura del audio. */
  ms: number;
  motor: string;
  segundosAudio: number;
  /** Solo el reconocimiento, si se pudo leer. */
  msMotor?: number;
  via: ViaTranscripcion;
  /** Lo transcribio el motor de respaldo (pedido por el cliente). */
  respaldo?: boolean;
}

export async function corre(args: string[], timeoutMs: number, env: NodeJS.ProcessEnv = entornoDictado()): Promise<{ stdout: string; stderr: string }> {
  return ejecuta(process.execPath, [CLI_DICTADO, ...args], { env, cwd: RAIZ_DICTADO, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 });
}

/** El entorno con el que el CLI usa el demonio como motor «remoto» (127.0.0.1, mismo token). */
export const entornoRemotoDemonio = (): NodeJS.ProcessEnv => ({ ...entornoDictado(), DICTADO_REMOTO_URL: URL_DEMONIO, DICTADO_REMOTO_TOKEN: process.env['DICTADO_MOVIL_TOKEN'] ?? '' });

let saludCache: { cuando: number; vivo: boolean } | undefined;

/** `/health` del demonio con tope corto y cache de 3 s: una ruta no puede esperar a un demonio muerto. */
export async function demonioVivo(): Promise<boolean> {
  if (saludCache && Date.now() - saludCache.cuando < 3_000) return saludCache.vivo;
  let vivo = false;
  try {
    const r = await fetch(`${URL_DEMONIO}/health`, { signal: AbortSignal.timeout(400), cache: 'no-store' });
    vivo = r.ok;
  } catch {
    vivo = false;
  }
  saludCache = { cuando: Date.now(), vivo };
  return vivo;
}

/**
 * Cualquier formato del navegador → PCM16LE mono 16 kHz en memoria, que el demonio lee con la
 * frecuencia en cabecera. Crudo y no WAV: el WAV que ffmpeg escribe a una tuberia lleva tamanos
 * «desconocidos» (0xFFFFFFFF) en la cabecera y el lector lo rechaza (medido el 2026-09-20).
 */
async function aPcm16k(ruta: string): Promise<Buffer> {
  const { stdout } = await ejecuta('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', ruta, '-ac', '1', '-ar', '16000', '-f', 's16le', 'pipe:1'], { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024, timeout: 120_000 });
  return stdout;
}

export async function transcribeConDemonio(ruta: string, motor: MotorTranscripcion = 'principal'): Promise<Transcrito> {
  const token = process.env['DICTADO_MOVIL_TOKEN'] ?? '';
  const t0 = performance.now();
  const pcm = await aPcm16k(ruta);
  const segundosAudio = Math.round((pcm.length / 32_000) * 10) / 10;
  const r = await fetch(`${URL_DEMONIO}/transcribir`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream', 'x-frecuencia-hz': '16000', 'x-idioma': 'es', 'x-motor': motor },
    body: new Uint8Array(pcm),
    signal: AbortSignal.timeout(180_000),
  });
  const cuerpo = (await r.json().catch(() => ({}))) as { texto?: string; ms?: number; motor?: string; error?: string; respaldo?: boolean };
  if (!r.ok) throw new Error(`demonio: ${r.status} ${cuerpo.error ?? ''}`.trim());
  saludCache = { cuando: Date.now(), vivo: true };
  return { texto: (cuerpo.texto ?? '').trim(), ms: Math.round(performance.now() - t0), motor: cuerpo.motor ?? 'demonio', segundosAudio, ...(cuerpo.ms !== undefined ? { msMotor: cuerpo.ms } : {}), via: 'demonio', ...(cuerpo.respaldo ? { respaldo: true } : {}) };
}

export async function transcribeConCli(ruta: string, motor: MotorTranscripcion = 'principal'): Promise<Transcrito> {
  const t0 = performance.now();
  const { stdout, stderr } = await corre(['archivo', ruta, '--motor', motor === 'respaldo' ? MOTOR_RESPALDO_CLI : 'parakeet'], 180_000);
  return { texto: stdout.trim(), ms: Math.round(performance.now() - t0), ...metricasDeTranscripcion(stderr), via: 'cli', ...(motor === 'respaldo' ? { respaldo: true } : {}) };
}

/** Demonio si vive; si falla a medio camino, el CLI. Nunca dos veces el mismo audio por el demonio. */
export async function transcribeRapido(ruta: string, opciones: { motor?: MotorTranscripcion } = {}): Promise<Transcrito> {
  const motor = opciones.motor ?? 'principal';
  if (await demonioVivo()) {
    try {
      return await transcribeConDemonio(ruta, motor);
    } catch (e) {
      // Un 409 (sin respaldo configurado) no es un demonio caido: se cae al CLI sin marcarlo muerto.
      if (!(e instanceof Error && e.message.includes('409'))) saludCache = { cuando: Date.now(), vivo: false };
    }
  }
  return transcribeConCli(ruta, motor);
}

export interface VozEnFlujo {
  via: ViaTranscripcion;
  frecuenciaHz: number;
  voz: string;
  /** PCM16LE mono. Por el demonio, una frase por trozo segun se sintetiza; por el CLI, todo de una vez al final. */
  cuerpo: ReadableStream<Uint8Array>;
}

async function sintetizaConDemonio(texto: string, voz: string | undefined, velocidad: number, senal: AbortSignal | undefined): Promise<VozEnFlujo> {
  const token = process.env['DICTADO_MOVIL_TOKEN'] ?? '';
  const senales = [AbortSignal.timeout(120_000), ...(senal ? [senal] : [])];
  const r = await fetch(`${URL_DEMONIO}/sintetizar`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ texto, ...(voz ? { voz } : {}), velocidad }),
    signal: AbortSignal.any(senales),
  });
  if (!r.ok || !r.body) {
    const cuerpo = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(`demonio: ${r.status} ${cuerpo.error ?? ''}`.trim());
  }
  saludCache = { cuando: Date.now(), vivo: true };
  return { via: 'demonio', frecuenciaHz: Number(r.headers.get('x-frecuencia-hz') ?? 22050), voz: r.headers.get('x-voz') ?? voz ?? '', cuerpo: r.body };
}

/** El CLI hace el WAV entero y ffmpeg lo pasa a PCM crudo (`-f s16le`, nunca WAV por tuberia): un solo trozo al final. */
async function sintetizaConCli(texto: string, voz: string | undefined, velocidad: number): Promise<VozEnFlujo> {
  const carpeta = await mkdtemp(join(tmpdir(), 'voz-flujo-'));
  try {
    const rutaTexto = join(carpeta, 'texto.txt');
    const rutaWav = join(carpeta, 'voz.wav');
    await writeFile(rutaTexto, texto, 'utf8');
    const args = ['di', '--archivo', rutaTexto, '--guarda', rutaWav, '--sin-sonido', '--velocidad', String(velocidad), ...(voz ? ['--voz', voz] : [])];
    const { stderr } = await corre(args, 300_000);
    const metricas = metricasDeSintesis(stderr, 0);
    const { stdout } = await ejecuta('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', rutaWav, '-ac', '1', '-ar', '22050', '-f', 's16le', 'pipe:1'], { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024, timeout: 120_000 });
    const bytes = new Uint8Array(stdout);
    return { via: 'cli', frecuenciaHz: 22050, voz: metricas.voz.replace(/^sherpa-tts:/, ''), cuerpo: new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } }) };
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}

/** Voz en flujo: el demonio si vive (frase a frase), el CLI si no. La respuesta dice por donde paso. */
export async function sintetizaEnFlujo(texto: string, voz: string | undefined, velocidad = 1, senal?: AbortSignal): Promise<VozEnFlujo> {
  if (await demonioVivo()) {
    try {
      return await sintetizaConDemonio(texto, voz, velocidad, senal);
    } catch (e) {
      if (senal?.aborted) throw e;
      saludCache = { cuando: Date.now(), vivo: false };
    }
  }
  return sintetizaConCli(texto, voz, velocidad);
}

/** Nivel pico en dBFS con ffmpeg, para decir POR QUE una toma salio sin texto. */
export function picoDb(ruta: string): Promise<number> {
  return new Promise((resuelve) => {
    execFile('ffmpeg', ['-hide_banner', '-i', ruta, '-af', 'volumedetect', '-f', 'null', '-'], (_e, _o, stderr) => {
      const m = /max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/.exec(stderr ?? '');
      resuelve(m ? Number(m[1]) : -Infinity);
    });
  });
}

export function razonSinTexto(bytes: number, pico: number): string {
  if (bytes < 2_000) return 'no se grabo audio (revisa el permiso de microfono del navegador)';
  if (pico < -50) return 'el microfono no capto voz: revisa que microfono usa el navegador y su nivel';
  return 'sin voz clara en la toma (acercate al microfono y habla al terminar de tocar)';
}

/** El texto viaja por stdin: comillas y saltos de linea no pelean con la shell. */
export function pegaEnPc(texto: string): Promise<void> {
  return new Promise((resuelve, rechaza) => {
    const hijo = spawn(process.execPath, [CLI_DICTADO, 'pega'], { env: entornoDictado(), cwd: RAIZ_DICTADO, stdio: ['pipe', 'ignore', 'ignore'] });
    hijo.on('error', rechaza);
    hijo.on('close', (codigo) => (codigo === 0 ? resuelve() : rechaza(new Error('el pegado fallo'))));
    hijo.stdin.write(texto);
    hijo.stdin.end();
  });
}
