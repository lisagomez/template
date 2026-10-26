#!/usr/bin/env node
/**
 * El job del cerebro personal: sincroniza SOLO el cerebro (lista-permitida.json) de esta instancia con el centro,
 * que vive en el VPS y se alcanza por la red privada. Una corrida = una pasada (en la realidad la dispara una tarea
 * programada; aquí, la prueba). El repo del cerebro es aparte (~/.cerebro-sync/cerebro.git, árbol = la copia de
 * Arbrain): solo contiene rutas que viajan, así que una unión no puede escribir fuera de ellas.
 *
 *   node sincroniza.mjs                   una pasada
 *   node sincroniza.mjs crea-centro       (VPS) crea el repo central y declara la versión de Arbrain de este lado
 *   node sincroniza.mjs declara-version   (VPS) declara en el centro la versión de ESTE lado (tras actualizar: CDC)
 *   node sincroniza.mjs estado
 *
 * Reglas que no se negocian:
 *   - Nunca elige un lado. Ante un choque se detiene sin escribir en el árbol ni empujar: la versión local queda en
 *     el disco y en su rama, la del centro en el centro; copia las dos (y la base) a choques/ y deja AVISO.md.
 *   - Si la versión de Arbrain de este lado (firma verificada) no es la que declara el centro, no sincroniza y no
 *     cambia nada: la comprobación va antes de crear o tocar el repo.
 *   - Sin reset --hard, sin push --force, sin clean, sin checkout --ours/--theirs, sin -X ours/theirs.
 *   - Nunca toca la carpeta de datos de la app, las llaves ni las sesiones: viven fuera de la copia de Arbrain y
 *     ninguna ruta de la lista permitida las alcanza.
 *
 * Exit: 0 al día · 2 choque · 3 versión distinta o sin verificar · 4 centro inalcanzable o empuje rechazado
 *       (reintentar) · 5 política (CAPAS.json sin clasificar, ruta o modo prohibido) · 75 otra corrida en curso ·
 *       1 error · 64 uso.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, writeSync, closeSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LISTA, RAMA, REF_VERSION, exclusiones, idDeMarca, motivoNoViaja, pathspecs, revisaCapas, trailerVersion, versionLocal } from './politica.mjs';
import { regeneraNow } from './regenera-now.mjs';
import { procesaResumenes } from './resumenes.mjs';

const SYNC = dirname(fileURLToPath(import.meta.url));
const LADO = process.env.CEREBRO_LADO ?? '';
const ARB = process.env.CEREBRO_ARBRAIN ?? join(homedir(), 'Arbrain');
const ESTADO = process.env.CEREBRO_ESTADO ?? join(homedir(), '.cerebro-sync');
const GITDIR = join(ESTADO, 'cerebro.git');
const CENTRO_URL = process.env.CEREBRO_CENTRO_URL ?? '';
const CENTRO_DIR = process.env.CEREBRO_CENTRO_DIR ?? '/srv/cerebro/centro.git';
const ANCLA = process.env.ARBRAIN_ANCLA ?? '~/.config/arbrain/firmas-permitidas';
const REMOTO = `refs/remotes/centro/${RAMA}`;
// La fase «resumen» (PASO 5b, `resumenes.mjs`): aquí dejan los productos su lectura de solo conteos.
export const ENTRADA_RESUMENES = process.env.CEREBRO_ENTRADA_RESUMENES ?? '/srv/cerebro/entrada-resumenes';

const SALIDA = { ok: 0, choque: 2, version: 3, centro: 4, politica: 5, ocupado: 75, error: 1, uso: 64 };
const ahora = () => new Date().toISOString();
const di = (m) => console.log(`[${LADO}] ${m}`);
const bitacora = (m) => { try { appendFileSync(join(ESTADO, 'bitacora.log'), `${ahora()} ${m}\n`); } catch { /* sin bitácora */ } };

