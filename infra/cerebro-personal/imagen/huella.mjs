#!/usr/bin/env node
/**
 * Huellas para la prueba, sin imprimir contenido (la carpeta de datos tiene la contraseña de la app):
 *
 *   huella.mjs carpeta <ruta> [--excluye a,b]  → { archivos, sha256, porCarpeta: { <primer nivel>: n } }
 *       sha256 combinado de (ruta relativa + sha256 del contenido) de cada archivo normal, en orden.
 *   huella.mjs archivos <raiz> <ruta>...        → { <ruta>: "sha256:…" | null }
 */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import { join, relative } from 'node:path';

const sha = (b) => createHash('sha256').update(b).digest('hex');

function recorre(raiz, excluye) {
  const fuera = [];
  const anda = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, e.name);
      const rel = relative(raiz, ruta);
      if (excluye.includes(rel.split('/')[0])) continue;
      if (e.isDirectory()) anda(ruta);
      else if (e.isFile()) fuera.push([rel, sha(readFileSync(ruta))]);
      else if (e.isSymbolicLink()) fuera.push([rel, `enlace:${readlinkSync(ruta)}`]);
      // sockets y tuberías (motor.sock) no tienen contenido que comparar
    }
  };
  anda(raiz);
  return fuera.sort(([a], [b]) => a.localeCompare(b));
}

const [orden, raiz, ...resto] = process.argv.slice(2);
if (orden === 'carpeta') {
  const i = resto.indexOf('--excluye');
  const excluye = i >= 0 ? resto[i + 1].split(',') : [];
  const lista = existsSync(raiz) ? recorre(raiz, excluye) : [];
  const porCarpeta = {};
  for (const [rel] of lista) { const c = rel.includes('/') ? rel.split('/')[0] : '(raíz)'; porCarpeta[c] = (porCarpeta[c] ?? 0) + 1; }
  console.log(JSON.stringify({ archivos: lista.length, sha256: `sha256:${sha(lista.map(([r, h]) => `${r}\0${h}`).join('\n'))}`, porCarpeta, excluidas: excluye }));
} else if (orden === 'archivos') {
  const fuera = {};
  for (const r of resto) {
    const p = join(raiz, r);
    fuera[r] = existsSync(p) && lstatSync(p).isFile() ? `sha256:${sha(readFileSync(p))}` : null;
  }
  console.log(JSON.stringify(fuera));
} else {
  console.error('uso: huella.mjs carpeta <ruta> [--excluye a,b] | archivos <raiz> <ruta>...');
  process.exit(64);
}
