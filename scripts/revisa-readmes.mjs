#!/usr/bin/env node
/**
 * Auditor de los README de producto contra el contrato «product first» (skill `readme`).
 *
 * Todo README de una herramienta o app abre con qué hace, casos de uso y requerimientos de
 * infraestructura, y después lo demás. El contrato vive en `.claude/skills/readme/contrato.json`;
 * este script lo aplica sin modelo, así que lo puede correr cualquier arnés y un gate.
 *
 * Cada README del repo cae en una de tres casillas: EN ALCANCE (se audita), EXCLUIDO (con su
 * motivo declarado en el contrato) o SIN CLASIFICAR (rojo: un README nuevo que nadie decidió si
 * es de producto no se queda sin mirar). Las carpetas de producto sin README se listan como
 * pendientes: se avisan, no se crean solas.
 *
 * Uso:  node scripts/revisa-readmes.mjs                  (el árbol de trabajo, con lo no versionado)
 *       node scripts/revisa-readmes.mjs <ruta>...         (solo esos README)
 *       node scripts/revisa-readmes.mjs --desde <ref>     (el estado de una ref de git, sin checkout)
 *       node scripts/revisa-readmes.mjs --json            (para otros arneses)
 *       node scripts/revisa-readmes.mjs --prueba          (la prueba de la prueba: siembra ocho
 *         violaciones —casos de uso antes que qué hace, sin infraestructura, «Instalar» antes de las
 *         de producto, un README nuevo en alcance que entra solo por el glob, un valor de variable de
 *         entorno, un README sin clasificar, cómputo sin cifra ni «no medido», y qué hace sin decir
 *         qué no hace— y exige que las ocho caigan)
 * Exit: 0 todo conforme · 1 algún README no conforme o sin clasificar.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUTA_CONTRATO, audita, revisaReadme } from './lib/readmes.mjs';

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const ambar = (s) => `\x1b[33m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;
const git = (args) => execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** Archivos y lector: del árbol de trabajo (versionados + nuevos no ignorados) o de una ref. */
function fuente(ref) {
  if (ref) {
    const archivos = git(['ls-tree', '-r', '--name-only', ref]).split('\n').filter(Boolean);
    return { archivos, leer: (a) => git(['show', `${ref}:${a}`]) };
  }
  const archivos = git(['ls-files', '-co', '--exclude-standard']).split('\n').filter(Boolean)
    .filter((a) => existsSync(join(RAIZ, a)));
  return { archivos, leer: (a) => readFileSync(join(RAIZ, a), 'utf8') };
}

const valorDe = (bandera) => {
  const i = process.argv.indexOf(bandera);
  return i === -1 ? null : process.argv[i + 1];
};

function imprime(r, contrato, soloRutas) {
  const orden = contrato.secciones.map((s) => s.titulo).join(' → ');
  console.log(gris(`Contrato product first (${RUTA_CONTRATO}): ${orden} → lo demás\n`));
  for (const { ruta, faltas } of r.evaluados) {
    console.log(faltas.length ? rojo(`  ✗ ${ruta}`) : verde(`  ✓ ${ruta}`));
    for (const f of faltas) console.log(`      · ${f}`);
  }
  if (soloRutas) return;
  console.log(gris(`\nExcluidos con motivo (${r.excluidos.length}):`));
  for (const x of r.excluidos) console.log(gris(`  · ${x.ruta} — ${x.motivo}`));
  console.log(ambar(`\nSin README: pendientes, se listan y no se crean solos (${r.sinReadme.length}):`));
  for (const c of r.sinReadme) console.log(ambar(`  · ${c}`));
  if (r.sinClasificar.length) {
    console.log(rojo(`\nSin clasificar (${r.sinClasificar.length}): ¿de producto (alcance) o excluido con motivo?`));
    for (const s of r.sinClasificar) console.log(rojo(`  · ${s}`));
  }
}

function resumen(r) {
  const mal = r.evaluados.filter((e) => e.faltas.length).length;
  const texto = `${r.evaluados.length} en alcance · ${r.evaluados.length - mal} conformes · ${mal} no conformes`
    + ` · ${r.excluidos.length} excluidos · ${r.sinReadme.length} sin README (pendientes)`
    + (r.sinClasificar.length ? ` · ${r.sinClasificar.length} sin clasificar` : '');
  const ok = mal === 0 && r.sinClasificar.length === 0;
  console.log(`\n${ok ? verde(`README product first al día: ${texto}.`) : rojo(`README NO conformes: ${texto}.`)}`);
  return ok;
}

/* -------------------------------------------------------------- la prueba de la prueba */

