/**
 * Un Postgres EFÍMERO (PGlite, en proceso, sin red ni Docker) con un Supabase mínimo imitado
 * —roles, `auth.uid()` y un `storage` con `objects` y `foldername`— y la propuesta de esquema
 * aplicada dos veces. Nada de esto toca una base real: se prueba y se tira.
 *
 * Los roles de servicio entran como entraría PostgREST: con un token de tarea FIRMADO que la
 * pasarela verifica antes de fijar `request.jwt.claims`. Ningún código de prueba que haga de agente
 * fija su propio alcance.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { emiteTokenDeTarea, verificaTokenDeTarea, type RolDeServicio } from '../dist/index.js'
import { HERRAMIENTA } from './_ayuda.ts'

export const SQL_SOPORTE = readFileSync(join(HERRAMIENTA, 'migraciones', 'propuesta-soporte-sap.sql'), 'utf8')

export const SUPABASE_MINIMO = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to service_role;
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

export const SHA = { a1: 'a'.repeat(64), a2: 'b'.repeat(64), b1: 'c'.repeat(64) } as const
export const SECRETO_TAREAS = 'secreto-de-laboratorio-para-tareas-0123456789'

const ruta = (c: string, cl: string, i: string, s: string) => `${c}/${cl}/${i}/${s}`

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
    insert into ss_incidencia (id, consultora_id, cliente_id, titulo, descripcion) values
      ('${INC.a1}', '${ORG.CA}', '${ORG.A1}', 'MIGO no contabiliza', 'M7 053 al contabilizar la entrada'),
      ('${INC.a2}', '${ORG.CA}', '${ORG.A2}', 'Dump en VA01', 'DBSQL_DUPLICATE_KEY_ERROR'),
      ('${INC.b1}', '${ORG.CB}', '${ORG.B1}', 'CFDI no timbra', 'CFDI40102');
    insert into ss_escalamiento (incidencia_id, consultora_id, cliente_id, motivo, escalada_por) values
      ('${INC.a1}', '${ORG.CA}', '${ORG.A1}', 'el plan necesita aprobación del laboratorio', 'agente:soporte-sap-a2a');
    insert into ss_evento (incidencia_id, consultora_id, cliente_id, seq, tipo, actor, fecha, anterior, hash) values
      ('${INC.a1}', '${ORG.CA}', '${ORG.A1}', 1, 'RECIBIDA', 'usr-000000000001', now(), 'genesis', '${'1'.repeat(64)}'),
      ('${INC.b1}', '${ORG.CB}', '${ORG.B1}', 1, 'RECIBIDA', 'usr-000000000002', now(), 'genesis', '${'2'.repeat(64)}');
    insert into ss_adjunto (id, incidencia_id, consultora_id, cliente_id, sha256, ruta, tipo_mime, bytes, via) values
      ('70000000-0000-4000-8000-0000000000a1', '${INC.a1}', '${ORG.CA}', '${ORG.A1}', '${SHA.a1}', '${ruta(ORG.CA, ORG.A1, INC.a1, SHA.a1)}', 'image/png', 1000, 'ocr_local'),
      ('70000000-0000-4000-8000-0000000000a2', '${INC.a2}', '${ORG.CA}', '${ORG.A2}', '${SHA.a2}', '${ruta(ORG.CA, ORG.A2, INC.a2, SHA.a2)}', 'application/pdf', 2000, 'capa0'),
      ('70000000-0000-4000-8000-0000000000b1', '${INC.b1}', '${ORG.CB}', '${ORG.B1}', '${SHA.b1}', '${ruta(ORG.CB, ORG.B1, INC.b1, SHA.b1)}', 'application/xml', 500, 'xml');
    insert into ss_campo_extraido (adjunto_id, incidencia_id, consultora_id, cliente_id, campo, valor, evidencia) values
      ('70000000-0000-4000-8000-0000000000a1', '${INC.a1}', '${ORG.CA}', '${ORG.A1}', 'transaccion', 'MIGO', 'captura: «Transacción MIGO»');
    insert into storage.objects (bucket_id, name) values
      ('ss-originales', '${ruta(ORG.CA, ORG.A1, INC.a1, SHA.a1)}'),
      ('ss-originales', '${ruta(ORG.CA, ORG.A2, INC.a2, SHA.a2)}'),
      ('ss-originales', '${ruta(ORG.CB, ORG.B1, INC.b1, SHA.b1)}'),
      ('ss-sandbox', '${ORG.CA}/caso-a/${'d'.repeat(64)}'),
      ('ss-sandbox', '${ORG.CB}/caso-b/${'e'.repeat(64)}'),
      ('ss-exportes', '${ORG.CA}/2026-10-04-${'f'.repeat(64)}');
    insert into ss_caso_sandbox (origen_consultora_id, texto) values
      ('${ORG.CA}', 'MIGO 101 rechaza el movimiento: periodo cerrado para la sociedad [SOCIEDAD]'),
      ('${ORG.CB}', 'El CFDI no timbra: el RFC del receptor no está en la LCO');
    insert into ss_contrato_sla (id, version, nivel, consultora_id, cliente_id, contenido, vigente_desde) values
      ('sla-ca', 1, 'N1-N2', '${ORG.CA}', null, '{}', '2026-10-01'),
      ('sla-cb', 1, 'N1-N2', '${ORG.CB}', null, '{}', '2026-10-01'),
      ('sla-a1', 1, 'N2-N3', '${ORG.CA}', '${ORG.A1}', '{}', '2026-10-01');
    insert into ss_mapeo (consultora_id, herramienta, version, contenido) values ('${ORG.CA}', 'mesauno', 1, '{}');
    insert into ss_propuesta (id, tipo, origen, alcance, contenido, propuesta_por) values
      ('80000000-0000-4000-8000-000000000001', 'regla', 'sandbox', 'nucleo', '{"regla":"periodo cerrado MM"}', 'agente:soporte-sap-a2a');
    insert into ss_chat_mensaje (usuario_id, autor, contenido) values
      ('${USR.sup}', 'humano', '¿Cómo va el cumplimiento de SLA de Andina?'),
      ('${USR.exp}', 'humano', 'Te enseño el caso de MIGO');
  `)
  return db
}

/** El seudónimo de una persona, igual que `ss_priv.seudonimo`. */
export async function seudonimo(db: PGlite, usuario: string): Promise<string> {
  return (await db.query<{ s: string }>(`select ss_priv.seudonimo('${usuario}') as s`)).rows[0]!.s
}

