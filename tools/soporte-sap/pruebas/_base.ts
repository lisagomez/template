/**
 * Un Postgres EFÍMERO (PGlite, en proceso, sin red ni Docker) con un Supabase mínimo imitado
 * —roles, `auth.uid()` y un `storage` con `objects` y `foldername`— y la propuesta de esquema
 * aplicada dos veces. Nada de esto toca una base real: se prueba y se tira.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { HERRAMIENTA } from './_ayuda.ts'

export const SQL_SOPORTE = readFileSync(join(HERRAMIENTA, 'migraciones', 'propuesta-soporte-sap.sql'), 'utf8')

export const SUPABASE_MINIMO = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
  name text not null, owner uuid, metadata jsonb, created_at timestamptz not null default now(), unique (bucket_id, name));
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
`

/** Identificadores fijos del escenario: un laboratorio, dos consultoras y tres clientes. */
export const ORG = {
  L: '00000000-0000-4000-8000-000000000001',
  CA: '00000000-0000-4000-8000-0000000000a0',
  CB: '00000000-0000-4000-8000-0000000000b0',
  A1: '00000000-0000-4000-8000-0000000000a1',
  A2: '00000000-0000-4000-8000-0000000000a2',
  B1: '00000000-0000-4000-8000-0000000000b1',
} as const

export const USR = {
  sup: '10000000-0000-4000-8000-000000000001',
  exp: '10000000-0000-4000-8000-000000000002',
  ca: '10000000-0000-4000-8000-0000000000a0',
  cb: '10000000-0000-4000-8000-0000000000b0',
  ua1: '10000000-0000-4000-8000-0000000000a1',
  ua2: '10000000-0000-4000-8000-0000000000a2',
  ub1: '10000000-0000-4000-8000-0000000000b1',
} as const

export const INC = {
  a1: '20000000-0000-4000-8000-0000000000a1',
  a2: '20000000-0000-4000-8000-0000000000a2',
  b1: '20000000-0000-4000-8000-0000000000b1',
} as const

const sha = (c: string) => c.repeat(64)

