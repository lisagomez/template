/**
 * El buzón en la base (spec 015, fase 3: TAR-5, TAR-6 y TAR-7). Parte del gate `prueba:buzon`.
 *
 * `prueba:migraciones` mira la FORMA (RLS en todo, nada privilegiado expuesto). Esto mira el
 * COMPORTAMIENTO: con las migraciones reales en un Postgres en proceso, actúa como una contadora
 * miembro del despacho, como alguien de fuera y como anónimo, y exige lo que la spec dice que la base
 * garantiza sin depender de la app.
 */
import { test } from 'node:test';
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
const HUELLA = (n) => `sha256:${String(n).padStart(64, '0')}`;

/**
 * Una base con las migraciones reales, una contadora miembro (a) y alguien de fuera (b). `siembra` cambia
 * la migración del buzón en memoria ([buscar, reemplazo]); si no encuentra lo que busca, la siembra no
 * siembra nada y la prueba lo dice en vez de pasar en falso.
 */
async function despacho(siembra) {
  const db = new PGlite();
  await db.exec(SUPABASE_MINIMO);
  for (const archivo of ARCHIVOS) {
    let sql = readFileSync(join(DIR, archivo), 'utf8');
    if (siembra && archivo === BUZON) {
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

const nuevaPyme = async (db, rfc = 'ABC010203XY9') =>
  (await db.query("insert into public.buzon_pymes (rfc, nombre) values ($1, 'Pyme de ejemplo') returning id, seudonimo", [rfc])).rows[0];
const consiente = (db, pyme, huella = HUELLA(1)) =>
  db.query("insert into public.buzon_consentimientos (pyme_id, huella_documento, firmado_en) values ($1, $2, '2026-10-01') returning id", [pyme, huella]);
const entra = (db, pyme, n) =>
  db.query('insert into public.buzon_documentos (pyme_id, nombre_archivo, huella) values ($1, $2, $3)', [pyme, `cfdi-${n}.xml`, HUELLA(100 + n)]);
const cuenta = async (db, tabla) => Number((await db.query(`select count(*)::int as n from public.${tabla}`)).rows[0].n);

test('RF-2: sin consentimiento vigente, la base rechaza el documento de esa pyme', async () => {
  const { db, comoMiembro } = await despacho();
  await comoMiembro();
  const pyme = await nuevaPyme(db);
  await assert.rejects(entra(db, pyme.id, 1), /row-level security/);
  assert.equal(await cuenta(db, 'buzon_documentos'), 0);
  await db.close();
});

test('RF-1: con consentimiento escrito registrado, el documento entra', async () => {
  const { db, comoMiembro } = await despacho();
  await comoMiembro();
  const pyme = await nuevaPyme(db);
  await consiente(db, pyme.id);
  await entra(db, pyme.id, 1);
  assert.equal(await cuenta(db, 'buzon_documentos'), 1);
  await db.close();
});

test('un consentimiento no se reescribe: solo se puede tocar revocado_en', async () => {
  const { db, comoMiembro } = await despacho();
  await comoMiembro();
  const pyme = await nuevaPyme(db);
  await consiente(db, pyme.id);
  await assert.rejects(db.query('update public.buzon_consentimientos set huella_documento = $1', [HUELLA(9)]), /permission denied/);
  await assert.rejects(db.query("update public.buzon_consentimientos set firmado_en = '2020-01-01'"), /permission denied/);
  await assert.rejects(db.query('delete from public.buzon_consentimientos'), /permission denied/);
  await db.close();
});

test('RF-3, RF-4: revocar borra los documentos de esa pyme, deja constancia y no toca a las demás', async () => {
  const { db, comoMiembro } = await despacho();
  await comoMiembro();
  const una = await nuevaPyme(db, 'ABC010203XY9');
  const otra = await nuevaPyme(db, 'XYZ040506AB1');
  await consiente(db, una.id, HUELLA(1));
  await consiente(db, otra.id, HUELLA(2));
  for (const n of [1, 2, 3]) await entra(db, una.id, n);
  await entra(db, otra.id, 4);
  await db.query('update public.buzon_consentimientos set revocado_en = now() where pyme_id = $1', [una.id]);
  const quedan = (await db.query('select pyme_id from public.buzon_documentos')).rows;
  assert.deepEqual(quedan.map((r) => r.pyme_id), [otra.id]);
  const [constancia] = (await db.query('select * from public.buzon_constancias')).rows;
  assert.equal(constancia.motivo, 'retiro_de_consentimiento');
  assert.equal(constancia.pyme_seudonimo, una.seudonimo);
  assert.equal(constancia.documentos_borrados, 3);
  await db.close();
});

test('un consentimiento revocado no se des-revoca, y tras revocar no entra nada hasta uno nuevo', async () => {
  const { db, comoMiembro } = await despacho();
  await comoMiembro();
  const pyme = await nuevaPyme(db);
  await consiente(db, pyme.id, HUELLA(1));
  await db.query('update public.buzon_consentimientos set revocado_en = now()');
  await assert.rejects(db.query('update public.buzon_consentimientos set revocado_en = null'), /no se des-revoca/);
  await assert.rejects(entra(db, pyme.id, 1), /row-level security/);
  await consiente(db, pyme.id, HUELLA(2));
  await entra(db, pyme.id, 1);
  assert.equal(await cuenta(db, 'buzon_documentos'), 1);
  await db.close();
});

test('una pyme tiene un solo consentimiento vigente a la vez', async () => {
  const { db, comoMiembro } = await despacho();
  await comoMiembro();
  const pyme = await nuevaPyme(db);
  await consiente(db, pyme.id, HUELLA(1));
  await assert.rejects(consiente(db, pyme.id, HUELLA(2)), /buzon_consentimiento_vigente/);
  await db.close();
});

test('RF-29: las constancias las escribe solo el disparador; un miembro no las inventa ni las borra', async () => {
  const { db, comoMiembro } = await despacho();
  await comoMiembro();
  await assert.rejects(
    db.query("insert into public.buzon_constancias (motivo, documentos_borrados) values ('cierre_del_piloto', 0)"),
    /permission denied/,
  );
  await assert.rejects(db.query('delete from public.buzon_constancias'), /permission denied/);
  await db.close();
});

test('quien no es miembro del despacho no ve ni da de alta nada; un anónimo, tampoco', async () => {
  const { db, comoMiembro, comoAjena, comoAnon } = await despacho();
  await comoMiembro();
  const pyme = await nuevaPyme(db);
  await consiente(db, pyme.id);
  await entra(db, pyme.id, 1);
  await comoAjena();
  for (const tabla of ['buzon_pymes', 'buzon_consentimientos', 'buzon_documentos', 'buzon_constancias']) {
    assert.equal(await cuenta(db, tabla), 0, `la ajena ve ${tabla}`);
  }
  await assert.rejects(nuevaPyme(db, 'QWE070809CD2'), /row-level security/);
  await comoAnon();
  await assert.rejects(db.query('select * from public.buzon_pymes'), /permission denied/);
  await db.close();
});

test('RF-21: ninguna tabla del buzón registra qué persona hizo algo', async () => {
  const { db } = await despacho();
  const { rows } = await db.query(`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and table_name like 'buzon\\_%'
      and column_name ~ '(autor|usuario|creado_por|subido_por|capturado_por|revisado_por|user)'
      and not (table_name = 'buzon_miembros' and column_name = 'usuario_id')`);
  assert.deepEqual(rows, []);
  await db.close();
});

test('el RFC se valida en la base, y el seudónimo no dice nada del RFC', async () => {
  const { db, comoMiembro } = await despacho();
  await comoMiembro();
  await assert.rejects(nuevaPyme(db, 'no-es-un-rfc'), /check constraint/);
  const pyme = await nuevaPyme(db, 'ABC010203XY9');
  assert.match(pyme.seudonimo, /^pyme-[0-9a-f]{10}$/);
  await db.close();
});

// --- La prueba de la prueba: con la regla quitada, la conducta tiene que cambiar ---------------------

test('siembra: sin la comprobación del consentimiento, el documento entra sin él (RF-2 la mide de verdad)', async () => {
  const { db, comoMiembro } = await despacho(['public.buzon_soy_miembro() and public.buzon_consiente(pyme_id)', 'public.buzon_soy_miembro()']);
  await comoMiembro();
  const pyme = await nuevaPyme(db);
  await entra(db, pyme.id, 1);
  assert.equal(await cuenta(db, 'buzon_documentos'), 1);
  await db.close();
});

test('siembra: con UPDATE abierto, el consentimiento se reescribe (la regla de columnas la mide de verdad)', async () => {
  const { db, comoMiembro } = await despacho([
    'grant update (revocado_en) on public.buzon_consentimientos to authenticated;',
    'grant update on public.buzon_consentimientos to authenticated;',
  ]);
  await comoMiembro();
  const pyme = await nuevaPyme(db);
  await consiente(db, pyme.id);
  await db.query('update public.buzon_consentimientos set huella_documento = $1', [HUELLA(9)]);
  await db.close();
});

test('siembra: si el retiro no borra, revocar deja los documentos (RF-4 la mide de verdad)', async () => {
  const { db, comoMiembro } = await despacho([
    'delete from public.buzon_documentos where pyme_id = new.pyme_id;',
    'perform 1; -- sembrado: no borra',
  ]);
  await comoMiembro();
  const pyme = await nuevaPyme(db);
  await consiente(db, pyme.id);
  await entra(db, pyme.id, 1);
  await db.query('update public.buzon_consentimientos set revocado_en = now()');
  assert.equal(await cuenta(db, 'buzon_documentos'), 1);
  await db.close();
});

