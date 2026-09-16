#!/usr/bin/env node
/**
 * Mide `@tu-scope/dictado` contra PESOS REALES y audio real en espanol. No es la suite de pruebas.
 *
 * Es la regla de `tools/voz`, heredada: **lo que no se ha medido contra pesos reales no esta
 * aprobado, esta sin medir.** El motor por defecto y el silencio que cierra una frase salen de
 * AQUI, con fecha, corpus y hardware al lado — no de un tutorial ni de un benchmark de otra
 * maquina (sflow midio en un M4 con MLX; esta es una Ryzen 5700G sin CUDA).
 *
 * Que mide, por motor:  WER acumulado · latencia por toma (p50/p95) · RTF · RAM residente.
 * Y aparte:             cuanto silencio cierra una frase sin partirla (VAD Silero) · hilos.
 *
 * Corpus: FLEURS es_419, split test, las 150 primeras tomas (~30 min), con transcripcion de
 * referencia. Se descarga el parquet de HF (CC-BY-4.0) y `corpus.py` lo deja en WAV 16 kHz.
 *
 * Uso:  npm run mide [-- --tomas 150 --motores parakeet,whisper-turbo,whisper-base,faster-whisper:small,faster-whisper:large-v3-turbo --sin-vad --sin-hilos]
 * Necesita: red la primera vez (~2,5 GB entre modelos, runtimes y corpus), `uv`, `ffmpeg`.
 * En un VPS con GPU corre IGUAL: `--dispositivo cuda` para los motores de faster-whisper.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { cpus, totalmem } from 'node:os';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..');
const banco = join(aqui, 'banco');
const modelos = join(banco, 'modelos');
const corpus = join(banco, 'corpus');

const ESC = String.fromCharCode(27);
const verde = (s) => `${ESC}[32m${s}${ESC}[0m`;
const gris = (s) => `${ESC}[2m${s}${ESC}[0m`;
const paso = (s) => console.log(`\n${verde('▸')} ${s}`);

const argv = process.argv.slice(2);
const opcion = (nombre, porDefecto) => {
  const i = argv.indexOf(`--${nombre}`);
  return i === -1 || argv[i + 1] === undefined ? porDefecto : argv[i + 1];
};
const TOMAS = Number(opcion('tomas', 150));
const DISPOSITIVO = opcion('dispositivo', 'cpu');
const HILOS = Number(opcion('hilos', 8));
const MOTORES = opcion('motores', 'parakeet,whisper-turbo,whisper-base,faster-whisper:small,faster-whisper:large-v3-turbo').split(',').filter(Boolean);
const SIN_VAD = argv.includes('--sin-vad');
const SIN_HILOS = argv.includes('--sin-hilos');
/** Un motor por proceso: la RAM se mide limpia y un motor que reviente no se lleva a los demas. */
const MOTOR_INTERNO = opcion('interno-motor', null);
const RSS_BASE_MB = Math.round(process.memoryUsage().rss / 1048576);

