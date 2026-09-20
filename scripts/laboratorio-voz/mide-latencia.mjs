#!/usr/bin/env node
/**
 * Mide la latencia de las rutas web de transcripcion con la MISMA frase, N veces, y da p50/p95.
 * Es la cifra «vista desde el navegador»: incluye red local, lectura del audio y motor.
 *
 *   node scripts/laboratorio-voz/mide-latencia.mjs --audio frase.wav [--n 5] [--url http://localhost:3000]
 *
 * El token se lee de .env.local y no se imprime.
 */
import { readFileSync } from 'node:fs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const URL_BASE = arg('url', 'http://localhost:3000');
const N = Number(arg('n', 5));
const audio = readFileSync(arg('audio'));
const token = /^DICTADO_MOVIL_TOKEN=(.+)$/m.exec(readFileSync('.env.local', 'utf8'))?.[1]?.trim();
if (!token) throw new Error('falta DICTADO_MOVIL_TOKEN');

const percentil = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
async function mide(nombre, ruta, cabeceras) {
  const tiempos = [];
  let ultimo = {};
  for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    const r = await fetch(`${URL_BASE}${ruta}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'audio/wav', ...cabeceras }, body: audio });
    ultimo = await r.json();
    if (!r.ok) throw new Error(`${nombre}: ${r.status} ${ultimo.error ?? ''}`);
    tiempos.push(Math.round(performance.now() - t0));
  }
  return { ruta: nombre, n: N, p50: percentil(tiempos, 0.5), p95: percentil(tiempos, 0.95), msServidor: ultimo.ms, msMotor: ultimo.msMotor, motor: ultimo.motor, via: ultimo.via, texto: String(ultimo.texto ?? '').slice(0, 60) };
}
const estado = await fetch(`${URL_BASE}/api/laboratorio/estado`).then((r) => r.json()).catch(() => ({}));
const filas = [
  await mide('/api/dictado/movil (pantalla)', '/api/dictado/movil', { 'x-destino': 'pantalla' }),
  await mide('/api/laboratorio/transcribir (rapido)', '/api/laboratorio/transcribir', { 'x-modo': 'rapido' }),
];
console.log(JSON.stringify({ demonio: estado.demonio ?? 'no reportado', segundosAudio: filas[1].msMotor === undefined ? undefined : undefined, filas }, null, 1));
