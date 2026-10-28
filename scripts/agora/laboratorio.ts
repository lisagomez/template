/**
 * El laboratorio de Ágora: un Postgres REAL y efímero en Docker (`supabase/postgres` 17, contenedor propio
 * `agora-pg-lab` solo en 127.0.0.1), con las migraciones de `tools/agora` y la siembra FICTICIA. Deja el entorno de la
 * app en `tools/agora/.laboratorio/entorno` (ignorado por git; contraseña y secreto aleatorios, nunca se imprimen).
 * No toca los contenedores de otros proyectos.
 *
 * Uso: node scripts/agora/laboratorio.ts            (levanta o reusa, y vuelve a sembrar una base nueva)
 *      node scripts/agora/laboratorio.ts --apaga    (borra el contenedor y el entorno)
 *      node scripts/agora/laboratorio.ts --url      (solo comprueba que hay entorno: presente/ausente)
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = join(RAIZ, 'tools/agora/.laboratorio');
const ARCHIVO = join(DIR, 'entorno');
const CONTENEDOR = 'agora-pg-lab';
const PUERTO = 55439;
const IMAGEN = 'public.ecr.aws/supabase/postgres:17.11.0.002';

export function leeEntorno(): Record<string, string> {
  if (!existsSync(ARCHIVO)) return {};
  return Object.fromEntries(readFileSync(ARCHIVO, 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
}

const docker = (args: string[]) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const existe = () => docker(['ps', '-a', '--filter', `name=^${CONTENEDOR}$`, '--format', '{{.Names}}']) === CONTENEDOR;
const corriendo = () => docker(['ps', '--filter', `name=^${CONTENEDOR}$`, '--format', '{{.Names}}']) === CONTENEDOR;

async function espera(url: string) {
  for (let i = 0; i < 90; i++) {
    try { const c = new pg.Client({ connectionString: url }); await c.connect(); await c.query('select 1'); await c.end(); return } catch { await new Promise((r) => setTimeout(r, 1000)) }
  }
  throw new Error('el Postgres del laboratorio no contestó en 90 s');
}

async function levanta() {
  const previo = leeEntorno();
  let clave = previo.AGORA_PG_CLAVE ?? '';
  if (existe() && !clave) { docker(['rm', '-f', CONTENEDOR]); }
  if (!existe()) {
    clave = randomBytes(18).toString('base64url');
    docker(['run', '-d', '--name', CONTENEDOR, '-e', `POSTGRES_PASSWORD=${clave}`, '-p', `127.0.0.1:${PUERTO}:5432`, IMAGEN]);
    console.log(`· contenedor ${CONTENEDOR} creado (${IMAGEN}, solo 127.0.0.1:${PUERTO})`);
  } else if (!corriendo()) {
    docker(['start', CONTENEDOR]);
  }
  const admin = `postgresql://postgres:${encodeURIComponent(clave)}@127.0.0.1:${PUERTO}/postgres`;
  await espera(admin);
  const c = new pg.Client({ connectionString: admin });
  await c.connect();
  await c.query('drop database if exists agora_lab with (force)');
  await c.query('create database agora_lab');
  await c.end();
  const url = admin.replace(/\/postgres$/, '/agora_lab');
  const { basePostgres } = await import('../../tools/agora/dist/base/pg.js');
  const { migra } = await import('../../tools/agora/dist/index.js');
  const { siembra } = await import('../../tools/agora/dist/laboratorio/index.js');
  const base = basePostgres(url);
  const secreto = randomBytes(32).toString('base64url');
  const hechas = await migra(base);
  await siembra(base, { secreto });
  const version = ((await base.consulta<{ v: string }>('select version() v'))[0]!.v).split(' on ')[0];
  await base.cierra();
  mkdirSync(DIR, { recursive: true });
  writeFileSync(ARCHIVO, `# Laboratorio de Ágora (datos ficticios). Lo escribe scripts/agora/laboratorio.ts; no se versiona.\nAGORA_LABORATORIO=1\nAGORA_PG_CLAVE=${clave}\nAGORA_PG_URL=${url}\nAGORA_SECRETO=${secreto}\n`, { mode: 0o600 });
  console.log(`· ${version}: ${hechas.length} migraciones y la siembra ficticia en la base agora_lab`);
  console.log(`· entorno en tools/agora/.laboratorio/entorno (AGORA_PG_URL presente, AGORA_SECRETO presente, ${secreto.length} caracteres)`);
}

if (process.argv.includes('--apaga')) {
  if (existe()) docker(['rm', '-f', CONTENEDOR]);
  rmSync(DIR, { recursive: true, force: true });
  console.log(`· ${CONTENEDOR} borrado y entorno quitado`);
} else if (process.argv.includes('--url')) {
  const e = leeEntorno();
  console.log(`AGORA_PG_URL ${e.AGORA_PG_URL ? 'presente' : 'ausente'} · AGORA_SECRETO ${e.AGORA_SECRETO ? 'presente' : 'ausente'} · contenedor ${existe() ? (corriendo() ? 'corriendo' : 'parado') : 'no existe'}`);
} else {
  await levanta();
}
