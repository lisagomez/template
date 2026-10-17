/**
 * Resolucion de la ref del corpus de casos-trampa — compartida por los TRES scripts que lo
 * leen: `audita-fugas.mjs`, `verifica-gobernanza.mjs` y `regresion-skills.mjs`.
 *
 * Vivia copiada en los tres, con el mismo bucle `['golden-sets', 'origin/golden-sets']`, y
 * por eso el mismo punto ciego estaba en los tres a la vez: la ref local se prefiere a la
 * remota —correcto, es donde se reescriben las entradas, y un clon fresco no tiene local—
 * pero una rama local **rezagada** ganaba igual, en silencio.
 *
 * Medido el 2026-08-31 con la local 8 commits por detras:
 *   - `audita:fugas` daba 13 entradas "sin declarar" que en `origin/` ya estaban declaradas.
 *     Trabajo inventado, que es el ruido.
 *   - `regresion -- --trampa` decia **21/21 en verde, promovible** habiendo dejado sin
 *     correr el caso mas nuevo, que en su vista no existia. Esa es la señal: un CDC
 *     aprobable con un caso-trampa de menos y sin que nada lo dijera.
 *
 * El corte es solo para el ancestro ESTRICTO. Si la rama ha divergido hay commits propios
 * sin subir, y eso es el flujo normal de edicion del corpus, no un error.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

export const RAMA_CORPUS = 'golden-sets';
export const REF_REMOTA = `origin/${RAMA_CORPUS}`;

const git = (raiz, args, extra = {}) =>
  execFileSync('git', args, { cwd: raiz, encoding: 'utf8', ...extra });

const existe = (raiz, ref) => {
  try { git(raiz, ['rev-parse', '--verify', '--quiet', ref], { stdio: 'ignore' }); return true; }
  catch { return false; }
};

/**
 * @returns {{ref: string|null, detras: number}}
 *   `ref`    — la que hay que leer (local primero, remota como respaldo, `null` si no hay
 *              ninguna: clon con `--single-branch`, y ahi C2 capa B no esta).
 *   `detras` — commits que le faltan a la local para alcanzar a la remota, y **solo** cuando
 *              es ancestro estricto. `0` significa al dia, divergida, o sin par que comparar.
 *              No usa red: compara refs que ya estan en el repo, asi que el gate no depende
 *              de la conectividad — pero tampoco ve lo que no se haya traido con `fetch`.
 */
export function estadoCorpus(raiz) {
  const local = existe(raiz, RAMA_CORPUS);
  const remota = existe(raiz, REF_REMOTA);
  let detras = 0;
  if (local && remota) {
    try {
      // Con las dos en el mismo commit tambien es ancestro; ahi `rev-list --count` da 0 y no
      // hay nada que avisar. Por eso el conteo decide, no el `is-ancestor` a secas.
      git(raiz, ['merge-base', '--is-ancestor', RAMA_CORPUS, REF_REMOTA], { stdio: 'ignore' });
      detras = Number(git(raiz, ['rev-list', '--count', `${RAMA_CORPUS}..${REF_REMOTA}`]).trim()) || 0;
    } catch { /* divergida: hay trabajo local, es legitimo */ }
  }
  return { ref: local ? RAMA_CORPUS : remota ? REF_REMOTA : null, detras };
}

/** El aviso, en un solo sitio para que los tres scripts digan lo mismo y el remedio exacto. */
export function avisoRezago(detras) {
  return [
    `\nLa rama local ${RAMA_CORPUS} esta ${detras} commit(s) por detras de ${REF_REMOTA}.`,
    'Leer ahi mide un corpus que ya no es el vigente, y el fallo sale en las dos',
    'direcciones: trabajo inventado, o verde sobre un corpus al que le faltan casos.',
    `\n  git branch -f ${RAMA_CORPUS} ${REF_REMOTA}`,
    `  # o, si lo editas en un worktree FUERA del repo:  git -C <ese worktree> merge --ff-only ${REF_REMOTA}\n`,
  ].join('\n');
}

