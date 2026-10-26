#!/usr/bin/env node
/**
 * Pinea Arbrain para la capa: verifica la firma de una etiqueta en el espejo de solo lectura, comprueba que
 * la copia que se lee está en esa etiqueta (HEAD = etiqueta) y escribe el lock con la etiqueta, el commit y la
 * huella del ancla. Es la fase 1 del grafo `docs/goals/capa-arbrain-grafo.json` (lazo `l-firma`).
 *
 * Imprime lo mismo que el PASO 3 del instalador de Arbrain: `FIRMA_OK vX.Y.Z <commit>` o `FIRMA_FALLA vX.Y.Z`.
 * Con FIRMA_FALLA no escribe nada y sale con 1: no se sigue por otro camino.
 *
 * Uso: node scripts/capa/pinea.mjs [--etiqueta vX.Y.Z] [--fuente <espejo>] [--ancla <archivo>] [--escribe]
 *      node scripts/capa/pinea.mjs --comprueba     (re-verifica el lock vigente: firma, commit y ancla intacta)
 * Exit: 0 FIRMA_OK · 1 FIRMA_FALLA o el lock no cuadra · 2 uso.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANCLA_OFICIAL, FUENTE_OFICIAL, URL_FUENTE, expande, headEsEtiqueta, huellaAncla, verificaEtiqueta, versionGit,
} from './firma.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const LOCK = 'tools/capa/upstream.lock.json';
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;

const arg = (nombre) => {
  const i = process.argv.indexOf(nombre);
  return i === -1 ? null : process.argv[i + 1] ?? null;
};

export const leeLock = (base = raiz) => {
  const ruta = join(base, LOCK);
  return existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : null;
};

/** Re-verifica un lock: la etiqueta sigue firmada, apunta al mismo commit y el ancla no cambió. */
export function compruebaLock(lock, { fuente = FUENTE_OFICIAL } = {}) {
  const fallos = [];
  const huella = huellaAncla(lock.ancla.ruta);
  if (!huella) fallos.push(`no existe el ancla ${lock.ancla.ruta}`);
  else if (`sha256:${huella.sha256}` !== lock.ancla.sha256) fallos.push('el ancla cambió desde el lock: nunca se edita para que algo pase (CDC)');
  const v = verificaEtiqueta({ repo: expande(fuente), etiqueta: lock.etiqueta, ancla: lock.ancla.ruta });
  if (!v.ok) fallos.push(v.motivo);
  else if (v.commit !== lock.commit) fallos.push(`${lock.etiqueta} apunta a ${v.commit.slice(0, 7)} y el lock dice ${lock.commit.slice(0, 7)}`);
  return { ok: fallos.length === 0, fallos, verificacion: v };
}

function corre() {
  const fuente = arg('--fuente') ?? FUENTE_OFICIAL;
  const ancla = arg('--ancla') ?? ANCLA_OFICIAL;
  const repo = expande(fuente);
  if (!existsSync(join(repo, '.git'))) {
    console.error(rojo(`✗ no hay espejo en ${fuente}: git clone -q --origin dani ${URL_FUENTE} ${fuente}`));
    process.exit(2);
  }
  if (process.argv.includes('--comprueba')) {
    const lock = leeLock();
    if (!lock) { console.error(rojo(`✗ no hay ${LOCK}`)); process.exit(1); }
    const c = compruebaLock(lock, { fuente });
    console.log(c.ok ? verde(`FIRMA_OK ${lock.etiqueta} ${lock.commit.slice(0, 7)} (lock vigente)`) : rojo(`FIRMA_FALLA ${lock.etiqueta}`));
    for (const f of c.fallos) console.log(rojo(`  · ${f}`));
    process.exit(c.ok ? 0 : 1);
  }
  const etiqueta = arg('--etiqueta') ?? `v${readFileSync(join(repo, 'VERSION'), 'utf8').trim()}`;
  const v = verificaEtiqueta({ repo, etiqueta, ancla });
  const head = v.ok ? headEsEtiqueta({ repo, etiqueta }) : { ok: false };
  if (!v.ok || !head.ok) {
    console.log(rojo(`FIRMA_FALLA ${etiqueta}`));
    console.log(rojo(`  · ${v.ok ? `HEAD (${head.head?.slice(0, 7)}) no es ${etiqueta} (${head.commit?.slice(0, 7)}): se lee solo lo verificado` : v.motivo}`));
    if (v.salida) console.log(gris(v.salida.split('\n').map((l) => `    ${l}`).join('\n')));
    process.exit(1);
  }
  console.log(verde(`FIRMA_OK ${etiqueta} ${v.commit.slice(0, 7)}`));
  console.log(gris(`  firmada por ${v.principal} (${v.llave}) · ancla ${ancla} · HEAD = ${etiqueta}`));
  const huella = huellaAncla(ancla);
  const lock = {
    _porque: 'Arbrain pineado para la capa: lo que la capa adopta se lee SOLO de esta etiqueta firmada. Subir de versión es un CDC (skill de actualización, propuesta). El ancla no se edita para que algo pase: si su sha256 cambia, `pinea.mjs --comprueba` falla.',
    fuente: URL_FUENTE,
    espejo: fuente,
    etiqueta,
    commit: v.commit,
    objetoEtiqueta: v.objeto,
    firma: { formato: 'ssh', principal: v.principal, llave: v.llave },
    // Con el prefijo: un hex de 64 suelto parece un token para `audita:secretos`, y esto es una huella pública.
    ancla: { ruta: ancla, sha256: `sha256:${huella.sha256}`, principales: huella.principales },
    verificado: new Date().toISOString().slice(0, 10),
    git: versionGit(),
  };
  if (process.argv.includes('--escribe')) {
    writeFileSync(join(raiz, LOCK), `${JSON.stringify(lock, null, 2)}\n`);
    console.log(verde(`✓ lock escrito: ${LOCK}`));
  }
  console.log(JSON.stringify(lock, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) corre();
