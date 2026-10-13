/**
 * El despacho en un Postgres en proceso (PGlite), con el Supabase mínimo y las migraciones reales: lo comparten
 * las pruebas de la base del buzón (spec 015). No es un archivo de pruebas: lo importan.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { SUPABASE_MINIMO } from '../lib/supabase-minimo.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = join(raiz, 'supabase/migrations');
const ARCHIVOS = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const BUZON = '20261007100000_buzon_cfdi.sql';
export const HUELLA = (n) => `sha256:${String(n).padStart(64, '0')}`;

/**
 * Una base con las migraciones reales, una contadora miembro (a) y alguien de fuera (b). `siembra` cambia
 * una migración en memoria ([buscar, reemplazo, archivo]; por defecto, la de la fase 3); si no encuentra lo que
 * busca, la siembra no siembra nada y la prueba lo dice en vez de pasar en falso.
 */
export async function despacho(siembra) {
  const db = new PGlite();
  await db.exec(SUPABASE_MINIMO);
  for (const archivo of ARCHIVOS) {
    let sql = readFileSync(join(DIR, archivo), 'utf8');
    if (siembra && archivo === (siembra[2] ?? BUZON)) {
      assert.ok(sql.includes(siembra[0]), `la siembra no encuentra: ${siembra[0]}`);
      sql = sql.replace(siembra[0], siembra[1]);
    }
    await db.exec(sql);
  }
  const alta = async (email) => (await db.query('insert into auth.users (email) values ($1) returning id', [email])).rows[0].id;
  const a = await alta('contadora@despacho-ejemplo.mx');
  const b = await alta('ajena@otro-ejemplo.mx');
  await db.query('insert into public.buzon_miembros (usuario_id) values ($1)', [a]);
  const como = async (rol, id = '') => {
    await db.exec('reset role');
    await db.exec(`set role ${rol}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  };
  return { db, a, b, comoMiembro: () => como('authenticated', a), comoAjena: () => como('authenticated', b), comoAnon: () => como('anon') };
}

// --- Ayudantes: actúan con el rol que la prueba haya puesto ---------------------------------------------------

export const nuevaPyme = async (db, rfc = 'ABC010203XY9') =>
  (await db.query("insert into public.buzon_pymes (rfc, nombre) values ($1, 'Pyme de ejemplo') returning id, seudonimo", [rfc])).rows[0];
export const consiente = (db, pyme, huella = HUELLA(1)) =>
  db.query("insert into public.buzon_consentimientos (pyme_id, huella_documento, firmado_en) values ($1, $2, '2026-10-01') returning id", [pyme, huella]);
export const entra = (db, pyme, n) =>
  db.query('insert into public.buzon_documentos (pyme_id, nombre_archivo, huella) values ($1, $2, $3)', [pyme, `cfdi-${n}.xml`, HUELLA(100 + n)]);
export const cuenta = async (db, tabla) => Number((await db.query(`select count(*)::int as n from public.${tabla}`)).rows[0].n);
