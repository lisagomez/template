#!/usr/bin/env node
/**
 * GEMINI.md se GENERA desde AGENTS.md; no se edita a mano.
 *
 * Por que: GEMINI.md era una copia condensada mantenida a mano de AGENTS.md. Nadie comparaba
 * los dos, y ya divergian (Comandos, Gobernanza, Aprendizajes) sin que ningun gate lo viera —
 * la misma pudricion silenciosa que el verificador persigue en todo lo demas. Derivarlo
 * elimina la clase entera del fallo: hay UNA fuente y una funcion pura que la proyecta.
 *
 * Que proyecta: SOLO las secciones de AGENTS.md que obligan (decision tree, reglas de codigo,
 * comandos, gobernanza, filosofia, auto-blindaje, golden path), verbatim. Lo informativo vive
 * en .claude/rules/ y Gemini no lo carga — igual que antes, y se le dice donde esta.
 *
 * Uso:  node scripts/sincroniza-gemini.mjs           # (re)escribe GEMINI.md
 *       node scripts/sincroniza-gemini.mjs --check   # exit 1 si GEMINI.md diverge
 * El verificador de gobernanza corre el --check: editar GEMINI.md a mano pone el gate en rojo.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Secciones `## ` de AGENTS.md que entran, en este orden. Las demas (skills, flujos,
 *  arquitectura, MCPs, estructura, aprendizajes) son punteros a .claude/rules/ y se omiten. */
export const SECCIONES_QUE_OBLIGAN = [
  'Filosofia: Agent-First',
  'Decision Tree: Que Hacer con Cada Request',
  'Auto-Blindaje',
  'Golden Path (Un Solo Stack)',
  'Reglas de Codigo',
  'Comandos npm',
  'Gobernanza (leer antes de tocar skills, datos o produccion)',
];

const CABECERA = `<!-- GENERADO por scripts/sincroniza-gemini.mjs desde AGENTS.md el ultimo CDC que lo toco.
     NO editar a mano: el verificador de gobernanza falla si diverge. Regenerar con
     \`npm run sincroniza:gemini\`. Solo lleva las secciones que OBLIGAN; lo informativo vive
     en .claude/rules/*.md (Gemini no las carga: leelas al tocar esos archivos). -->
`;

const SOLO_GEMINI = `## Solo para Gemini

- **Skills**: \`.claude/skills/<nombre>/SKILL.md\` (23). Leer el que aplique segun el decision tree.
- **Rules**: \`.claude/rules/*.md\` no se cargan solas en este arnes: aprendizajes del stack y
  de gobernanza, arquitectura, flujos y la sintaxis verificada de QA viven ahi.
- **Memoria del proyecto**: \`.claude/memory/MEMORY.md\` (indice) y sus carpetas.
`;

/** Parte AGENTS.md en secciones \`## \` (el preambulo antes de la primera es la 0). */
function secciones(agents) {
  const partes = agents.split(/(?=^## )/m);
  const mapa = new Map();
  for (const p of partes) {
    const m = p.match(/^## (.+?)\s*$/m);
    if (m) mapa.set(m[1].trim(), p.replace(/\s+$/, '') + '\n');
  }
  return { preambulo: partes[0], mapa };
}

export function generaGemini(raiz) {
  const agents = readFileSync(join(raiz, 'AGENTS.md'), 'utf8');
  const { preambulo, mapa } = secciones(agents);
  const faltan = SECCIONES_QUE_OBLIGAN.filter((s) => !mapa.has(s));
  if (faltan.length) {
    throw new Error(`AGENTS.md ya no tiene: ${faltan.join(' · ')} — si se renombro, actualizar SECCIONES_QUE_OBLIGAN`);
  }
  // El preambulo (titulo + cita) se conserva tal cual; el bloque que `next dev` re-anade al
  // final de AGENTS.md no se proyecta: es del arnes, no de la fabrica.
  const cuerpo = SECCIONES_QUE_OBLIGAN.map((s) => mapa.get(s)).join('\n---\n\n');
  return `${CABECERA}\n${preambulo.trim()}\n\n---\n\n${cuerpo}\n---\n\n${SOLO_GEMINI}`;
}

/** true si GEMINI.md coincide con lo generado; si no, la razon. */
export function geminiSincronizado(raiz) {
  const destino = join(raiz, 'GEMINI.md');
  if (!existsSync(destino)) return 'GEMINI.md no existe';
  const actual = readFileSync(destino, 'utf8');
  let esperado;
  try {
    esperado = generaGemini(raiz);
  } catch (e) {
    return e.message;
  }
  return actual === esperado ? true : 'GEMINI.md diverge de lo que genera sincroniza-gemini.mjs';
}

// --- CLI -------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const check = process.argv.includes('--check');
  if (check) {
    const r = geminiSincronizado(raiz);
    if (r === true) {
      console.log('\x1b[32m✓ GEMINI.md esta sincronizado con AGENTS.md.\x1b[0m');
      process.exit(0);
    }
    console.error(`\x1b[31m✗ ${r}\x1b[0m`);
    console.error('  Regenerar: npm run sincroniza:gemini (y revisar el diff: es un CDC si AGENTS.md cambio).');
    process.exit(1);
  }
  const salida = generaGemini(raiz);
  writeFileSync(join(raiz, 'GEMINI.md'), salida);
  console.log(`GEMINI.md regenerado desde AGENTS.md (${salida.split('\n').length} lineas, ${salida.length} chars).`);
}
