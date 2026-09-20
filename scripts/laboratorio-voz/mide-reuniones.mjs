#!/usr/bin/env node
/**
 * Reuniones de ventas medibles: cada reunion del corpus (`<r>.wav` + `<r>.verdad.json`) pasa por
 * `dictado lote --hablantes 2` y por el cerebro de asesoria; se mide contra la verdad de terreno:
 *   - turnos etiquetados bien: fraccion del tiempo de habla detectado cuyo hablante coincide
 *     (con la mejor correspondencia Hablante 1/2 ↔ Asesor/Cliente);
 *   - WER del texto completo, en orden temporal;
 *   - proceso / duracion del audio;
 *   - puntaje del asesor y huecos, para el veredicto humano.
 *
 *   node scripts/laboratorio-voz/mide-reuniones.mjs [--carpeta tools/dictado/medicion/corpus-propio/reuniones]
 */
import { execFile } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { parseaActa } from '../../src/features/laboratorio-voz/services/acta.ts';
import { analizaTurnos } from '../../src/features/laboratorio-voz/services/asesor.ts';
import { wer } from '../../tools/dictado/dist/index.js';

const ejecuta = promisify(execFile);
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const carpeta = resolve(arg('carpeta', 'tools/dictado/medicion/corpus-propio/reuniones'));
const raizDictado = resolve('tools/dictado');
const banco = join(raizDictado, 'medicion', 'banco');
const env = { ...process.env, DICTADO_MODELOS: process.env.DICTADO_MODELOS ?? join(banco, 'modelos'), DICTADO_RUNTIME: process.env.DICTADO_RUNTIME ?? banco, DICTADO_DATOS: process.env.DICTADO_DATOS ?? join(banco, 'datos') };
// `--motor remoto`: el demonio local como motor (127.0.0.1:47125, token del celular). Sin el, el lote arranca el motor por proceso.
const motor = arg('motor', 'parakeet');
if (motor === 'remoto') {
  const token = /^DICTADO_MOVIL_TOKEN=(.+)$/m.exec(readFileSync('.env.local', 'utf8'))?.[1]?.trim() ?? '';
  Object.assign(env, { DICTADO_REMOTO_URL: `http://127.0.0.1:${process.env.DICTADO_DEMONIO_PUERTO ?? 47125}`, DICTADO_REMOTO_TOKEN: token });
}

const solape = (a, b) => Math.max(0, Math.min(a.finMs, b.finMs) - Math.max(a.inicioMs, b.inicioMs));
function etiquetadoCorrecto(detectados, verdad) {
  const nombres = [...new Set(detectados.map((t) => t.hablante))];
  const lados = ['Asesor', 'Cliente'];
  let mejor = 0;
  const asignaciones = nombres.length === 2 ? [[nombres[0], nombres[1]], [nombres[1], nombres[0]]] : [[nombres[0] ?? '?', nombres[1] ?? '?']];
  for (const [h1, h2] of asignaciones) {
    const mapa = { [h1]: lados[0], [h2]: lados[1] };
    let bien = 0, total = 0;
    for (const t of detectados) {
      for (const v of verdad) {
        const s = solape(t, v);
        if (s <= 0) continue;
        total += s;
        if (mapa[t.hablante] === v.hablante) bien += s;
      }
    }
    mejor = Math.max(mejor, total > 0 ? bien / total : 0);
  }
  return mejor;
}

