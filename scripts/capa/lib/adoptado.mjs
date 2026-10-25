/**
 * Lo adoptado de Arbrain y lo que cambió en ello entre dos versiones firmadas.
 *
 * «Lo adoptado» son las piezas `adopta` y `reimplementa` de `tools/capa/mapa.json`, con sus rutas `origen` en el repo
 * del autor. «Dónde se adoptó de verdad» lo dicen las cabeceras: los archivos de `tools/capa/src/**`, el `NOTICE` y
 * los destinos del mapa que ya existen citan la ruta de origen. Un cambio en un origen que nadie cita todavía solo
 * mueve el mapa; uno en un origen citado pide realinear ese archivo.
 *
 * Nada de lo que hay aquí escribe: lee el espejo con git y el template con `fs`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { archivos, cambios, muestra, numstat } from './git.mjs';

export const NIVELES = ['producto', 'herramienta', 'global'];
const SE_ADOPTA = new Set(['adopta', 'reimplementa']);

export const piezasAdoptadas = (mapa) => (mapa.piezas ?? []).filter((p) => SE_ADOPTA.has(p.decision));

/** ¿`archivo` es `origen` o vive dentro de él (si `origen` es una carpeta)? */
export const pertenece = (archivo, origen) => archivo === origen || archivo.startsWith(`${origen.replace(/\/$/, '')}/`);

export const rutasDeOrigen = (piezas) => [...new Set(piezas.flatMap((p) => p.origen ?? []))].sort();

/** Los cambios entre dos commits restringidos a lo adoptado, con sus líneas (+/−). */
export function cambiosAdoptados(repo, desde, hasta, piezas) {
  const rutas = rutasDeOrigen(piezas);
  const lista = cambios(repo, desde, hasta, rutas);
  const lineas = numstat(repo, desde, hasta, rutas);
  return lista.map((c) => ({ ...c, ...(lineas.get(c.ruta) ?? { mas: null, menos: null }) }));
}

/** Los cambios de una pieza: los que tocan alguno de sus orígenes (antes o después de un renombre). */
const cambiosDe = (pieza, lista) =>
  lista.filter((c) => (pieza.origen ?? []).some((o) => pertenece(c.ruta, o) || (c.antes && pertenece(c.antes, o))));

/**
 * Clasifica por nivel y por pieza. Lo que no cambió se cuenta (una línea), no se lista: la cadencia de Arbrain es
 * diaria y un informe que repite las 90 piezas cada día no lo lee nadie.
 */
export function clasifica(lista, piezas) {
  const porNivel = Object.fromEntries(NIVELES.map((n) => [n, []]));
  const sinCambio = Object.fromEntries(NIVELES.map((n) => [n, 0]));
  for (const pieza of piezas) {
    const nivel = NIVELES.includes(pieza.nivel) ? pieza.nivel : 'producto';
    const suyos = cambiosDe(pieza, lista);
    if (suyos.length) porNivel[nivel].push({ pieza, cambios: suyos });
    else sinCambio[nivel] += 1;
  }
  const tocadas = NIVELES.reduce((n, k) => n + porNivel[k].length, 0);
  return { porNivel, sinCambio, tocadas, total: piezas.length };
}

/** Orígenes que ya no existen en la versión nueva: el mapa se queda sin suelo y hay que regenerarlo. */
export function origenesPerdidos(repo, hasta, piezas) {
  const presentes = archivos(repo, hasta).map((a) => a.ruta);
  const existe = (o) => presentes.some((r) => pertenece(r, o));
  return piezas.flatMap((p) => (p.origen ?? []).filter((o) => !existe(o)).map((origen) => ({ pieza: p.id, origen })));
}

const escapa = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Símbolos del mapa (funciones, tipos, constantes) que desaparecen de un origen que cambió. */
export function simbolosPerdidos(repo, hasta, pieza, cambiadas) {
  const fuera = [];
  for (const [archivo, simbolos] of Object.entries(pieza.simbolos ?? {})) {
    if (!cambiadas.has(archivo)) continue;
    const texto = muestra(repo, hasta, archivo);
    if (texto === null) continue;
    for (const s of simbolos) if (!new RegExp(`(^|[^A-Za-z0-9_$])${escapa(s)}([^A-Za-z0-9_$]|$)`).test(texto)) fuera.push({ pieza: pieza.id, archivo, simbolo: s });
  }
  return fuera;
}

