#!/usr/bin/env node
/**
 * Auditoria de credenciales sobre TODA la historia del repositorio.
 *
 * Por que existe, si el verificador ya mira el arbol de trabajo:
 *
 *   1. **Un boilerplate se clona con su historia.** Un secreto commiteado y borrado en el
 *      commit siguiente sigue ahi, y `git log -p` lo entrega intacto. El arbol limpio es
 *      condicion necesaria y no suficiente.
 *   2. **El gate del verificador solo conoce firmas con prefijo** (`ghp_`, `sk-`, ...). Un
 *      token sin prefijo —64 hex de Hetzner, una password a pelo en un `.env.example`—
 *      pasaba entero. Aqui se anade la heuristica de asignacion: una variable que se llama
 *      KEY/TOKEN/SECRET/PASSWORD con un valor que NO parece placeholder.
 *
 * NUNCA imprime el valor: archivo, tipo y un prefijo de 4 caracteres (regla de "secretos en
 * pantalla" de CLAUDE.md). Un hallazgo que cita la credencial la copia a los logs de CI.
 *
 * Exit 0 = limpio · 1 = hay algo con forma de credencial viva · 2 = no pude auditar.
 */
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (args) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });

const FIRMAS = [
  ['Supabase (sbp_)', /sbp_[A-Za-z0-9]{36,}/],
  ['OpenAI/OpenRouter/Anthropic (sk-)', /\bsk-[A-Za-z0-9_-]{24,}/],
  ['Stripe (sk_live/rk_live/whsec_)', /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}|\bwhsec_[A-Za-z0-9]{20,}/],
  ['GitHub (ghp_/gho_/ghs_/github_pat_)', /\bgh[pos]_[A-Za-z0-9]{36}|\bgithub_pat_[A-Za-z0-9_]{50,}/],
  ['Slack (xox*)', /\bxox[baprs]-[A-Za-z0-9-]{12,}/],
  ['AWS (AKIA)', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API (AIza)', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['DigitalOcean (dop_v1_)', /\bdop_v1_[0-9a-f]{64}\b/],
  ['Docker Hub (dckr_pat_)', /\bdckr_pat_[A-Za-z0-9_-]{20,}/],
  ['npm (npm_)', /\bnpm_[A-Za-z0-9]{36}\b/],
  ['Resend (re_)', /\bre_[A-Za-z0-9]{20,}/],
  ['bot de Telegram', /\b\d{8,10}:AA[A-Za-z0-9_-]{32,}/],
  ['clave privada PEM', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['JWT con sus tres partes', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
  // Hetzner y compania no llevan prefijo: 64 hex sueltos. Se excluye lo precedido por `:`
  // para no cazar `sha256:...`, que es un ancla publica y no un secreto.
  ['hex de 64 sin prefijo (estilo HCLOUD)', /(?<![0-9a-f:])[0-9a-f]{64}(?![0-9a-f])/],
];

// `[^\S\n]*` y no `\s*`: con `\s*` el espacio cruza el salto de linea y captura el NOMBRE de
// la variable siguiente como si fuera el valor de esta. Produce hallazgos fantasma en todo
// bloque `.env` con variables vacias — o sea, en todo placeholder bien escrito.
const ASIGNACION = /^[^\S\n]*(?:export[^\S\n]+)?([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|DSN|CREDENTIAL)S?)[^\S\n]*[:=][^\S\n]*["']?([^"'\s#]{8,})/gm;

const MARCAS = /(your_|tu[-_]|xxx|\.\.\.|placeholder|ejemplo|example|dummy|fake|sample|change_?me|replace|todo|<|\$\{)/i;
/** Un placeholder se delata por lo que dice o por su pobreza: un secreto real tiene
 *  variedad de caracteres. Ninguna de las dos pruebas basta sola. */
const esPlaceholder = (v) =>
  v.startsWith('$') || MARCAS.test(v) || new Set(v.replace(/[^A-Za-z0-9]/g, '')).size < 8;

const NO_ESCANEAR = /audita-secretos\.mjs|verifica-gobernanza\.mjs|package-lock\.json/;

let rutas;
let blobs;
try {
  rutas = new Map();
  for (const linea of git(['rev-list', '--objects', '--all']).split('\n')) {
    const sp = linea.indexOf(' ');
    if (sp < 0) continue;
    const sha = linea.slice(0, sp);
    const ruta = linea.slice(sp + 1).trim();
    if (!ruta) continue;
    if (!rutas.has(sha)) rutas.set(sha, new Set());
    rutas.get(sha).add(ruta);
  }
  // Solo objetos ALCANZABLES desde alguna rama o tag: es exactamente lo que viaja en un
  // clon. `--batch-all-objects` incluiria tambien los sueltos —una rama borrada que aun no
  // ha pasado por `gc`— y eso es un falso rojo: ese blob ya no lo recibe nadie. Se
  // descubrio en el control negativo, cuando el auditor siguio en rojo tras borrar la rama
  // de prueba.
  const tamanos = new Map(
    git(['cat-file', '--batch-all-objects', '--batch-check=%(objectname) %(objecttype) %(objectsize)'])
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split(' '))
      .filter(([, tipo]) => tipo === 'blob')
      .map(([sha, , size]) => [sha, Number(size)]),
  );
  blobs = [...rutas.keys()]
    .filter((sha) => {
      const t = tamanos.get(sha);
      return t !== undefined && t > 0 && t < 2_000_000;
    })
    .map((sha) => ['blob', sha]);
} catch (e) {
  console.error(`✗ NO PUDE AUDITAR: ${e.message}`);
  console.error('  Exit 2 a proposito: no haber podido mirar NO es haber mirado y no ver nada.');
  process.exit(2);
}

const hallazgos = [];
let escaneados = 0;
for (const [, sha] of blobs) {
  const donde = [...(rutas.get(sha) ?? ['(blob sin ruta en ninguna rama)'])].join(', ');
  if (NO_ESCANEAR.test(donde)) continue;
  let contenido;
  try {
    contenido = git(['cat-file', 'blob', sha]);
  } catch {
    continue;
  }
  if (contenido.includes('\0')) continue; // binario
  escaneados++;
  const anota = (tipo, valor) =>
    hallazgos.push({ tipo, donde, sha, muestra: `${valor.slice(0, 4)}…(${valor.length} car.)` });

  for (const [nombre, patron] of FIRMAS) {
    const m = contenido.match(patron);
    if (m && !esPlaceholder(m[0])) anota(nombre, m[0]);
  }
  ASIGNACION.lastIndex = 0;
  let a;
  while ((a = ASIGNACION.exec(contenido)) !== null) {
    const [, clave, valor] = a;
    if (esPlaceholder(valor) || valor.length < 12) continue;
    if (/^(true|false|null|localhost|https?:\/\/|\d+$)/i.test(valor)) continue;
    anota(`asignacion sin pinta de placeholder (${clave})`, valor);
  }
}

const commits = git(['rev-list', '--all', '--count']).trim();
console.log(`Auditoria de credenciales — ${escaneados} blobs de texto, ${commits} commits, todas las ramas.`);
if (hallazgos.length === 0) {
  console.log('\x1b[32m✓ Limpio: ningun blob de la historia lleva una credencial con forma de viva.\x1b[0m');
  process.exit(0);
}
console.log(`\n\x1b[31m${hallazgos.length} hallazgo(s)\x1b[0m — el valor NO se imprime, solo su prefijo:\n`);
for (const h of hallazgos) {
  console.log(`  · ${h.tipo}\n      en: ${h.donde}\n      muestra: ${h.muestra}  (blob ${h.sha.slice(0, 8)})`);
}
console.log('\nSi es real: **rotarla es la contencion**, no borrar el commit. Reescribir la historia');
console.log('no invalida un valor que ya se filtro; rotar, si. Y despues, procedimiento de incidente (C6).');
process.exit(1);
