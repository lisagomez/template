/**
 * La política del cerebro, en un solo lugar: qué ruta viaja, qué está negado, qué versión de Arbrain corre en este
 * lado y si la lista permitida cubre el CAPAS.json de esa versión. La usan el job (`sincroniza.mjs`), el hook del
 * centro (`centro-pre-receive.mjs`) y el driver de merge (`fusiona-registros.mjs`). Sin dependencias.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, posix } from 'node:path';

export const LISTA = JSON.parse(readFileSync(new URL('./lista-permitida.json', import.meta.url), 'utf8'));
export const REF_VERSION = 'refs/meta/version-arbrain';
export const RAMA = 'main';

const expande = (ruta) => (ruta.startsWith('~/') ? join(homedir(), ruta.slice(2)) : ruta);

/** Glob mínimo sobre el NOMBRE del archivo (`*` = cualquier cosa), sin distinguir mayúsculas. */
const globRe = (patron) => new RegExp(`^${patron.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'i');
const NEGADOS = LISTA.negados.map(globRe);

/** ¿El nombre de archivo cae en un patrón negado (llaves, bases, temporales)? */
export const esNegada = (ruta) => NEGADOS.some((re) => re.test(posix.basename(ruta)));

/**
 * ¿La ruta (relativa a la raíz de Arbrain, con `/`) viaja? Devuelve `null` si viaja o el motivo si no.
 * Sin `..`, sin rutas absolutas, sin barras dobles: lo que no es canónico no viaja.
 */
export function motivoNoViaja(ruta) {
  if (typeof ruta !== 'string' || !ruta || ruta.startsWith('/') || ruta.includes('\\') || ruta.split('/').some((s) => s === '' || s === '.' || s === '..')) {
    return 'ruta no canónica';
  }
  if (esNegada(ruta)) return 'nombre negado (llaves, bases de datos o temporales)';
  for (const [entrada] of Object.entries(LISTA.viaja)) {
    if (entrada.endsWith('/') ? ruta.startsWith(entrada) : ruta === entrada) return null;
  }
  const skill = /^\.claude\/skills\/([^/]+)\/.+/.exec(ruta);
  if (skill) return LISTA.skills_del_autor.includes(skill[1]) ? `skill del autor (${skill[1]}): viene con la versión, no del cerebro` : null;
  for (const [entrada, porque] of Object.entries(LISTA.no_viaja)) {
    if (entrada.endsWith('/') ? ruta.startsWith(entrada) : ruta === entrada) return `no viaja: ${porque}`;
  }
  return 'fuera de la lista permitida';
}

export const viaja = (ruta) => motivoNoViaja(ruta) === null;

/**
 * Pathspecs para `git add`: cada ruta que viaja y existe (en disco o rastreada, para que una baja también viaje),
 * y una por skill propia. Literales: nada de comodines que un nombre raro pueda ensanchar.
 */
export function pathspecs(raiz, rastreadas) {
  const hay = (e) => existsSync(join(raiz, e)) || rastreadas.some((r) => (e.endsWith('/') ? r.startsWith(e) : r === e));
  const specs = Object.keys(LISTA.viaja).filter(hay).map((e) => `:(literal)${e}`);
  const dirSkills = join(raiz, '.claude', 'skills');
  const enDisco = existsSync(dirSkills)
    ? readdirSync(dirSkills, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.isSymbolicLink()).map((d) => d.name)
    : [];
  const enRepo = rastreadas.filter((r) => r.startsWith('.claude/skills/')).map((r) => r.split('/')[2]);
  for (const s of new Set([...enDisco, ...enRepo])) if (!LISTA.skills_del_autor.includes(s)) specs.push(`:(literal).claude/skills/${s}/`);
  return specs;
}

/** `info/exclude` del repo del cerebro: lista blanca (todo fuera salvo lo que viaja) y los negados. */
export function exclusiones() {
  const lineas = [
    '# Generado por cerebro-sync: el repo del cerebro solo ve lo que viaja (lista-permitida.json).',
    '/*',
    '!/.claude/',
    '/.claude/*',
    ...Object.keys(LISTA.viaja).map((e) => `!/${e}`),
    '!/.claude/skills/',
  ];
  for (const s of LISTA.skills_del_autor) lineas.push(`/.claude/skills/${s}/`);
  lineas.push('# negados (no viajan aunque estén dentro de una ruta permitida)');
  for (const n of LISTA.negados) lineas.push(n);
  return `${lineas.join('\n')}\n`;
}

/** Contrasta la lista permitida con el CAPAS.json de la versión que corre: cada ruta «alumno» clasificada. */
export function revisaCapas(capas) {
  const fallos = [];
  const clasificadas = new Set([...Object.keys(LISTA.viaja), ...Object.keys(LISTA.no_viaja)]);
  for (const r of capas.alumno ?? []) if (!clasificadas.has(r)) fallos.push(`CAPAS.json trae «${r}» en alumno y la lista permitida no la clasifica`);
  const autor = new Set(capas.skills_del_autor ?? []);
  const nuestras = new Set(LISTA.skills_del_autor);
  for (const s of autor) if (!nuestras.has(s)) fallos.push(`skill del autor nueva «${s}»: sin revisar se sincronizaría como propia`);
  for (const s of nuestras) if (!autor.has(s)) fallos.push(`la skill «${s}» ya no es del autor: sin revisar empezaría a viajar`);
  return fallos;
}

const git = (args, opciones = {}) => {
  const r = spawnSync('git', args, { encoding: 'utf8', ...opciones });
  return { ok: r.status === 0, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim(), status: r.status };
};

/**
 * La versión de Arbrain de este lado, VERIFICADA: `VERSION` de la copia, su etiqueta `vX.Y.Z` anotada y firmada
 * contra el ancla (la misma verificación del PASO 3 de su instalador). Sin firma válida no hay versión.
 */
export function versionLocal({ arbrain, ancla = '~/.config/arbrain/firmas-permitidas' }) {
  const rutaVersion = join(arbrain, 'VERSION');
  if (!existsSync(rutaVersion)) return { ok: false, motivo: `no hay VERSION en ${arbrain}` };
  const version = readFileSync(rutaVersion, 'utf8').trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) return { ok: false, motivo: `VERSION no es X.Y.Z («${version}»)` };
  const etiqueta = `v${version}`;
  const rutaAncla = expande(ancla);
  if (!existsSync(rutaAncla)) return { ok: false, motivo: 'no hay ancla de firmas: sin ancla no hay versión verificada' };
  if (git(['-C', arbrain, 'cat-file', '-t', `refs/tags/${etiqueta}`]).stdout !== 'tag') return { ok: false, motivo: `${etiqueta} no es una etiqueta anotada en esta copia` };
  const v = git(['-C', arbrain, '-c', 'gpg.format=ssh', '-c', 'gpg.ssh.program=ssh-keygen', '-c', `gpg.ssh.allowedSignersFile=${rutaAncla}`, 'verify-tag', etiqueta]);
  if (!v.ok || !/Good "git" signature for \S+ with \S+ key SHA256:/.test(`${v.stdout}\n${v.stderr}`)) return { ok: false, motivo: `la firma de ${etiqueta} no verifica contra el ancla` };
  const commit = git(['-C', arbrain, 'rev-parse', `${etiqueta}^{commit}`]).stdout;
  return { ok: true, version, etiqueta, commit, marca: `${version} ${commit}\n` };
}

/** El id de blob de una marca de versión (lo que guarda la ref del centro), sin escribir nada. */
export function idDeMarca(marca) {
  const r = spawnSync('git', ['hash-object', '--stdin'], { input: marca, encoding: 'utf8' });
  return (r.stdout ?? '').trim();
}

/** El trailer que lleva cada commit del cerebro: con qué versión de Arbrain se hizo. */
export const trailerVersion = (v) => `Arbrain-Version: ${v.version} ${v.commit}`;
