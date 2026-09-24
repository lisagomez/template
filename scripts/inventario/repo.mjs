/**
 * Lee el estado real del repo para el inventario: archivos (los que git rastrea mas los
 * nuevos no ignorados — una herramienta recien creada todavia no esta en git y es justo
 * la que hay que ver), el indice, y los CLIs impresos del manifiesto de la imprenta.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { descubre, cruza } from './nucleo.mjs';

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const RUTA_INDICE = 'inventario/activos.json';

const git = (raiz, args) => execFileSync('git', ['-C', raiz, ...args], { encoding: 'utf8' })
  .split('\n').filter(Boolean);

export function listaArchivos(raiz) {
  const todos = new Set([
    ...git(raiz, ['ls-files']),
    ...git(raiz, ['ls-files', '--others', '--exclude-standard']),
  ]);
  return [...todos].filter((a) => existsSync(join(raiz, a))).sort();
}

export function clisImpresos(raiz) {
  const ruta = join(raiz, '.claude/imprenta/manifiesto.json');
  if (!existsSync(ruta)) return [];
  const m = JSON.parse(readFileSync(ruta, 'utf8'));
  return (m.servicios ?? []).filter((s) => s.estado === 'cli-impreso' && s.slug).map((s) => s.slug);
}

/** Todo lo que el detector, la vista y el export necesitan, leido una vez. */
export function cargaRepo(raiz = RAIZ) {
  const indice = JSON.parse(readFileSync(join(raiz, RUTA_INDICE), 'utf8'));
  const archivos = listaArchivos(raiz);
  const clis = clisImpresos(raiz);
  const existe = (ruta) => (ruta.startsWith('cli:') ? clis.includes(ruta.slice(4)) : existsSync(join(raiz, ruta)));
  const unidades = descubre(indice, archivos, clis);
  const { porActivo, hallazgos } = cruza(indice, unidades, existe);
  const leeBytes = (a) => (existsSync(join(raiz, a)) ? readFileSync(join(raiz, a)) : null);
  return { raiz, indice, archivos, clis, existe, unidades, porActivo, hallazgos, leeBytes };
}
