#!/usr/bin/env node
/**
 * Lee el cerebro personal desde un ESPEJO, en solo lectura: busca un tema en su memoria y devuelve lo encontrado.
 *
 * Es el nivel global de la capa («el cerebro personal se lee a demanda y en solo lectura»). Lo usa SOLO el agente del
 * laboratorio: ningún producto lee el cerebro personal (restricción del spec, no firmable), y por eso esto vive en
 * `scripts/capa/` y NO en el paquete `@tu-scope/capa` que componen los productos. Se lee un espejo (un clon del
 * centro del job o el repo del cerebro), nunca la instancia viva.
 *
 * Cómo lee: con git, del árbol de un commit (`HEAD` o `--ref`), sin tocar el árbol de trabajo ni el índice
 * (`--no-optional-locks`). Y lo comprueba: la huella por CONTENIDO de la carpeta entera (con su `.git`) y su
 * `git status` quedan IGUALES antes y después; si no, sale con 1.
 *
 * Qué lee: la memoria de la capa del alumno de Arbrain (`CAPAS.json › alumno` de v0.2.10, leído como dato):
 * `.claude/memory/` (esencia, índices y user/feedback/project/reference). Con `--todo`, además `.claude/knowledge/`,
 * `.claude/plan/` y `.claude/diario/`. Nunca: `.env*`, llaves, bases, `.claude/daily/` (extractos de conversaciones)
 * ni binarios. Lo que parezca un token se enmascara antes de devolverlo.
 *
 * Uso: node scripts/capa/lee-cerebro.mjs --repo <espejo> --tema "<tema>" [--ref HEAD] [--todo] [--max 10] [--json]
 * Exit: 0 encontró algo · 4 no encontró nada (se dice, no se inventa) · 1 la lectura cambió el espejo · 2 uso.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git } from './lib/git.mjs';
import { huellaDirectorio } from './lib/huella.mjs';

export const RUTAS_MEMORIA = ['.claude/memory'];
export const RUTAS_TODO = ['.claude/memory', '.claude/knowledge', '.claude/plan', '.claude/diario'];
const NUNCA = [/(^|\/)\.env/, /\.(pem|key|p12|db|sqlite\d?|sqlite-wal)$/i, /(^|\/)(llaves|acceso|servidor)\.json$/, /(^|\/)\.claude\/daily\//, /(^|\/)id_(rsa|ed25519)/];
const VACIAS = new Set('los las del para con por una uno que como mas pero sus esta este esto eso esa entre sobre desde hasta donde cuando quien cual muy sin hay fue son ser tiene the and for'.split(' '));
const TOKEN = /\b(sk-[A-Za-z0-9_-]{12,}|sk_[a-z]+_[A-Za-z0-9]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,})/g;

export const normaliza = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const palabras = (tema) => [...new Set(normaliza(tema).split(/[^a-z0-9]+/).filter((p) => p.length >= 3 && !VACIAS.has(p)))];
export const enmascara = (t) => t.replace(TOKEN, (m) => `${m.slice(0, 4)}…[enmascarado]`);

/** La carpeta es el tipo (contrato de memoria de Arbrain): user/feedback/project/reference, o el índice que sea. */
export function tipoDe(ruta) {
  const m = ruta.match(/^\.claude\/memory\/(user|feedback|project|reference)\//);
  if (m) return m[1];
  const base = ruta.split('/').at(-1);
  const indices = { 'MEMORY.md': 'esencia', 'MEMORY-indice.md': 'indice', 'MEMORY-user.md': 'indice-user', 'MEMORY-archivo.md': 'archivo' };
  if (ruta.startsWith('.claude/memory/') && indices[base]) return indices[base];
  return ruta.split('/')[1] ?? 'otro';
}

/** La foto que prueba la solo lectura: contenido entero de la carpeta y `git status` (si tiene árbol). */
function foto(repo) {
  const st = git(repo, ['status', '--porcelain=v1', '--untracked-files=all']);
  return { huella: huellaDirectorio(repo), status: st.ok ? st.stdout : '(repo sin árbol de trabajo)' };
}

const prefijo = (p) => new RegExp(`(^|[^a-z0-9])${p}`);

/** Busca las palabras en un archivo: líneas que casan, cuáles casaron y el puntaje. */
function buscaEn(ruta, texto, claves) {
  const lineas = texto.split('\n');
  const rutaN = normaliza(ruta);
  const casadas = new Set(claves.filter((p) => prefijo(p).test(rutaN)));
  const hits = [];
  lineas.forEach((l, i) => {
    const n = normaliza(l);
    const aqui = claves.filter((p) => prefijo(p).test(n));
    if (!aqui.length) return;
    aqui.forEach((p) => casadas.add(p));
    hits.push({ n: i + 1, texto: enmascara(l.trim()).slice(0, 240), peso: aqui.length });
  });
  const titulo = lineas.find((l) => l.startsWith('# '))?.slice(2).trim() ?? null;
  const puntaje = casadas.size * 10 + Math.min(hits.length, 10) + claves.filter((p) => prefijo(p).test(rutaN)).length * 5;
  return { casadas: [...casadas], hits: hits.sort((a, b) => b.peso - a.peso || a.n - b.n).slice(0, 5), titulo, puntaje };
}

/** Los archivos que se pueden leer en `ref`, y los que se saltan con su porqué. */
function candidatos(repo, ref, rutas) {
  const r = git(repo, ['ls-tree', '-r', '-z', '--full-tree', ref, '--', ...rutas]);
  const leer = [];
  const saltados = [];
  for (const linea of r.stdout.split('\0').filter(Boolean)) {
    const [cabeza, ruta] = linea.split('\t');
    const [modo, , objeto] = cabeza.split(' ');
    if (NUNCA.some((re) => re.test(ruta))) saltados.push({ ruta, porque: 'secreto, base o conversación: nunca se lee' });
    else if (modo === '120000') saltados.push({ ruta, porque: 'enlace simbólico: no se sigue' });
    else leer.push({ ruta, objeto });
  }
  return { leer, saltados };
}

/** Los archivos de detalle que enlaza una línea de índice que casó (el índice dispara, el detalle cuenta). */
const enlaces = (texto) => [...texto.matchAll(/\]\(([^)\s#]+\.md)\)/g)].map((m) => m[1]);

/**
 * Busca `tema` en la memoria del cerebro de `repo` (en `ref`). No escribe nada y lo comprueba.
 * @param {{ repo: string, tema: string, ref?: string, todo?: boolean, max?: number }} o
 */
export function leeCerebro({ repo, tema, ref = 'HEAD', todo = false, max = 10 }) {
  const claves = palabras(tema ?? '');
  if (!claves.length) return { ok: false, codigo: 2, motivo: 'el tema no tiene palabras de 3 letras o más' };
  if (!existsSync(repo)) return { ok: false, codigo: 2, motivo: `no existe ${repo}` };
  const antes = foto(repo);
  const commit = git(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).stdout.trim();
  if (!commit) return { ok: false, codigo: 2, motivo: `${ref} no es un commit en ${repo}` };
  const { leer, saltados } = candidatos(repo, commit, todo ? RUTAS_TODO : RUTAS_MEMORIA);
  const porRuta = new Map();
  for (const a of leer) {
    const texto = git(repo, ['cat-file', 'blob', a.objeto]).stdout;
    if (texto.includes('\0')) { saltados.push({ ruta: a.ruta, porque: 'binario' }); continue; }
    const b = buscaEn(a.ruta, texto, claves);
    porRuta.set(a.ruta, { texto, ...b });
  }
  const encontrados = resultados(porRuta, max);
  const despues = foto(repo);
  const igual = antes.huella.sha256 === despues.huella.sha256 && antes.status === despues.status;
  return {
    ok: igual, codigo: igual ? (encontrados.length ? 0 : 4) : 1, repo, tema, palabras: claves, ref, commit,
    leidos: leer.length, saltados, encontrados,
    soloLectura: { igual, huellaAntes: antes.huella, huellaDespues: despues.huella, statusAntes: antes.status, statusDespues: despues.status },
  };
}

/** Ordena lo que casó y suma los detalles que enlazan las líneas de índice que casaron. */
function resultados(porRuta, max) {
  const salida = [];
  for (const [ruta, x] of porRuta) {
    if (!x.casadas.length) continue;
    const via = [];
    for (const h of x.hits) for (const destino of enlaces(h.texto)) via.push(`.claude/memory/${destino.replace(/^\.\//, '')}`);
    salida.push({ ruta, tipo: tipoDe(ruta), titulo: x.titulo, casadas: x.casadas, lineas: x.hits.map(({ n, texto }) => ({ n, texto })), puntaje: x.puntaje, enlaza: [...new Set(via)].filter((v) => porRuta.has(v)) });
  }
  for (const r of [...salida]) {
    for (const destino of r.enlaza) {
      if (salida.some((s) => s.ruta === destino)) continue;
      const d = porRuta.get(destino);
      const primeras = d.texto.split('\n').map((l, i) => ({ n: i + 1, texto: enmascara(l.trim()).slice(0, 240) })).filter((l) => l.texto).slice(0, 4);
      salida.push({ ruta: destino, tipo: tipoDe(destino), titulo: d.titulo, casadas: [], lineas: primeras, puntaje: r.puntaje - 1, via: r.ruta, enlaza: [] });
    }
  }
  return salida.sort((a, b) => b.puntaje - a.puntaje || a.ruta.localeCompare(b.ruta)).slice(0, max);
}

/** El resultado en texto, para la conversación. */
export function enTexto(r) {
  if (!r.repo) return `lee-cerebro: ${r.motivo}`;
  const l = [`Cerebro ${r.repo} @ ${r.commit.slice(0, 7)} · tema «${r.tema}» (palabras: ${r.palabras.join(', ')}) · ${r.encontrados.length} encontrado(s) en ${r.leidos} archivo(s) leídos`];
  if (!r.encontrados.length) l.push('  No está en la memoria: no se inventa.');
  r.encontrados.forEach((e, i) => {
    l.push(`${i + 1}. ${e.ruta} (${e.tipo})${e.titulo ? ` — «${e.titulo}»` : ''}${e.via ? ` · enlazado desde ${e.via}` : ''} · puntaje ${e.puntaje}`);
    for (const x of e.lineas) l.push(`   ${x.n}: ${x.texto}`);
  });
  if (r.saltados.length) l.push(`  Saltados: ${r.saltados.map((s) => `${s.ruta} (${s.porque})`).join('; ')}`);
  const s = r.soloLectura;
  l.push(s.igual
    ? `Solo lectura comprobada: huella por contenido IGUAL antes y después (${s.huellaAntes.sha256.slice(0, 16)}…, ${s.huellaAntes.archivos} archivos con .git) · git status IGUAL (${s.statusAntes ? `${s.statusAntes.trim().split('\n').length} línea(s)` : 'vacío'})`
    : `LA LECTURA CAMBIÓ EL ESPEJO: huella ${s.huellaAntes.sha256.slice(0, 16)}… → ${s.huellaDespues.sha256.slice(0, 16)}…`);
  return l.join('\n');
}

function cli() {
  const a = process.argv.slice(2);
  const val = (n) => (a.includes(n) ? a[a.indexOf(n) + 1] : undefined);
  const repo = val('--repo');
  const tema = val('--tema');
  if (!repo || !tema) {
    console.error('Uso: node scripts/capa/lee-cerebro.mjs --repo <espejo> --tema "<tema>" [--ref HEAD] [--todo] [--max 10] [--json]');
    process.exit(2);
  }
  const r = leeCerebro({ repo: resolve(repo), tema, ref: val('--ref') ?? 'HEAD', todo: a.includes('--todo'), max: Number(val('--max') ?? 10) });
  console.log(a.includes('--json') ? JSON.stringify(r, null, 2) : enTexto(r));
  process.exit(r.codigo);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) cli();
