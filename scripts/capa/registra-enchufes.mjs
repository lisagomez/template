#!/usr/bin/env node
/**
 * Escribe el registro de enchufes de la app (`src/shared/capa/enchufes.ts`) a partir de los `enchufe.json` del árbol.
 * Turbopack no importa por glob, así que el registro es un archivo generado; el verificador de enchufes lo compara con
 * lo que hay en disco y se pone rojo si alguien añade un enchufe sin registrarlo (o lo edita a mano).
 *
 * Uso: node scripts/capa/registra-enchufes.mjs [--comprueba]   (sin escribir: exit 1 si está desfasado)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contexto } from './verifica-enchufes.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const REGISTRO = 'src/shared/capa/enchufes.ts';

export function generaRegistro(archivos) {
  const ordenados = [...archivos].sort();
  const desde = (a) => relative(join(RAIZ, dirname(REGISTRO)), join(RAIZ, a)).replace(/^(?!\.)/, './');
  return [
    '// ALTO: ARTEFACTO AUTOGENERADO por `node scripts/capa/registra-enchufes.mjs`. No lo edites a mano: se regenera.',
    '/**',
    ' * Registro de los enchufes de la app. GENERADO por `node scripts/capa/registra-enchufes.mjs`: no se edita a mano',
    ' * (el verificador de enchufes lo compara con los `enchufe.json` del árbol). Cada uno se valida al cargar.',
    ' */',
    "import { EsquemaEnchufe, type Enchufe } from '../../../tools/capa/dist/index.js';",
    ...ordenados.map((a, k) => `import e${k} from '${desde(a)}' with { type: 'json' };`),
    '',
    `export const ARCHIVOS = ${JSON.stringify(ordenados, null, 2).replace(/"/g, "'")} as const;`,
    '',
    `export const ENCHUFES: Enchufe[] = [${ordenados.map((_, k) => `e${k}`).join(', ')}].map((e) => EsquemaEnchufe.parse(e));`,
    '',
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const archivos = contexto().enchufes.map((e) => e.archivo);
  const nuevo = generaRegistro(archivos);
  const actual = existsSync(join(RAIZ, REGISTRO)) ? readFileSync(join(RAIZ, REGISTRO), 'utf8') : '';
  if (process.argv.includes('--comprueba')) {
    console.log(actual === nuevo ? `✓ ${REGISTRO} al día (${archivos.length} enchufes)` : `✗ ${REGISTRO} desfasado: node scripts/capa/registra-enchufes.mjs`);
    process.exit(actual === nuevo ? 0 : 1);
  }
  writeFileSync(join(RAIZ, REGISTRO), nuevo);
  console.log(`✓ ${REGISTRO}: ${archivos.length} enchufes`);
}