/** La base con el esquema y el escenario sembrado (como dueño de las tablas). */
export async function baseSoporte(extra = ''): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(SUPABASE_MINIMO)
  await db.exec(SQL_SOPORTE)
  await db.exec(SQL_SOPORTE)
  if (extra) await db.exec(extra)
  await db.exec(`
    insert into ss_organizacion (id, tipo, nombre, padre_id) values
      ('${ORG.L}', 'laboratorio', 'Laboratorio', null),
      ('${ORG.CA}', 'consultora', 'Consultora Andina', '${ORG.L}'),
      ('${ORG.CB}', 'consultora', 'Consultora Boreal', '${ORG.L}'),
      ('${ORG.A1}', 'cliente', 'Alimentos del Bajío', '${ORG.CA}'),
      ('${ORG.A2}', 'cliente', 'Aceros del Norte', '${ORG.CA}'),
      ('${ORG.B1}', 'cliente', 'Bebidas del Sur', '${ORG.CB}');
    insert into ss_miembro values
      ('${ORG.L}', '${USR.sup}', 'superadmin'), ('${ORG.L}', '${USR.exp}', 'experto'),
      ('${ORG.CA}', '${USR.ca}', 'consultor'), ('${ORG.CB}', '${USR.cb}', 'consultor'),
      ('${ORG.A1}', '${USR.ua1}', 'usuario_cliente'), ('${ORG.A2}', '${USR.ua2}', 'usuario_cliente'),
      ('${ORG.B1}', '${USR.ub1}', 'usuario_cliente');
    insert into ss_incidencia (id, consultora_id, cliente_id, titulo) values
      ('${INC.a1}', '${ORG.CA}', '${ORG.A1}', 'MIGO no contabiliza'),
      ('${INC.a2}', '${ORG.CA}', '${ORG.A2}', 'Dump en VA01'),
      ('${INC.b1}', '${ORG.CB}', '${ORG.B1}', 'CFDI no timbra');
    insert into ss_evento (incidencia_id, consultora_id, cliente_id, seq, tipo, actor, fecha, anterior, hash) values
      ('${INC.a1}', '${ORG.CA}', '${ORG.A1}', 1, 'RECIBIDA', 'cliente', now(), 'genesis', '${sha('1')}'),
      ('${INC.b1}', '${ORG.CB}', '${ORG.B1}', 1, 'RECIBIDA', 'cliente', now(), 'genesis', '${sha('2')}');
    insert into ss_adjunto (incidencia_id, consultora_id, cliente_id, sha256, ruta, tipo_mime, bytes, via) values
      ('${INC.a1}', '${ORG.CA}', '${ORG.A1}', '${sha('a')}', '${ORG.CA}/${ORG.A1}/${INC.a1}/${sha('a')}', 'image/png', 1000, 'ocr_local'),
      ('${INC.a2}', '${ORG.CA}', '${ORG.A2}', '${sha('b')}', '${ORG.CA}/${ORG.A2}/${INC.a2}/${sha('b')}', 'application/pdf', 2000, 'capa0'),
      ('${INC.b1}', '${ORG.CB}', '${ORG.B1}', '${sha('c')}', '${ORG.CB}/${ORG.B1}/${INC.b1}/${sha('c')}', 'application/xml', 500, 'xml');
    insert into storage.objects (bucket_id, name) values
      ('ss-originales', '${ORG.CA}/${ORG.A1}/${INC.a1}/${sha('a')}'),
      ('ss-originales', '${ORG.CA}/${ORG.A2}/${INC.a2}/${sha('b')}'),
      ('ss-originales', '${ORG.CB}/${ORG.B1}/${INC.b1}/${sha('c')}'),
      ('ss-sandbox', '${ORG.CA}/caso-a/${sha('d')}'),
      ('ss-sandbox', '${ORG.CB}/caso-b/${sha('e')}');
    insert into ss_caso_sandbox (origen_consultora_id, texto) values
      ('${ORG.CA}', 'MIGO 101 rechaza el movimiento: periodo cerrado para la sociedad [SOCIEDAD]'),
      ('${ORG.CB}', 'El CFDI no timbra: el RFC del receptor no está en la LCO');
    insert into ss_contrato_sla (id, version, nivel, consultora_id, cliente_id, contenido, vigente_desde) values
      ('sla-ca', 1, 'N1-N2', '${ORG.CA}', null, '{}', '2026-10-01'),
      ('sla-cb', 1, 'N1-N2', '${ORG.CB}', null, '{}', '2026-10-01'),
      ('sla-a1', 1, 'N2-N3', '${ORG.CA}', '${ORG.A1}', '{}', '2026-10-01');
    insert into ss_chat_mensaje (usuario_id, autor, contenido) values
      ('${USR.sup}', 'humano', '¿Cómo va el cumplimiento de SLA de Andina?'),
      ('${USR.exp}', 'humano', 'Te enseño el caso de MIGO');
  `)
  return db
}

/** Corre `sql` como una persona (rol authenticated con su `sub`). Siempre vuelve a dueño. */
export async function como<T = Record<string, unknown>>(db: PGlite, usuario: string, sql: string): Promise<T[]> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${usuario}', false);`)
  try { return (await db.query<T>(sql)).rows } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`) }
}

/** Corre `sql` como el agente, acotado a la consultora de su tarea (o a ninguna). */
export async function comoAgente<T = Record<string, unknown>>(db: PGlite, consultora: string | null, sql: string): Promise<T[]> {
  await db.exec(`set role soporte_sap_agente; select set_config('ss.consultora', '${consultora ?? ''}', false);`)
  try { return (await db.query<T>(sql)).rows } finally { await db.exec(`reset role; select set_config('ss.consultora', '', false);`) }
}

/** ¿Falla? Devuelve el mensaje del error, o null si pasó. */
export async function falla(f: () => Promise<unknown>): Promise<string | null> {
  try { await f(); return null } catch (e) { return e instanceof Error ? e.message : String(e) }
}
