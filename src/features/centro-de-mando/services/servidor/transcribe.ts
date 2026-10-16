/**
 * Voz → texto para el centro de mando, contra el demonio LOCAL de `tools/dictado`
 * (127.0.0.1, Bearer = DICTADO_MOVIL_TOKEN). El audio va de la página a este servidor y de aquí
 * al demonio: no sale de la máquina.
 *
 * Órdenes cortas y Parakeet: el motor detecta el idioma solo y, con un audio de un segundo, oye
 * inglés («Para» → «But», «Más despacio» → «Must spacious»; medido el 2026-10-16 con voces Piper).
 * El respaldo con el idioma forzado (faster-whisper) tarda ~1,7 s: no cabe en «menos de un
 * segundo». Así que a un audio corto se le hacen DOS pasadas en paralelo: la directa y otra con
 * una frase portadora en español delante («Escucha.»), que ancla el idioma; luego se quita la
 * portadora del texto. El enrutador recibe las dos y se queda con la orden más segura. Como se
 * especula en la pausa, esas dos pasadas suelen terminar antes de que el VAD cierre.
 */
import { pareceOtroIdioma } from '../../../../../tools/dictado/dist/index.js';
import { aPcm16, dePcm16, palabras, parecido } from '../../../../../tools/bucle-voz/dist/index.js';

const PUERTO = process.env['DICTADO_DEMONIO_PUERTO'] ?? '47125';
const DEMONIO = `http://127.0.0.1:${PUERTO}`;
const HZ = 16_000;
/** Hasta cuánto audio se ancla (órdenes y frases cortas). */
export const SEGUNDOS_ANCLAJE = 1.8;
const PORTADORA = 'Escucha.';

export class DemonioCaido extends Error {}

const cabeceras = (extra: Record<string, string>) => ({ authorization: `Bearer ${process.env['DICTADO_MOVIL_TOKEN'] ?? ''}`, ...extra });

async function pasada(pcm: Uint8Array, senal: AbortSignal): Promise<string> {
  let r: Response;
  try {
    r = await fetch(`${DEMONIO}/transcribir`, { method: 'POST', headers: cabeceras({ 'content-type': 'application/octet-stream', 'x-frecuencia-hz': String(HZ), 'x-idioma': 'es' }), body: new Uint8Array(pcm), signal: senal });
  } catch (e) {
    if (senal.aborted) throw e;
    throw new DemonioCaido('el motor local no responde: arranca «npm run demonio» en tools/dictado');
  }
  const cuerpo = (await r.json().catch(() => ({}))) as { texto?: string; error?: string };
  if (!r.ok) throw new Error(`motor local: ${r.status} ${cuerpo.error ?? ''}`.trim());
  return (cuerpo.texto ?? '').trim();
}

/** Remuestreo lineal (la portadora sale del demonio a 22 050 Hz). */
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

let portadora: Promise<Float32Array> | undefined;

/** La frase portadora en PCM a 16 kHz, sintetizada UNA vez por el mismo demonio (voz Piper local). */
function portadoraPcm(): Promise<Float32Array> {
  portadora ??= (async () => {
    const r = await fetch(`${DEMONIO}/sintetizar`, { method: 'POST', headers: cabeceras({ 'content-type': 'application/json' }), body: JSON.stringify({ texto: PORTADORA }) });
    if (!r.ok) throw new DemonioCaido('el motor local no sintetiza la portadora');
    const hz = Number(r.headers.get('x-frecuencia-hz') ?? 22_050);
    return remuestrea(dePcm16(new Uint8Array(await r.arrayBuffer())), hz, HZ);
  })().catch((e: unknown) => {
    portadora = undefined;
    throw e;
  });
  return portadora;
}

/** Quita la portadora del principio del texto anclado («Escucha. Para.» → «Para.»). */
export function quitaPortadora(texto: string): string {
  const m = /^\s*([\p{L}]+)[\s\p{P}]*/u.exec(texto);
  if (!m?.[1] || parecido(palabras(m[1])[0] ?? '', 'escucha') < 0.7) return texto.trim();
  return texto.slice(m[0].length).trim();
}

function junta(...partes: Float32Array[]): Float32Array {
  const total = partes.reduce((s, p) => s + p.length, 0);
  const salida = new Float32Array(total);
  let i = 0;
  for (const p of partes) {
    salida.set(p, i);
    i += p.length;
  }
  return salida;
}

export interface Transcripcion {
  candidatos: string[];
  anclada: boolean;
  ms: number;
}

/** `pcm`: PCM16LE mono a 16 kHz. */
export async function transcribeTurno(pcm: Uint8Array, senal: AbortSignal): Promise<Transcripcion> {
  const t0 = performance.now();
  const segundos = pcm.length / 2 / HZ;
  if (segundos > SEGUNDOS_ANCLAJE) return { candidatos: [await pasada(pcm, senal)].filter(Boolean), anclada: false, ms: Math.round(performance.now() - t0) };
  const audio = dePcm16(pcm);
  const silencio = (s: number) => new Float32Array(Math.round(s * HZ));
  const anclado = async () => quitaPortadora(await pasada(new Uint8Array(aPcm16(junta(await portadoraPcm(), silencio(0.15), audio, silencio(0.3))).buffer), senal));
  const [directa, conPortadora] = await Promise.all([pasada(pcm, senal), anclado().catch(() => '')]);
  const orden = pareceOtroIdioma(directa, 'es') || directa.length === 0 ? [conPortadora, directa] : [directa, conPortadora];
  return { candidatos: [...new Set(orden.filter((t) => t.length > 0))], anclada: true, ms: Math.round(performance.now() - t0) };
}

export async function demonioResponde(): Promise<boolean> {
  try {
    return (await fetch(`${DEMONIO}/health`, { signal: AbortSignal.timeout(400), cache: 'no-store' })).ok;
  } catch {
    return false;
  }
}
