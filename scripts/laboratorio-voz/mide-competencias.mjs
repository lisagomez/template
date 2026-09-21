#!/usr/bin/env node
/**
 * Muletillas contra verdad de terreno (Etapa 3, mejora 3.4): cada guion de
 * `tools/dictado/medicion/corpus-propio/muletillas/` (muletillas escritas en conteo conocido, leido por
 * dos voces Piper, pausas largas de 1,8 s en posiciones conocidas) pasa por `dictado lote
 * --hablantes 1` con cada motor, y se compara lo que el motor conserva:
 *   - recall y precision por muletilla (tp = min(verdad, obtenido));
 *   - pausas largas detectadas vs. las insertadas;
 *   - palabras por minuto medidas vs. las del guion;
 *   - WER del texto.
 * Regla de decision, escrita antes de medir: un motor «conserva» muletillas si recall ≥ 80 % y
 * precision ≥ 90 % sumando los guiones con muletillas. Solo esos motores pueden mostrar la cifra;
 * con ninguno, el panel dice «no medible».
 *
 *   node scripts/laboratorio-voz/mide-competencias.mjs [--motores remoto,faster-whisper:small]
 *
 * `remoto` = el demonio (Parakeet). `faster-whisper:small` usa el venv del banco. Sin otra carga.
 */
import { execFile } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { parseaActa } from '../../src/features/laboratorio-voz/services/acta.ts';
import { cuentaMuletillas, evaluaCompetencias, pausasEntre } from '../../src/features/laboratorio-voz/services/competencias.ts';
import { wer } from '../../tools/dictado/dist/index.js';

const ejecuta = promisify(execFile);
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const MOTORES = arg('motores', 'remoto,faster-whisper:small').split(',');
const carpeta = resolve('tools/dictado/medicion/corpus-propio/muletillas');
const raizDictado = resolve('tools/dictado');
const banco = join(raizDictado, 'medicion', 'banco');
const token = /^DICTADO_MOVIL_TOKEN=(.+)$/m.exec(readFileSync('.env.local', 'utf8'))?.[1]?.trim() ?? '';
const env = { ...process.env, DICTADO_MODELOS: process.env.DICTADO_MODELOS ?? join(banco, 'modelos'), DICTADO_RUNTIME: process.env.DICTADO_RUNTIME ?? banco, DICTADO_DATOS: process.env.DICTADO_DATOS ?? join(banco, 'datos'), DICTADO_PYTHON: process.env.DICTADO_PYTHON ?? join(banco, 'venv', 'bin', 'python'), DICTADO_REMOTO_URL: `http://127.0.0.1:${process.env.DICTADO_DEMONIO_PUERTO ?? 47125}`, DICTADO_REMOTO_TOKEN: token };
console.log(`token: ${token ? `presente (largo ${token.length})` : 'ausente'}`);