const URL_RE = /https?:\/\/([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;
const hosts = (texto) => new Set([...(texto ?? '').matchAll(URL_RE)].map((m) => m[1].toLowerCase()));

/**
 * Hosts que aparecen en un origen adoptado y antes no estaban: si eso se adopta, algo sale de la máquina (C4). Es la
 * misma pregunta que el actualizador oficial le hace a «lo que corre solo» (¿manda datos a un sitio nuevo?).
 */
export function hostsNuevos(repo, desde, hasta, lista) {
  const salida = [];
  for (const c of lista) {
    if (c.estado === 'D') continue;
    const antes = hosts(muestra(repo, desde, c.antes ?? c.ruta));
    for (const host of hosts(muestra(repo, hasta, c.ruta))) if (!antes.has(host)) salida.push({ archivo: c.ruta, host });
  }
  return salida;
}

// --- Dónde se adoptó de verdad (las cabeceras) --------------------------------------------------------------------

const TOKEN = /[A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@[\]-]+)+\/?/g;
const DEL_TEMPLATE = /^(tools|scripts|docs|productos|infra|src\/(app|features|shared|lib))\//;

function recorre(dir, salida = []) {
  if (!existsSync(dir)) return salida;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) recorre(p, salida);
    else if (/\.(ts|tsx|mjs|js|md)$/.test(e.name)) salida.push(p);
  }
  return salida;
}

/** Los archivos del template que pueden citar un origen: la capa, su NOTICE y los destinos del mapa que existen. */
export function archivosQueCitan(raiz, mapa) {
  const lista = recorre(join(raiz, 'tools/capa/src'));
  lista.push(join(raiz, 'tools/capa/NOTICE'));
  for (const p of piezasAdoptadas(mapa)) {
    const d = p.destino;
    if (!d || d.startsWith('~') || /mapa\.json$|MAPA\.md$/.test(d)) continue;
    const ruta = join(raiz, d);
    if (existsSync(ruta) && statSync(ruta).isFile()) lista.push(ruta);
  }
  return [...new Set(lista)].filter((p) => existsSync(p));
}

/** Resuelve una cita a archivos del autor: ruta completa, carpeta completa, o sufijo de archivo SIN ambigüedad. */
function resuelve(token, rutas) {
  const t = token.replace(/\/$/, '');
  const exactos = rutas.filter((r) => r === t || r.startsWith(`${t}/`));
  if (exactos.length) return exactos;
  if (!/\.[A-Za-z0-9]+$/.test(t)) return [];
  const sufijos = rutas.filter((r) => r.endsWith(`/${t}`));
  return sufijos.length === 1 ? sufijos : [];
}

/** origen del autor → archivos del template cuya cabecera lo cita. */
export function citas(raiz, mapa, rutasDelAutor) {
  const mapaCitas = new Map();
  for (const archivo of archivosQueCitan(raiz, mapa)) {
    const texto = readFileSync(archivo, 'utf8');
    const propio = relative(raiz, archivo);
    for (const token of new Set(texto.match(TOKEN) ?? [])) {
      if (DEL_TEMPLATE.test(token) || token.startsWith('./') || token.includes('${')) continue;
      for (const r of resuelve(token, rutasDelAutor)) {
        if (!mapaCitas.has(r)) mapaCitas.set(r, new Set());
        mapaCitas.get(r).add(propio);
      }
    }
  }
  return mapaCitas;
}

/** Las versiones de Arbrain que citan las cabeceras (procedencia a actualizar cuando se mueva el lock). */
export function versionesCitadas(raiz, mapa) {
  const porVersion = new Map();
  for (const archivo of archivosQueCitan(raiz, mapa)) {
    const texto = readFileSync(archivo, 'utf8');
    for (const m of texto.matchAll(/Arbrain[^\n]*?\b(v\d+\.\d+\.\d+)\b/g)) {
      if (!porVersion.has(m[1])) porVersion.set(m[1], new Set());
      porVersion.get(m[1]).add(relative(raiz, archivo));
    }
  }
  return porVersion;
}
