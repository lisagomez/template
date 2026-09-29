#!/usr/bin/env node
/**
 * Prueba de no pérdida de un README reestructurado (skill `readme`, comando `reestructura`).
 *
 * Compara el README de una ref (por defecto, la base de la rama: `git merge-base HEAD main`)
 * con el del árbol de trabajo, línea a línea: conservadas, movidas, reescritas con motivo y
 * borradas sin justificar, y las cifras del original que ya no aparecen. Rojo si hay alguna
 * línea borrada sin motivo o alguna cifra perdida: reordenar para producto se admite,
 * borrar en silencio no.
 *
 * Uso:  node scripts/no-perdida-readme.mjs <ruta> [--desde <ref>] [--motivos <archivo.json>] [--detalle] [--json]
 *   --motivos  JSON { "motivos": [{ "antes": "<línea original>", "motivo": "<por qué>" }] }
 *   --detalle  lista cada línea reescrita con su motivo, las borradas y las cifras perdidas
 * Exit: 0 sin pérdida · 1 con pérdida · 2 uso incorrecto.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { comparaNoPerdida } from './lib/no-perdida.mjs';
import { esqueleto } from './lib/readmes.mjs';

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;
const git = (args) => execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const valorDe = (b) => { const i = process.argv.indexOf(b); return i === -1 ? null : process.argv[i + 1]; };

function entrada() {
  const ruta = process.argv.slice(2).find((a, i, t) => !a.startsWith('--') && !['--desde', '--motivos'].includes(t[i - 1]));
  if (!ruta || !existsSync(join(RAIZ, ruta))) {
    console.error('uso: node scripts/no-perdida-readme.mjs <ruta-del-README> [--desde <ref>] [--motivos <archivo.json>]');
    process.exit(2);
  }
  const desde = valorDe('--desde') ?? git(['merge-base', 'HEAD', 'main']);
  const archivoMotivos = valorDe('--motivos');
  const motivos = archivoMotivos ? JSON.parse(readFileSync(join(RAIZ, archivoMotivos), 'utf8')).motivos : [];
  return { ruta, desde, motivos };
}

function imprimeDetalle(r) {
  for (const x of r.reescritas) console.log(gris(`    reescrita (l.${x.n}) «${x.t.slice(0, 90)}» — ${x.motivo}`));
  for (const x of r.sinJustificar) console.log(rojo(`    borrada sin motivo (l.${x.n}) «${x.t.slice(0, 90)}»`));
  for (const c of r.cifrasPerdidas) console.log(rojo(`    cifra perdida «${c.cifra}» (faltan ${c.faltan})`));
  for (const t of r.motivosSobrantes) console.log(gris(`    motivo sin uso (la línea sigue tal cual): «${t.slice(0, 90)}»`));
}

function main() {
  const { ruta, desde, motivos } = entrada();
  const antes = git(['show', `${desde}:${ruta}`]);
  const despues = readFileSync(join(RAIZ, ruta), 'utf8');
  const r = comparaNoPerdida(antes, despues, motivos);
  const ok = r.sinJustificar.length === 0 && r.cifrasPerdidas.length === 0;
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ruta, desde, ok, ...r }, null, 2));
    process.exit(ok ? 0 : 1);
  }
  console.log(`No pérdida: ${ruta} (${desde.slice(0, 7)} → árbol de trabajo)`);
  console.log(`  líneas no vacías: antes ${r.antes} · después ${r.despues}`);
  console.log(`  conservadas en su sitio ${r.conservadas.length} · movidas ${r.movidas.length}`
    + ` · reescritas con motivo ${r.reescritas.length} · borradas sin justificar ${r.sinJustificar.length}`
    + ` · nuevas ${r.nuevas} · cifras perdidas ${r.cifrasPerdidas.length}`);
  if (process.argv.includes('--detalle') || !ok) imprimeDetalle(r);
  console.log(gris('  esqueleto antes:'));
  for (const l of esqueleto(antes)) console.log(gris(`    ${l}`));
  console.log(gris('  esqueleto después:'));
  for (const l of esqueleto(despues)) console.log(gris(`    ${l}`));
  console.log(ok ? verde('  sin pérdida: 0 borradas sin justificar, 0 cifras perdidas') : rojo('  CON PÉRDIDA'));
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