const SEMBRADA = 'tools/herramienta-sembrada/README.md';
const quita = (texto, titulo) => texto.replace(new RegExp(`\\n## ${titulo}\\n[\\s\\S]*?(?=\\n## )`), '');
const seccion = (texto, titulo) => texto.match(new RegExp(`\\n## ${titulo}\\n[\\s\\S]*?(?=\\n## )`))[0];

/** Las ocho siembras, todas sobre una copia CONFORME de la plantilla del skill. */
function siembras(buena) {
  const cu = seccion(buena, 'Casos de uso');
  const clave = ['OPENROUTER', 'API', 'KEY'].join('_');
  const valor = ['sk', 'or', 'v1', 'b7c4e9a1d3f2'.repeat(3)].join('-');
  return [
    ['casos de uso antes que qué hace', buena.replace(cu, '').replace('\n## Qué hace', `${cu}\n## Qué hace`)],
    ['falta la sección de infraestructura', quita(buena, 'Requerimientos de infraestructura')],
    ['«Instalar» antes de las tres de producto', buena.replace('\n## Qué hace', '\n## Instalar\n\n```bash\nnpm install x\n```\n\n## Qué hace')],
    ['un valor de variable de entorno escrito en el README', `${buena}\n\`\`\`bash\n${clave}=${valor} npm run demo\n\`\`\`\n`],
    // La viñeta entera, con sus líneas de continuación: si queda una, la siembra no siembra.
    ['cómputo sin cifra ni «no medido»', buena.replace(/(\*\*CPU, GPU y memoria\*\*)[^\n]*(\n {2}[^\n]*)*/, '$1: lo que haga falta.')],
    ['qué hace sin decir qué no hace', buena.replace(/\n### Qué no hace\n[\s\S]*?(?=\n## )/, '')],
  ];
}

function prueba(contrato, base) {
  const buena = readFileSync(join(RAIZ, '.claude/skills/readme/plantilla.md'), 'utf8');
  const plantilla = `tools/herramienta-de-prueba/README.md`;
  const conPlantilla = { archivos: [...base.archivos, plantilla], leer: (a) => (a === plantilla ? buena : base.leer(a)) };
  const faltasPlantilla = revisaReadme(buena, contrato);
  if (faltasPlantilla.length) {
    console.log(rojo(`La plantilla del skill NO cumple su propio contrato: ${faltasPlantilla.join(' | ')}`));
    process.exit(1);
  }
  const clave = (r) => new Set([
    ...r.evaluados.flatMap((e) => e.faltas.map((f) => `${e.ruta}: ${f}`)),
    ...r.sinClasificar.map((s) => `sin clasificar: ${s}`),
  ]);
  const antes = clave(audita({ ...conPlantilla, contrato }));
  const casos = [
    ...siembras(buena).map(([nombre, texto]) => [nombre, { archivos: conPlantilla.archivos, leer: (a) => (a === plantilla ? texto : conPlantilla.leer(a)) }]),
    ['README nuevo en alcance, sin conformar, que entra solo por el glob', {
      archivos: [...conPlantilla.archivos, SEMBRADA], leer: (a) => (a === SEMBRADA ? '# Nueva\n\n## Uso\n\n`npm i`\n' : conPlantilla.leer(a)),
    }],
    ['README fuera de alcance y sin motivo de exclusión', {
      archivos: [...conPlantilla.archivos, 'apps/nueva/README.md'], leer: conPlantilla.leer,
    }],
  ];
  let cazadas = 0;
  for (const [nombre, caso] of casos) {
    const nuevas = [...clave(audita({ ...caso, contrato }))].filter((f) => !antes.has(f));
    if (nuevas.length) { cazadas += 1; console.log(`CAZADA ${nombre} — ${nuevas[0]}`); }
    else console.log(rojo(`VIVA   ${nombre} — el auditor no la vio`));
  }
  if (antes.size) console.log(ambar(`  aviso: el árbol ya tiene ${antes.size} falta(s); no cuentan como cazas`));
  console.log(`\nprueba de la prueba: ${cazadas} de ${casos.length} siembras cazadas`);
  process.exit(cazadas === casos.length ? 0 : 1);
}

function main() {
  const contrato = JSON.parse(readFileSync(join(RAIZ, RUTA_CONTRATO), 'utf8'));
  const base = fuente(valorDe('--desde'));
  if (process.argv.includes('--prueba')) return prueba(contrato, base);
  const rutas = process.argv.slice(2).filter((a, i, t) => !a.startsWith('--') && t[i - 1] !== '--desde');
  let r = audita({ ...base, contrato });
  if (rutas.length) r = { ...r, evaluados: r.evaluados.filter((e) => rutas.includes(e.ruta)) };
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.evaluados.every((e) => !e.faltas.length) && !r.sinClasificar.length ? 0 : 1);
  }
  imprime(r, contrato, rutas.length > 0);
  process.exit(resumen(r) ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
