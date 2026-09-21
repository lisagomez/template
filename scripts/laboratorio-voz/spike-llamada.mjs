#!/usr/bin/env node
/**
 * Spike de llamada a dos canales con AUDIO PROPIO (Etapa 3, mejora 3.1): nada se conecta a una
 * llamada real. Las lineas de `r1-discovery` (dos voces Piper) se montan en dos pistas —asesor
 * y cliente— con los silencios de la verdad, con un sangrado opcional de un canal en el otro
 * (como un altavoz que se cuela en el microfono). Cada pista pasa por su propio Silero
 * (`creaDetectorPorCanal`) en bloques de 320 ms; cada fin de turno va al demonio a transcribir y
 * el asesor de ventas analiza los turnos acumulados. Se mide:
 *   - etiquetado (el canal ya dice quien habla: deberia ser 100 %),
 *   - turnos abiertos en el canal equivocado (por el sangrado),
 *   - WER del texto completo,
 *   - latencia fin de turno → insight: transcribir + analizar, sin contar el cierre del VAD (500 ms).
 *
 *   node scripts/laboratorio-voz/spike-llamada.mjs [--reunion r1-discovery] [--sangrado-db -20] [--sin-dominancia]
 *
 * Hallazgo del 2026-09-20: con sangrado de -20 dB, Silero abre en el canal ajeno un turno espejo de
 * cada frase (24 turnos por 12 reales, WER 100 %). Un VAD por canal no basta si el audio se cuela:
 * hace falta la regla de DOMINANCIA, que aqui se aplica al cerrar cada turno: si durante su tramo el
 * otro canal sono ≥ 6 dB mas fuerte en mas del 60 % de los bloques, el turno es sangrado y se
 * descarta. `--sin-dominancia` mide sin la regla (el hallazgo), para que se vea la diferencia.
 *
 * Exige el demonio vivo. Es un spike: mide lo que la maquina puede hacer con dos canales limpios;
 * capturar una llamada real exige el ayudante de Windows y las tres firmas de `propuestas/`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analizaTurnos } from '../../src/features/laboratorio-voz/services/asesor.ts';
import { wer } from '../../tools/dictado/dist/index.js';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const REUNION = arg('reunion', 'r1-discovery');
const SANGRADO_DB = Number(arg('sangrado-db', '-20'));
const CON_DOMINANCIA = !process.argv.includes('--sin-dominancia');
const DOMINANCIA_DB = 6;
const DOMINANCIA_FRACCION = 0.6;
const raizDictado = resolve('tools/dictado');
const banco = join(raizDictado, 'medicion', 'banco');
const carpeta = join(raizDictado, 'medicion', 'corpus-propio', 'reuniones');
const DEMONIO = `http://127.0.0.1:${process.env.DICTADO_DEMONIO_PUERTO ?? 47125}`;
const token = /^DICTADO_MOVIL_TOKEN=(.+)$/m.exec(readFileSync('.env.local', 'utf8'))?.[1]?.trim() ?? '';
console.log(`token: ${token ? `presente (largo ${token.length})` : 'ausente'} · sangrado ${SANGRADO_DB} dB`);
if (!(await fetch(`${DEMONIO}/health`).then((r) => r.ok).catch(() => false))) throw new Error('el demonio no responde: npm run demonio en tools/dictado');

const voz = await import(pathToFileURL(join(raizDictado, 'node_modules', '@tu-scope', 'voz', 'dist', 'index.js')).href);
const vozNodo = await import(pathToFileURL(join(raizDictado, 'node_modules', '@tu-scope', 'voz', 'dist', 'node', 'index.js')).href);
const dictadoNodo = await import(pathToFileURL(join(raizDictado, 'dist', 'node', 'index.js')).href);
const ort = createRequire(pathToFileURL(join(banco, 'x.js')))('onnxruntime-node');

// Dos pistas con la verdad: cada linea en su canal y silencio en el otro; luego el sangrado.
const verdad = JSON.parse(readFileSync(join(carpeta, `${REUNION}.verdad.json`), 'utf8'));
const tmp = join(tmpdir(), `spike-${Date.now()}`);
execFileSync('mkdir', ['-p', tmp]);
const pista = (lado) => {
  const salida = join(tmp, `${lado}.wav`);
  const lineas = verdad.turnos.map((t, i) => ({ ...t, archivo: join(carpeta, `${REUNION}-${String(i + 1).padStart(2, '0')}.wav`) })).filter((t) => t.hablante === lado);
  const fc = lineas.map((t, i) => `[${i + 1}:a]aformat=sample_rates=16000:channel_layouts=mono,adelay=${t.inicioMs}|${t.inicioMs}[d${i}];`).join('') + `[0:a]${lineas.map((_, i) => `[d${i}]`).join('')}amix=inputs=${lineas.length + 1}:duration=first:normalize=0[out]`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `aevalsrc=0:d=${(verdad.duracionMs / 1000).toFixed(2)}:s=16000`, ...lineas.flatMap((t) => ['-i', t.archivo]), '-filter_complex', fc, '-map', '[out]', salida]);
  return salida;
};
const limpias = { Asesor: pista('Asesor'), Cliente: pista('Cliente') };
const conSangrado = (propio, ajeno) => {
  const salida = join(tmp, `mezcla-${propio.split('/').pop()}`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', propio, '-i', ajeno, '-filter_complex', `[1:a]volume=${SANGRADO_DB}dB[b];[0:a][b]amix=inputs=2:duration=first:normalize=0[out]`, '-map', '[out]', salida]);
  return salida;
};
const canales = { asesor: await dictadoNodo.leeAudio(conSangrado(limpias.Asesor, limpias.Cliente)), cliente: await dictadoNodo.leeAudio(conSangrado(limpias.Cliente, limpias.Asesor)) };

const modelos = [await vozNodo.creaModeloSilero({ ort, modelo: join(banco, 'modelos', 'silero_vad.onnx') }), await vozNodo.creaModeloSilero({ ort, modelo: join(banco, 'modelos', 'silero_vad.onnx') })];
const detector = voz.creaDetectorPorCanal({ etiquetas: ['asesor', 'cliente'], modelos, msSilencioParaCerrar: 500, msMinimoHabla: 200, msRelleno: 250, conservaAudio: true });

async function transcribe(muestras) {
  const pcm = dictadoNodo.floatAPcm16(muestras);
  const r = await fetch(`${DEMONIO}/transcribir`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream', 'x-frecuencia-hz': '16000', 'x-idioma': 'es' }, body: new Uint8Array(pcm) });
  const j = await r.json();
  if (!r.ok) throw new Error(`transcribir ${r.status} ${j.error ?? ''}`);
  return j;
}

const BLOQUE = Math.round(16000 * 0.32);
const segmentos = [];
const latencias = [];
let insightsVistos = 0;
let descartadosPorSangrado = 0;
/** Nivel por bloque y canal, para la regla de dominancia. */
const nivelPorBloque = { asesor: [], cliente: [] };
const dbDe = (m) => { let s = 0; for (let i = 0; i < m.length; i++) s += m[i] * m[i]; return 20 * Math.log10(Math.sqrt(s / Math.max(1, m.length)) + 1e-9); };
const esSangrado = (canal, turno) => {
  if (!CON_DOMINANCIA) return false;
  const otro = canal === 'asesor' ? 'cliente' : 'asesor';
  const desde = Math.floor((turno.inicioMs / 1000) * 16000 / BLOQUE), hasta = Math.ceil((turno.finMs / 1000) * 16000 / BLOQUE);
  let dominados = 0, n = 0;
  for (let b = desde; b < hasta; b++) {
    const propio = nivelPorBloque[canal][b], ajeno = nivelPorBloque[otro][b];
    if (propio === undefined || ajeno === undefined) continue;
    n++;
    if (ajeno > propio + DOMINANCIA_DB) dominados++;
  }
  return n > 0 && dominados / n > DOMINANCIA_FRACCION;
};
const total = Math.max(canales.asesor.muestras.length, canales.cliente.muestras.length);
const t0 = performance.now();
for (let pos = 0; pos < total; pos += BLOQUE) {
  const bloques = [canales.asesor.muestras.subarray(pos, pos + BLOQUE), canales.cliente.muestras.subarray(pos, pos + BLOQUE)];
  if (bloques[0].length !== bloques[1].length) break;
  nivelPorBloque.asesor.push(dbDe(bloques[0]));
  nivelPorBloque.cliente.push(dbDe(bloques[1]));
  for (const { canal, evento } of await detector.procesa(bloques)) {
    if (evento.tipo !== 'finHabla') continue;
    if (esSangrado(canal, evento.turno)) { descartadosPorSangrado++; continue; }
    const tFin = performance.now();
    const r = await transcribe(evento.turno.audio);
    const seg = { inicioMs: Math.round(evento.turno.inicioMs), finMs: Math.round(evento.turno.finMs), hablante: canal, texto: (r.texto ?? '').trim() };
    segmentos.push(seg);
    const tA = performance.now();
    const analisis = analizaTurnos(segmentos, { asesor: 'interno', cliente: 'cliente' }, 'discovery');
    const msAnalisis = performance.now() - tA;
    latencias.push({ turno: segmentos.length, canal, msTranscripcion: Math.round(tA - tFin), msAnalisis: Math.round(msAnalisis), msTotal: Math.round(performance.now() - tFin), insights: analisis.insights.length, nuevos: analisis.insights.length - insightsVistos, duracionTurnoMs: seg.finMs - seg.inicioMs });
    insightsVistos = analisis.insights.length;
  }
}
for (const { canal, evento } of await detector.cierra()) if (evento.tipo === 'finHabla' && !esSangrado(canal, evento.turno)) segmentos.push({ inicioMs: Math.round(evento.turno.inicioMs), finMs: Math.round(evento.turno.finMs), hablante: canal, texto: (await transcribe(evento.turno.audio)).texto ?? '' });
const msProceso = Math.round(performance.now() - t0);

