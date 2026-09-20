/**
 * Solo servidor: el laboratorio habla con el pipeline de voz por el CLI de `tools/dictado`
 * (`archivo`, `lote`, `di`), igual que `/api/dictado/movil`. Nada de aqui entra al navegador.
 * C4: el audio va a un temporal que se borra siempre; ningun error lleva texto ni rutas.
 */
import { execFile, spawn } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { corre, entornoDictado, transcribeRapido as transcribeRapidoLocal } from '@/shared/lib/transcriptor-local';
import type { MetricasSintesis, Piezas, RespuestaTranscripcion, Segmento } from '../../types/index.ts';
import { metricasDeSintesis, metricasDeTranscripcion, parseaActa } from '../acta.ts';

export { demonioVivo, picoDb, razonSinTexto } from '@/shared/lib/transcriptor-local';

const ejecuta = promisify(execFile);

/**
 * Template strings, no `path.join` de literales, y NINGUNA llamada a `fs` con estas rutas desde
 * el bundle: Turbopack rastrea como assets lo que el codigo toque y tropieza con el symlink del
 * venv del banco (medido el 2026-09-20). Todo lo que mira el disco vive en
 * `scripts/laboratorio-voz/maquina.mjs` y corre como proceso aparte.
 */
const MAQUINA = `${process.cwd()}/scripts/laboratorio-voz/maquina.mjs`;
const entorno = entornoDictado;

/** El sondeo de disco, como proceso: `orden` es una de las de `maquina.mjs`; `entrada` va por stdin. */
export function maquina<T>(orden: string, entrada?: unknown): Promise<T> {
  return new Promise((resuelve, rechaza) => {
    const hijo = spawn(process.execPath, [MAQUINA, orden], { env: entorno(), cwd: process.cwd(), stdio: ['pipe', 'pipe', 'ignore'] });
    let salida = '';
    hijo.stdout.setEncoding('utf8');
    hijo.stdout.on('data', (d: string) => (salida += d));
    hijo.on('error', rechaza);
    hijo.on('close', (codigo) => {
      if (codigo !== 0) return rechaza(new Error(`maquina ${orden} fallo`));
      try {
        resuelve(JSON.parse(salida) as T);
      } catch (e) {
        rechaza(e);
      }
    });
    if (entrada !== undefined) hijo.stdin.write(JSON.stringify(entrada));
    hijo.stdin.end();
  });
}

/** Rapido: el demonio residente si vive, el CLI si no (ver `transcriptor-local.ts`). */
export const transcribeRapido = (ruta: string): Promise<RespuestaTranscripcion> => transcribeRapidoLocal(ruta);

export interface OpcionesTiempos {
  hablantes?: number;
  silencioMs?: number;
}

export async function transcribeConTiempos(ruta: string, opciones: OpcionesTiempos = {}): Promise<RespuestaTranscripcion> {
  const t0 = performance.now();
  // 500 ms: el defecto de `dictado lote` (entre dos personas el hueco suele ser mayor); 700 dejaba una reunion entera en un turno.
  const args = ['lote', ruta, '--motor', 'parakeet', '--silencio-ms', String(opciones.silencioMs ?? 500)];
  if (opciones.hablantes) args.push('--hablantes', String(opciones.hablantes));
  const { stdout, stderr } = await corre(args, 900_000);
  const segmentos = parseaActa(stdout);
  return { texto: segmentos.map((s) => s.texto).filter(Boolean).join(' '), segmentos, ms: Math.round(performance.now() - t0), ...metricasDeTranscripcion(stderr) };
}

/** Un canal por persona: se parte el estereo con ffmpeg y cada lado se transcribe con tiempos. */
export async function transcribePorCanales(ruta: string, carpeta: string, etiquetas: [string, string]): Promise<RespuestaTranscripcion> {
  const t0 = performance.now();
  const izquierdo = join(carpeta, 'izquierdo.wav');
  const derecho = join(carpeta, 'derecho.wav');
  await ejecuta('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', ruta, '-filter_complex', '[0:a]channelsplit=channel_layout=stereo[l][r]', '-map', '[l]', '-ar', '16000', izquierdo, '-map', '[r]', '-ar', '16000', derecho], { timeout: 120_000 });
  const [a, b] = await Promise.all([transcribeConTiempos(izquierdo, { hablantes: 1 }), transcribeConTiempos(derecho, { hablantes: 1 })]);
  const etiqueta = (segs: Segmento[] | undefined, nombre: string) => (segs ?? []).map((s) => ({ ...s, hablante: nombre }));
  const segmentos = [...etiqueta(a.segmentos, etiquetas[0]), ...etiqueta(b.segmentos, etiquetas[1])].filter((s) => s.texto.length > 0).sort((x, y) => x.inicioMs - y.inicioMs);
  return { texto: segmentos.map((s) => s.texto).join(' '), segmentos, ms: Math.round(performance.now() - t0), motor: a.motor, segundosAudio: Math.max(a.segundosAudio, b.segundosAudio), hablantes: 2 };
}

export interface OpcionesSintesis {
  voz: string;
  velocidad: number;
}

export async function sintetiza(rutaTexto: string, opciones: OpcionesSintesis, rutaSalida: string): Promise<MetricasSintesis> {
  const t0 = performance.now();
  const { stderr } = await corre(['di', '--archivo', rutaTexto, '--voz', opciones.voz, '--velocidad', String(opciones.velocidad), '--guarda', rutaSalida, '--sin-sonido'], 300_000);
  return metricasDeSintesis(stderr, Math.round(performance.now() - t0));
}

interface EstadoMaquina {
  piezas: Piezas;
  voces: string[];
}

let cache: { cuando: number; valor: EstadoMaquina } | undefined;

/** Presencia, nunca valores; y las voces YA descargadas (una peticion web jamas baja pesos). Cache corta. */
export async function estadoMaquina(): Promise<EstadoMaquina> {
  if (cache && Date.now() - cache.cuando < 10_000) return cache.valor;
  const valor = await maquina<EstadoMaquina>('piezas');
  cache = { cuando: Date.now(), valor };
  return valor;
}

export const piezas = async (): Promise<Piezas> => (await estadoMaquina()).piezas;
export const vocesDisponibles = async (): Promise<string[]> => (await estadoMaquina()).voces;
