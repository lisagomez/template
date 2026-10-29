#!/usr/bin/env node
/** `npm run dev` con el entorno del laboratorio de Ágora (tools/agora/.laboratorio/entorno). Sin él, Ágora sale apagada. */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ARCHIVO = join(RAIZ, 'tools/agora/.laboratorio/entorno');
const env = { ...process.env };
if (existsSync(ARCHIVO)) {
  for (const l of readFileSync(ARCHIVO, 'utf8').split('\n')) if (/^[A-Z_]+=/.test(l)) env[l.slice(0, l.indexOf('='))] = l.slice(l.indexOf('=') + 1);
} else console.log('sin entorno del laboratorio: corre primero npm run agora:laboratorio (Ágora saldrá apagada)');
// Solo en esta máquina: la Puerta responde a un Host local, y un Host se falsifica desde la red si el servidor escucha
// en todas las interfaces (lo que hace `next dev` por defecto).
const argumentos = process.argv.slice(2);
const anfitrion = argumentos.some((a) => a === '-H' || a.startsWith('--hostname')) ? [] : ['-H', '127.0.0.1'];
const hijo = spawn('npm', ['run', 'dev', '--', ...anfitrion, ...argumentos], { cwd: RAIZ, env, stdio: 'inherit' });
hijo.on('exit', (c) => process.exit(c ?? 0));
