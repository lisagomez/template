'use client';

/**
 * Lo que el navegador le pide al servidor del laboratorio, con el token de emparejamiento
 * (el mismo de /dictar) en cada llamada que toca audio o guarda algo. Los errores salen en
 * espanol llano para la persona que prueba; nunca llevan el token.
 */
import type { MetricasSintesis, Piezas, RespuestaTranscripcion, Veredicto, VeredictoNuevo } from '../types/index.ts';

export interface EstadoServidor {
  piezas: Piezas;
  voces: string[];
  /** El demonio residente de transcripcion responde: las rutas pagan solo el motor. */
  demonio?: boolean;
}

export type ModoTranscripcion = 'rapido' | 'tiempos' | 'canales';

export interface OpcionesTranscribir {
  modo: ModoTranscripcion;
  hablantes?: number;
  etiquetas?: [string, string];
  /** `respaldo`: segundo motor con el idioma forzado, para audio corto que el principal oyo en ingles. */
  motor?: 'principal' | 'respaldo';
}

const cabeceras = (token: string, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${token}`, ...extra });

async function mensajeDe(r: Response, porDefecto: string): Promise<string> {
  if (r.status === 401) return 'el emparejamiento caducó: vuelve a teclear el token';
  if (r.status === 503) return 'el servidor no tiene token configurado';
  try {
    const j = (await r.json()) as { error?: string };
    return j.error ?? porDefecto;
  } catch {
    return porDefecto;
  }
}

export async function pideEstado(): Promise<EstadoServidor> {
  const r = await fetch('/api/laboratorio/estado', { cache: 'no-store' });
  if (!r.ok) throw new Error('no se pudo leer el estado de la máquina');
  return (await r.json()) as EstadoServidor;
}

export async function transcribe(token: string, audio: Blob, opciones: OpcionesTranscribir): Promise<RespuestaTranscripcion> {
  const extra: Record<string, string> = { 'x-modo': opciones.modo, 'content-type': audio.type || 'application/octet-stream' };
  if (opciones.hablantes) extra['x-hablantes'] = String(opciones.hablantes);
  if (opciones.etiquetas) extra['x-etiquetas'] = opciones.etiquetas.join(',');
  if (opciones.motor) extra['x-motor'] = opciones.motor;
  const r = await fetch('/api/laboratorio/transcribir', { method: 'POST', headers: cabeceras(token, extra), body: audio });
  if (!r.ok) throw new Error(await mensajeDe(r, 'no se pudo transcribir'));
  return (await r.json()) as RespuestaTranscripcion;
}

const metricasDe = <T>(r: Response): T => JSON.parse(decodeURIComponent(r.headers.get('x-metricas') ?? '%7B%7D')) as T;

export async function sintetizaVoz(token: string, texto: string, voz: string | undefined, velocidad: number): Promise<{ audio: Blob; metricas: MetricasSintesis }> {
  const r = await fetch('/api/laboratorio/sintetizar', { method: 'POST', headers: cabeceras(token, { 'content-type': 'application/json' }), body: JSON.stringify({ texto, voz, velocidad }) });
  if (!r.ok) throw new Error(await mensajeDe(r, 'no se pudo generar la voz'));
  return { audio: await r.blob(), metricas: metricasDe<MetricasSintesis>(r) };
}

export interface RespuestaVozEnFlujo {
  /** PCM16LE mono; por el demonio llega frase a frase. */
  cuerpo: ReadableStream<Uint8Array>;
  frecuenciaHz: number;
  voz: string;
  via: 'demonio' | 'cli' | 'desconocida';
}

/** La voz en flujo: la respuesta se lee por trozos mientras el servidor sigue sintetizando. */
export async function pideVozEnFlujo(token: string, texto: string, opciones: { voz?: string; velocidad?: number; senal?: AbortSignal } = {}): Promise<RespuestaVozEnFlujo> {
  const r = await fetch('/api/laboratorio/sintetizar-flujo', {
    method: 'POST',
    headers: cabeceras(token, { 'content-type': 'application/json' }),
    body: JSON.stringify({ texto, voz: opciones.voz, velocidad: opciones.velocidad }),
    signal: opciones.senal,
  });
  if (!r.ok || !r.body) throw new Error(await mensajeDe(r, 'no se pudo generar la voz'));
  const via = r.headers.get('x-via');
  return { cuerpo: r.body, frecuenciaHz: Number(r.headers.get('x-frecuencia-hz') ?? 22050), voz: r.headers.get('x-voz') ?? '', via: via === 'demonio' || via === 'cli' ? via : 'desconocida' };
}

export interface LineaMuestra {
  canal: 'izquierdo' | 'derecho';
  texto: string;
}

export async function fabricaMuestra(token: string, lineas: LineaMuestra[], formato: 'estereo' | 'mono'): Promise<{ audio: Blob; segundosAudio: number }> {
  const r = await fetch('/api/laboratorio/muestra', { method: 'POST', headers: cabeceras(token, { 'content-type': 'application/json' }), body: JSON.stringify({ lineas, formato }) });
  if (!r.ok) throw new Error(await mensajeDe(r, 'no se pudo fabricar la muestra'));
  return { audio: await r.blob(), segundosAudio: metricasDe<{ segundosAudio: number }>(r).segundosAudio };
}

export async function leeVeredictos(token: string): Promise<Veredicto[]> {
  const r = await fetch('/api/laboratorio/veredictos', { headers: cabeceras(token), cache: 'no-store' });
  if (!r.ok) throw new Error(await mensajeDe(r, 'no se pudieron leer los veredictos'));
  return ((await r.json()) as { veredictos: Veredicto[] }).veredictos;
}

export async function guardaVeredicto(token: string, nuevo: VeredictoNuevo): Promise<Veredicto> {
  const r = await fetch('/api/laboratorio/veredictos', { method: 'POST', headers: cabeceras(token, { 'content-type': 'application/json' }), body: JSON.stringify(nuevo) });
  if (!r.ok) throw new Error(await mensajeDe(r, 'no se pudo guardar el veredicto'));
  return ((await r.json()) as { veredicto: Veredicto }).veredicto;
}

export async function descargaInforme(token: string): Promise<Blob> {
  const r = await fetch('/api/laboratorio/veredictos?formato=md', { headers: cabeceras(token), cache: 'no-store' });
  if (!r.ok) throw new Error(await mensajeDe(r, 'no se pudo generar el informe'));
  return r.blob();
}

export interface DatosPersonales {
  diccionario: string[];
  snippets: Array<{ disparador: string; expansion: string; usos: number }>;
  historial: Array<{ id: string; fecha: string; texto: string; motor: string; duracionMs: number; latenciaMs: number | null }>;
  total: number;
}

export type OrdenDatos =
  | { orden: 'diccionario-agrega'; terminos: string[] }
  | { orden: 'diccionario-quita'; termino: string }
  | { orden: 'snippets-agrega'; disparador: string; expansion: string }
  | { orden: 'snippets-quita'; disparador: string }
  | { orden: 'historial-corrige'; id: string; texto: string };

export async function leeDatos(token: string): Promise<DatosPersonales> {
  const r = await fetch('/api/laboratorio/datos', { headers: cabeceras(token), cache: 'no-store' });
  if (!r.ok) throw new Error(await mensajeDe(r, 'no se pudieron leer tus datos'));
  return (await r.json()) as DatosPersonales;
}

export async function ordenaDatos(token: string, orden: OrdenDatos): Promise<{ anadidos?: string[]; quitado?: boolean; candidatos?: string[]; corregida?: boolean }> {
  const r = await fetch('/api/laboratorio/datos', { method: 'POST', headers: cabeceras(token, { 'content-type': 'application/json' }), body: JSON.stringify(orden) });
  if (!r.ok) throw new Error(await mensajeDe(r, 'no se pudo aplicar'));
  return (await r.json()) as { anadidos?: string[]; quitado?: boolean; candidatos?: string[]; corregida?: boolean };
}
