#!/usr/bin/env node
/**
 * Gate de visibilidad (PRP-004, Fase 0): el monorepo lleva el ERP, y lo defendible no puede
 * vivir en un repo publico (ERP-MAESTRO §1.7). Este chequeo falla si el repo de `origin` es
 * visible sin credenciales.
 *
 * Como mide: pregunta a la API publica de GitHub SIN token. Un repo publico responde 200; uno
 * privado responde 404 a quien no tiene acceso, que es exactamente lo que ve un extrano. No usa
 * `gh` ni credenciales: corre igual en el servidor, donde no hay `gh`.
 *
 * Vive en `predeploy`, no en `validate`: necesita red, y `validate` corre sin ella.
 * Uso:  node scripts/verifica-privado.mjs [--repo dueno/nombre]
 *       node scripts/verifica-privado.mjs --push   (desde el hook pre-push: solo mide si lo que se
 *       empuja toca `erp/`; el resto del trabajo no se frena mientras el repo siga publico)
 * Exit: 0 privado · 1 publico · 2 no se pudo medir (sin red, o respuesta inesperada).
 */
import { execFileSync } from 'node:child_process';

const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;

/** `dueno/nombre` desde la URL de origin (https o ssh). */
export function repoDeOrigin(url) {
  const m = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(url.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

/** Archivos que cambian los refs que llegan por stdin al hook pre-push. */
function tocadosEnPush(entrada) {
  const CERO = /^0+$/;
  return entrada.split('\n').filter(Boolean).flatMap((linea) => {
    const [, local, , remoto] = linea.split(' ');
    if (!local || CERO.test(local)) return []; // borrado de rama: no sube nada
    const rango = CERO.test(remoto) ? [local, '--not', '--remotes=origin'] : [`${remoto}..${local}`];
    return execFileSync('git', ['log', '--format=', '--name-only', ...rango], { encoding: 'utf8' })
      .split('\n').filter(Boolean);
  });
}

async function main() {
  if (process.argv.includes('--push')) {
    const { readFileSync } = await import('node:fs');
    const tocados = tocadosEnPush(readFileSync(0, 'utf8'));
    if (!tocados.some((a) => a.startsWith('erp/'))) process.exit(0);
  }
  const i = process.argv.indexOf('--repo');
  const repo = i > 0 ? process.argv[i + 1]
    : repoDeOrigin(execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }));
  if (!repo) {
    console.error(rojo('No pude deducir dueno/nombre de origin; pasa --repo.'));
    process.exit(2);
  }
  let estado;
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { 'User-Agent': 'verifica-privado', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15000),
    });
    estado = r.status;
  } catch (e) {
    console.error(rojo(`No se pudo medir la visibilidad de ${repo} (${e.name}): sin red no hay veredicto.`));
    process.exit(2);
  }
  if (estado === 404) {
    console.log(verde(`✓ ${repo} no es visible sin credenciales (privado).`));
    process.exit(0);
  }
  if (estado === 200) {
    console.error(rojo(`✗ ${repo} es PUBLICO: el monorepo lleva el ERP y lo defendible no sale (§1.7).`));
    console.error('  Hazlo privado: gh repo edit <repo> --visibility private --accept-visibility-change-consequences');
    process.exit(1);
  }
  console.error(rojo(`Respuesta inesperada de GitHub (${estado}) para ${repo}: sin veredicto.`));
  process.exit(2);
}

if (process.argv[1] && process.argv[1].endsWith('verifica-privado.mjs')) main();