const reuniones = readdirSync(carpeta).filter((n) => n.endsWith('.verdad.json')).map((n) => n.replace('.verdad.json', ''));
const filas = [];
for (const r of reuniones) {
  const verdad = JSON.parse(readFileSync(join(carpeta, `${r}.verdad.json`), 'utf8'));
  const t0 = performance.now();
  const { stdout } = await ejecuta(process.execPath, [join(raizDictado, 'dist', 'node', 'cli.js'), 'lote', join(carpeta, `${r}.wav`), '--hablantes', String(verdad.hablantes), '--motor', motor, '--silencio-ms', '500'], { env, cwd: raizDictado, timeout: 600_000, maxBuffer: 32 * 1024 * 1024 });
  const ms = Math.round(performance.now() - t0);
  const segmentos = parseaActa(stdout);
  const correcto = etiquetadoCorrecto(segmentos, verdad.turnos);
  const w = wer(verdad.turnos.map((t) => t.texto).join(' '), segmentos.map((s) => s.texto).join(' '));
  const nombres = [...new Set(segmentos.map((s) => s.hablante))];
  // el hablante con mas tiempo en turnos del asesor de la verdad es el asesor
  const tiempoComoAsesor = Object.fromEntries(nombres.map((n) => [n, segmentos.filter((s) => s.hablante === n).reduce((acc, s) => acc + verdad.turnos.filter((v) => v.hablante === 'Asesor').reduce((a2, v) => a2 + solape(s, v), 0), 0)]));
  const asesor = nombres.sort((a, b) => tiempoComoAsesor[b] - tiempoComoAsesor[a])[0];
  const lados = Object.fromEntries(nombres.map((n) => [n, n === asesor ? 'interno' : 'cliente']));
  const tipo = r.includes('demo') ? 'demo' : r.includes('negociacion') ? 'negociacion' : 'discovery';
  const analisis = analizaTurnos(segmentos, lados, tipo);
  filas.push({ reunion: r, tipo, duracionS: +(verdad.duracionMs / 1000).toFixed(1), turnosDetectados: segmentos.length, turnosVerdad: verdad.turnos.length, hablantesDetectados: nombres.length, etiquetadoCorrecto: +correcto.toFixed(3), wer: +w.wer.toFixed(3), procesoMs: ms, procesoSobreDuracion: +(ms / verdad.duracionMs).toFixed(2), score: analisis.score.total, huecos: analisis.score.huecos.map((h) => h.dimension), insights: analisis.insights.length, riesgos: analisis.riesgos.map((x) => x.tipo), acciones: analisis.acciones.length });
  console.log(`${r}: turnos ${segmentos.length}/${verdad.turnos.length} · hablantes ${nombres.length} · etiquetado ${(correcto * 100).toFixed(0)} % · WER ${(w.wer * 100).toFixed(1)} % · proceso ${(ms / 1000).toFixed(1)} s (${(ms / verdad.duracionMs).toFixed(2)}×) · score ${analisis.score.total} · huecos ${analisis.score.huecos.map((h) => h.dimension).join(',') || '-'}`);
}
const fecha = new Date().toISOString().slice(0, 10);
writeFileSync(join(carpeta, `medicion-${fecha}${motor === 'remoto' ? '-demonio' : ''}.json`), JSON.stringify({ fecha, motor, umbrales: { etiquetado: 0.9, wer: 0.1, procesoSobreDuracion: 0.15 }, filas }, null, 1));
const md = ['# Reuniones simuladas — medición ' + fecha, '', '| reunión | tipo | dur. | turnos (det/verdad) | hablantes | etiquetado | WER | proceso | score | huecos |', '|---|---|---|---|---|---|---|---|---|---|', ...filas.map((f) => `| ${f.reunion} | ${f.tipo} | ${f.duracionS} s | ${f.turnosDetectados}/${f.turnosVerdad} | ${f.hablantesDetectados} | ${(f.etiquetadoCorrecto * 100).toFixed(0)} % | ${(f.wer * 100).toFixed(1)} % | ${(f.procesoMs / 1000).toFixed(1)} s (${f.procesoSobreDuracion}×) | ${f.score} | ${f.huecos.join(', ') || '—'} |`), '', 'Umbrales del piloto: etiquetado ≥ 90 % · WER < 10 % · proceso < 0,15× la duración · score dentro de ±10 del veredicto humano (pendiente).', ''].join('\n');
writeFileSync(join(carpeta, `medicion-${fecha}${motor === 'remoto' ? '-demonio' : ''}.md`), md.replace('# Reuniones simuladas — medición', `# Reuniones simuladas (motor ${motor}) — medición`));
console.log(`escrito ${join(carpeta, `medicion-${fecha}${motor === 'remoto' ? '-demonio' : ''}.md`)}`);
