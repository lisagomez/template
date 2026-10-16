/**
 * Voz sintética LOCAL para medir: el demonio de dictado (Piper) dice una frase, se pasa a 16 kHz y
 * se calcula dónde empieza y acaba de verdad la voz (la verdad de terreno del «fin real del habla»).
 * Nada sale de la máquina.
 */
import { readFileSync } from 'node:fs';
import { dePcm16, nivelDb } from '../../tools/bucle-voz/dist/index.js';

export const DEMONIO = `http://127.0.0.1:${process.env['DICTADO_DEMONIO_PUERTO'] ?? '47125'}`;
export const VOCES = ['es_MX-claude-high', 'es_ES-davefx-medium', 'es_MX-ald-medium'] as const;

/** El token del dictado, de `.env.local` o del entorno. Nunca se imprime. */
export function tokenDictado(): string {
  if (process.env['DICTADO_MOVIL_TOKEN']) return process.env['DICTADO_MOVIL_TOKEN'];
  const m = /^DICTADO_MOVIL_TOKEN=(.+)$/m.exec(readFileSync('.env.local', 'utf8'));
  if (!m?.[1]) throw new Error('falta DICTADO_MOVIL_TOKEN (.env.local)');
  return m[1].trim();
}

function remuestrea(x: Float32Array, de: number, a: number): Float32Array {
  const n = Math.round((x.length * a) / de);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = (i * de) / a;
    const j = Math.floor(p);
    y[i] = (x[j] ?? 0) * (1 - (p - j)) + (x[j + 1] ?? 0) * (p - j);
  }
  return y;
}

export interface Dicho {
  texto: string;
  voz: string;
  muestras: Float32Array;
  hz: 16_000;
  /** ms desde el inicio del clip hasta la primera / última ventana de 10 ms con voz (> −45 dBFS). */
  msInicioVoz: number;
  msFinVoz: number;
}

export function limitesDeVoz(muestras: Float32Array, hz: number, umbralDb = -45): { inicio: number; fin: number } {
  const v = Math.round(hz / 100);
  let inicio = -1;
  let fin = -1;
  for (let i = 0; i + v <= muestras.length; i += v) {
    if (nivelDb(muestras, i, i + v) >= umbralDb) {
      if (inicio < 0) inicio = i;
      fin = i + v;
    }
  }
  return { inicio: (Math.max(0, inicio) / hz) * 1000, fin: (Math.max(0, fin) / hz) * 1000 };
}

export async function dice(texto: string, voz: string, token = tokenDictado()): Promise<Dicho> {
  const r = await fetch(`${DEMONIO}/sintetizar`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ texto, voz }) });
  if (!r.ok) throw new Error(`el demonio no sintetizó «${texto}» (${r.status})`);
  const hz = Number(r.headers.get('x-frecuencia-hz') ?? 22_050);
  const muestras = remuestrea(dePcm16(new Uint8Array(await r.arrayBuffer())), hz, 16_000);
  const { inicio, fin } = limitesDeVoz(muestras, 16_000);
  return { texto, voz, muestras, hz: 16_000, msInicioVoz: inicio, msFinVoz: fin };
}
