#!/usr/bin/env node
/**
 * JOB DE PLATAFORMA DECLARADO (C7): aplica supabase/migrations/ al proyecto con la cadena de conexión
 * de Postgres (SUPABASE_DB_URL en .env.local). Es la ÚNICA pieza que la usa; ninguna superficie de la
 * app la lee. Las migraciones son idempotentes y no destructivas; una destructiva pasa por gate humano.
 * La cadena nunca se imprime: toda salida pasa por `enmascara`. CLI de Supabase pineada (C1).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const CLI = 'supabase@2.118.0';
const entorno = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const url = entorno.SUPABASE_DB_URL;
if (!url) { console.error('Falta SUPABASE_DB_URL en .env.local (Dashboard → Connect → Session pooler). No se aplicó nada.'); process.exit(2); }
const enmascara = (s) => s.replaceAll(url, '‹cadena de conexión›').replace(/postgres(ql)?:\/\/\S+/g, 'postgres://‹oculto›').replace(/[a-z0-9-]+\.pooler\.supabase\.com/g, '‹pooler›').replace(/db\.[a-z0-9]{20}\.supabase\.co/g, '‹base›');
const seco = process.argv.includes('--seco');
const r = spawnSync('npx', ['-y', CLI, 'db', 'push', '--db-url', url, '--include-all', ...(seco ? ['--dry-run'] : [])], { input: 'y\n', encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
process.stdout.write(enmascara(r.stdout ?? ''));
process.stderr.write(enmascara(r.stderr ?? ''));
process.exit(r.status ?? 1);
