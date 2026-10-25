/**
 * Nivel global: las skills del autor de Arbrain que tienen copia aquí (en el proyecto, `.claude/skills/<x>`, o en
 * `~/.claude/skills/<x>`), comparadas con la etiqueta nueva.
 *
 * Solo LEE las copias: las materializa (la de la etiqueta, con git; las locales, copiándolas) en un temporal y compara
 * ahí con `git diff --no-index`. La propuesta de realineamiento es una unión a tres bandas por archivo (base = la
 * etiqueta del lock, nuestra = la copia, suya = la etiqueta nueva) que se ESCRIBE en la carpeta del informe, nunca
 * encima de una copia. Aplicarla es un CDC; escribir en `~/.claude` queda fuera de esta skill.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { archivos, cambios, git, muestra } from './git.mjs';

const EJECUTABLE = /(^|\/)scripts\/|\.(py|mjs|cjs|js|ts|sh|ps1|bat|cmd)$/;
export const SKILLS_GLOBALES = join(homedir(), '.claude/skills');

/** Las skills del autor según su `CAPAS.json` (dato) en `rev`; sin él, las carpetas de `.claude/skills`. */
export function skillsDelAutor(repo, rev) {
  try {
    const capas = JSON.parse(muestra(repo, rev, 'CAPAS.json') ?? 'null');
    if (Array.isArray(capas?.skills_del_autor)) return [...capas.skills_del_autor].sort();
  } catch { /* CAPAS.json ilegible: se cae a las carpetas */ }
  const dirs = new Set(archivos(repo, rev, '.claude/skills').map((a) => a.ruta.split('/')[2]).filter(Boolean));
  return [...dirs].sort();
}

/** Escribe en `destino` la carpeta de la skill tal como está en `rev`. Los enlaces simbólicos no se siguen. */
function materializa(repo, rev, nombre, destino) {
  const prefijo = `.claude/skills/${nombre}`;
  const enlaces = [];
  for (const a of archivos(repo, rev, prefijo)) {
    if (a.modo === '120000') { enlaces.push(a.ruta); continue; }
    const ruta = join(destino, a.ruta.slice(prefijo.length + 1));
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(ruta, git(repo, ['cat-file', 'blob', a.objeto]).stdout);
  }
  return enlaces;
}

/** `git diff --no-index` entre dos carpetas del temporal (rutas relativas: el diff se lee con nombres claros). */
function diffCarpetas(cwd, a, b) {
  if (!existsSync(join(cwd, a)) && !existsSync(join(cwd, b))) return '';
  for (const lado of [a, b]) mkdirSync(join(cwd, lado), { recursive: true });
  const r = git(null, ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '-M', a, b], { cwd });
  if (r.status !== 0 && r.status !== 1) throw new Error(`diff ${a} ${b}: ${r.salida.split('\n')[0]}`);
  return r.stdout;
}

/** +/− y archivos de un diff unificado. */
export function cuenta(texto) {
  const lineas = texto.split('\n');
  const archivosDiff = lineas.filter((l) => l.startsWith('diff --git ')).length;
  // Las cabeceras son `--- a/…`, `+++ b/…` o `/dev/null`; un `---` de frontmatter que entra o sale sí cuenta.
  const cabecera = /^(\+\+\+|---) (a\/|b\/|\/dev\/null)/;
  const mas = lineas.filter((l) => l.startsWith('+') && !cabecera.test(l)).length;
  const menos = lineas.filter((l) => l.startsWith('-') && !cabecera.test(l)).length;
  return { archivos: archivosDiff, mas, menos };
}

/** Una unión a tres bandas en el temporal. `choques` = número de bloques en conflicto (0 = limpia). */
function tresBandas(cwd, { nuestra, base, suya, etiquetas }) {
  const vacia = join(cwd, '.vacia');
  if (!existsSync(vacia)) writeFileSync(vacia, '');
  const r = git(null, ['merge-file', '-p', '-L', etiquetas[0], '-L', etiquetas[1], '-L', etiquetas[2],
    nuestra, existsSync(base) ? base : vacia, suya], { cwd });
  // merge-file sale con el número de choques (tope 127) o negativo si falla: un negativo llega como >127.
  if (r.status === null || r.status > 127) throw new Error(`merge-file: ${r.salida.split('\n')[0]}`);
  return { texto: r.stdout, choques: r.status };
}