/** Todo pineado por URL exacta: `latest` es anti-patron aqui igual que en el modelo (C1). */
const PESOS = [
  { carpeta: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8', url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2', que: 'NVIDIA Parakeet TDT 0.6B v3 (25 idiomas, es incluido), int8, ONNX' },
  { carpeta: 'sherpa-onnx-whisper-turbo', url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-turbo.tar.bz2', que: 'OpenAI Whisper large-v3-turbo, int8, ONNX' },
  { carpeta: 'sherpa-onnx-whisper-base', url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-base.tar.bz2', que: 'OpenAI Whisper base (multilingue), int8, ONNX' },
];
const ARCHIVOS = [
  { archivo: 'silero_vad.onnx', url: 'https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx', que: 'Silero VAD v5' },
  { archivo: 'embedding.onnx', url: 'https://huggingface.co/Wespeaker/wespeaker-voxceleb-resnet34-LM/resolve/main/voxceleb_resnet34_LM.onnx', que: 'WeSpeaker ResNet34-LM (para `dictado lote`)' },
];
const RUNTIMES = { 'sherpa-onnx-node': '1.13.8', 'onnxruntime-node': '1.30.0' };
const PYTHON = { version: '3.12', paquetes: ['faster-whisper==1.2.1', 'pyarrow==25.0.1'] };
const PARQUET = { url: 'https://huggingface.co/datasets/google/fleurs/resolve/refs%2Fconvert%2Fparquet/es_419/test/0000.parquet', archivo: 'fleurs-es_419-test.parquet', que: 'FLEURS es_419 test (Google, CC-BY-4.0), 908 tomas' };

function baja(url, destino) {
  execFileSync('curl', ['-sSL', '--fail', '-o', destino, url], { stdio: ['ignore', 'ignore', 'inherit'] });
}

function preparaModelos() {
  mkdirSync(modelos, { recursive: true });
  for (const p of PESOS) {
    if (existsSync(join(modelos, p.carpeta))) {
      console.log(gris(`  ya esta: ${p.carpeta}`));
      continue;
    }
    console.log(gris(`  bajando ${p.carpeta} — ${p.que}`));
    const tar = join(modelos, `${p.carpeta}.tar.bz2`);
    baja(p.url, tar);
    execFileSync('tar', ['-xjf', tar, '-C', modelos]);
    execFileSync('rm', [tar]);
  }
  for (const a of ARCHIVOS) {
    if (existsSync(join(modelos, a.archivo))) continue;
    console.log(gris(`  bajando ${a.archivo} — ${a.que}`));
    baja(a.url, join(modelos, a.archivo));
  }
}

function preparaRuntime() {
  if (!existsSync(join(banco, 'package.json'))) writeFileSync(join(banco, 'package.json'), JSON.stringify({ name: 'banco-dictado', private: true, type: 'module' }, null, 1));
  const faltan = Object.entries(RUNTIMES).filter(([n]) => !existsSync(join(banco, 'node_modules', n)));
  if (faltan.length > 0) {
    console.log(gris(`  instalando ${faltan.map(([n, v]) => `${n}@${v}`).join(' ')} (peers opcionales; ~600 MB)`));
    execFileSync('npm', ['install', '--no-audit', '--no-fund', ...faltan.map(([n, v]) => `${n}@${v}`)], { cwd: banco, stdio: 'inherit' });
  }
  const python = join(banco, 'venv', 'bin', 'python');
  if (!existsSync(python)) {
    console.log(gris(`  creando venv de Python ${PYTHON.version} con ${PYTHON.paquetes.join(', ')}`));
    execFileSync('uv', ['venv', '--python', PYTHON.version, join(banco, 'venv')], { stdio: 'ignore' });
    execFileSync('uv', ['pip', 'install', '--python', python, ...PYTHON.paquetes], { stdio: 'ignore' });
  }
  // Se mide el paquete CONSTRUIDO, no `src/`: es lo que se instala en el proyecto de destino.
  execFileSync('npm', ['run', 'build'], { cwd: raiz, stdio: 'ignore' });
  return python;
}

function preparaCorpus(python) {
  mkdirSync(corpus, { recursive: true });
  const parquet = join(corpus, PARQUET.archivo);
  if (!existsSync(parquet)) {
    console.log(gris(`  bajando ${PARQUET.que} (670 MB)`));
    baja(PARQUET.url, parquet);
  }
  const manifiesto = join(corpus, 'fleurs', 'manifiesto.json');
  if (!existsSync(manifiesto) || JSON.parse(readFileSync(manifiesto, 'utf8')).length < TOMAS) {
    execFileSync(python, [join(aqui, 'corpus.py'), parquet, join(corpus, 'fleurs'), String(TOMAS)], { stdio: 'inherit' });
  }
  // El manifiesto guarda rutas relativas al banco: asi sobrevive a copiar el banco al VPS.
  const tomas = JSON.parse(readFileSync(manifiesto, 'utf8')).slice(0, TOMAS).map((t) => ({ ...t, archivo: isAbsolute(t.archivo) ? t.archivo : join(banco, t.archivo) }));
  console.log(gris(`  ${tomas.length} tomas, ${(tomas.reduce((s, t) => s + t.duracionMs, 0) / 60000).toFixed(1)} min`));
  return tomas;
}

const rssMb = () => Math.round(process.memoryUsage().rss / 1048576);
const pct = (v, p) => {
  const o = [...v].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.max(0, Math.ceil((p / 100) * o.length) - 1))];
};

