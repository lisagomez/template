#!/usr/bin/env node
/**
 * Presupuesto de contexto de la fabrica — control C8.
 *
 * Que problema resuelve: `CLAUDE.md`, el indice de memoria y las descripciones de los 22
 * skills entran en **cada sesion**, se usen o no. Nadie habia medido nunca cuanto cuesta
 * eso, asi que crecia sin que nadie lo notara — el mismo modo de falla que el rezago de
 * versiones y la pudricion de los documentos: **no habia sensor**.
 *
 * Que NO hace: no mide una sesion real (no ve el historial, ni las salidas de herramientas,
 * ni lo que el usuario pega). Mide **el suelo**: lo que se paga antes de escribir la primera
 * palabra. Decirlo importa — un gate que promete mas de lo que mide es peor que ninguno.
 *
 * Como cuenta:
 *   - Si `gpt-tokenizer` esta instalado (opcional, NO es dependencia del boilerplate: son
 *     27 MB que heredaria cada proyecto), usa BPE real y lo dice.
 *   - Si no, usa el ratio calibrado en `.claude/presupuesto-contexto.json`, que se midio
 *     contra ese mismo tokenizador sobre TODO el markdown de este repo. No es un 4 sacado
 *     de un blog: es una medicion con su muestra, su fecha y su margen.
 *
 * Exit 0 = dentro de presupuesto · 1 = algo se paso · 2 = no pude medir.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leeConImports } from './lee-instrucciones.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ruta = (p) => join(raiz, p);
const PRESUPUESTO = '.claude/presupuesto-contexto.json';

const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;

if (!existsSync(ruta(PRESUPUESTO))) {
  console.error(rojo(`✗ NO PUDE MEDIR: falta ${PRESUPUESTO}`));
  console.error('  Exit 2: sin presupuesto declarado, cualquier cifra que imprimiera no tendria contra que compararse.');
  process.exit(2);
}
let cfg;
try {
  cfg = JSON.parse(readFileSync(ruta(PRESUPUESTO), 'utf8'));
} catch (e) {
  console.error(rojo(`✗ NO PUDE MEDIR: ${PRESUPUESTO} no es JSON valido (${e.message})`));
  process.exit(2);
}
const ratio = cfg.calibracion?.ratio_chars_por_token;
if (!ratio || ratio <= 0) {
  console.error(rojo('✗ NO PUDE MEDIR: el presupuesto no declara `calibracion.ratio_chars_por_token`'));
  console.error('  Un contador sin calibracion declarada es un numero inventado con formato de medicion.');
  process.exit(2);
}

// --- El contador -----------------------------------------------------------
let cuenta;
let metodo;
try {
  // Sin extension: el `exports` del paquete mapea `./esm/*` a `./esm/*.js`, asi que
  // pedirlo con `.js` resuelve a `.js.js` y falla en silencio hacia el modo estimado.
  const { encode } = await import('gpt-tokenizer/esm/encoding/o200k_base');
  cuenta = (texto) => encode(texto).length;
  metodo = 'BPE real (o200k_base, `gpt-tokenizer` presente)';
} catch {
  cuenta = (texto) => Math.round(texto.length / ratio);
  metodo = `estimado: chars / ${ratio} — ${cfg.calibracion.margen ?? 'margen no declarado'}`;
}

// Los archivos de instrucciones se miden EXPANDIDOS: `CLAUDE.md` importa `AGENTS.md` y ese
// import se carga en contexto igual que si estuviera pegado. Medir el archivo sin expandir
// reportaria una caida de ~6700 tokens que NO existe — un ahorro inventado es peor que no
// medir nada.
const INSTRUCCIONES = new Set(['CLAUDE.md', 'GEMINI.md', 'AGENTS.md']);
const lee = (p) => (INSTRUCCIONES.has(p)
  ? leeConImports(ruta(p))
  : existsSync(ruta(p)) ? readFileSync(ruta(p), 'utf8') : null);
const filas = [];
const excesos = [];

const anota = (etiqueta, tokens, tope, nivel) => {
  filas.push({ etiqueta, tokens, tope, nivel });
  if (tope && tokens > tope) {
    excesos.push(`${etiqueta}: ${tokens} tokens sobre un tope de ${tope} (+${tokens - tope})`);
  }
};

// --- Nivel 1: lo que se paga SIEMPRE ---------------------------------------
const n1 = cfg.niveles?.siempre ?? {};
let totalSiempre = 0;
for (const archivo of n1.archivos ?? []) {
  const texto = lee(archivo);
  if (texto === null) {
    console.error(rojo(`✗ NO PUDE MEDIR: el presupuesto nombra ${archivo}, que no existe`));
    process.exit(2);
  }
  const t = cuenta(texto);
  totalSiempre += t;
  anota(archivo, t, n1.por_archivo?.[archivo], 'siempre');
}
// Las descripciones (frontmatter) de los skills viajan en el contexto sin invocar nada.
let descripciones = 0;
let nSkills = 0;
const dirSkills = ruta('.claude/skills');
if (n1.incluye_descripciones_de_skills && existsSync(dirSkills)) {
  for (const d of readdirSync(dirSkills, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const texto = lee(`.claude/skills/${d.name}/SKILL.md`);
    if (texto === null) continue;
    nSkills++;
    const m = texto.match(/^---([\s\S]*?)^---/m);
    if (m) descripciones += cuenta(m[1]);
  }
  totalSiempre += descripciones;
  anota(`descripciones de ${nSkills} skills`, descripciones, n1.presupuesto_descripciones, 'siempre');
}
anota('TOTAL que se paga en cada sesion', totalSiempre, n1.presupuesto, 'siempre');

// --- Nivel 2: el espejo de otro arnes --------------------------------------
for (const archivo of cfg.niveles?.espejo?.archivos ?? []) {
  const texto = lee(archivo);
  if (texto === null) continue;
  anota(archivo, cuenta(texto), cfg.niveles.espejo.por_archivo?.[archivo], 'espejo');
}

// --- Nivel 3: lo que cuesta invocar un skill -------------------------------
const n3 = cfg.niveles?.por_invocacion ?? {};
let suma = 0;
let mayor = { nombre: '—', tokens: 0 };
if (existsSync(dirSkills)) {
  for (const d of readdirSync(dirSkills, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const texto = lee(`.claude/skills/${d.name}/SKILL.md`);
    if (texto === null) continue;
    const t = cuenta(texto);
    suma += t;
    if (t > mayor.tokens) mayor = { nombre: d.name, tokens: t };
    if (n3.presupuesto_por_skill && t > n3.presupuesto_por_skill) {
      excesos.push(`skill ${d.name}: ${t} tokens sobre un tope de ${n3.presupuesto_por_skill} (+${t - n3.presupuesto_por_skill})`);
    }
  }
  anota(`skill mas caro (${mayor.nombre})`, mayor.tokens, n3.presupuesto_por_skill, 'por invocacion');
  anota('suma de los 22 skills', suma, n3.presupuesto_suma, 'por invocacion');
}

// --- Salida ----------------------------------------------------------------
console.log(gris(`Metodo: ${metodo}`));
console.log(gris(`Calibrado el ${cfg.calibracion.medido ?? '?'} sobre ${cfg.calibracion.muestra ?? '?'}\n`));
let nivelActual = null;
for (const f of filas) {
  if (f.nivel !== nivelActual) {
    nivelActual = f.nivel;
    console.log(gris(`— ${nivelActual} —`));
  }
  const pct = f.tope ? `${Math.round((f.tokens / f.tope) * 100)}% de ${f.tope}` : gris('sin tope');
  const marca = f.tope && f.tokens > f.tope ? rojo('✗') : verde('✓');
  console.log(`  ${marca} ${f.etiqueta.padEnd(38)} ${String(f.tokens).padStart(6)} tokens  ${pct}`);
}

if (excesos.length === 0) {
  console.log(verde(`\n✓ Contexto dentro de presupuesto.`));
  console.log(gris('  Recuerda que esto mide el SUELO: no ve el historial, ni las salidas de herramientas,'));
  console.log(gris('  ni lo que se pegue en la sesion. Lo que mide, lo mide de verdad.'));
  process.exit(0);
}
console.log(rojo(`\n${excesos.length} presupuesto(s) excedido(s):`));
for (const e of excesos) console.log(`  · ${e}`);
console.log('\nOpciones, por orden de preferencia: recortar lo que ya no aporta · mover detalle a un');
console.log('documento que se lea BAJO DEMANDA (no en el contexto base) · o subir el tope en el JSON,');
console.log('que es una decision consciente y queda en el diff — no un descuido.');
process.exit(1);
