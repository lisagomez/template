/**
 * El laboratorio de Ágora: un Postgres REAL y efímero en Docker (`supabase/postgres` 17, contenedor propio
 * `agora-pg-lab` solo en 127.0.0.1), con las migraciones de `tools/agora` y la siembra FICTICIA. Deja el entorno de la
 * app en `tools/agora/.laboratorio/entorno` (ignorado por git; contraseña y secreto aleatorios, nunca se imprimen).
 * No toca los contenedores de otros proyectos.
 *
 * Uso: node scripts/agora/laboratorio.ts            (levanta o reusa, y vuelve a sembrar una base nueva)
 *      node scripts/agora/laboratorio.ts --apaga    (borra el contenedor y el entorno, si ESTE árbol lo creó)
 *      node scripts/agora/laboratorio.ts --apaga --huerfano   (borra un contenedor que no creó este árbol, a propósito)
 *      node scripts/agora/laboratorio.ts --url      (solo comprueba que hay entorno: presente/ausente)
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { ARCHIVO, CONTENEDOR, DIR, leeEntorno } from './entorno.ts';

const PUERTO = 55439;
const IMAGEN = 'public.ecr.aws/supabase/postgres:17.11.0.002';

const docker = (args: string[]) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const existe = () => docker(['ps', '-a', '--filter', `name=^${CONTENEDOR}$`, '--format', '{{.Names}}']) === CONTENEDOR;
const corriendo = () => docker(['ps', '--filter', `name=^${CONTENEDOR}$`, '--format', '{{.Names}}']) === CONTENEDOR;

async function espera(url: string) {
  for (let i = 0; i < 90; i++) {
    try { const c = new pg.Client({ connectionString: url }); await c.connect(); await c.query('select 1'); await c.end(); return } catch { await new Promise((r) => setTimeout(r, 1000)) }
  }
  throw new Error('el Postgres del laboratorio no contestó en 90 s');
}

/** ¿La clave de este árbol abre el contenedor que está ahí? Si no, el contenedor es de otro árbol. Si está parado no se
 *  puede comprobar, y lo que no se comprueba no se borra (cuarta pasada del verificador: una clave vieja pasaba). */
async function esMio(clave: string): Promise<boolean> {
  if (!clave || !corriendo()) return false;
  const c = new pg.Client({ connectionString: `postgresql://postgres:${encodeURIComponent(clave)}@127.0.0.1:${PUERTO}/postgres`, connectionTimeoutMillis: 5000 });
  try { await c.connect(); await c.end(); return true; } catch { return false; }
}

async function levanta() {
  const previo = leeEntorno();
  let clave = previo.AGORA_PG_CLAVE ?? '';
  if (existe() && !clave) {
    // Un contenedor sin su clave en ESTE árbol es de otro árbol (u otra sesión): nunca se borra solo.
    console.error(`✗ el contenedor ${CONTENEDOR} existe y este árbol no tiene su clave: no lo borro. Si lo creó otro árbol, trabaja desde ese; si sabes que quedó huérfano, --apaga --huerfano.`);
    process.exit(2);
  }
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
  // Este script ES el laboratorio: la base es `agora_lab` del contenedor propio que acaba de crear o reusar.
  process.env.AGORA_LABORATORIO = '1';
  await siembra(base, { secreto });
  const version = ((await base.consulta<{ v: string }>('select version() v'))[0]!.v).split(' on ')[0];
  await base.cierra();
  mkdirSync(DIR, { recursive: true });
  writeFileSync(ARCHIVO, `# Laboratorio de Ágora (datos ficticios). Lo escribe scripts/agora/laboratorio.ts; no se versiona.\nAGORA_LABORATORIO=1\nAGORA_PG_CLAVE=${clave}\nAGORA_PG_URL=${url}\nAGORA_SECRETO=${secreto}\n`, { mode: 0o600 });
  console.log(`· ${version}: ${hechas.length} migraciones y la siembra ficticia en la base agora_lab`);
  console.log(`· entorno en tools/agora/.laboratorio/entorno (AGORA_PG_URL presente, AGORA_SECRETO presente, ${secreto.length} caracteres)`);
}

// Solo actúa si se EJECUTA (node scripts/agora/laboratorio.ts); importarlo no hace nada.
const ejecutado = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!ejecutado) {
  // importado: sin efectos
} else if (process.argv.includes('--apaga')) {
  // Solo borra lo que ESTE árbol creó: su clave tiene que ABRIR el contenedor (una clave vieja de otro contenedor no
  // basta). Un huérfano, solo declarado a propósito.
  if (existe() && !process.argv.includes('--huerfano') && !(await esMio(leeEntorno().AGORA_PG_CLAVE ?? ''))) {
    console.error(`✗ no compruebo que ${CONTENEDOR} sea de este árbol (su clave no lo abre, o está parado): no lo borro. Si sabes que quedó huérfano: --apaga --huerfano`);
    process.exit(2);
  }
  if (existe()) docker(['rm', '-f', CONTENEDOR]);
  rmSync(DIR, { recursive: true, force: true });
  console.log(`· ${CONTENEDOR} borrado y entorno quitado`);
} else if (process.argv.includes('--url')) {
  const e = leeEntorno();
  console.log(`AGORA_PG_URL ${e.AGORA_PG_URL ? 'presente' : 'ausente'} · AGORA_SECRETO ${e.AGORA_SECRETO ? 'presente' : 'ausente'} · contenedor ${existe() ? (corriendo() ? 'corriendo' : 'parado') : 'no existe'}`);
} else {
  await levanta();
}
