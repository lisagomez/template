#!/usr/bin/env node
/**
 * Verificador de los artefactos generados (D-SS-9, decidida el 2026-10-22). Corre dentro de
 * `npm run validate`.
 *
 * Lo generado no se edita: se regenera. `GEMINI.md` ya lo cumplia (sincroniza-gemini.mjs) y el
 * CI de GitHub tambien (D-SS-8); este gate lo extiende a todo artefacto que el repo puede
 * regenerar por si solo. El registro vive en `.claude/gates.json`, clave `generados`; la logica,
 * en `lib/generados.mjs`. Por artefacto: rutas versionadas, banner «ALTO: ARTEFACTO
 * AUTOGENERADO» y comparacion con su fuente. Por el repo: ningun banner sin registrar, nada
 * `fuera` sin motivo, ningun archivo con dos duenos.
 *
 * Cada pasada corre ademas sus siembras (la prueba de la prueba): un artefacto editado a mano,
 * el banner borrado, un artefacto borrado, un generado sin registrar, el gate que compara
 * apagado, un `fuera` sin motivo, algo `fuera` con banner y un archivo con dos duenos. Si una
 * siembra sobrevive, el gate se pone rojo aunque el repo este bien.
 *
 * Necesita los `dist/` de tools/ (los construye `pretypecheck`, que va antes en `validate`); a
 * mano: `npm run prepara:gate` primero.
 *
 * Uso:  node scripts/verifica-generados.mjs
 * Exit: 0 en verde · 1 en rojo.
 */
import { closeSync, openSync, readSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargaManifiesto, ManifiestoInvalido, MANIFIESTO } from './lib/gates.mjs';
import { revisaGenerados, siembrasGenerados } from './lib/generados.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;

const BINARIOS = /\.(png|jpe?g|gif|webp|ico|mp4|webm|wav|mp3|ogg|pdf|xlsx|docx|zip|gz|onnx|bin|pyc|woff2?|ttf)$/i;
const BYTES_CABEZA = 64 * 1024;

/** El principio de un archivo versionado, como texto; '' si es binario. */
function lee(ruta) {
  if (BINARIOS.test(ruta)) return '';
  let fd;
  try {
    fd = openSync(join(raiz, ruta), 'r');
    const buf = Buffer.alloc(BYTES_CABEZA);
    const n = readSync(fd, buf, 0, BYTES_CABEZA, 0);
    const trozo = buf.subarray(0, n);
    return trozo.includes(0) ? '' : trozo.toString('utf8');
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function corre(comando) {
  const r = spawnSync(comando, { cwd: raiz, shell: true, encoding: 'utf8', timeout: 120_000 });
  const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-3).join(' · ').slice(0, 300);
  return { status: r.status ?? 1, salida: r.error ? r.error.message : salida };
}

function imprime({ ok, fallos }) {
  for (const linea of ok) console.log(`  ${verde('✓')} ${linea}`);
  for (const f of fallos) {
    console.log(`  ${rojo('✗')} ${f.descripcion}`);
    console.log(gris(`      ↳ ${f.pista}`));
  }
}

/** Las siembras sobre el mundo real, sin correr comandos: cada una tiene que poner algo en rojo. */
function pruebaDeLaPrueba(mundo) {
  const sinCorrer = { ...mundo, corre: () => ({ status: 0, salida: '' }) };
  const vivas = siembrasGenerados(sinCorrer)
    .filter(([, cambio]) => revisaGenerados({ ...sinCorrer, ...cambio }).fallos.length === 0)
    .map(([nombre]) => nombre);
  const total = siembrasGenerados(sinCorrer).length;
  return { total, vivas };
}

// --- Entrada -----------------------------------------------------------------
let padron;
let registro;
try {
  padron = cargaManifiesto(raiz);
  registro = JSON.parse(readFileSync(join(raiz, MANIFIESTO), 'utf8')).generados;
} catch (e) {
  if (!(e instanceof ManifiestoInvalido) && !(e instanceof SyntaxError)) throw e;
  console.log(rojo(`✗ ${MANIFIESTO} no carga: ${e.message}`));
  process.exit(1);
}
const git = spawnSync('git', ['ls-files', '-z'], { cwd: raiz, encoding: 'utf8' });
if (git.status !== 0) {
  console.log(rojo(`✗ git ls-files fallo: ${git.stderr}`));
  process.exit(1);
}
const rastreados = git.stdout.split('\0').filter(Boolean);
const mundo = { registro, rastreados, lee, padron, corre };

const resultado = revisaGenerados(mundo);
imprime(resultado);
const siembras = resultado.fallos.length === 0 ? pruebaDeLaPrueba(mundo) : null;
if (siembras) {
  const cazadas = siembras.total - siembras.vivas.length;
  const linea = `siembras: ${cazadas} de ${siembras.total} cazadas`;
  console.log(siembras.vivas.length ? `  ${rojo('✗')} ${linea} — vivas: ${siembras.vivas.join(' · ')}` : `  ${verde('✓')} ${linea}`);
}
console.log('');
if (resultado.fallos.length === 0 && siembras.vivas.length === 0) {
  console.log(verde(`Artefactos generados al dia: ${resultado.ok.length} comprobaciones y ${siembras.total} siembras en verde.`));
  console.log(gris(`  ${registro.artefactos.length} artefactos declarados, ${registro.fuera.length} grupos fuera con su motivo.`));
  process.exit(0);
}
console.log(rojo(siembras === null
  ? `Artefactos generados DIVERGENTES: ${resultado.fallos.length} de ${resultado.ok.length + resultado.fallos.length} comprobaciones fallaron (las siembras no se corren sobre una base en rojo).`
  : `La prueba de la prueba fallo: ${siembras.vivas.length} siembra(s) que el verificador no vio.`));
process.exit(1);
