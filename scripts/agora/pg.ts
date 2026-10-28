/**
 * Las suites y los sabotajes de `tools/agora` en el Postgres REAL del laboratorio (cada prueba en una base nueva que
 * se borra al terminar). Es la evidencia de cada fase: la versión del servidor sale en el output.
 * Uso: node scripts/agora/pg.ts [--fase nucleo]   ·   sin laboratorio: npm run agora:laboratorio primero.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leeEntorno } from './laboratorio.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '../..');
const e = leeEntorno();
if (!e.AGORA_PG_URL) { console.error('✗ no hay laboratorio: npm run agora:laboratorio'); process.exit(2); }
const admin = e.AGORA_PG_URL.replace(/\/agora_lab$/, '/postgres');
const env = { ...process.env, AGORA_PG_URL: admin };
const dir = join(RAIZ, 'tools/agora');
const fase = process.argv.indexOf('--fase') > 0 ? ['--fase', process.argv[process.argv.indexOf('--fase') + 1]!] : [];
const pruebas = spawnSync('node', ['--test', '--test-concurrency=1', '--test-reporter=spec', ...(fase.length ? [`pruebas/${fase[1]}.ts`] : ['pruebas/[a-z]*.ts']), ], { cwd: dir, env, encoding: 'utf8' });
const salida = `${pruebas.stdout}${pruebas.stderr}`;
console.log(salida.split('\n').filter((l) => /^(✔|✖|ℹ (tests|pass|fail))|^\s+(✔|✖)/.test(l.trim()) || /^ℹ/.test(l)).join('\n'));
const sabotajes = spawnSync('node', ['evidencia/sabotajes.ts', ...fase], { cwd: dir, env, encoding: 'utf8', stdio: 'inherit' });
process.exit(pruebas.status || sabotajes.status ? 1 : 0);