async function creaMotorMedido(nombre, nodo, python) {
  const requiere = createRequire(pathToFileURL(join(banco, 'x.js')));
  const importa = async (n) => {
    const m = await import(pathToFileURL(requiere.resolve(n)).href);
    return m.default ?? m;
  };
  // RSS de este proceso menos el de un Node recien arrancado: vale porque cada motor corre en un
  // proceso PROPIO (`--interno-motor`). Medido en el mismo proceso que otro motor, el segundo
  // reutiliza memoria del primero y sale con «2 MB» (paso el 2026-09-15).
  const antes = RSS_BASE_MB;
  if (nombre.startsWith('faster-whisper')) {
    const modelo = nombre.split(':')[1] ?? 'small';
    const motor = nodo.creaMotorPorProceso({
      id: `faster-whisper-${modelo}-${DISPOSITIVO === 'cpu' ? 'int8' : 'float16'}-${DISPOSITIVO}`,
      comando: python,
      argumentos: [join(raiz, 'motores-locales', 'motor-faster-whisper.py'), '--modelo', modelo, '--dispositivo', DISPOSITIVO, '--hilos', String(HILOS), '--raiz-modelos', join(modelos, 'faster-whisper')],
      admitePista: true,
    });
    return { motor, ram: () => motor.rssMb ?? NaN };
  }
  const carpetas = { parakeet: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8', 'whisper-turbo': 'sherpa-onnx-whisper-turbo', 'whisper-base': 'sherpa-onnx-whisper-base' };
  const sherpa = await importa('sherpa-onnx-node');
  const motor = nodo.creaMotorSherpa({ sherpa, carpeta: join(modelos, carpetas[nombre]), hilos: HILOS, idioma: 'es' });
  return { motor, ram: () => rssMb() - antes };
}

/** Lanza `mide.mjs --interno-motor <nombre>` y recoge su fila JSON (la ultima linea de stdout). */
function mideMotorEnProcesoAparte(nombre) {
  const salida = execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--interno-motor', nombre, '--tomas', String(TOMAS), '--dispositivo', DISPOSITIVO, '--hilos', String(HILOS)], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024,
  });
  const lineas = salida.trim().split('\n');
  return JSON.parse(lineas[lineas.length - 1]);
}

async function mideMotor(nombre, tomas, nodo, python, nucleo, audios) {
  const { motor, ram } = await creaMotorMedido(nombre, nodo, python);
  const t0 = performance.now();
  await motor.calienta?.();
  const carga = performance.now() - t0;
  const latencias = [];
  const pares = [];
  let msAudio = 0;
  for (const [i, toma] of tomas.entries()) {
    const audio = audios.get(toma.archivo);
    const t1 = performance.now();
    const r = await motor.transcribe(audio.muestras, audio.frecuenciaHz, { idioma: 'es' });
    latencias.push(performance.now() - t1);
    msAudio += audio.duracionMs;
    pares.push({ referencia: toma.referencia, hipotesis: r.texto });
    process.stderr.write(`\r  ${nombre}: ${i + 1}/${tomas.length}`);
  }
  process.stderr.write('\n');
  const w = nucleo.werAcumulado(pares);
  const cortas = tomas.map((t, i) => [t.duracionMs, latencias[i]]).filter(([d]) => d <= 8000).map(([, l]) => l);
  const fila = {
    motor: motor.id,
    tomas: tomas.length,
    wer: w.wer,
    cer: nucleo.cer(pares.map((p) => p.referencia).join(' '), pares.map((p) => p.hipotesis).join(' ')).wer,
    latenciaP50Ms: pct(latencias, 50),
    latenciaP95Ms: pct(latencias, 95),
    latenciaCortasP50Ms: cortas.length ? pct(cortas, 50) : null,
    tomasCortas: cortas.length,
    rtf: latencias.reduce((s, l) => s + l, 0) / msAudio,
    ramMb: ram(),
    cargaMs: carga,
    ejemplos: pares.slice(0, 2),
  };
  await motor.cierra?.();
  return fila;
}

