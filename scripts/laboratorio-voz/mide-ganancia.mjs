#!/usr/bin/env node
/**
 * Ganancia automatica, medida (Etapa 3, mejora 3.5): `dictado dictar --entrada <wav> --motor remoto`
 * con `--ganancia-db 0` y con `--ganancia-db auto`, sobre las condiciones `flojo` (−24 dB),
 * `fuerte` (+12 dB limitado), `limpio` y `snr10` del corpus de campo. Diez frases por condicion,
 * encadenadas con 1 s de silencio, para que `dictar` las oiga como una sesion real (a tiempo real:
 * ~1 min por corrida). Se mide WER con cifras igualadas, turnos sin voz, descartados por energia y
 * el pico que vio la ganancia.
 *
 *   node scripts/laboratorio-voz/mide-ganancia.mjs [--condiciones flojo,fuerte,limpio,snr10] [--n 10]
 *
 * Regla escrita antes de medir: la ganancia auto solo se PROPONE por defecto (bitacora, firma) si
 * mejora ≥ 3 puntos de WER en `flojo` sin empeorar > 0,5 en el resto.
 */
import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { numerosACifras, wer } from '../../tools/dictado/dist/index.js';

const ejecuta = promisify(execFile);
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const CONDS = arg('condiciones', 'flojo,fuerte,limpio,snr10').split(',');
const N = Number(arg('n', 10));
const raizDictado = resolve('tools/dictado');
const banco = join(raizDictado, 'medicion', 'banco');
const campo = join(raizDictado, 'medicion', 'corpus-propio', 'campo');
const sintetico = join(raizDictado, 'medicion', 'corpus-propio', 'sintetico');
const frases = readFileSync(join(raizDictado, 'medicion', 'corpus-propio', 'frases.txt'), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
const token = /^DICTADO_MOVIL_TOKEN=(.+)$/m.exec(readFileSync('.env.local', 'utf8'))?.[1]?.trim() ?? '';
const env = { ...process.env, DICTADO_MODELOS: join(banco, 'modelos'), DICTADO_RUNTIME: banco, DICTADO_DATOS: join(banco, 'datos'), DICTADO_REMOTO_URL: `http://127.0.0.1:${process.env.DICTADO_DEMONIO_PUERTO ?? 47125}`, DICTADO_REMOTO_TOKEN: token, NO_COLOR: '1' };
console.log(`token: ${token ? `presente (largo ${token.length})` : 'ausente'}`);
const carpeta = join(tmpdir(), `mide-ganancia-${Date.now()}`);
mkdirSync(carpeta, { recursive: true });
const limpia = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const werCifras = (ref, hip) => wer(numerosACifras(ref), numerosACifras(hip));

/** Las N primeras frases de la condicion, encadenadas con 1 s de silencio; la referencia es su texto en orden. */
function sesionDe(condicion) {
  const indices = Array.from({ length: N }, (_, i) => i + 1);
  const archivos = indices.map((i) => join(condicion === 'limpio' ? sintetico : campo, `${condicion}-${String(i).padStart(2, '0')}.wav`));
  const salida = join(carpeta, `${condicion}.wav`);
  const fc = archivos.map((_, i) => `[${i + 1}:a]aformat=sample_rates=16000:channel_layouts=mono[a${i + 1}];`).join('') + archivos.map((_, i) => `[0:a][a${i + 1}]`).join('') + `[0:a]concat=n=${2 * archivos.length + 1}:v=0:a=1[out]`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'aevalsrc=0:d=1.0:s=16000', ...archivos.flatMap((f) => ['-i', f]), '-filter_complex', fc, '-map', '[out]', salida]);
  return { salida, referencia: indices.map((i) => frases[i - 1]).join(' ') };
}

