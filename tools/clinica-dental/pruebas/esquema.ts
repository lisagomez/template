/**
 * La migracion propuesta, en Postgres 17 EFIMERO (PGlite, en proceso, sin red ni Docker) con un Supabase
 * minimo imitado. NO se aplica a ninguna base: se prueba y se tira (lazo l-rls). Comprueba: idempotente; toda
 * tabla con RLS y `clinica_id`; el paciente A no lee al B; la clinica A no lee a la B (personal y operador);
 * el dato de salud solo lo ve su dueño (y el rol clinico de SU clinica); anon no lee nada; la doble reserva
 * tambien la para la base; el libro no admite una arroba.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

const SQL = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migraciones', 'propuesta-clinica-dental.sql'), 'utf8');
const SUPABASE_MINIMO = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
`;
const ANA = '11111111-1111-4111-8111-111111111111';
const BETO = '22222222-2222-4222-8222-222222222222';
const RECEPCION_MAGUEY = '33333333-3333-4333-8333-333333333333';
const CLINICO_MAGUEY = '44444444-4444-4444-8444-444444444444';
const PAC = (n: string) => `pac_${n.repeat(20)}`;
const CIT = (n: string) => `cit_${n.repeat(20)}`;

async function base() {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(SUPABASE_MINIMO);
  await db.exec(SQL);
  await db.exec(SQL);
  await db.exec(`
    insert into clinica_clinica values ('maguey', 'Clínica Dental Maguey'), ('colibri', 'Dental Colibrí');
    insert into clinica_miembro values ('maguey', '${RECEPCION_MAGUEY}', 'recepcion'), ('maguey', '${CLINICO_MAGUEY}', 'clinico');
    insert into clinica_paciente (clinica_id, seudonimo, usuario_id, nombre, apellido_paterno, edad, correo, celular, categorias, canal_adquisicion) values
      ('maguey', '${PAC('a')}', '${ANA}', 'Ameyalli', 'Zempoalteca', 34, 'ameyalli@pacientes.example', '+525500001001', '{general}', 'convenio'),
      ('maguey', '${PAC('b')}', '${BETO}', 'Tonatiuh', 'Mixcoatl', 52, 'tonatiuh@pacientes.example', '+522200001003', '{endodoncia}', 'redes'),
      ('colibri', '${PAC('c')}', '${ANA}', 'Ameyalli', 'Zempoalteca', 34, 'ameyalli@pacientes.example', '+525500001001', '{general}', 'busqueda'),
      ('colibri', '${PAC('d')}', '${BETO}', 'Tonatiuh', 'Mixcoatl', 52, 'tonatiuh@pacientes.example', '+522200001003', '{endodoncia}', 'redes');
    insert into clinica_salud values ('maguey', '${PAC('a')}', 'Me duele la muela del lado izquierdo', now()), ('maguey', '${PAC('b')}', 'Punzadas en un colmillo', now());
    insert into clinica_cita (clinica_id, id, seudonimo, servicio, categoria, sillon, inicio, fin, estado) values
      ('maguey', '${CIT('1')}', '${PAC('a')}', 'limpieza', 'general', 'sillon-1', '2026-10-22 16:00Z', '2026-10-22 16:45Z', 'confirmada'),
      ('maguey', '${CIT('2')}', '${PAC('b')}', 'valoracion', 'general', 'sillon-2', '2026-10-22 16:00Z', '2026-10-22 16:30Z', 'confirmada'),
      ('colibri', '${CIT('3')}', '${PAC('d')}', 'limpieza', 'general', 'sillon-unico', '2026-10-22 18:00Z', '2026-10-22 19:00Z', 'confirmada');
  `);
  return db;
}

const como = async (db: PGlite, usuario: string, sql: string) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${usuario}', false);`);
  try { return await db.query<Record<string, unknown>>(sql); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};
const operador = async (db: PGlite, clinica: string | null, sql: string) => {
  await db.exec(`set role clinica_operador; select set_config('app.clinica', '${clinica ?? ''}', false);`);
  try { return await db.query<Record<string, unknown>>(sql); } finally { await db.exec(`reset role; select set_config('app.clinica', '', false);`); }
};

test('se aplica dos veces; toda tabla del portal con RLS (forzada) y con clinica_id', async () => {
  const db = await base();
  const tablas = await db.query<{ n: string; rls: boolean; forzada: boolean }>(`select relname as n, relrowsecurity as rls, relforcerowsecurity as forzada from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname like 'clinica_%'`);
  assert.equal(tablas.rows.length, 10);
  assert.deepEqual(tablas.rows.filter((t) => !t.rls || !t.forzada), []);
  const sin = await db.query<{ n: string }>(`select c.relname as n from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname like 'clinica_%' and c.relname <> 'clinica_clinica'
    and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'clinica_id')`);
  assert.deepEqual(sin.rows, []);
});

test('PACIENTE A no lee al B: sus filas, su cita y su dato de salud, y nada más', async () => {
  const db = await base();
  assert.deepEqual((await como(db, ANA, `select clinica_id, seudonimo from clinica_paciente order by 1`)).rows, [{ clinica_id: 'colibri', seudonimo: PAC('c') }, { clinica_id: 'maguey', seudonimo: PAC('a') }]);
  assert.deepEqual((await como(db, ANA, `select id from clinica_cita`)).rows, [{ id: CIT('1') }]);
  assert.deepEqual((await como(db, ANA, `select padecimiento from clinica_salud`)).rows, [{ padecimiento: 'Me duele la muela del lado izquierdo' }]);
  const cambio = await como(db, ANA, `update clinica_paciente set nombre = 'X' where seudonimo = '${PAC('b')}'`);
  assert.equal(cambio.affectedRows ?? 0, 0);
  await assert.rejects(como(db, ANA, `insert into clinica_consentimiento (clinica_id, seudonimo, tipo, otorgado, version) values ('maguey', '${PAC('b')}', 'newsletter', false, 'v')`), /row-level security/);
  await assert.rejects(como(db, ANA, `insert into clinica_paciente (clinica_id, seudonimo, usuario_id, nombre, apellido_paterno, edad, correo, celular, categorias, canal_adquisicion) values ('maguey', '${PAC('e')}', '${BETO}', 'X', 'Y', 30, 'x@y.example', '+525500000000', '{general}', 'directo')`), /row-level security/);
});

test('PACIENTE: no escribe citas ni avisos directamente (los escribe el operador del portal)', async () => {
  const db = await base();
  await assert.rejects(como(db, ANA, `insert into clinica_cita (clinica_id, id, seudonimo, servicio, categoria, sillon, inicio, fin, estado) values ('maguey', '${CIT('9')}', '${PAC('a')}', 'x', 'general', 'sillon-1', now(), now() + interval '1 hour', 'confirmada')`), /permission denied/);
});

test('retirar el consentimiento de salud = borrar SU fila; no la de otro', async () => {
  const db = await base();
  const otro = await como(db, ANA, `delete from clinica_salud where seudonimo = '${PAC('b')}'`);
  assert.equal(otro.affectedRows ?? 0, 0);
  const suyo = await como(db, ANA, `delete from clinica_salud where seudonimo = '${PAC('a')}'`);
  assert.equal(suyo.affectedRows, 1);
  assert.equal((await db.query(`select 1 from clinica_salud`)).rows.length, 1);
});

test('CLÍNICA A no lee a la B: el personal de Maguey ve Maguey y nada de Colibrí; recepción no ve el dato de salud', async () => {
  const db = await base();
  assert.deepEqual((await como(db, RECEPCION_MAGUEY, `select distinct clinica_id from clinica_paciente`)).rows, [{ clinica_id: 'maguey' }]);
  assert.deepEqual((await como(db, RECEPCION_MAGUEY, `select id from clinica_cita order by id`)).rows, [{ id: CIT('1') }, { id: CIT('2') }]);
  assert.deepEqual((await como(db, RECEPCION_MAGUEY, `select 1 from clinica_salud`)).rows, [], 'recepción no ve el padecimiento');
  assert.equal((await como(db, CLINICO_MAGUEY, `select 1 from clinica_salud`)).rows.length, 2, 'el rol clínico de SU clínica sí');
});

test('OPERADOR (sin bypassrls, no es service_role): solo la clínica de la transacción; sin clínica, nada', async () => {
  const db = await base();
  assert.deepEqual((await operador(db, 'maguey', `select distinct clinica_id from clinica_cita`)).rows, [{ clinica_id: 'maguey' }]);
  assert.deepEqual((await operador(db, null, `select 1 from clinica_cita`)).rows, []);
  await assert.rejects(operador(db, 'maguey', `insert into clinica_cita (clinica_id, id, seudonimo, servicio, categoria, sillon, inicio, fin, estado) values ('colibri', '${CIT('8')}', '${PAC('d')}', 'x', 'general', 'sillon-unico', '2026-10-23 18:00Z', '2026-10-23 19:00Z', 'confirmada')`), /row-level security/);
  await assert.rejects(operador(db, 'maguey', `select 1 from clinica_salud`), /permission denied/);
  const rol = await db.query<{ b: boolean }>(`select rolbypassrls as b from pg_roles where rolname = 'clinica_operador'`);
  assert.equal(rol.rows[0]!.b, false);
});

test('ANON no lee nada', async () => {
  const db = await base();
  for (const t of ['clinica_paciente', 'clinica_salud', 'clinica_cita', 'clinica_evento']) {
    await db.exec('set role anon;');
    const r = await db.query(`select count(*) from ${t}`).then(() => 'leyó', () => 'sin permiso');
    await db.exec('reset role;');
    assert.equal(r, 'sin permiso', t);
  }
});

test('la base también para la DOBLE RESERVA: dos confirmadas empalmadas en el mismo sillón no entran', async () => {
  const db = await base();
  await assert.rejects(operador(db, 'maguey', `insert into clinica_cita (clinica_id, id, seudonimo, servicio, categoria, sillon, inicio, fin, estado) values ('maguey', '${CIT('5')}', '${PAC('b')}', 'limpieza', 'general', 'sillon-1', '2026-10-22 16:30Z', '2026-10-22 17:15Z', 'confirmada')`), /clinica_cita_sin_doble_reserva/);
  await operador(db, 'maguey', `insert into clinica_cita (clinica_id, id, seudonimo, servicio, categoria, sillon, inicio, fin, estado) values ('maguey', '${CIT('6')}', '${PAC('b')}', 'limpieza', 'general', 'sillon-1', '2026-10-22 16:30Z', '2026-10-22 17:15Z', 'cancelada')`);
  await operador(db, 'maguey', `insert into clinica_cita (clinica_id, id, seudonimo, servicio, categoria, sillon, inicio, fin, estado) values ('maguey', '${CIT('7')}', '${PAC('b')}', 'limpieza', 'general', 'sillon-1', '2026-10-22 16:45Z', '2026-10-22 17:30Z', 'confirmada')`);
});

test('el libro en la base: solo se agrega, sin arrobas, y el paciente no lo lee', async () => {
  const db = await base();
  const h = 'a'.repeat(64);
  await operador(db, 'maguey', `insert into clinica_evento values ('maguey', 1, '{"tipo":"newsletter_baja","sujeto":"${PAC('a')}"}', '${'0'.repeat(64)}', '${h}')`);
  await assert.rejects(operador(db, 'maguey', `insert into clinica_evento values ('maguey', 2, '{"tipo":"x","sujeto":"ameyalli@pacientes.example"}', '${h}', '${h}')`), /check constraint/);
  await assert.rejects(operador(db, 'maguey', `update clinica_evento set seq = 9`), /permission denied/);
  await assert.rejects(operador(db, 'maguey', `delete from clinica_evento`), /permission denied/);
  assert.deepEqual((await como(db, ANA, `select 1 from clinica_evento`)).rows, []);
  assert.equal((await como(db, RECEPCION_MAGUEY, `select 1 from clinica_evento`)).rows.length, 1);
});

test('ninguna función de la propuesta es SECURITY DEFINER ni la ejecuta anon; todas fijan search_path', async () => {
  const db = await base();
  const r = await db.query<{ n: string; def: boolean; anon: boolean; sp: boolean }>(`select proname as n, prosecdef as def, has_function_privilege('anon', oid, 'EXECUTE') as anon,
    exists (select 1 from unnest(coalesce(proconfig, '{}')) c where c like 'search_path=%') as sp from pg_proc where pronamespace = 'public'::regnamespace and proname like 'clinica_%'`);
  assert.equal(r.rows.length, 3);
  for (const f of r.rows) assert.deepEqual({ def: f.def, anon: f.anon, sp: f.sp }, { def: false, anon: false, sp: true }, f.n);
});
