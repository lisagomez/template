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
}

export type ModoTranscripcion = 'rapido' | 'tiempos' | 'canales';

export interface OpcionesTranscribir {
  modo: ModoTranscripcion;
  hablantes?: number;
  etiquetas?: [string, string];
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