// Metricas contra la verdad
const solape = (a, b) => Math.max(0, Math.min(a.finMs, b.finMs) - Math.max(a.inicioMs, b.inicioMs));
const lado = { asesor: 'Asesor', cliente: 'Cliente' };
let bien = 0, totalSolape = 0, equivocados = 0;
for (const s of segmentos) {
  let mejor = null;
  for (const v of verdad.turnos) { const x = solape(s, v); totalSolape += x; if (lado[s.hablante] === v.hablante) bien += x; if (!mejor || x > mejor.x) mejor = { v, x }; }
  if (mejor && mejor.x > 0 && lado[s.hablante] !== mejor.v.hablante) equivocados++;
  if (!mejor || mejor.x === 0) equivocados++; // turno fantasma (sangrado) sin voz real en ese canal
}
const etiquetado = totalSolape > 0 ? bien / totalSolape : 0;
const texto = [...segmentos].sort((a, b) => a.inicioMs - b.inicioMs).map((s) => s.texto).join(' ');
const w = wer(verdad.turnos.map((t) => t.texto).join(' '), texto);
const percentil = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? null; };
const p50 = percentil(latencias.map((l) => l.msTotal), 0.5), p95 = percentil(latencias.map((l) => l.msTotal), 0.95);
const analisisFinal = analizaTurnos(segmentos, { asesor: 'interno', cliente: 'cliente' }, 'discovery');
const resultado = { fecha: new Date().toISOString().slice(0, 10), reunion: REUNION, sangradoDb: SANGRADO_DB, dominancia: CON_DOMINANCIA, descartadosPorSangrado, duracionS: +(verdad.duracionMs / 1000).toFixed(1), turnosVerdad: verdad.turnos.length, turnosDetectados: segmentos.length, etiquetado: +etiquetado.toFixed(3), turnosCanalEquivocado: equivocados, wer: +w.wer.toFixed(3), insightP50Ms: p50, insightP95Ms: p95, cierreVadMs: 500, procesoMs: msProceso, procesoSobreDuracion: +(msProceso / verdad.duracionMs).toFixed(2), score: analisisFinal.score.total, insights: analisisFinal.insights.length, huecos: analisisFinal.score.huecos.map((h) => h.dimension), latencias, segmentos };
const salida = join(carpeta, `spike-llamada-${resultado.fecha}${CON_DOMINANCIA ? '' : '-sin-dominancia'}`);
writeFileSync(`${salida}.json`, JSON.stringify(resultado, null, 1));
writeFileSync(`${salida}.md`, [`# Spike de llamada a dos canales — ${resultado.fecha}`, '', `Reunión \`${REUNION}\` (${resultado.duracionS} s, ${verdad.turnos.length} turnos, dos voces Piper) montada en dos pistas con sangrado de ${SANGRADO_DB} dB del otro canal. Un Silero por canal, bloques de 320 ms, cada fin de turno al demonio y el asesor sobre lo acumulado. **Audio propio: nada se conectó a una llamada real.**`, '', '| métrica | valor | umbral |', '|---|---|---|', `| etiquetado correcto | ${(etiquetado * 100).toFixed(0)} % | 100 % |`, `| turnos en el canal equivocado (o fantasmas por sangrado) | ${equivocados} | 0 |`, `| WER | ${(w.wer * 100).toFixed(1)} % | < 10 % |`, `| fin de turno → insight (transcribir + analizar) p50 / p95 | ${p50} / ${p95} ms | p50 < 1 500 ms |`, `| más el cierre del VAD | +500 ms | fijo |`, `| turnos detectados / verdad | ${segmentos.length} / ${verdad.turnos.length} | |`, `| turnos descartados por sangrado (regla de dominancia ${CON_DOMINANCIA ? 'activa' : 'APAGADA'}) | ${descartadosPorSangrado} | |`, `| proceso / duración | ${resultado.procesoSobreDuracion}× | |`, `| score del asesor · insights · huecos | ${analisisFinal.score.total} · ${analisisFinal.insights.length} · ${resultado.huecos.join(', ') || '—'} | |`, '', '## Por turno', '', '| turno | canal | duración | transcribir | analizar | total | insights (nuevos) |', '|---|---|---|---|---|---|---|', ...latencias.map((l) => `| ${l.turno} | ${l.canal} | ${(l.duracionTurnoMs / 1000).toFixed(1)} s | ${l.msTranscripcion} ms | ${l.msAnalisis} ms | ${l.msTotal} ms | ${l.insights} (+${l.nuevos}) |`), '', 'Lo que el spike NO mide: la captura real (WSLg no ve el audio de Zoom/Teams en Windows), la cancelación de eco de una llamada, ni el consentimiento. Eso es el ayudante de Windows (PRP nuevo, CDC si trae DLL) y las tres firmas.', ''].join('\n'));
console.log(`${REUNION} (sangrado ${SANGRADO_DB} dB, dominancia ${CON_DOMINANCIA ? 'si' : 'no'}): etiquetado ${(etiquetado * 100).toFixed(0)} % · descartados por sangrado ${descartadosPorSangrado} · canal equivocado ${equivocados} · WER ${(w.wer * 100).toFixed(1)} % · insight p50 ${p50} ms (p95 ${p95}) + 500 ms de VAD · turnos ${segmentos.length}/${verdad.turnos.length} · proceso ${resultado.procesoSobreDuracion}× · escrito ${salida}.md`);
