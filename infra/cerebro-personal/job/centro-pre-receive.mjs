#!/usr/bin/env node
/**
 * Hook pre-receive del centro (el repo del cerebro en el VPS). Lo instala `sincroniza.mjs crea-centro` con
 * `core.hooksPath` apuntando a una carpeta de la imagen que ninguna instancia puede escribir. Es la segunda línea:
 * el job de cada lado ya revisa lo mismo, pero el centro no confía en el otro lado.
 *
 * Rechaza el empuje entero (exit 1, con el motivo de vuelta al que empuja) si:
 *   - toca una ref que no sea refs/heads/main (la versión declarada no se cambia empujando);
 *   - borra o reescribe main (además: receive.denyDeletes y receive.denyNonFastForwards);
 *   - intenta crear main por el túnel: el cerebro lo funda el VPS;
 *   - un commit nuevo trae una ruta que no viaja, un enlace simbólico o un submódulo;
 *   - un commit nuevo no lleva `Arbrain-Version:` o lleva otra que la declarada en el centro.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { REF_VERSION, RAMA, motivoNoViaja } from './politica.mjs';

const CERO = /^0+$/;
const git = (args) => {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, stdout: r.stdout ?? '' };
};
const fallos = [];
const tunel = process.env.CEREBRO_VIA === 'tunel';
const quien = tunel ? `«${process.env.CEREBRO_DE ?? 'desconocido'}» por el túnel` : 'el VPS (local)';

const declarada = git(['cat-file', 'blob', REF_VERSION]);
if (!declarada.ok) fallos.push('el centro no tiene versión de Arbrain declarada (sincroniza.mjs declara-version)');
const version = declarada.stdout.trim();

for (const l of readFileSync(0, 'utf8').split('\n').filter(Boolean)) {
  const [viejo, nuevo, ref] = l.split(' ');
  if (ref !== `refs/heads/${RAMA}`) { fallos.push(`${ref}: solo se acepta refs/heads/${RAMA}`); continue; }
  if (CERO.test(nuevo)) { fallos.push(`${ref}: no se borra`); continue; }
  if (CERO.test(viejo) && tunel) { fallos.push(`${ref}: el cerebro del centro lo funda el VPS, no se crea por el túnel`); continue; }
  if (!CERO.test(viejo) && !git(['merge-base', '--is-ancestor', viejo, nuevo]).ok) { fallos.push(`${ref}: no es avance rápido (nunca se reescribe la historia)`); continue; }
  const nuevos = git(['rev-list', nuevo, '--not', '--all']).stdout.split('\n').filter(Boolean);
  for (const c of nuevos) {
    const corto = c.slice(0, 7);
    const trailer = git(['log', '-1', '--format=%(trailers:key=Arbrain-Version,valueonly,separator=%x2C)', c]).stdout.trim();
    if (!trailer) fallos.push(`${corto}: sin trailer Arbrain-Version`);
    else if (trailer !== version) fallos.push(`${corto}: hecho con Arbrain ${trailer.split(' ')[0]} y el centro declara ${version.split(' ')[0] || '(nada)'}`);
    for (const e of git(['ls-tree', '-r', '-z', '--full-tree', c]).stdout.split('\0').filter(Boolean)) {
      const tab = e.indexOf('\t');
      const [modo, tipo] = e.slice(0, tab).split(' ');
      const ruta = e.slice(tab + 1);
      if (tipo !== 'blob' || !['100644', '100755'].includes(modo)) fallos.push(`${corto}: ${ruta} no es un archivo normal (${modo})`);
      const motivo = motivoNoViaja(ruta);
      if (motivo) fallos.push(`${corto}: ${ruta} → ${motivo}`);
    }
  }
}

if (fallos.length) {
  process.stderr.write(`CENTRO_RECHAZA empuje de ${quien}:\n${[...new Set(fallos)].slice(0, 20).map((f) => `  · ${f}`).join('\n')}\n`);
  process.exit(1);
}
process.exit(0);
