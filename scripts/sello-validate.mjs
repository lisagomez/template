#!/usr/bin/env node
/**
 * Sello de `validate`: `predeploy` no repite el gate sobre un arbol que YA paso entero.
 *
 * El problema que resuelve (lo nombro un sujeto de capa B el 2026-08-26): `predeploy` es un
 * subconjunto estricto de `validate`. Quien acaba de correr `validate` y despliega paga las
 * ocho comprobaciones dos veces, la segunda en el servidor. La salida facil —quitar
 * `predeploy` "porque ya lo corremos a mano"— es exactamente el hueco que la capa se comio el
 * 2026-08-23 (gate fuera de la ruta de deploy). Esto quita la espera SIN sacar el gate de la
 * ruta: si el arbol es identico al que `validate` sello, `predeploy` pasa en milisegundos; si
 * se toco cualquier archivo, o no hay sello, corre el gate completo como siempre.
 *
 * Huella: `git write-tree` sobre un indice temporal con `git add -A` — cubre lo versionado, lo
 * modificado y lo nuevo (respetando .gitignore). Dos arboles con la misma huella son el mismo
 * contenido byte a byte; no hay "mas o menos igual".
 *
 * Uso:  node scripts/sello-validate.mjs --sella     # lo llama `validate` al final, si todo paso
 *       node scripts/sello-validate.mjs --verifica  # exit 0 = sello vigente; 1 = no (corre el gate)
 * El sello vive en .validate-sello.json (ignorado por git: es de esta maquina, no del repo).
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SELLO = join(raiz, '.validate-sello.json');
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;
const amarillo = (s) => `\x1b[33m${s}\x1b[0m`;

const git = (args, env = {}) =>
  execFileSync('git', args, { cwd: raiz, encoding: 'utf8', env: { ...process.env, ...env } }).trim();

/** Huella del arbol de trabajo completo (versionado + modificado + nuevo no ignorado). */
export function huellaDelArbol() {
  const temporal = mkdtempSync(join(tmpdir(), 'sello-'));
  const indice = join(temporal, 'index');
  try {
    const env = { GIT_INDEX_FILE: indice };
    git(['read-tree', 'HEAD'], env);
    git(['add', '-A'], env);
    return git(['write-tree'], env);
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }
}

function sella() {
  const sello = { arbol: huellaDelArbol(), head: git(['rev-parse', 'HEAD']), node: process.version, sellado: new Date().toISOString() };
  writeFileSync(SELLO, JSON.stringify(sello, null, 2) + '\n');
  console.log(verde(`✓ validate sellado: arbol ${sello.arbol.slice(0, 12)} (${sello.sellado})`));
  console.log(gris('  predeploy pasara sin repetir el gate mientras el arbol no cambie.'));
}

function verifica() {
  if (!existsSync(SELLO)) {
    console.log(amarillo('· sin sello de validate: predeploy corre el gate completo'));
    process.exit(1);
  }
  let sello;
  try {
    sello = JSON.parse(readFileSync(SELLO, 'utf8'));
  } catch {
    console.log(amarillo('· sello ilegible: predeploy corre el gate completo'));
    process.exit(1);
  }
  const actual = huellaDelArbol();
  if (sello.arbol !== actual) {
    console.log(amarillo(`· el arbol cambio desde el ultimo validate (${String(sello.arbol).slice(0, 12)} -> ${actual.slice(0, 12)}): predeploy corre el gate completo`));
    process.exit(1);
  }
  if (sello.node !== process.version) {
    console.log(amarillo(`· validate se sello con Node ${sello.node} y esto es ${process.version}: predeploy corre el gate completo`));
    process.exit(1);
  }
  console.log(verde(`✓ sello vigente: este arbol (${actual.slice(0, 12)}) ya paso validate entero el ${sello.sellado}`));
  console.log(gris('  predeploy no repite el gate. Toca un archivo y volvera a correrlo.'));
  process.exit(0);
}

if (process.argv.includes('--sella')) sella();
else if (process.argv.includes('--verifica')) verifica();
else {
  console.error('Uso: node scripts/sello-validate.mjs --sella | --verifica');
  process.exit(2);
}
