/** Distancias coseno entre turnos (WeSpeaker) del caso de dos hablantes y del limpio: para fijar el umbral con datos. */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { audio, turnosDePalabras } from '../../tools/reel/dist/node/index.js';
import { distanciaCoseno } from '../../tools/voz/dist/index.js';
import { creaModeloHablante } from '../../tools/voz/dist/node/index.js';
import { motores } from './motores.ts';

const m = motores();
const modelo = await creaModeloHablante({ ort: m.ort as never, modelo: m.hablante });
for (const caso of ['limpio', 'dos-hablantes']) {
  const c = join(homedir(), '.reel', 'laboratorio', caso);
  const tr = JSON.parse(readFileSync(join(c, 'transcripcion.json'), 'utf8'));
  const voz = await audio(join(c, 'normalizado.mov'));
  const turnos = turnosDePalabras(tr.palabras, voz, 16_000).filter((t) => t.finMs - t.inicioMs >= 700);
  const vs = await Promise.all(turnos.map((t) => modelo.vector(t.audio!)));
  const d: number[] = [];
  for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) d.push(Number(distanciaCoseno(vs[i]!, vs[j]!).toFixed(3)));
  console.log(caso, 'turnos', turnos.map((t) => `${(t.inicioMs / 1000).toFixed(1)}-${(t.finMs / 1000).toFixed(1)}`).join(' '));
  console.log('  distancias: máx', Math.max(...d), '· por turno contra los demás (media):', vs.map((_, i) => (vs.map((w, j) => (i === j ? null : distanciaCoseno(vs[i]!, w))).filter((x): x is number => x !== null).reduce((s, x, _, a) => s + x / a.length, 0)).toFixed(2)).join(' '));
}
