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
    `\n  git -C .claude/worktrees/${RAMA_CORPUS} merge --ff-only ${REF_REMOTA}`,
    `  # o, sin worktree:  git branch -f ${RAMA_CORPUS} ${REF_REMOTA}\n`,
  ].join('\n');
}