/** git sobre el repo del cerebro (árbol = la copia de Arbrain). Nunca con shell. */
const g = (args, extra = {}) => {
  const r = spawnSync('git', ['--git-dir', GITDIR, '--work-tree', ARB, ...args], {
    cwd: ARB, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, ...extra,
  });
  return { ok: r.status === 0, status: r.status, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() };
};
const rev = (ref) => { const r = g(['rev-parse', '-q', '--verify', `${ref}^{commit}`]); return r.ok ? r.stdout : null; };
const esAncestro = (a, b) => g(['merge-base', '--is-ancestor', a, b]).ok;

/** Detiene la corrida: deja AVISO.md + AVISO.json (lo lee una persona o un monitor) y sale con su código. */
function detente(tipo, titulo, lineas = [], datos = {}) {
  mkdirSync(ESTADO, { recursive: true });
  const aviso = { tipo, lado: LADO, cuando: ahora(), titulo, detalle: lineas, ...datos };
  writeFileSync(join(ESTADO, 'AVISO.json'), `${JSON.stringify(aviso, null, 2)}\n`);
  writeFileSync(join(ESTADO, 'AVISO.md'), `# Aviso del cerebro (${LADO}): ${titulo}\n\n- Cuándo: ${aviso.cuando}\n- Tipo: ${tipo}\n${lineas.map((l) => `- ${l}`).join('\n')}\n`);
  bitacora(`DETENIDO ${tipo}: ${titulo}`);
  di(`DETENIDO (${tipo}): ${titulo}`);
  for (const l of lineas) di(`  · ${l}`);
  process.exit(SALIDA[tipo]);
}

/** Un solo job a la vez por instancia (candado con pid; uno huérfano se recupera). */
function candado() {
  mkdirSync(ESTADO, { recursive: true, mode: 0o700 });
  const ruta = join(ESTADO, 'corrida.lock');
  for (let intento = 0; intento < 2; intento++) {
    try {
      const fd = openSync(ruta, 'wx', 0o600);
      writeSync(fd, String(process.pid)); closeSync(fd);
      process.on('exit', () => { try { unlinkSync(ruta); } catch { /* ya no está */ } });
      return;
    } catch {
      const pid = Number.parseInt(readFileSync(ruta, 'utf8'), 10);
      try { process.kill(pid, 0); di(`otra corrida en curso (pid ${pid})`); process.exit(SALIDA.ocupado); } catch { unlinkSync(ruta); }
    }
  }
}

/** PASO 1-2: la versión de este lado (firmada) es la que declara el centro. Antes de tocar nada. */
function compruebaVersiones() {
  const v = versionLocal({ arbrain: ARB, ancla: ANCLA });
  if (!v.ok) detente('version', 'la versión de Arbrain de este lado no está verificada', [v.motivo, 'No se sincroniza nada con una copia sin firma válida.']);
  const r = spawnSync('git', ['-c', 'protocol.ext.allow=user', 'ls-remote', CENTRO_URL, REF_VERSION, `refs/heads/${RAMA}`], {
    encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, timeout: 60_000,
  });
  if (r.status !== 0) detente('centro', 'no llego al centro', [(r.stderr ?? '').trim().split('\n').slice(-2).join(' ') || 'sin respuesta', 'No se cambió nada; reintenta cuando la red privada responda.']);
  const refs = Object.fromEntries((r.stdout ?? '').trim().split('\n').filter(Boolean).map((l) => l.split('\t').reverse()));
  const delCentro = refs[REF_VERSION];
  if (!delCentro) detente('version', 'el centro no declara versión de Arbrain', ['En el VPS: sincroniza.mjs declara-version (solo tras verificar su copia).']);
  if (delCentro !== idDeMarca(v.marca)) {
    detente('version', 'las versiones de Arbrain de los dos lados difieren: no sincronizo', [
      `este lado: ${v.version} (${v.commit.slice(0, 7)}), firma verificada`,
      `el centro declara otra versión (marca ${delCentro.slice(0, 12)}); este lado esperaba ${idDeMarca(v.marca).slice(0, 12)}`,
      'Actualiza las dos instancias a la misma versión con el procedimiento oficial (es un CDC) y vuelve a correr el job.',
      'No se tocó el cerebro de ningún lado ni el centro.',
    ], { versionLocal: v.version, commitLocal: v.commit, marcaCentro: delCentro });
  }
  return { v, mainCentro: refs[`refs/heads/${RAMA}`] ?? null };
}