/** Cuanto silencio cierra una frase sin partirla: cada toma de FLEURS es UNA frase leida. */
async function mideVad(tomas, nodo, audios) {
  const requiere = createRequire(pathToFileURL(join(banco, 'x.js')));
  const ort = await import(pathToFileURL(requiere.resolve('onnxruntime-node')).href);
  const filas = [];
  for (const silencio of [300, 500, 700, 1000, 1500]) {
    const detector = await nodo.creaDetectorSilero({ ort: ort.default ?? ort, rutaModelo: join(modelos, 'silero_vad.onnx'), msSilencioParaCerrar: silencio });
    let partidas = 0;
    let sinVoz = 0;
    let msHabla = 0;
    let msTotal = 0;
    const t0 = performance.now();
    for (const toma of tomas) {
      const audio = audios.get(toma.archivo);
      detector.reinicia();
      const eventos = [...(await detector.procesa(audio.muestras)), ...(await detector.cierra())];
      const turnos = eventos.filter((e) => e.tipo === 'finHabla').map((e) => e.turno);
      if (turnos.length === 0) sinVoz += 1;
      if (turnos.length > 1) partidas += 1;
      msHabla += turnos.reduce((s, t) => s + (t.finMs - t.inicioMs), 0);
      msTotal += audio.duracionMs;
    }
    filas.push({ silencioMs: silencio, tomasPartidas: partidas, tomasSinVoz: sinVoz, fraccionPartidas: partidas / tomas.length, fraccionHabla: msHabla / msTotal, rtf: (performance.now() - t0) / msTotal });
    console.log(`  cierre ${silencio} ms: ${partidas}/${tomas.length} frases partidas, ${sinVoz} sin voz, ${(100 * (msHabla / msTotal)).toFixed(0)} % del audio es habla`);
  }
  return filas;
}

