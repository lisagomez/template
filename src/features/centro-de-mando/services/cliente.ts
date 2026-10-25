'use client';

/**
 * Lo que la página le pide al servidor, siempre con el token de emparejamiento y la señal del
 * turno: si el turno muere, la petición se corta. El audio va solo al servidor LOCAL; el texto
 * solo sale (hacia el cerebro) cuando el enrutador lo decide.
 */
import { aPcm16, dePcm16, type AudioFrase, type AudioTurno, type Mensaje, type PiezaCerebro } from '../../../../tools/bucle-voz/dist/index.js';
import type { EstadoServidor } from '../types/index.ts';

const cabeceras = (token: string, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${token}`, ...extra });

async function error(r: Response, porDefecto: string): Promise<Error> {
  if (r.status === 401) return new Error('el emparejamiento caducó: vuelve a teclear el token');
  const j = (await r.json().catch(() => ({}))) as { error?: string };
  return new Error(j.error ?? porDefecto);
}

export async function transcribe(token: string, audio: AudioTurno, senal: AbortSignal): Promise<string[]> {
  if (audio.hz !== 16_000) throw new Error('el micrófono tiene que entregar 16 kHz');
  const r = await fetch('/api/centro-de-mando/transcribir', {
    method: 'POST',
    headers: cabeceras(token, { 'content-type': 'application/octet-stream', 'x-frecuencia-hz': '16000' }),
    body: aPcm16(audio.muestras).buffer,
    signal: senal,
  });
  if (!r.ok) throw await error(r, 'no se pudo transcribir');
  return ((await r.json()) as { candidatos: string[] }).candidatos;
}

/** La voz de UNA frase, entera (el demonio la sintetiza en ~100-200 ms). */
export async function sintetiza(token: string, frase: string, senal: AbortSignal, voz = 'es_MX-claude-high', velocidad = 0.9): Promise<AudioFrase> {
  const r = await fetch('/api/centro-de-mando/voz', {
    method: 'POST',
    headers: cabeceras(token, { 'content-type': 'application/json' }),
    body: JSON.stringify({ texto: frase, voz, velocidad }),
    signal: senal,
  });
  if (!r.ok) throw await error(r, 'no se pudo generar la voz');
  const hz = Number(r.headers.get('x-frecuencia-hz') ?? 22_050);
  return { muestras: dePcm16(new Uint8Array(await r.arrayBuffer())), hz };
}

/** El cerebro en flujo: una línea NDJSON por token, y el uso al final (y, si es el simulado, lo dice al principio). */
export async function* piensa(token: string, mensajes: readonly Mensaje[], senal: AbortSignal): AsyncGenerator<PiezaCerebro> {
  const r = await fetch('/api/centro-de-mando/cerebro', { method: 'POST', headers: cabeceras(token, { 'content-type': 'application/json' }), body: JSON.stringify({ mensajes }), signal: senal });
  if (!r.ok || !r.body) throw await error(r, 'el cerebro no respondió');
  const lector = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let resto = '';
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    resto += value;
    let i: number;
    while ((i = resto.indexOf('\n')) >= 0) {
      const linea = resto.slice(0, i).trim();
      resto = resto.slice(i + 1);
      if (!linea) continue;
      const pieza = JSON.parse(linea) as { t: 'token'; x: string } | { t: 'uso'; costoUsd: number | null } | { t: 'cerebro'; simulado: boolean } | { t: 'error'; mensaje: string };
      if (pieza.t === 'token') yield { tipo: 'token', texto: pieza.x };
      else if (pieza.t === 'uso') yield { tipo: 'uso', costoUsd: pieza.costoUsd };
      else if (pieza.t === 'cerebro') yield { tipo: 'meta', simulado: pieza.simulado === true };
      else throw new Error(pieza.mensaje);
    }
  }
}

export async function lee(token: string, orden: 'agenda-hoy' | 'agenda-manana' | 'gasto', senal: AbortSignal): Promise<string> {
  const r = await fetch('/api/centro-de-mando/lee', { method: 'POST', headers: cabeceras(token, { 'content-type': 'application/json' }), body: JSON.stringify({ orden }), signal: senal });
  if (!r.ok) throw await error(r, 'no se pudo leer');
  return ((await r.json()) as { texto: string }).texto;
}

export async function pideEstado(token: string): Promise<EstadoServidor> {
  const r = await fetch('/api/centro-de-mando/estado', { headers: cabeceras(token), cache: 'no-store' });
  if (!r.ok) throw await error(r, 'no se pudo leer el estado de la máquina');
  return (await r.json()) as EstadoServidor;
}