/** PASO 3: la lista permitida cubre el CAPAS.json de esta versión (si no, decidir es de una persona). */
function compruebaCapas() {
  let capas;
  try { capas = JSON.parse(readFileSync(join(ARB, 'CAPAS.json'), 'utf8')); } catch (e) { detente('politica', 'no pude leer CAPAS.json', [e.message]); }
  const fallos = revisaCapas(capas);
  if (fallos.length) detente('politica', 'la lista permitida no cubre el CAPAS.json de esta versión', [...fallos, 'Clasificar cada ruta es una decisión (CDC), no un default.']);
}

/** PASO 4: el repo del cerebro (se crea una vez; la configuración se reescribe en cada pasada). */
function aseguraRepo() {
  if (!existsSync(GITDIR)) {
    const r = spawnSync('git', ['init', '-q', '--bare', '--template=', `--initial-branch=${RAMA}`, GITDIR], { encoding: 'utf8' });
    if (r.status !== 0) detente('error', 'no pude crear el repo del cerebro', [r.stderr.trim()]);
    di('repo del cerebro creado (separado de la copia de Arbrain; árbol = la copia)');
  }
  const config = [
    ['core.bare', 'false'], ['core.worktree', ARB], ['core.symlinks', 'false'], ['core.autocrlf', 'false'],
    ['user.name', `cerebro-sync (${LADO})`], ['user.email', `cerebro-sync@${LADO}.invalid`],
    ['merge.registros.name', 'unión por registro (id o clave)'],
    ['merge.registros.driver', `node ${join(SYNC, 'fusiona-registros.mjs')} %O %A %B %P`],
    ['protocol.ext.allow', 'user'], ['transfer.fsckObjects', 'true'], ['remote.centro.url', CENTRO_URL], ['gc.auto', '0'],
  ];
  for (const [k, v] of config) spawnSync('git', ['--git-dir', GITDIR, 'config', k, v]);
  mkdirSync(join(GITDIR, 'info'), { recursive: true });
  writeFileSync(join(GITDIR, 'info', 'exclude'), exclusiones());
  writeFileSync(join(GITDIR, 'info', 'attributes'), Object.keys(LISTA.registros).map((r) => `${r} merge=registros`).join('\n') + '\n');
}

/** Revisa modos y rutas de una lista `git diff --raw -z` o `ls-tree -r -z`: nada que no viaje, nada que no sea archivo. */
function rutasProhibidas(entradas) {
  const fallos = [];
  for (const { modo, ruta } of entradas) {
    if (modo && !['100644', '100755', '000000'].includes(modo)) fallos.push(`${ruta}: no es un archivo normal (${modo})`);
    const m = motivoNoViaja(ruta);
    if (m) fallos.push(`${ruta}: ${m}`);
  }
  return fallos;
}

const entradasDeArbol = (commit) => g(['ls-tree', '-r', '-z', '--full-tree', commit]).stdout.split('\0').filter(Boolean)
  .map((e) => { const t = e.indexOf('\t'); return { modo: e.slice(0, t).split(' ')[0], ruta: e.slice(t + 1) }; });

/** PASO 6: los cambios locales de lo que viaja, en un commit con su versión. */
function registraCambios(v) {
  const rastreadas = g(['ls-files', '-z']).stdout.split('\0').filter(Boolean);
  const specs = pathspecs(ARB, rastreadas);
  if (specs.length) {
    const a = g(['add', '-A', '--', ...specs]);
    if (!a.ok) detente('error', 'git add falló', [a.stderr]);
  }
  const crudo = g(['diff', '--cached', '--raw', '-z', '--no-renames']).stdout.split('\0').filter(Boolean);
  const entradas = [];
  for (let i = 0; i < crudo.length; i += 2) entradas.push({ modo: crudo[i].split(' ')[1], ruta: crudo[i + 1] });
  const fallos = rutasProhibidas(entradas);
  if (fallos.length) detente('politica', 'hay algo preparado que no puede viajar: no hago commit', fallos);
  if (!entradas.length) return 0;
  const c = g(['commit', '-q', '-m', `cerebro (${LADO}): ${entradas.length} archivo(s)`, '-m', `${trailerVersion(v)}\nLado: ${LADO}`]);
  if (!c.ok) detente('error', 'git commit falló', [c.stderr]);
  return entradas.length;
}

