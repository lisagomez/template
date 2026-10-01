/**
 * La propuesta de esquema, validada en un Postgres 17 EFÍMERO (PGlite, en proceso, sin red ni
 * Docker) con un Supabase mínimo imitado. NO se aplica a ninguna base: se prueba y se tira.
 * Comprueba: se aplica dos veces (idempotente); toda tabla con RLS y con `inquilino_id`; el panel
 * de un dueño no ve, no escribe y no modifica lo de otro inquilino; y la idempotencia vive en el
 * esquema (wamid, origen_wamid, event_id únicos).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const SQL = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migraciones', 'propuesta-ventas-whatsapp.sql'), 'utf8');
const SUPABASE_MINIMO = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
`;
const DUENA_RESTAURANTE = '11111111-1111-1111-1111-111111111111';
const DUENA_TIENDA = '22222222-2222-2222-2222-222222222222';

async function base() {
  const db = new PGlite();
  await db.exec(SUPABASE_MINIMO);
  await db.exec(SQL);
  await db.exec(SQL);
  await db.exec(`
    insert into vw_inquilino (id, nombre, giro, waba_id, phone_number_id, dataset_id, catalogo_id) values
      ('pyme_restaurante', 'La Parroquia de Doña Chela', 'restaurante', 'waba_1', 'pn_1', 'ds_1', 'cat_1'),
      ('pyme_tienda', 'Huipiles Xalapeños', 'tienda', 'waba_2', 'pn_2', 'ds_2', 'cat_2');
    insert into vw_miembro values ('pyme_restaurante', '${DUENA_RESTAURANTE}', 'dueno'), ('pyme_tienda', '${DUENA_TIENDA}', 'dueno');
    insert into vw_contacto (inquilino_id, wa_id) values ('pyme_restaurante', '522291112233'), ('pyme_tienda', '522281112233');
    insert into vw_conversacion (inquilino_id, id, context_id, wa_id) values ('pyme_restaurante', 'conv_a', 'ctx_a', '522291112233'), ('pyme_tienda', 'conv_b', 'ctx_b', '522281112233');
    insert into vw_pedido (inquilino_id, id, conversacion_id, origen_wamid, items, subtotal_centavos, total_centavos, estado) values
      ('pyme_restaurante', 'ped_1', 'conv_a', 'wamid.A', '[]', 19000, 22500, 'pagado'),
      ('pyme_tienda', 'ped_1', 'conv_b', 'wamid.B', '[]', 95000, 101000, 'pagado');
  `);
  return db;
}

const como = async (db: PGlite, usuario: string, sql: string) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${usuario}', false);`);
  try { return await db.query(sql); } finally { await db.exec('reset role;'); }
};

test('esquema: se aplica dos veces; toda tabla con RLS y con inquilino_id', async () => {
  const db = await base();
  const sinRls = await db.query<{ n: string }>(`select relname as n from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname like 'vw_%' and not relrowsecurity`);
  assert.deepEqual(sinRls.rows, []);
  const tablas = await db.query<{ n: string }>(`select relname as n from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname like 'vw_%'`);
  assert.equal(tablas.rows.length, 12);
  const sinInquilino = await db.query<{ n: string }>(`select c.relname as n from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname like 'vw_%' and c.relname <> 'vw_inquilino'
    and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'inquilino_id')`);
  assert.deepEqual(sinInquilino.rows, []);
});

test('RLS: la dueña del restaurante no ve, no escribe y no modifica lo de la tienda', async () => {
  const db = await base();
  const suyos = await como(db, DUENA_RESTAURANTE, 'select inquilino_id, id from vw_pedido');
  assert.deepEqual(suyos.rows, [{ inquilino_id: 'pyme_restaurante', id: 'ped_1' }]);
  const inquilinos = await como(db, DUENA_RESTAURANTE, 'select id from vw_inquilino');
  assert.deepEqual(inquilinos.rows, [{ id: 'pyme_restaurante' }]);
  await assert.rejects(como(db, DUENA_RESTAURANTE, `insert into vw_producto (inquilino_id, retailer_id, nombre, precio_centavos, existencias) values ('pyme_tienda', 'x', 'x', 100, 1)`), /row-level security/);
  const cambio = await como(db, DUENA_RESTAURANTE, `update vw_pedido set total_centavos = 1 where inquilino_id = 'pyme_tienda'`);
  assert.equal(cambio.affectedRows ?? 0, 0);
  const intacto = await db.query<{ total_centavos: number }>(`select total_centavos from vw_pedido where inquilino_id = 'pyme_tienda'`);
  assert.equal(Number(intacto.rows[0]!.total_centavos), 101000);
  const anonimo = await db.exec(`set role anon;`).then(() => db.query('select count(*) from vw_pedido').then(() => 'leyó', () => 'sin permiso'));
  await db.exec('reset role;');
  assert.equal(anonimo, 'sin permiso');
});

test('idempotencia en el esquema: wamid, origen_wamid y event_id únicos por inquilino', async () => {
  const db = await base();
  await db.exec(`insert into vw_mensaje (inquilino_id, wamid, conversacion_id, direccion, autor, tipo, resumen, instante) values ('pyme_restaurante', 'wamid.X', 'conv_a', 'entrante', 'cliente', 'text', 'hola', now())`);
  await assert.rejects(db.exec(`insert into vw_mensaje (inquilino_id, wamid, conversacion_id, direccion, autor, tipo, resumen, instante) values ('pyme_restaurante', 'wamid.X', 'conv_a', 'entrante', 'cliente', 'text', 'hola', now())`), /duplicate key/);
  await assert.rejects(db.exec(`insert into vw_pedido (inquilino_id, id, conversacion_id, origen_wamid, items, subtotal_centavos, total_centavos, estado) values ('pyme_restaurante', 'ped_2', 'conv_a', 'wamid.A', '[]', 1, 1, 'carrito')`), /duplicate key/);
  await db.exec(`insert into vw_evento_conversion (inquilino_id, event_id, nombre, conversacion_id, estado) values ('pyme_restaurante', 'ped_1:Purchase', 'Purchase', 'conv_a', 'aceptado')`);
  await assert.rejects(db.exec(`insert into vw_evento_conversion (inquilino_id, event_id, nombre, conversacion_id, estado) values ('pyme_restaurante', 'ped_1:Purchase', 'Purchase', 'conv_a', 'aceptado')`), /duplicate key/);
  await db.exec(`insert into vw_uso_ia (inquilino_id, id, conversacion_id, modelo, simulado) values ('pyme_restaurante', 'u1', 'conv_a', 'real', false)`);
  const uso = await db.query<{ costo_micro_usd: number | null }>(`select costo_micro_usd from vw_uso_ia where id = 'u1'`);
  assert.equal(uso.rows[0]!.costo_micro_usd, null, 'sin datos de uso: costo NULL, no cero');
});