/** Propuesta por archivo para una copia: qué del tramo del autor entra limpio, qué choca y qué falta decidir. */
function proponeCopia(w, { nombre, copia, cambiosSkill, desde, hasta }) {
  const propuesta = [];
  for (const c of cambiosSkill) {
    const rel = c.ruta.slice(`.claude/skills/${nombre}/`.length);
    const suya = join(w, `arbrain-${hasta}`, nombre, rel);
    const nuestra = join(w, copia, nombre, rel);
    if (c.estado === 'D') { propuesta.push({ rel, accion: existsSync(nuestra) ? 'el autor lo borró: decidir si se quita aquí' : 'el autor lo borró y aquí no está', choques: 0 }); continue; }
    if (!existsSync(nuestra)) { propuesta.push({ rel, accion: 'nuevo del autor: se propone traerlo', choques: 0, texto: readFileSync(suya, 'utf8') }); continue; }
    const base = join(w, `arbrain-${desde}`, nombre, c.antes ? c.antes.slice(`.claude/skills/${nombre}/`.length) : rel);
    const u = tresBandas(w, { nuestra, base, suya, etiquetas: [copia, `arbrain-${desde}`, `arbrain-${hasta}`] });
    propuesta.push({ rel, accion: u.choques ? `unión con ${u.choques} choque(s): decide una persona` : 'unión limpia: entra lo del autor y se conserva lo nuestro', choques: u.choques, texto: u.texto });
  }
  return propuesta;
}

/** Copia a `w/<lado>/<nombre>` la skill local si existe. Devuelve si existía. */
function copiaLocal(origen, w, lado, nombre) {
  if (!origen || !existsSync(origen)) return false;
  cpSync(origen, join(w, lado, nombre), { recursive: true, dereference: false });
  return true;
}

/** Compara una skill del autor con sus copias locales y arma la propuesta. Todo dentro del temporal `w`. */
function comparaSkill(w, { repo, nombre, desde, hasta, revDesde, revHasta, proyecto, global }) {
  const enlaces = [...materializa(repo, revDesde, nombre, join(w, `arbrain-${desde}`, nombre)),
    ...materializa(repo, revHasta, nombre, join(w, `arbrain-${hasta}`, nombre))];
  const cambiosSkill = cambios(repo, revDesde, revHasta, [`.claude/skills/${nombre}`]);
  const tramo = diffCarpetas(w, `arbrain-${desde}/${nombre}`, `arbrain-${hasta}/${nombre}`);
  const copias = {};
  for (const [lado, origen] of [['proyecto', proyecto], ['global', global]]) {
    if (!copiaLocal(origen && join(origen, nombre), w, lado, nombre)) { copias[lado] = null; continue; }
    const d = diffCarpetas(w, `${lado}/${nombre}`, `arbrain-${hasta}/${nombre}`);
    copias[lado] = { diff: d, ...cuenta(d), igual: d === '',
      propuesta: cambiosSkill.length ? proponeCopia(w, { nombre, copia: lado, cambiosSkill, desde, hasta }) : [] };
  }
  return { nombre, cambiosTramo: cambiosSkill, tramo, ...cuenta(tramo), enlaces, copias,
    ejecutable: cambiosSkill.filter((c) => EJECUTABLE.test(c.ruta)).map((c) => c.ruta) };
}

const dirsDe = (dir) => (dir && existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);

/**
 * El nivel global entero: cada skill del autor con copia aquí, las homónimas nuevas (una skill nueva del autor con el
 * nombre de una nuestra no se mezcla con la nuestra) y las que el autor quitó.
 */
export function comparaGlobal({ repo, desde, hasta, revDesde, revHasta, proyecto, global = SKILLS_GLOBALES }) {
  const w = mkdtempSync(join(tmpdir(), 'capa-skills-'));
  try {
    const antes = skillsDelAutor(repo, revDesde);
    const ahora = skillsDelAutor(repo, revHasta);
    const locales = new Set([...dirsDe(proyecto), ...dirsDe(global)]);
    const nuevas = ahora.filter((s) => !antes.includes(s));
    const conCopia = ahora.filter((s) => locales.has(s) && !nuevas.includes(s));
    const skills = conCopia.map((nombre) => comparaSkill(w, { repo, nombre, desde, hasta, revDesde, revHasta, proyecto, global }));
    return {
      skills,
      sinCopia: ahora.filter((s) => !locales.has(s)),
      homonimas: nuevas.filter((s) => locales.has(s)),
      nuevas,
      quitadas: antes.filter((s) => !ahora.includes(s)),
    };
  } finally {
    rmSync(w, { recursive: true, force: true });
  }
}