const guiones = readdirSync(carpeta).filter((n) => n.endsWith('.verdad.json')).map((n) => n.replace('.verdad.json', '')).sort();
if (guiones.length === 0) throw new Error('primero: node tools/dictado/medicion/fabrica-corpus.mjs --muletillas');
const aMapa = (lista) => Object.fromEntries(lista.map((m) => [m.palabra, m.veces]));
const filas = [];
for (const motor of MOTORES) {
  for (const g of guiones) {
    const verdad = JSON.parse(readFileSync(join(carpeta, `${g}.verdad.json`), 'utf8'));
    const t0 = performance.now();
    const { stdout } = await ejecuta(process.execPath, [join(raizDictado, 'dist', 'node', 'cli.js'), 'lote', join(carpeta, `${g}.wav`), '--hablantes', '1', '--motor', motor, '--silencio-ms', '500'], { env, cwd: raizDictado, timeout: 900_000, maxBuffer: 32 * 1024 * 1024 });
    const ms = Math.round(performance.now() - t0);
    const segmentos = parseaActa(stdout);
    const texto = segmentos.map((s) => s.texto).join(' ');
    const esperadas = aMapa(cuentaMuletillas(verdad.texto));
    const obtenidas = aMapa(cuentaMuletillas(texto));
    const palabras = [...new Set([...Object.keys(esperadas), ...Object.keys(obtenidas)])];
    const porMuletilla = palabras.map((p) => { const e = esperadas[p] ?? 0, o = obtenidas[p] ?? 0; return { palabra: p, esperadas: e, obtenidas: o, tp: Math.min(e, o), fn: Math.max(0, e - o), fp: Math.max(0, o - e) }; });
    const tp = porMuletilla.reduce((s, x) => s + x.tp, 0), fn = porMuletilla.reduce((s, x) => s + x.fn, 0), fp = porMuletilla.reduce((s, x) => s + x.fp, 0);
    const pausas = pausasEntre(segmentos);
    const pausasBien = verdad.pausasLargas.filter((v) => pausas.some((p) => Math.abs(p.inicioMs - v.inicioMs) < 600)).length;
    const c = evaluaCompetencias(segmentos, verdad.duracionMs, motor);
    const ppmVerdad = Math.round(verdad.palabras / ((verdad.duracionMs - verdad.pausasLargas.length * 1800 - 500) / 60000));
    const w = wer(verdad.texto, texto);
    filas.push({ motor, guion: g, voz: verdad.voz, duracionS: +(verdad.duracionMs / 1000).toFixed(1), tp, fn, fp, esperadas: tp + fn, obtenidas: tp + fp, recall: tp + fn > 0 ? +(tp / (tp + fn)).toFixed(3) : null, precision: tp + fp > 0 ? +(tp / (tp + fp)).toFixed(3) : null, porMuletilla, pausasVerdad: verdad.pausasLargas.length, pausasDetectadas: pausas.length, pausasBien, ppm: c.palabrasPorMinuto, ppmVerdad, wer: +w.wer.toFixed(3), procesoMs: ms, texto });
    console.log(`${motor} · ${g}: muletillas ${tp}/${tp + fn} conservadas, ${fp} inventadas · pausas ${pausasBien}/${verdad.pausasLargas.length} · ppm ${c.palabrasPorMinuto} (guion ${ppmVerdad}) · WER ${(w.wer * 100).toFixed(1)} % · ${(ms / 1000).toFixed(1)} s`);
  }
}
// decision por motor sobre los guiones CON muletillas (el control mide solo falsos positivos)
const decision = {};
for (const motor of MOTORES) {
  const de = filas.filter((f) => f.motor === motor);
  const conM = de.filter((f) => !f.guion.startsWith('g1-'));
  const tp = conM.reduce((s, f) => s + f.tp, 0), fn = conM.reduce((s, f) => s + f.fn, 0), fp = de.reduce((s, f) => s + f.fp, 0);
  const recall = tp / Math.max(1, tp + fn), precision = tp / Math.max(1, tp + fp);
  decision[motor] = { recall: +recall.toFixed(3), precision: +precision.toFixed(3), conserva: recall >= 0.8 && precision >= 0.9, pausas: `${de.reduce((s, f) => s + f.pausasBien, 0)}/${de.reduce((s, f) => s + f.pausasVerdad, 0)}`, werMedio: +(de.reduce((s, f) => s + f.wer, 0) / de.length).toFixed(3), procesoSobreDuracion: +(de.reduce((s, f) => s + f.procesoMs, 0) / de.reduce((s, f) => s + f.duracionS * 1000, 0)).toFixed(2) };
  console.log(`DECISION ${motor}: recall ${(recall * 100).toFixed(0)} % · precision ${(precision * 100).toFixed(0)} % → ${decision[motor].conserva ? 'CONSERVA las muletillas: puede mostrarlas' : 'NO las conserva: «no medible» con este motor'}`);
}
const fecha = new Date().toISOString().slice(0, 10);
writeFileSync(join(carpeta, `medicion-${fecha}.json`), JSON.stringify({ fecha, motores: MOTORES, regla: 'recall ≥ 0,80 y precisión ≥ 0,90 sobre los guiones con muletillas (g2–g6); el control g1 solo aporta falsos positivos', decision, filas }, null, 1));
const md = [`# Muletillas contra verdad de terreno — medición ${fecha}`, '', 'Seis guiones (uno de control sin muletillas) leídos por dos voces Piper, con muletillas escritas en conteo conocido y pausas de 1,8 s en posiciones conocidas. Piper pronuncia todas las muletillas: lo que se mide es si el MOTOR las conserva al transcribir. Sintético: una persona titubea distinto a una voz que lee «eh» como palabra.', '', '## Decisión por motor', '', '| motor | recall | precisión | pausas largas detectadas | WER medio | proceso / duración | decisión |', '|---|---|---|---|---|---|---|', ...MOTORES.map((m) => `| ${m} | ${(decision[m].recall * 100).toFixed(0)} % | ${(decision[m].precision * 100).toFixed(0)} % | ${decision[m].pausas} | ${(decision[m].werMedio * 100).toFixed(1)} % | ${decision[m].procesoSobreDuracion}× | ${decision[m].conserva ? '**conserva**: se muestra la cifra' : 'no conserva: «no medible»'} |`), '', 'Regla escrita antes de medir: recall ≥ 80 % y precisión ≥ 90 % sobre los guiones con muletillas. Si ningún motor la cumple, el panel dice «no medible» y no inventa una cifra.', '', '## Por guion y voz', '', '| motor | guion | voz | conservadas | inventadas | pausas | ppm (guion) | WER |', '|---|---|---|---|---|---|---|---|', ...filas.map((f) => `| ${f.motor} | ${f.guion} | ${f.voz.split('-')[0]} | ${f.tp}/${f.esperadas} | ${f.fp} | ${f.pausasBien}/${f.pausasVerdad} | ${f.ppm} (${f.ppmVerdad}) | ${(f.wer * 100).toFixed(1)} % |`), '', '## Por muletilla (todos los guiones)', ''];
for (const m of MOTORES) {
  const suma = {};
  for (const f of filas.filter((x) => x.motor === m)) for (const p of f.porMuletilla) { suma[p.palabra] = suma[p.palabra] ?? { e: 0, o: 0, tp: 0 }; suma[p.palabra].e += p.esperadas; suma[p.palabra].o += p.obtenidas; suma[p.palabra].tp += p.tp; }
  md.push(`### ${m}`, '', '| muletilla | esperadas | obtenidas | conservadas |', '|---|---|---|---|', ...Object.entries(suma).sort((a, b) => b[1].e - a[1].e).map(([p, v]) => `| ${p} | ${v.e} | ${v.o} | ${v.tp} |`), '');
}
md.push('Nota: «no?» cuenta cualquier «no», también la negación: en los guiones aparece como palabra normal y entra igual en los dos lados, así que mide conservación y no muletilla real.', '');
writeFileSync(join(carpeta, `medicion-${fecha}.md`), md.join('\n'));
console.log(`escrito ${join(carpeta, `medicion-${fecha}.md`)}`);
