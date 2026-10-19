#!/usr/bin/env node
/**
 * Antes de las pruebas: las pruebas montan el nucleo sobre las piezas REALES de la casa (las `Reservas` de
 * `tools/calendario`, el enrutador de `tools/bucle-voz` y el simulador de Meta de `tools/ventas-whatsapp`), importadas
 * de su `dist/`. En un clon limpio ese
 * `dist/` no existe hasta que algo lo construye; sin esto la suite fallaria diciendo «no se encuentra el
 * modulo», que suena a import mal escrito y es un build que falta (la leccion de `scripts/prepara-gate.mjs`).
 * El paquete NO depende de ellas en tiempo de ejecucion: se inyectan.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const pieza of ['calendario', 'bucle-voz', 'ventas-whatsapp']) {
  const dir = resolve(aqui, '..', pieza);
  if (!existsSync(join(dir, 'dist', 'index.js'))) execFileSync('npm', ['run', 'build'], { cwd: dir, stdio: 'inherit' });
}
execFileSync('npm', ['run', 'build'], { cwd: aqui, stdio: 'inherit' });