/** PASO 7: trae el centro y revisa lo que llega antes de unirlo (no se confía en el otro lado). */
function traeCentro(v, mainCentro) {
  if (!mainCentro) return null;
  const f = g(['-c', 'protocol.ext.allow=user', 'fetch', '-q', '--no-tags', 'centro', `refs/heads/${RAMA}:${REMOTO}`]);
  if (!f.ok) detente('centro', 'no pude traer el centro (¿reescribió su historia?)', [f.stderr.split('\n').slice(-2).join(' ')]);
  const local = rev(`refs/heads/${RAMA}`);
  const nuevos = g(['rev-list', REMOTO, ...(local ? ['--not', local] : [])]).stdout.split('\n').filter(Boolean);
  const fallos = [];
  for (const c of nuevos) {
    const t = g(['log', '-1', '--format=%(trailers:key=Arbrain-Version,valueonly)', c]).stdout.trim();
    if (t !== `${v.version} ${v.commit}`) fallos.push(`${c.slice(0, 7)}: versión «${t || 'ninguna'}»`);
    fallos.push(...rutasProhibidas(entradasDeArbol(c)).map((x) => `${c.slice(0, 7)}: ${x}`));
  }
  if (fallos.length) detente('politica', 'lo que trae el centro no cumple la política: no lo uno', [...new Set(fallos)].slice(0, 20));
  return rev(REMOTO);
}

/**
 * Copias de las tres versiones de cada archivo en choque, fuera del cerebro (no viajan). La carpeta se nombra por el
 * par de commits: el mismo choque, visto por pasadas programadas sucesivas, no se copia dos veces.
 */
function guardaChoque(salida, local, centro) {
  const partes = salida.split('\0');
  const dir = join(ESTADO, 'choques', `${local.slice(0, 12)}-contra-${centro.slice(0, 12)}`);
  const etapas = { 1: 'base', 2: 'local', 3: 'centro' };
  const archivos = {};
  for (const p of partes.slice(1)) {
    if (!p) break;
    const m = /^(\d+) ([0-9a-f]+) (\d)\t(.+)$/.exec(p);
    if (!m) continue;
    const [, , blob, etapa, ruta] = m;
    archivos[ruta] ??= {};
    archivos[ruta][etapas[etapa]] = blob;
    const destino = join(dir, `${ruta}.${etapas[etapa]}`);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, spawnSync('git', ['--git-dir', GITDIR, 'cat-file', 'blob', blob]).stdout);
  }
  return { dir, archivos };
}

