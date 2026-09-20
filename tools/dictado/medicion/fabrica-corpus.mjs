#!/usr/bin/env node
/**
 * Fabrica el corpus SINTETICO de calibracion y las reuniones simuladas con las voces Piper de la
 * maquina, para calibrar sin esperar grabaciones propias (que van en las mismas carpetas con
 * los mismos nombres y se miden igual). Los WAV no van al repo; esto los regenera.
 *
 *   node medicion/fabrica-corpus.mjs            # frases.txt → sintetico/{limpio,ruido,celular}-NN.wav
 *   node medicion/fabrica-corpus.mjs --reuniones # reuniones/guiones.json → <r>.wav + <r>.verdad.json
 *
 * Condiciones: `ruido` mezcla ruido rosa de oficina; `celular` recorta la banda a 300-3400 Hz,
 * comprime y anade ruido blanco. Las voces se alternan (es_MX claude, es_ES davefx) para que
 * la diarizacion tenga dos voces reales que separar.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const banco = join(raiz, 'medicion', 'banco');
const carpeta = join(raiz, 'medicion', 'corpus-propio');
const env = { ...process.env, DICTADO_MODELOS: process.env.DICTADO_MODELOS ?? join(banco, 'modelos'), DICTADO_RUNTIME: process.env.DICTADO_RUNTIME ?? banco, DICTADO_DATOS: process.env.DICTADO_DATOS ?? join(banco, 'datos') };
const VOCES = ['es_MX-claude-high', 'es_ES-davefx-medium'];
const di = (texto, voz, salida) => execFileSync(process.execPath, [join(raiz, 'dist', 'node', 'cli.js'), 'di', texto, '--voz', voz, '--guarda', salida, '--sin-sonido'], { env, cwd: raiz, stdio: 'ignore' });
const ffmpeg = (args) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'ignore' });
const duracion = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim());

function frases() {
  const lista = readFileSync(join(carpeta, 'frases.txt'), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  const sal = join(carpeta, 'sintetico');
  mkdirSync(sal, { recursive: true });
  lista.forEach((f, i) => {
    const n = String(i + 1).padStart(2, '0');
    const limpio = join(sal, `limpio-${n}.wav`);
    if (!existsSync(limpio)) di(f, VOCES[i % 2], limpio);
    ffmpeg(['-i', limpio, '-filter_complex', 'anoisesrc=color=pink:amplitude=0.04:sample_rate=22050:duration=20[n];[0:a][n]amix=inputs=2:duration=first:normalize=0', join(sal, `ruido-${n}.wav`)]);
    ffmpeg(['-i', limpio, '-filter_complex', '[0:a]highpass=f=300,lowpass=f=3400,acompressor=threshold=-18dB:ratio=3[v];anoisesrc=color=white:amplitude=0.012:sample_rate=22050:duration=20[n];[v][n]amix=inputs=2:duration=first:normalize=0', join(sal, `celular-${n}.wav`)]);
  });
  console.log(`${lista.length} frases × 3 condiciones en ${sal}`);
}

function reuniones() {
  const dir = join(carpeta, 'reuniones');
  const guiones = JSON.parse(readFileSync(join(dir, 'guiones.json'), 'utf8'));
  const gap = 0.8;
  for (const [r, lineas] of Object.entries(guiones)) {
    const entradas = [];
    let t = gap;
    const verdad = [];
    lineas.forEach(([lado, texto], i) => {
      const f = join(dir, `${r}-${String(i + 1).padStart(2, '0')}.wav`);
      if (!existsSync(f)) di(texto, lado === 'Asesor' ? VOCES[0] : VOCES[1], f);
      const d = duracion(f);
      verdad.push({ hablante: lado, inicioMs: Math.round(t * 1000), finMs: Math.round((t + d) * 1000), texto });
      entradas.push(f);
      t += d + gap;
    });
    writeFileSync(join(dir, `${r}.verdad.json`), JSON.stringify({ reunion: r, hablantes: 2, gapMs: 800, turnos: verdad, duracionMs: Math.round(t * 1000) }, null, 1));
    const n = entradas.length;
    const fc = entradas.map((_, i) => `[${i + 1}:a]aformat=sample_rates=16000:channel_layouts=mono[a${i + 1}];`).join('') + entradas.map((_, i) => `[0:a][a${i + 1}]`).join('') + `[0:a]concat=n=${2 * n + 1}:v=0:a=1[out]`;
    ffmpeg(['-f', 'lavfi', '-i', 'aevalsrc=0:d=0.8:s=16000', ...entradas.flatMap((f) => ['-i', f]), '-filter_complex', fc, '-map', '[out]', join(dir, `${r}.wav`)]);
    console.log(`${r}: ${n} lineas, ${t.toFixed(1)} s`);
  }
}

if (process.argv.includes('--reuniones')) reuniones();
else frases();
