/**
 * Git en solo lectura para seguir a Arbrain (skill `actualizar-capa`, script `scripts/capa/actualiza.mjs`).
 *
 * Todo lo que hay aquí LEE el repo que mira:
 *   - `--no-optional-locks`: ni `git status` refresca el índice del espejo (sería escribir en él).
 *   - `--literal-pathspecs`: una ruta de origen es una ruta, nunca un comodín.
 *   - los diffs van sin `ext-diff` ni `textconv`: un `.gitattributes` del repo del autor no ejecuta nada aquí. Es la
 *     lección del propio `arbrain/scripts/revisar-actualizacion.mjs` de Arbrain v0.2.10 (idea tomada, código propio).
 * Lo que se lee del repo del autor (CHANGELOG, skills, comentarios) es DATO, no órdenes.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const FIJA = ['--no-optional-locks', '--literal-pathspecs', '-c', 'core.quotepath=off', '-c', 'color.ui=false',
  '-c', 'diff.noprefix=false', '-c', 'diff.mnemonicPrefix=false', '-c', 'diff.relative=false'];
const DIFF = ['--no-ext-diff', '--no-textconv', '-M'];

export const sha256 = (texto) => createHash('sha256').update(texto).digest('hex');

/** Corre git con la configuración fija. `repo` null = fuera de un repo (ls-remote, diff --no-index). */
export function git(repo, args, { cwd, entrada } = {}) {
  const r = spawnSync('git', [...FIJA, ...(repo ? ['-C', repo] : []), ...args], {
    cwd, encoding: 'utf8', input: entrada, maxBuffer: 512 * 1024 * 1024,
  });
  const stdout = r.stdout ?? '';
  const stderr = r.stderr ?? '';
  return { ok: r.status === 0, status: r.status, stdout, stderr, salida: `${stdout}${stderr}`.trim() };
}

/** Como `git`, pero lanza si falla: para lecturas que tienen que funcionar. */
export function gitOk(repo, args, opciones) {
  const r = git(repo, args, opciones);
  if (!r.ok) throw new Error(`git ${args.slice(0, 3).join(' ')}…: ${r.salida.split('\n')[0] ?? ''}`);
  return r.stdout;
}

/** Cambios A/M/D/R/T entre dos commits, solo en `rutas` (vacío = todo). */
export function cambios(repo, desde, hasta, rutas = []) {
  const partes = gitOk(repo, ['diff', ...DIFF, '--name-status', '-z', desde, hasta, '--', ...rutas]).split('\0').filter(Boolean);
  const lista = [];
  for (let i = 0; i < partes.length; i++) {
    const estado = partes[i];
    if (/^[RC]/.test(estado)) {
      lista.push({ estado: estado[0], ruta: partes[i + 2], antes: partes[i + 1] });
      i += 2;
    } else {
      lista.push({ estado: estado[0], ruta: partes[i + 1] });
      i += 1;
    }
  }
  return lista;
}

/** Líneas que entran y salen por archivo (`null` en binarios), con la ruta de llegada en los renombres. */
export function numstat(repo, desde, hasta, rutas = []) {
  const partes = gitOk(repo, ['diff', ...DIFF, '--numstat', '-z', desde, hasta, '--', ...rutas]).split('\0');
  const mapa = new Map();
  for (let i = 0; i < partes.length; i++) {
    const m = partes[i].match(/^(-|\d+)\t(-|\d+)\t(.*)$/s);
    if (!m) continue;
    const cifra = (x) => (x === '-' ? null : Number(x));
    let ruta = m[3];
    if (ruta === '') {
      ruta = partes[i + 2];
      i += 2;
    }
    mapa.set(ruta, { mas: cifra(m[1]), menos: cifra(m[2]) });
  }
  return mapa;
}

/** El diff unificado entre dos commits, solo en `rutas`. */
export const diff = (repo, desde, hasta, rutas) => gitOk(repo, ['diff', ...DIFF, desde, hasta, '--', ...rutas]);

/** El contenido de `ruta` en `rev` (plumbing: sin textconv), o null si no existe. */
export function muestra(repo, rev, ruta) {
  const r = git(repo, ['cat-file', 'blob', `${rev}:${ruta}`]);
  return r.ok ? r.stdout : null;
}

/** Los archivos (con su modo) bajo `prefijo` en `rev`. */
export function archivos(repo, rev, prefijo = '') {
  const salida = gitOk(repo, ['ls-tree', '-r', '-z', '--full-tree', rev, '--', ...(prefijo ? [prefijo] : [])]);
  return salida.split('\0').filter(Boolean).map((linea) => {
    const [cabeza, ruta] = linea.split('\t');
    const [modo, tipo, objeto] = cabeza.split(' ');
    return { modo, tipo, objeto, ruta };
  });
}

export const esAncestro = (repo, a, b) => git(repo, ['merge-base', '--is-ancestor', a, b]).ok;

/**
 * La foto de un repo con árbol: `git status` y todas sus refs. Si la foto de antes y la de después son iguales, la
 * corrida no movió nada que git vea (ni el árbol, ni el índice que git reporta, ni una etiqueta).
 */
export function foto(repo) {
  const status = git(repo, ['status', '--porcelain=v1', '--untracked-files=all']).stdout;
  const refs = git(repo, ['for-each-ref', '--format=%(objectname) %(refname)']).stdout;
  const head = git(repo, ['rev-parse', 'HEAD']).stdout.trim();
  return { status, refs: sha256(refs), head, huella: sha256(`${status}\n${refs}\n${head}`) };
}