/** Corre `sql` como una persona (rol authenticated con su `sub`). Siempre vuelve a dueño. */
export async function como<T = Record<string, unknown>>(db: PGlite, usuario: string, sql: string): Promise<T[]> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${usuario}', false);`)
  try { return (await db.query<T>(sql)).rows } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`) }
}

/** La pasarela: verifica el token de la tarea y SOLO entonces fija el rol y los claims. */
export async function comoServicio<T = Record<string, unknown>>(db: PGlite, token: string, sql: string): Promise<T[]> {
  const claims = verificaTokenDeTarea(SECRETO_TAREAS, token, Date.now())
  await db.exec(`set role ${claims.rol}; select set_config('request.jwt.claims', '${JSON.stringify(claims)}', false);`)
  try { return (await db.query<T>(sql)).rows } finally { await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`) }
}

/** Un token válido para una consultora y un rol, firmado como lo firmaría el orquestador. */
export const tokenDe = (consultora: string, rol: RolDeServicio = 'soporte_sap_agente'): string =>
  emiteTokenDeTarea(SECRETO_TAREAS, { consultora, tarea: `tarea-${rol}`, rol, exp: Date.now() + 60_000 })

/** Corre `sql` como el agente con una tarea legítima de esa consultora. */
export const comoAgente = <T = Record<string, unknown>>(db: PGlite, consultora: string, sql: string): Promise<T[]> =>
  comoServicio<T>(db, tokenDe(consultora), sql)

/** ¿Falla? Devuelve el mensaje del error, o null si pasó. */
export async function falla(f: () => Promise<unknown>): Promise<string | null> {
  try { await f(); return null } catch (e) { return e instanceof Error ? e.message : String(e) }
}

/** Carga SINTÉTICA de 12 meses para una consultora y un cliente (incidencias, 6 eventos, adjunto y horas por incidencia). */
export async function cargaSintetica(db: PGlite, consultora: string, cliente: string, porMes: number): Promise<void> {
  const n = porMes * 12
  await db.exec(`begin; set local session_replication_role = replica;
    insert into ss_incidencia (id, consultora_id, cliente_id, titulo, descripcion, prioridad, estado, creada_en)
      select gen_random_uuid(), '${consultora}', '${cliente}', 'Incidencia sintética ' || g, repeat('texto de la incidencia ', 12), (array['P1','P2','P3','P4'])[1 + g % 4], 'cerrada', now() - (g || ' hours')::interval
      from generate_series(1, ${n}) g;
    insert into ss_evento (incidencia_id, consultora_id, cliente_id, seq, tipo, actor, fecha, anterior, hash)
      select i.id, i.consultora_id, i.cliente_id, s, (array['RECIBIDA','CATEGORIZADA','PRIMERA_RESPUESTA','RESUELTA','CERRADA','NOTA'])[s], 'agente:soporte-sap-a2a', i.creada_en + (s || ' minutes')::interval, md5(i.id::text || (s - 1)), md5(i.id::text || s)
      from ss_incidencia i, generate_series(1, 6) s where i.consultora_id = '${consultora}' and i.titulo like 'Incidencia sintética%';
    insert into ss_adjunto (incidencia_id, consultora_id, cliente_id, sha256, ruta, tipo_mime, bytes, via)
      select i.id, i.consultora_id, i.cliente_id, encode(sha256(i.id::text::bytea), 'hex'), i.consultora_id || '/' || i.cliente_id || '/' || i.id || '/' || encode(sha256(i.id::text::bytea), 'hex'), 'image/png', 180000, 'ocr_local'
      from ss_incidencia i where i.consultora_id = '${consultora}' and i.titulo like 'Incidencia sintética%';
    insert into ss_horas (consultora_id, cliente_id, incidencia_id, consultor, minutos, fecha)
      select i.consultora_id, i.cliente_id, i.id, 'usr-000000000abc', 30 + (random() * 300)::int, current_date
      from ss_incidencia i where i.consultora_id = '${consultora}' and i.titulo like 'Incidencia sintética%';
    commit;`)
}
