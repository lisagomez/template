/**
 * Traer y verificar las versiones de Arbrain sin escribir lo que no verifica.
 *
 * Las etiquetas nuevas se traen a una CUARENTENA (un clon `--bare --shared` desechable del espejo: pide prestados sus
 * objetos sin escribir en él), se verifican ahí y solo las que verifican pasan al espejo. Si una falla, el espejo no
 * recibe nada: ni la etiqueta, ni sus objetos, ni `FETCH_HEAD`.
 *
 * La verificación es la de `scripts/capa/firma.mjs` (la misma que el PASO 3 del instalador de Arbrain) más lo que su
 * actualizador oficial comprueba además (`.claude/skills/actualizar-arbrain/verificar.py` de v0.2.10, leído como dato;
 * código propio): el nombre interno de la etiqueta es el del ref, el `VERSION` de su commit dice lo mismo, la firma es
 * de un principal del ancla del lock, la versión continúa la del lock (nunca un regreso) y nadie movió una etiqueta
 * que el espejo ya tenía. Lo que NO se copia de él: allá una rotación de llaves reescribe el ancla; aquí el ancla
 * nunca se edita, y una rotación es una alerta para el CDC.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PATRON_ETIQUETA, verificaEtiqueta } from '../firma.mjs';
import { esAncestro, git, muestra } from './git.mjs';

export const version = (etiqueta) => etiqueta.slice(1).split('.').map(Number);

/** Orden semántico de dos etiquetas vX.Y.Z: <0, 0, >0. */
export function comparaVersion(a, b) {
  const [x, y] = [version(a), version(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

const ordena = (lista) => [...lista].sort((a, b) => comparaVersion(b, a));

/** Etiquetas vX.Y.Z de un repo: nombre → objeto de la etiqueta. */
export function etiquetasLocales(repo) {
  const salida = git(repo, ['for-each-ref', '--format=%(refname:strip=2) %(objectname)', 'refs/tags']).stdout;
  return new Map(salida.split('\n').map((l) => l.split(' ')).filter(([t]) => PATRON_ETIQUETA.test(t ?? '')));
}

/** Etiquetas vX.Y.Z del remoto (lectura de la red): nombre → objeto. `null` si el remoto no responde. */
export function etiquetasRemotas(remoto) {
  const r = git(null, ['ls-remote', '--tags', '--refs', remoto]);
  if (!r.ok) return { ok: false, motivo: r.salida.split('\n')[0] ?? 'el remoto no respondió' };
  const pares = r.stdout.split('\n').filter(Boolean).map((l) => {
    const [objeto, ref] = l.split('\t');
    return [ref.replace('refs/tags/', ''), objeto];
  });
  return { ok: true, etiquetas: new Map(pares.filter(([t]) => PATRON_ETIQUETA.test(t))) };
}

/** Las que el remoto movió (mismo nombre, otro objeto) y las nuevas, de la más nueva a la más vieja. */
export function comparaEtiquetas(locales, remotas) {
  const movidas = [...remotas].filter(([t, o]) => locales.has(t) && locales.get(t) !== o).map(([t]) => t);
  const nuevas = ordena([...remotas.keys()].filter((t) => !locales.has(t)));
  return { movidas, nuevas };
}

/** Clona el espejo en cuarentena y trae ahí `nuevas` (sin `+`: nada se fuerza). Devuelve la ruta y cómo limpiar. */
export function cuarentena({ espejo, remoto, nuevas }) {
  const dir = mkdtempSync(join(tmpdir(), 'capa-cuarentena-'));
  const limpia = () => rmSync(dir, { recursive: true, force: true });
  const repo = join(dir, 'cuarentena.git');
  const clon = git(null, ['clone', '--quiet', '--bare', '--shared', espejo, repo]);
  if (!clon.ok) {
    limpia();
    return { ok: false, motivo: `no pude preparar la cuarentena: ${clon.salida.split('\n')[0]}` };
  }
  const refspecs = nuevas.map((t) => `refs/tags/${t}:refs/tags/${t}`);
  const trae = git(repo, ['fetch', '--quiet', '--no-tags', remoto, ...refspecs]);
  if (!trae.ok) {
    limpia();
    return { ok: false, motivo: `no pude traer ${nuevas.join(', ')}: ${trae.salida.split('\n')[0]}` };
  }
  return { ok: true, repo, limpia };
}

/** Pasa al espejo SOLO etiquetas ya verificadas (sin forzar y sin escribir FETCH_HEAD). */
export function promueve({ espejo, cuarentena: repo, etiquetas }) {
  if (!etiquetas.length) return { ok: true };
  const refspecs = etiquetas.map((t) => `refs/tags/${t}:refs/tags/${t}`);
  const r = git(espejo, ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false', 'fetch', '--quiet', '--no-tags', '--no-write-fetch-head', repo, ...refspecs]);
  return r.ok ? { ok: true } : { ok: false, motivo: r.salida.split('\n')[0] };
}

/** Lo que `firma.mjs` no mira y el actualizador oficial sí: nombre interno, principal, VERSION y continuidad. */
function compruebaExtra({ repo, etiqueta, v, principales, base }) {
  const objeto = git(repo, ['cat-file', 'tag', `refs/tags/${etiqueta}`]).stdout;
  const nombre = objeto.match(/^tag (\S+)$/m)?.[1];
  if (nombre !== etiqueta) return `la etiqueta ${etiqueta} es en realidad «${nombre ?? '?'}» renombrada`;
  if (principales?.length && !principales.includes(v.principal)) {
    return `la firmó «${v.principal}», que no es un principal del ancla del lock (${principales.join(', ')})`;
  }
  const declarada = muestra(repo, v.commit, 'VERSION')?.trim();
  if (declarada !== etiqueta.slice(1)) return `el VERSION dentro de ${etiqueta} dice «${declarada ?? '(no existe)'}»`;
  if (base && !esAncestro(repo, base, v.commit)) return `${etiqueta} no continúa la historia del lock: no se regresa ni se salta de rama`;
  return null;
}

/** Verificación estricta de una etiqueta: la de firma.mjs y lo de `compruebaExtra`. No escribe nada. */
export function verificaEstricta({ repo, etiqueta, ancla, principales, base }) {
  const v = verificaEtiqueta({ repo, etiqueta, ancla });
  if (!v.ok) return v;
  const motivo = compruebaExtra({ repo, etiqueta, v, principales, base });
  return motivo ? { ...v, ok: false, motivo } : v;
}

/** La etiqueta destino: la pedida, o la más nueva de las que hay. */
export function eligeDestino({ pedida, disponibles }) {
  if (pedida) return disponibles.includes(pedida) ? { ok: true, etiqueta: pedida } : { ok: false, motivo: `la etiqueta ${pedida} no existe ni en el espejo ni en el remoto` };
  const [mas] = ordena(disponibles);
  return mas ? { ok: true, etiqueta: mas } : { ok: false, motivo: 'no hay ninguna etiqueta vX.Y.Z' };
}

/** Las etiquetas posteriores al lock que hay que verificar todas: una nueva sin firma válida bloquea, aunque no sea la elegida. */
export const posterioresAlLock = (disponibles, lock) => ordena(disponibles.filter((t) => comparaVersion(t, lock) > 0));