async function mideHilos(tomas, nodo, audios) {
  const requiere = createRequire(pathToFileURL(join(banco, 'x.js')));
  const m = await import(pathToFileURL(requiere.resolve('sherpa-onnx-node')).href);
  const sherpa = m.default ?? m;
  const filas = [];
  const muestra = tomas.slice(0, 20);
  for (const hilos of [4, 8, 16]) {
    const motor = nodo.creaMotorSherpa({ sherpa, carpeta: join(modelos, 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8'), hilos });
    await motor.calienta();
    const latencias = [];
    for (const toma of muestra) {
      const audio = audios.get(toma.archivo);
      const t = performance.now();
      await motor.transcribe(audio.muestras, audio.frecuenciaHz);
      latencias.push(performance.now() - t);
    }
    filas.push({ hilos, latenciaP50Ms: pct(latencias, 50) });
    console.log(`  parakeet con ${hilos} hilos: p50 ${pct(latencias, 50).toFixed(0)} ms sobre ${muestra.length} tomas`);
  }
  return filas;
}

function tabla(filas) {
  const f = (n, d = 1) => (n === null || Number.isNaN(n) ? '—' : Number(n).toFixed(d));
  const lineas = ['| motor | WER | CER | latencia p50 | p95 | p50 tomas ≤8 s | RTF | RAM | carga |', '|---|---|---|---|---|---|---|---|---|'];
  for (const r of filas) lineas.push(`| ${r.motor} | ${f(100 * r.wer)} % | ${f(100 * r.cer)} % | ${f(r.latenciaP50Ms, 0)} ms | ${f(r.latenciaP95Ms, 0)} ms | ${f(r.latenciaCortasP50Ms, 0)} ms (${r.tomasCortas}) | ${f(r.rtf, 3)} | ${f(r.ramMb, 0)} MB | ${f(r.cargaMs / 1000)} s |`);
  return lineas.join('\n');
}

async function mide() {
  paso('modelos (pineados por URL)');
  preparaModelos();
  paso('runtimes (peers opcionales, pineados) y venv');
  const python = preparaRuntime();
  paso('corpus');
  const tomas = preparaCorpus(python);

  const nodo = await import(pathToFileURL(join(raiz, 'dist', 'node', 'index.js')).href);
  const audios = new Map();
  for (const t of tomas) audios.set(t.archivo, await nodo.leeAudio(t.archivo));

  const maquina = { cpu: cpus()[0]?.model?.trim(), nucleos: cpus().length, ramGb: Math.round(totalmem() / 1073741824), node: process.version, dispositivo: DISPOSITIVO, hilos: HILOS, kernel: readdirSync('/proc').includes('version') ? readFileSync('/proc/version', 'utf8').split(' ')[2] : undefined };
  const resultado = { fecha: new Date().toISOString().slice(0, 10), maquina, corpus: { nombre: 'FLEURS es_419 test', tomas: tomas.length, minutos: Number((tomas.reduce((s, t) => s + t.duracionMs, 0) / 60000).toFixed(1)), licencia: 'CC-BY-4.0', fuente: PARQUET.url }, motores: [], vad: [], hilos: [] };

  if (!SIN_VAD) {
    paso('VAD Silero: cuanto silencio cierra una frase sin partirla');
    resultado.vad = await mideVad(tomas, nodo, audios);
  }
  if (!SIN_HILOS && MOTORES.includes('parakeet')) {
    paso('hilos: Parakeet con 4, 8 y 16');
    resultado.hilos = await mideHilos(tomas, nodo, audios);
  }
  for (const nombre of MOTORES) {
    paso(`motor ${nombre} (en su propio proceso)`);
    try {
      resultado.motores.push(mideMotorEnProcesoAparte(nombre));
    } catch (error) {
      console.log(`  ✗ ${nombre}: ${error instanceof Error ? error.message : String(error)}`);
      resultado.motores.push({ motor: nombre, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const salida = join(aqui, `ultima-medicion-${DISPOSITIVO}.json`);
  writeFileSync(salida, JSON.stringify(resultado, null, 1) + '\n');
  console.log(`\n${maquina.cpu} · ${maquina.nucleos} hilos · ${maquina.ramGb} GB · ${DISPOSITIVO} · ${resultado.corpus.nombre}, ${resultado.corpus.tomas} tomas (${resultado.corpus.minutos} min) · ${resultado.fecha}\n`);
  console.log(tabla(resultado.motores.filter((m) => !m.error)));
  console.log(gris(`\nescrito en ${salida}`));
}

async function mideInterno(nombre) {
  const python = join(banco, 'venv', 'bin', 'python');
  const tomas = JSON.parse(readFileSync(join(corpus, 'fleurs', 'manifiesto.json'), 'utf8')).slice(0, TOMAS).map((t) => ({ ...t, archivo: isAbsolute(t.archivo) ? t.archivo : join(banco, t.archivo) }));
  const nodo = await import(pathToFileURL(join(raiz, 'dist', 'node', 'index.js')).href);
  const nucleo = await import(pathToFileURL(join(raiz, 'dist', 'index.js')).href);
  const audios = new Map();
  for (const t of tomas) audios.set(t.archivo, await nodo.leeAudio(t.archivo));
  const fila = await mideMotor(nombre, tomas, nodo, python, nucleo, audios);
  process.stdout.write(JSON.stringify(fila) + '\n');
}

(MOTOR_INTERNO ? mideInterno(MOTOR_INTERNO) : mide()).catch((error) => {
  console.error(error);
  process.exit(1);
});
