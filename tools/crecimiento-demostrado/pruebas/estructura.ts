/**
 * La estructura que garantiza la honestidad, comprobada leyendo el código:
 *  - el núcleo NUNCA importa la verdad plantada ni el laboratorio (la respuesta no se fuga);
 *  - la verdad no importa nada del sistema (es otro camino de cálculo);
 *  - ningún agente llega al kernel, al motor o a la narración sin pasar por el orquestador;
 *  - el núcleo no importa React, Next ni Supabase; archivos de hasta 500 líneas.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const archivos = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? archivos(join(dir, n)) : n.endsWith('.ts') ? [join(dir, n)] : []));
const importsDe = (f: string) => [...readFileSync(f, 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)[^'"]*from\s+'([^']+)'/g)].map((m) => m[1]!);
const todos = archivos(SRC).map((f) => ({ ruta: relative(SRC, f), imports: importsDe(f), lineas: readFileSync(f, 'utf8').split('\n').length }));

test('el núcleo nunca importa la verdad plantada ni el laboratorio', () => {
  const nucleo = todos.filter((a) => !/^(sinteticos|laboratorio)\//.test(a.ruta));
  const fugas = nucleo.flatMap((a) => a.imports.filter((i) => /sinteticos|laboratorio/.test(i)).map((i) => `${a.ruta} → ${i}`));
  assert.deepEqual(fugas, []);
});

test('la verdad plantada se calcula sin ningún módulo del sistema', () => {
  const verdad = todos.find((a) => a.ruta === 'sinteticos/verdad.ts')!;
  assert.deepEqual(verdad.imports, ['./libro.js']);
  const libro = todos.find((a) => a.ruta === 'sinteticos/libro.ts')!;
  assert.ok(libro.imports.every((i) => i.startsWith('./')), 'el libro tampoco');
});

test('los agentes no tocan el kernel ni el motor: solo el orquestador los conecta', () => {
  const agentes = todos.filter((a) => a.ruta.startsWith('agentes/') && a.ruta !== 'agentes/orquestador.ts');
  const directos = agentes.flatMap((a) => a.imports.filter((i) => /kernel\/(kernel|reglas|teoremas)|motor\/(evalua|indice|clases)|narracion\/inclusion/.test(i)).map((i) => `${a.ruta} → ${i}`));
  assert.deepEqual(directos, []);
});

test('el núcleo no importa React, Next ni Supabase; el SDK de A2A solo en ./a2a', () => {
  const prohibidos = todos.flatMap((a) => a.imports.filter((i) => /^(react|next|@supabase)/.test(i) || (i.startsWith('@a2a-js') && !a.ruta.startsWith('a2a/'))).map((i) => `${a.ruta} → ${i}`));
  assert.deepEqual(prohibidos, []);
});

test('archivos de hasta 500 líneas', () => {
  assert.deepEqual(todos.filter((a) => a.lineas > 500).map((a) => `${a.ruta}: ${a.lineas}`), []);
});