/** PASO 8: une con el centro. Avance rápido si se puede; si no, unión calculada FUERA del árbol (merge-tree). */
function integra(v, centro, estado) {
  const local = rev(`refs/heads/${RAMA}`);
  if (!centro || !local || local === centro || esAncestro(centro, local)) return 'nada que traer';
  if (esAncestro(local, centro)) {
    const m = g(['merge', '--ff-only', '-q', REMOTO]);
    if (!m.ok) detente('error', 'el avance rápido falló', [m.stderr]);
    return `avance rápido a ${centro.slice(0, 7)}`;
  }
  const sinBase = !g(['merge-base', local, centro]).ok;
  if (sinBase && estado.unido) detente('politica', 'el centro y este lado no comparten historia', ['Nunca se unen historias sin relación después de la primera unión.']);
  const mt = g(['merge-tree', '--write-tree', '-z', ...(sinBase ? ['--allow-unrelated-histories'] : []), local, centro]);
  if (mt.status === 1) {
    const { dir, archivos } = guardaChoque(mt.stdout, local, centro);
    const registros = mt.stderr.split('\n').filter((l) => l.startsWith('CHOQUE-REGISTRO ')).map((l) => l.slice(16));
    detente('choque', 'el mismo contenido cambió distinto en los dos lados: me detengo sin elegir', [
      ...Object.keys(archivos).map((r) => `archivo en choque: ${r}`),
      ...registros.map((r) => `registro en choque: ${r}`),
      `la versión local sigue en el disco y en la rama local (${local.slice(0, 7)}, sin empujar); la del centro, en el centro (${centro.slice(0, 7)})`,
      `copias de las dos versiones (y la base): ${dir}`,
      'Resolverlo es de una persona: decide el contenido, haz la unión a mano en este repo y vuelve a correr el job.',
    ], { local, centro, archivos, copias: dir });
  }
  if (mt.status !== 0) detente('error', 'merge-tree falló', [mt.stderr]);
  const arbol = mt.stdout.split('\0')[0];
  const c = g(['commit-tree', arbol, '-p', local, '-p', centro, '-m', `cerebro (${LADO}): une el centro`, '-m', `${trailerVersion(v)}\nLado: ${LADO}`]);
  if (!c.ok) detente('error', 'commit-tree falló', [c.stderr]);
  const rt = g(['read-tree', '-m', '-u', local, c.stdout]);
  if (!rt.ok) detente('error', 'no pude llevar la unión al árbol (nada cambió en la rama)', [rt.stderr]);
  g(['update-ref', '-m', 'cerebro-sync: une el centro', `refs/heads/${RAMA}`, c.stdout, local]);
  return `unión por registro limpia (${c.stdout.slice(0, 7)})`;
}

/** PASO 9: empuja al centro sin forzar. Si el centro avanzó mientras tanto, se reintenta en la próxima pasada. */
function empuja(centro) {
  const local = rev(`refs/heads/${RAMA}`);
  if (!local || local === centro) return null;
  const p = g(['-c', 'protocol.ext.allow=user', 'push', '-q', 'centro', `refs/heads/${RAMA}:refs/heads/${RAMA}`]);
  if (!p.ok) detente('centro', 'el centro no aceptó el empuje (nada se perdió; reintenta)', p.stderr.split('\n').filter(Boolean).slice(-8));
  g(['update-ref', REMOTO, local]);
  return local;
}

const leeEstado = () => { try { return JSON.parse(readFileSync(join(ESTADO, 'estado.json'), 'utf8')); } catch { return {}; } };

