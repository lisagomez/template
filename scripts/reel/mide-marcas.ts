/**
 * Error de las marcas por palabra (propuesta §10.1: «no están medidas»). Se sintetiza CADA palabra por
 * separado y se pegan con huecos conocidos: el inicio real de cada palabra se sabe al milisegundo.
 * Luego Parakeet transcribe el conjunto y se compara el inicio que da contra el real.
 */
import { writeFileSync } from 'node:fs';
import { creaTranscriptorParakeet } from '../../tools/reel/dist/node/index.js';
import { motores, voz } from './motores.ts';

const FRASE = 'hoy sacamos el pan de muerto recién horneado con azúcar y ajonjolí para toda la familia de la colonia';
const habla = voz('claude-high');
const HZ = 16_000;
const remuestrea = (m: Float32Array, de: number): Float32Array => { const r = de / HZ; return Float32Array.from({ length: Math.floor(m.length / r) }, (_, i) => m[Math.floor(i * r)] ?? 0); };
/** Recorta el silencio de los extremos de la palabra sintetizada (umbral de energía). */
const recorta = (m: Float32Array): Float32Array => { let a = 0, b = m.length - 1; while (a < b && Math.abs(m[a] ?? 0) < 0.01) a++; while (b > a && Math.abs(m[b] ?? 0) < 0.01) b--; return m.slice(a, b + 1); };

const trozos: Float32Array[] = []; const reales: Array<{ texto: string; inicio: number }> = [];
let t = 0.3;
trozos.push(new Float32Array(Math.round(0.3 * HZ)));
for (const p of FRASE.split(' ')) {
  const g = habla(p, 1); const m = recorta(remuestrea(g.samples, g.sampleRate));
  reales.push({ texto: p, inicio: t }); trozos.push(m); t += m.length / HZ;
  const hueco = 0.12 + (reales.length % 3) * 0.06; trozos.push(new Float32Array(Math.round(hueco * HZ))); t += hueco;
}
const total = new Float32Array(trozos.reduce((s, x) => s + x.length, 0)); let o = 0; for (const x of trozos) { total.set(x, o); o += x.length; }
const tr = await creaTranscriptorParakeet({ sherpa: motores().sherpa, carpeta: motores().parakeet }).transcribe(total, HZ);
const norma = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-zñ]/g, '');
const errores: number[] = []; let j = 0;
for (const r of reales) {
  const k = tr.palabras.findIndex((p, i) => i >= j && norma(p.texto) === norma(r.texto));
  if (k < 0) continue;
  errores.push(Math.round((tr.palabras[k]!.inicio - r.inicio) * 1000)); j = k + 1;
}
const abs = errores.map(Math.abs).sort((a, b) => a - b);
const q = (p: number) => abs[Math.min(abs.length - 1, Math.floor(p * abs.length))] ?? null;
const r = { palabras: reales.length, emparejadas: errores.length, sesgoMs: Math.round(errores.reduce((s, e) => s + e, 0) / Math.max(1, errores.length)), medianaAbsMs: q(0.5), p90AbsMs: q(0.9), maxAbsMs: abs[abs.length - 1] ?? null, resolucionMs: 80, texto: tr.texto };
writeFileSync(process.argv[2] ?? '/dev/stdout', JSON.stringify(r, null, 1));
console.log(JSON.stringify(r));