/**
 * Los worktrees que tienen el corpus sacado (en su rama, o con `casos-trampa.md` en la raiz
 * aunque esten separados) y cuelgan DENTRO de otro worktree: ahi se llega leyendo el
 * directorio, sin ir a buscar la rama. El de edicion vivio en `.claude/worktrees/` del
 * 2026-08-28 al 2026-10-17 —ignorado por git y por la busqueda del arnes, pero a un `ls` de
 * distancia— y lo recomendaba el propio aviso de rezago. Fuera del repo es como se edita.
 * @returns {string[]} sus rutas; vacio si no hay ninguno o no hay git
 */
export function corpusEnDisco(raiz) {
  let lista;
  try { lista = git(raiz, ['worktree', 'list', '--porcelain'], { stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { return []; }
  const arboles = lista.split('\n\n').map((bloque) => {
    const ruta = bloque.match(/^worktree (.+)$/m)?.[1];
    if (!ruta || !existsSync(ruta)) return null;
    return { ruta: realpathSync(ruta), rama: bloque.match(/^branch (.+)$/m)?.[1] ?? null };
  }).filter(Boolean);
  const cuelgaDeOtro = (ruta) => arboles.some((otro) => otro.ruta !== ruta && ruta.startsWith(otro.ruta + sep));
  return arboles
    .filter(({ ruta, rama }) => rama === `refs/heads/${RAMA_CORPUS}` || existsSync(join(ruta, 'casos-trampa.md')))
    .filter(({ ruta }) => cuelgaDeOtro(ruta))
    .map(({ ruta }) => ruta);
}

/** Siembras de `corpusEnDisco` sobre un repo desechable: [nombre, donde, que saca, esperados]. */
export const SIEMBRAS_CORPUS = [
  ['el corpus en un worktree dentro del repo', ['.claude', 'worktrees', 'corpus'], [RAMA_CORPUS], 1],
  ['el corpus separado (sin rama) dentro del repo', ['.claude', 'worktrees', 'corpus'], ['--detach', RAMA_CORPUS], 1],
  ['la rama del corpus dentro del repo, aun sin archivos', ['.claude', 'worktrees', 'corpus'], ['--no-checkout', RAMA_CORPUS], 1],
  ['control: el corpus en un worktree fuera del repo', ['..', 'fuera'], [RAMA_CORPUS], 0],
  ['control: otro worktree dentro del repo, sin el corpus', ['.claude', 'worktrees', 'otra'], ['--detach', 'main'], 0],
];

/** Corre las siembras; devuelve las que `corpusEnDisco` no ve como debe. */
export function pruebaCorpusEnDisco() {
  const base = mkdtempSync(join(tmpdir(), 'siembra-corpus-'));
  const repo = join(base, 'repo');
  const g = (...args) => git(repo, ['-c', 'user.name=siembra', '-c', 'user.email=siembra@local',
    '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    mkdirSync(repo);
    g('init', '-q', '-b', 'main');
    writeFileSync(join(repo, 'README.md'), 'repo\n');
    g('add', '.'); g('commit', '-qm', 'base');
    g('checkout', '-q', '--orphan', RAMA_CORPUS); g('rm', '-rqf', '.');
    writeFileSync(join(repo, 'casos-trampa.md'), 'siembra\n');
    g('add', '.'); g('commit', '-qm', 'corpus'); g('checkout', '-q', 'main');
    return SIEMBRAS_CORPUS.filter(([, donde, saca, esperados]) => {
      const ruta = join(repo, ...donde);
      g('worktree', 'add', '-q', ruta, ...saca);
      const vistos = corpusEnDisco(repo).length;
      g('worktree', 'remove', '--force', ruta);
      return vistos !== esperados;
    }).map(([nombre]) => nombre);
  } catch (e) {
    return [`el repo desechable no se pudo montar: ${e.message.split('\n')[0]}`];
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}
