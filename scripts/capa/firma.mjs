/**
 * La firma de Arbrain, verificada como la verifica su propio instalador (INSTALAR.md, PASO 3) y nada más
 * permisiva: etiqueta `vX.Y.Z` anotada, firma SSH contra un ancla que vive FUERA de los dos repos, y la copia
 * que se lee con HEAD = la etiqueta. Lo usan `pinea.mjs` (el lock de la capa) y la skill que trae versiones.
 *
 * Tres reglas que no se negocian:
 *   1. **Nunca `latest` ni una rama**: solo una etiqueta `vX.Y.Z`. Un nombre que se mueve no se puede firmar.
 *   2. **El ancla no se edita para que algo pase.** El lock guarda su sha256; si cambió, la verificación falla
 *      aunque la firma cuadre, y quien la cambió tiene que explicarlo en un CDC.
 *   3. **Leer no escribe.** Verificar no hace checkout, ni fetch, ni toca el árbol: `git status` queda igual.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const URL_FUENTE = 'https://github.com/arbrain-ai/arbrain.git';
/** El ancla oficial: la misma ruta que usa el actualizador de Arbrain (`actualizar-arbrain/verificar.py`). */
export const ANCLA_OFICIAL = '~/.config/arbrain/firmas-permitidas';
/** El espejo de solo lectura: un clon con `--origin dani`, fuera del template. */
export const FUENTE_OFICIAL = '~/.cache/capa-arbrain/fuente';
export const PATRON_ETIQUETA = /^v\d+\.\d+\.\d+$/;

export const expande = (ruta) => (ruta.startsWith('~/') ? join(homedir(), ruta.slice(2)) : ruta);

const git = (repo, args, ancla) => {
  const firma = ancla
    ? ['-c', 'gpg.format=ssh', '-c', 'gpg.ssh.program=ssh-keygen', '-c', `gpg.ssh.allowedSignersFile=${ancla}`]
    : [];
  const r = spawnSync('git', [...firma, '-C', repo, ...args], { encoding: 'utf8' });
  return { ok: r.status === 0, salida: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(), stdout: (r.stdout ?? '').trim() };
};

/** La huella del ancla: su sha256 y los principales que autoriza (sin imprimir llaves). */
export function huellaAncla(rutaAncla) {
  const ruta = expande(rutaAncla);
  if (!existsSync(ruta)) return null;
  const contenido = readFileSync(ruta);
  const principales = contenido
    .toString('utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)[0]);
  return { sha256: createHash('sha256').update(contenido).digest('hex'), principales };
}

/**
 * Verifica una etiqueta en un repo local. No escribe nada.
 * @returns {{ ok: boolean, motivo?: string, etiqueta: string, commit?: string, objeto?: string, principal?: string, llave?: string, salida?: string }}
 */
export function verificaEtiqueta({ repo, etiqueta, ancla = ANCLA_OFICIAL }) {
  const r = { ok: false, etiqueta };
  if (!PATRON_ETIQUETA.test(etiqueta ?? '')) return { ...r, motivo: `«${etiqueta}» no es una etiqueta vX.Y.Z: nunca latest ni una rama` };
  const rutaAncla = expande(ancla);
  if (!existsSync(rutaAncla)) return { ...r, motivo: `no existe el ancla de firmas (${ancla}): sin ancla no hay verificación` };
  const tipo = git(repo, ['cat-file', '-t', `refs/tags/${etiqueta}`]);
  if (!tipo.ok) return { ...r, motivo: `la etiqueta ${etiqueta} no existe en el espejo` };
  if (tipo.stdout !== 'tag') return { ...r, motivo: `${etiqueta} es una etiqueta ligera (${tipo.stdout}): no lleva firma` };
  const v = git(repo, ['verify-tag', etiqueta], rutaAncla);
  const buena = v.salida.match(/Good "git" signature for (\S+) with (\S+) key (SHA256:\S+)/);
  const commit = git(repo, ['rev-parse', `${etiqueta}^{commit}`]).stdout;
  const objeto = git(repo, ['rev-parse', `refs/tags/${etiqueta}`]).stdout;
  if (!v.ok || !buena) return { ...r, commit, objeto, motivo: 'la firma no verifica contra el ancla', salida: v.salida };
  return { ok: true, etiqueta, commit, objeto, principal: buena[1], llave: buena[3], salida: v.salida };
}

/** HEAD de la copia que se lee = la etiqueta (lo que exige el PASO 3: se lee lo verificado, no otra cosa). */
export function headEsEtiqueta({ repo, etiqueta }) {
  const head = git(repo, ['rev-parse', 'HEAD']).stdout;
  const commit = git(repo, ['rev-parse', `${etiqueta}^{commit}`]).stdout;
  return { ok: Boolean(head) && head === commit, head, commit };
}

/** `git status --porcelain` del espejo: la prueba de que leer no escribió. */
export const estadoArbol = (repo) => git(repo, ['status', '--porcelain', '--untracked-files=all']).stdout;

/** Las etiquetas vX.Y.Z del espejo, de la más nueva a la más vieja. */
export const etiquetas = (repo) =>
  git(repo, ['tag', '-l', 'v*', '--sort=-v:refname']).stdout.split('\n').filter((t) => PATRON_ETIQUETA.test(t));

export const versionGit = () => spawnSync('git', ['--version'], { encoding: 'utf8' }).stdout.trim().replace('git version ', '');
