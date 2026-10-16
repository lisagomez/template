/** Cuánto tarda la ruta de transcripción del HUD (dos pasadas en paralelo para lo corto) con frases cortas reales. */
import { aPcm16, percentil } from '../../tools/bucle-voz/dist/index.js';
import { dice, tokenDictado } from './voz-sintetica.ts';
const token = tokenDictado();
const frases = ['¿Qué hora es?', '¿Qué tengo hoy?', 'Más despacio.', 'Repite.', 'Para.', '¿Qué día es hoy?'];
const ms: number[] = [];
for (let r = 0; r < 3; r++) for (const f of frases) {
  const d = await dice(f, r % 2 ? 'es_ES-davefx-medium' : 'es_MX-claude-high', token);
  const t0 = performance.now();
  const res = await fetch(`${process.argv[2] ?? 'http://localhost:3011'}/api/centro-de-mando/transcribir`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream', 'x-frecuencia-hz': '16000' }, body: aPcm16(d.muestras).buffer });
  await res.json();
  ms.push(performance.now() - t0);
}
console.log(`transcripción de ${ms.length} órdenes cortas: p50 ${Math.round(percentil(ms, 50) ?? 0)} ms · p95 ${Math.round(percentil(ms, 95) ?? 0)} ms`);
