#!/usr/bin/env node
/**
 * Control C2 — suite de regresion de skills.
 *
 * Capa A (por defecto): contratos estructurales de cada SKILL.md. Deterministas, sin
 *   invocar al modelo, corren en cada build. Comparan por FORMA, no por texto: da igual
 *   como este redactado el skill mientras siga declarando lo que no se negocia.
 *
 * Capa B (--trampa): corpus de entradas adversariales que DEBEN escalar o negarse.
 *   Requiere invocar al modelo, asi que no es determinista ni gratuita: se corre en cada
 *   CDC, no en cada build. Aqui solo se verifica que el corpus este completo y se lista.
 *
 * Verde = promovible. Rojo = el cambio de modelo/skill NO se promueve.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR_SKILLS = join(raiz, '.claude/skills');
const DIR_GOLDEN = join(raiz, '.claude/gobernanza/golden-sets');
const modoTrampa = process.argv.includes('--trampa');

const fallos = [];
const ok = [];
const anota = (desc, cond, pista) => (cond ? ok.push(desc) : fallos.push({ desc, pista }));

// ---------------------------------------------------------------- capa B
if (modoTrampa) {
  const ruta = join(DIR_GOLDEN, 'casos-trampa.md');
  if (!existsSync(ruta)) {
    console.error('No existe el corpus de casos-trampa. C2 capa B esta vacia.');
    process.exit(1);
  }
  const corpus = readFileSync(ruta, 'utf8');
  const casos = [...corpus.matchAll(/^##\s+(T\d+)\s*·\s*(.+)$/gm)];
  const esperado = new Map();
  anota(`el corpus declara casos (${casos.length})`, casos.length > 0, 'corpus vacio');
  for (const [, id, titulo] of casos) {
    const bloque = corpus.split(new RegExp(`^##\\s+${id}\\s`, 'm'))[1]?.split(/^## /m)[0] ?? '';
    const b64 = bloque.match(/\*\*Expectativa \(b64\):\*\*\s*```([\s\S]*?)```/);
    anota(
      `${id} declara entrada y expectativa`,
      /\*\*Entrada:\*\*/.test(bloque) && b64 !== null,
      'un caso sin expectativa no se puede evaluar: es decoracion',
    );
    if (b64) esperado.set(id, Buffer.from(b64[1].replace(/\s+/g, ''), 'base64').toString('utf8'));
  }
  console.log('\nCasos-trampa a ejecutar en este CDC (sesion limpia, comparacion estructural):\n');
  for (const [, id, titulo] of casos) {
    console.log(`\n  \x1b[1m${id} · ${titulo}\x1b[0m`);
    const exp = esperado.get(id);
    if (exp) console.log(exp.split('\n').map((l) => `      ${l}`).join('\n'));
  }
  console.log('\n  \x1b[2mLas expectativas viven en base64 para que un agente no las lea por accidente.');
  console.log('  Ejecutar cada caso en una SESION FRIA, sin el contexto del cambio.\x1b[0m');
  console.log('  Resultado -> anotarlo en .claude/gobernanza/BITACORA-CDC.md\n');
}

// ---------------------------------------------------------------- capa A
if (!modoTrampa) {
  const contratos = JSON.parse(readFileSync(join(DIR_GOLDEN, 'contratos.json'), 'utf8'));
  const skills = readdirSync(DIR_SKILLS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  anota(`hay skills que verificar (${skills.length})`, skills.length > 0, 'no se encontro ningun skill');

  for (const skill of skills) {
    const ruta = join(DIR_SKILLS, skill, 'SKILL.md');
    if (!existsSync(ruta)) {
      anota(`${skill}: tiene SKILL.md`, false, 'un directorio en skills/ sin SKILL.md no es un skill');
      continue;
    }
    const contenido = readFileSync(ruta, 'utf8');
    const aplicables = [...(contratos.todos_los_skills ?? []), ...(contratos.skills?.[skill] ?? [])];
    for (const { patron, porque } of aplicables) {
      anota(
        `${skill}: ${porque}`,
        new RegExp(patron, 'm').test(contenido),
        `no se encontro /${patron}/ en ${skill}/SKILL.md`,
      );
    }
  }

  // Un skill con contrato declarado que ya no existe = contrato huerfano.
  for (const nombre of Object.keys(contratos.skills ?? {})) {
    anota(
      `el contrato de "${nombre}" apunta a un skill existente`,
      skills.includes(nombre),
      'contrato huerfano: el skill se renombro o se borro sin actualizar contratos.json',
    );
  }
}

// ---------------------------------------------------------------- reporte
const total = ok.length + fallos.length;
for (const l of ok) console.log(`  \x1b[32m✓\x1b[0m ${l}`);
for (const f of fallos) {
  console.log(`  \x1b[31m✗\x1b[0m ${f.desc}`);
  console.log(`      \x1b[2m↳ ${f.pista}\x1b[0m`);
}
console.log('');
const capa = modoTrampa ? 'C2 capa B (casos-trampa)' : 'C2 capa A (contratos)';
if (fallos.length === 0) {
  console.log(`\x1b[32m${capa}: ${ok.length}/${total} en verde — promovible.\x1b[0m`);
  process.exit(0);
}
console.log(`\x1b[31m${capa}: ${fallos.length} de ${total} fallaron — NO promovible.\x1b[0m`);
console.log('\x1b[2mUn skill perdio una regla que no se negocia. Sin excepciones ni "se ve bien".\x1b[0m');
process.exit(1);