async function pasada() {
  if (!LADO || !CENTRO_URL) { console.error('faltan CEREBRO_LADO y CEREBRO_CENTRO_URL'); process.exit(SALIDA.uso); }
  candado();
  const { v, mainCentro } = compruebaVersiones();
  di(`Arbrain ${v.version} (${v.commit.slice(0, 7)}) verificado; el centro declara la misma versión`);
  compruebaCapas();
  aseguraRepo();
  const estado = leeEstado();
  // PASO 5b · el resumen de cada producto, SOLO en el VPS (`resumenes.mjs`): conteos y enlaces a la agenda del cerebro,
  // validados con el esquema de la capa; un archivo con cualquier texto libre se rechaza entero y se queda fuera del
  // cerebro. Va antes del commit para que viaje en esta misma pasada.
  if (LADO === 'vps') {
    const r = await procesaResumenes({ entrada: ENTRADA_RESUMENES, arbrain: ARB });
    for (const a of r.aceptados) di(`RESUMEN_ACEPTADO ${a.archivo} → tarea ${a.id}`);
    for (const x of r.rechazados) di(`RESUMEN_RECHAZADO ${x.archivo}: ${x.motivos.length} motivo(s); queda en la cuarentena del VPS, fuera del cerebro`);
  }
  const n = registraCambios(v);
  di(n ? `cambios locales: ${n} archivo(s) → commit ${rev(`refs/heads/${RAMA}`).slice(0, 7)}` : 'sin cambios locales');
  const centro = traeCentro(v, mainCentro);
  di(`del centro: ${integra(v, centro, estado)}`);
  const empujado = empuja(centro);
  if (empujado) di(`empujado al centro: ${empujado.slice(0, 7)}`);
  const now = regeneraNow({ arbrain: ARB, lado: LADO });
  di(`now.md regenerado en este lado (no viaja): ${now.eventosHoy} evento(s) hoy, ${now.tareas} tarea(s)`);
  if (existsSync(join(ESTADO, 'AVISO.json'))) {
    mkdirSync(join(ESTADO, 'avisos'), { recursive: true });
    const sello = ahora().replace(/[:.]/g, '-');
    renameSync(join(ESTADO, 'AVISO.json'), join(ESTADO, 'avisos', `${sello}.json`));
    if (existsSync(join(ESTADO, 'AVISO.md'))) renameSync(join(ESTADO, 'AVISO.md'), join(ESTADO, 'avisos', `${sello}.md`));
    di('el aviso anterior quedó resuelto y archivado en avisos/');
  }
  const main = rev(`refs/heads/${RAMA}`);
  writeFileSync(join(ESTADO, 'estado.json'), `${JSON.stringify({ lado: LADO, ultima: ahora(), main, centro: rev(REMOTO), version: v.version, unido: true }, null, 2)}\n`);
  bitacora(`OK main=${main}`);
  console.log(`SINCRONIZADO ${LADO} main=${main.slice(0, 7)} centro=${(rev(REMOTO) ?? main).slice(0, 7)}`);
}

/** VPS: declara en el centro la versión de ESTE lado (ref a un blob; no pasa por el hook ni por el túnel). */
function declaraVersion() {
  const v = versionLocal({ arbrain: ARB, ancla: ANCLA });
  if (!v.ok) { console.error(`FIRMA_FALLA: ${v.motivo}`); process.exit(SALIDA.version); }
  const blob = spawnSync('git', ['--git-dir', CENTRO_DIR, 'hash-object', '-w', '--stdin'], { input: v.marca, encoding: 'utf8' }).stdout.trim();
  const r = spawnSync('git', ['--git-dir', CENTRO_DIR, 'update-ref', REF_VERSION, blob], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stderr); process.exit(SALIDA.error); }
  console.log(`VERSION_DECLARADA ${v.version} ${v.commit.slice(0, 7)} en ${CENTRO_DIR}`);
}

function creaCentro() {
  if (!existsSync(CENTRO_DIR)) {
    const r = spawnSync('git', ['init', '-q', '--bare', '--template=', `--initial-branch=${RAMA}`, CENTRO_DIR], { encoding: 'utf8' });
    if (r.status !== 0) { console.error(r.stderr); process.exit(SALIDA.error); }
  }
  for (const [k, v] of [['receive.denyNonFastForwards', 'true'], ['receive.denyDeletes', 'true'], ['receive.fsckObjects', 'true'],
    ['core.hooksPath', join(SYNC, 'hooks-centro')], ['gc.auto', '0']]) spawnSync('git', ['--git-dir', CENTRO_DIR, 'config', k, v]);
  mkdirSync(ENTRADA_RESUMENES, { recursive: true, mode: 0o700 });
  console.log(`CENTRO_LISTO ${CENTRO_DIR} (sin forzar, sin borrar, hook de política; entrada de resúmenes vacía: ${ENTRADA_RESUMENES})`);
  declaraVersion();
}

const orden = process.argv[2] ?? 'pasada';
if (orden === 'pasada') await pasada();
else if (orden === 'crea-centro') creaCentro();
else if (orden === 'declara-version') declaraVersion();
else if (orden === 'estado') console.log(JSON.stringify({ ...leeEstado(), aviso: existsSync(join(ESTADO, 'AVISO.json')) ? JSON.parse(readFileSync(join(ESTADO, 'AVISO.json'), 'utf8')) : null }, null, 2));
else { console.error('uso: sincroniza.mjs [pasada|crea-centro|declara-version|estado]'); process.exit(SALIDA.uso); }
