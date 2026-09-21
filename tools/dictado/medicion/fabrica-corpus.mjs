#!/usr/bin/env node
/**
 * Fabrica el corpus SINTETICO de calibracion y las reuniones simuladas con las voces Piper de la
 * maquina, para calibrar sin esperar grabaciones propias (que van en las mismas carpetas con
 * los mismos nombres y se miden igual). Los WAV no van al repo; esto los regenera.
 *
 *   node medicion/fabrica-corpus.mjs            # frases.txt → sintetico/{limpio,ruido,celular}-NN.wav
 *   node medicion/fabrica-corpus.mjs --reuniones # reuniones/guiones.json → <r>.wav + <r>.verdad.json
 *   node medicion/fabrica-corpus.mjs --campo     # sintetico/limpio-NN.wav → campo/<condicion>-NN.wav (condiciones.mjs)
 *   node medicion/fabrica-corpus.mjs --muletillas # muletillas/guiones.json → <g>-<voz>.wav + <g>-<voz>.verdad.json
 *
 * Condiciones: `ruido` mezcla ruido rosa de oficina; `celular` recorta la banda a 300-3400 Hz,
 * comprime y anade ruido blanco. Las voces se alternan (es_MX claude, es_ES davefx) para que
 * la diarizacion tenga dos voces reales que separar.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONDICIONES, NOMBRES_CONDICION, nivelMedioDb } from './condiciones.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const banco = join(raiz, 'medicion', 'banco');
const carpeta = join(raiz, 'medicion', 'corpus-propio');
const env = { ...process.env, DICTADO_MODELOS: process.env.DICTADO_MODELOS ?? join(banco, 'modelos'), DICTADO_RUNTIME: process.env.DICTADO_RUNTIME ?? banco, DICTADO_DATOS: process.env.DICTADO_DATOS ?? join(banco, 'datos') };
const VOCES = ['es_MX-claude-high', 'es_ES-davefx-medium'];
const di = (texto, voz, salida) => execFileSync(process.execPath, [join(raiz, 'dist', 'node', 'cli.js'), 'di', texto, '--voz', voz, '--guarda', salida, '--sin-sonido'], { env, cwd: raiz, stdio: 'ignore' });
const ffmpeg = (args) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
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

/**
 * Campo: cada condicion de `condiciones.mjs` sobre cada `limpio-NN.wav`, con el SNR calculado
 * desde el nivel medio de ESA voz. El babble del almacen son otras seis frases del corpus (las dos
 * voces) en bucle. Ademas `calle-sinvoz.wav` y `taller-sinvoz.wav`: el ruido solo, para contar
 * turnos fantasma. Sintetico: se parece al campo, no es el campo.
 */
function campo() {
  const origen = join(carpeta, 'sintetico');
  const sal = join(carpeta, 'campo');
  mkdirSync(sal, { recursive: true });
  const limpios = readdirSync(origen).filter((n) => /^limpio-\d+\.wav$/.test(n)).sort();
  if (limpios.length === 0) throw new Error('primero fabrica el corpus limpio (sin argumentos)');
  const babble = join(sal, 'babble.wav');
  if (!existsSync(babble)) {
    const seis = limpios.slice(0, 6).map((n) => join(origen, n));
    ffmpeg([...seis.flatMap((f) => ['-i', f]), '-filter_complex', seis.map((_, i) => `[${i}:a]`).join('') + `concat=n=${seis.length}:v=0:a=1[out]`, '-map', '[out]', babble]);
  }
  const babbleDb = nivelMedioDb(babble);
  let hechos = 0;
  for (const n of limpios) {
    const entrada = join(origen, n);
    const vozDb = nivelMedioDb(entrada);
    for (const condicion of NOMBRES_CONDICION) {
      const salida = join(sal, n.replace('limpio', condicion));
      if (existsSync(salida)) continue;
      const filtro = CONDICIONES[condicion](vozDb, { babbleDb });
      ffmpeg(['-i', entrada, ...(condicion === 'almacen' ? ['-stream_loop', '-1', '-i', babble] : []), '-filter_complex', filtro, '-t', '30', '-shortest', salida]);
      hechos++;
    }
  }
  for (const condicion of ['calle', 'taller']) {
    const salida = join(sal, `${condicion}-sinvoz.wav`);
    if (existsSync(salida)) continue;
    // 8 s de silencio digital como «voz» a -20 dB nominal: el filtro pone el ruido a su SNR y la voz no esta.
    ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono:d=8', '-filter_complex', CONDICIONES[condicion](-20, {}), '-t', '8', salida]);
  }
  console.log(`${limpios.length} frases × ${NOMBRES_CONDICION.length} condiciones (${hechos} nuevos) + 2 sin voz en ${sal} · babble ${babbleDb.toFixed(1)} dB`);
}