async function corre(condicion, ganancia) {
  const { salida, referencia } = sesionDe(condicion);
  const t0 = performance.now();
  const { stdout } = await ejecuta(process.execPath, [join(raizDictado, 'dist', 'node', 'cli.js'), 'dictar', '--entrada', salida, '--motor', 'remoto', '--ganancia-db', ganancia, '--pegar', 'ninguno', '--sin-trayectoria', '--silencio-ms', '700', '--modo', 'manos-libres'], { env, cwd: raizDictado, timeout: 600_000, maxBuffer: 32 * 1024 * 1024 }).catch((e) => ({ stdout: String(e.stdout ?? '') }));
  const lineas = limpia(stdout).split('\n');
  const textos = lineas.map((l) => /\[pegar=ninguno\] (".*")$/.exec(l)?.[1]).filter(Boolean).map((j) => JSON.parse(j));
  const sinVoz = lineas.filter((l) => l.includes('(sin voz)')).length;
  const descartados = lineas.filter((l) => l.includes('turno descartado')).length;
  const pico = lineas.map((l) => /pico[^\d-]*(-?\d+(?:\.\d+)?) dBFS/.exec(l)?.[1]).filter(Boolean).map(Number);
  const gananciaAplicada = lineas.map((l) => /ganancia[^\d+-]*([+-]?\d+(?:\.\d+)?) dB/.exec(l)?.[1]).filter(Boolean).map(Number);
  const w = werCifras(referencia, textos.join(' '));
  return { condicion, ganancia, turnos: textos.length, sinVoz, descartados, wer: +w.wer.toFixed(3), picoDb: pico[0] ?? null, gananciaAplicadaDb: gananciaAplicada.at(-1) ?? null, segundos: +((performance.now() - t0) / 1000).toFixed(0), texto: textos.join(' ').slice(0, 200) };
}

const filas = [];
for (const c of CONDS) for (const g of ['0', 'auto']) {
  const f = await corre(c, g);
  filas.push(f);
  console.log(`${c} · ganancia ${g}: WER ${(f.wer * 100).toFixed(1)} % · turnos ${f.turnos} · sin voz ${f.sinVoz} · descartados ${f.descartados} · pico ${f.picoDb ?? '?'} dBFS · aplicada ${f.gananciaAplicadaDb ?? '?'} dB · ${f.segundos} s`);
}
const mejora = (c) => { const a = filas.find((f) => f.condicion === c && f.ganancia === '0'), b = filas.find((f) => f.condicion === c && f.ganancia === 'auto'); return a && b ? +((a.wer - b.wer) * 100).toFixed(1) : null; };
const enFlojo = mejora('flojo');
const empeoraResto = CONDS.filter((c) => c !== 'flojo').map((c) => -mejora(c)).filter((x) => x !== null);
const propone = enFlojo !== null && enFlojo >= 3 && empeoraResto.every((x) => x <= 0.5);
const fecha = new Date().toISOString().slice(0, 10);
const salida = join(raizDictado, 'medicion', 'corpus-propio', `ganancia-${fecha}.md`);
writeFileSync(salida.replace('.md', '.json'), JSON.stringify({ fecha, n: N, regla: 'auto se propone por defecto si mejora ≥ 3 puntos en flojo sin empeorar > 0,5 en el resto', mejoraFlojo: enFlojo, empeoraResto, propone, filas }, null, 1));
writeFileSync(salida, [`# Ganancia automática — medición ${fecha}`, '', `${N} frases por condición encadenadas con 1 s de silencio, \`dictar --entrada\` a tiempo real con el demonio como motor. Corpus sintético: mide el ajuste, no un micrófono real.`, '', '| condición | ganancia | WER (cifras igualadas) | turnos | sin voz | descartados por energía | pico visto | ganancia aplicada |', '|---|---|---|---|---|---|---|---|', ...filas.map((f) => `| ${f.condicion} | ${f.ganancia} | ${(f.wer * 100).toFixed(1)} % | ${f.turnos} | ${f.sinVoz} | ${f.descartados} | ${f.picoDb ?? '?'} dBFS | ${f.gananciaAplicadaDb ?? (f.ganancia === 'auto' ? '0 (pico en ventana, sin ajuste)' : '?')} dB |`), '', `Mejora en flojo: ${enFlojo ?? '?'} puntos · en el resto ${empeoraResto.map((x) => (x > 0 ? `empeora ${x}` : `mejora ${-x}`)).join(', ') || '—'}.`, '', propone ? '**Regla cumplida**: se redacta la propuesta de bitácora para poner `--ganancia-db auto` por defecto (firma humana).' : '**Regla no cumplida**: la ganancia automática sigue siendo opcional (`--ganancia-db auto`); no se propone cambiar el defecto.', ''].join('\n'));
console.log(`escrito ${salida} · propone auto por defecto: ${propone}`);
