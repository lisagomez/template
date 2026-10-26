#!/usr/bin/env node
/**
 * Corre las pruebas de cada herramienta de `tools/`. Corre dentro de `npm run validate`.
 *
 * Por que existe: `prepara-gate.mjs` CONSTRUIA las herramientas de `tools/` (para que el
 * typecheck de la raiz no fallara) pero nadie corria sus pruebas. Medido el 2026-09-26 al
 * cablear el manifiesto de gates: 87 archivos de prueba en cuatro herramientas empaquetadas
 * —776 pruebas solo en `extractor-documental`— que `validate` no ejecutaba nunca. Pasaban
 * las cuatro, pero por suerte, no por gate: nada las obligaba a seguir pasando.
 *
 * La deteccion no fue vista a ojo: la hizo la comprobacion de huerfanos de
 * `verifica-gates.mjs`, la misma que caza `scripts/prueba-a2a.ts`.
 *
 * Requiere que las herramientas esten construidas (lo hace `prepara-gate.mjs` en el hook
 * `pretypecheck`, antes del primer gate del perfil). Una herramienta sin script `prueba` se
 * reporta y no cuenta como pasada: no correr no es pasar.
 *
 * Uso:  node scripts/prueba-tools.mjs [nombre…]  (npm run prueba:tools -- capa voz: solo esas; sin nombres, todas)
 * Exit: 0 si todas las suites pasan · 1 si alguna falla o no se pudo correr.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;

const dirTools = join(raiz, 'tools');
if (!existsSync(dirTools)) {
  console.log(gris('no hay tools/: nada que probar'));
  process.exit(0);
}

const todas = readdirSync(dirTools, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(dirTools, e.name, 'package.json')))
  .map((e) => e.name)
  .sort();
// `npm run prueba:tools -- capa voz`: solo esas. Sin nombres, todas (así lo corre `validate`). Un nombre que no
// existe es rojo: pedir una suite que no está y salir en verde sería no correr y decir que pasó.
const pedidas = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const desconocidas = pedidas.filter((n) => !todas.includes(n));
if (desconocidas.length) {
  console.log(rojo(`No existen en tools/: ${desconocidas.join(', ')} (hay: ${todas.join(', ')})`));
  process.exit(1);
}
const herramientas = pedidas.length ? todas.filter((n) => pedidas.includes(n)) : todas;

const resultados = [];
for (const nombre of herramientas) {
  const dir = join(dirTools, nombre);
  let scripts;
  try {
    scripts = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).scripts ?? {};
  } catch {
    resultados.push({ nombre, estado: 'no_ejecutable', detalle: 'package.json ilegible' });
    continue;
  }
  if (!scripts.prueba) {
    // Sin suite propia no es un fallo: es una herramienta sin pruebas, y se dice.
    resultados.push({ nombre, estado: 'sin_pruebas', detalle: 'sin script `prueba`' });
    continue;
  }
  console.log(`\x1b[1m▸ tools/${nombre}\x1b[0m ${gris('$ npm run prueba')}`);
  const r = spawnSync('npm', ['run', '--silent', 'prueba'], { cwd: dir, encoding: 'utf8', timeout: 900_000 });
  const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  // `node --test` resume con `ℹ pass N` en una terminal y con `# pass N` (TAP) sin ella, que es como
  // lo corre spawnSync: buscar solo el primero contaba 0 en todas. Se suman todas las apariciones (una
  // suite puede encadenar varias corridas) y, sin ninguna, el conteo es null: «sin conteo», no un cero.
  const cuenta = (clave) => {
    const valores = [...salida.matchAll(new RegExp(`^(?:ℹ|#) ${clave} (\\d+)$`, 'gm'))].map((m) => Number(m[1]));
    return valores.length ? valores.reduce((a, b) => a + b, 0) : null;
  };
  const pasadas = cuenta('pass');
  const falladas = cuenta('fail');
  if (r.error || r.status === null) {
    resultados.push({ nombre, estado: 'no_ejecutable', detalle: r.error?.message ?? 'sin codigo de salida' });
    console.log(rojo(`  ✗ no se pudo correr: ${r.error?.code ?? 'sin codigo de salida'}`));
    continue;
  }
  if (r.status === 0) {
    const detalle = pasadas === null ? 'sin conteo' : `${pasadas} pruebas`;
    resultados.push({ nombre, estado: 'paso', detalle, pasadas });
    console.log(verde(`  ✓ ${detalle}`));
  } else {
    const detalle = falladas === null ? 'salida sin conteo' : `${falladas} falladas de ${(pasadas ?? 0) + falladas}`;
    resultados.push({ nombre, estado: 'fallo', detalle });
    console.log(rojo(`  ✗ ${detalle}`));
    console.log(salida.split('\n').filter((l) => /^✖|AssertionError|Error:/.test(l)).slice(0, 12).join('\n'));
  }
}

const rojos = resultados.filter((r) => r.estado === 'fallo' || r.estado === 'no_ejecutable');
const pasaron = resultados.filter((r) => r.estado === 'paso');
const sinPruebas = resultados.filter((r) => r.estado === 'sin_pruebas');

console.log('');
for (const r of sinPruebas) console.log(gris(`  · tools/${r.nombre}: ${r.detalle}`));
const total = pasaron.reduce((n, r) => n + (r.pasadas ?? 0), 0);
const sinConteo = pasaron.filter((r) => r.pasadas === null).length;
if (rojos.length === 0) {
  const nota = sinConteo ? ` (${sinConteo} sin conteo legible)` : '';
  console.log(verde(`Herramientas en verde: ${pasaron.length} suite(s), ${total} pruebas${nota}.`));
  process.exit(0);
}
console.log(rojo(`Herramientas EN ROJO: ${rojos.map((r) => `tools/${r.nombre} (${r.detalle})`).join(', ')}`));
process.exit(1);