/**
 * Muletillas con verdad de terreno: cada guion tiene muletillas escritas en conteo conocido y
 * pausas «largas» (1,8 s) entre tramos; los huecos normales entre tramos son de 0,6 s. Se lee con
 * las dos voces. La verdad lleva el texto, la duracion y donde estan las pausas; lo que cuenta la
 * medicion es si el MOTOR conserva las muletillas, porque Piper las pronuncia todas.
 */
function muletillas() {
  const dir = join(carpeta, 'muletillas');
  const guiones = JSON.parse(readFileSync(join(dir, 'guiones.json'), 'utf8'));
  const HUECO = { normal: 0.6, larga: 1.8, fin: 0 };
  for (const [g, tramos] of Object.entries(guiones)) {
    for (const voz of VOCES) {
      const corto = voz.split('-')[0];
      const partes = [];
      let t = 0.5;
      const pausas = [];
      tramos.forEach(([texto, pausa], i) => {
        const f = join(dir, `${g}-${corto}-${String(i + 1).padStart(2, '0')}.wav`);
        if (!existsSync(f)) di(texto, voz, f);
        const d = duracion(f);
        partes.push({ f, inicioMs: Math.round(t * 1000), finMs: Math.round((t + d) * 1000), texto });
        t += d;
        if (pausa === 'larga') pausas.push({ inicioMs: Math.round(t * 1000), finMs: Math.round((t + HUECO.larga) * 1000), ms: HUECO.larga * 1000 });
        t += HUECO[pausa] ?? 0;
      });
      const salida = join(dir, `${g}-${corto}.wav`);
      // entradas: [0] silencio inicial 0,5 s; luego cada tramo; los huecos son fuentes lavfi nombradas
      const fuentes = ['-f', 'lavfi', '-i', 'aevalsrc=0:d=0.5:s=16000', ...partes.flatMap((p) => ['-i', p.f])];
      // Ensamblado: [0:a] + por cada tramo [aN] (+ un hueco [snormal]/[slarga]); cada fuente lavfi de hueco
      // se declara solo si se usa (una salida sin conectar es error) y se reparte con asplit.
      const usosNormal = tramos.filter((x) => x[1] === 'normal').length;
      const usosLarga = tramos.filter((x) => x[1] === 'larga').length;
      const huecos = (usosNormal > 0 ? `aevalsrc=0:d=${HUECO.normal}:s=16000[snormal];` : '') + (usosLarga > 0 ? `aevalsrc=0:d=${HUECO.larga}:s=16000[slarga];` : '');
      const split = (nombre, usos) => (usos > 1 ? `[${nombre}]asplit=${usos}${Array.from({ length: usos }, (_, k) => `[${nombre}${k}]`).join('')};` : usos === 1 ? `[${nombre}]anull[${nombre}0];` : '');
      let kNormal = 0, kLarga = 0;
      const secuencia = ['[0:a]', ...partes.flatMap((p, i) => { const pausa = tramos[i][1]; if (pausa === 'normal') return [`[a${i + 1}]`, `[snormal${kNormal++}]`]; if (pausa === 'larga') return [`[a${i + 1}]`, `[slarga${kLarga++}]`]; return [`[a${i + 1}]`]; })];
      const grafo = huecos + split('snormal', usosNormal) + split('slarga', usosLarga) + partes.map((_, i) => `[${i + 1}:a]aformat=sample_rates=16000:channel_layouts=mono[a${i + 1}];`).join('') + secuencia.join('') + `concat=n=${secuencia.length}:v=0:a=1[out]`;
      ffmpeg([...fuentes, '-filter_complex', grafo, '-map', '[out]', salida]);
      const textoCompleto = partes.map((p) => p.texto).join(' ');
      writeFileSync(join(dir, `${g}-${corto}.verdad.json`), JSON.stringify({ guion: g, voz, duracionMs: Math.round(t * 1000), texto: textoCompleto, palabras: textoCompleto.split(/\s+/).length, tramos: partes.map((p) => ({ inicioMs: p.inicioMs, finMs: p.finMs, texto: p.texto })), pausasLargas: pausas }, null, 1));
      console.log(`${g} · ${corto}: ${partes.length} tramos, ${pausas.length} pausas largas, ${t.toFixed(1)} s`);
    }
  }
}

if (process.argv.includes('--reuniones')) reuniones();
else if (process.argv.includes('--campo')) campo();
else if (process.argv.includes('--muletillas')) muletillas();
else frases();
