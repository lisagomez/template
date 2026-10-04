/**
 * La suite de la sala: cada comprobación es CONDUCTA (el intento falla con el rol real) o
 * ESTRUCTURA (el permiso o la política que lo impide existe). Hacen falta las dos: con el agente
 * fuera del dueño de las tablas, quitar `force` no cambia ninguna conducta, y solo la estructura
 * lo ve. `sabotajes.ts` siembra cada defecto y exige que su comprobación caiga.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { enruta as enrutaReal, type Mensaje } from '../dist/index.js'

export const SQL_SALA = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migraciones', 'propuesta-sala-a2a.sql'), 'utf8')

/** Supabase mínimo, con lo que importa aquí: `service_role` con bypassrls y TODO por defecto en public. */
export const SUPABASE_MINIMO = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to service_role;
`

export const TEN_A = '30000000-0000-4000-8000-000000000001'
export const TEN_B = '30000000-0000-4000-8000-000000000002'
export const H = { a: '40000000-0000-4000-8000-00000000000a', a2: '40000000-0000-4000-8000-0000000000a2', b: '40000000-0000-4000-8000-00000000000b' } as const
const C1 = '50000000-0000-4000-8000-000000000001'
const C2 = '50000000-0000-4000-8000-000000000002'
export const M1 = '60000000-0000-4000-8000-000000000001'
const M2 = '60000000-0000-4000-8000-000000000002'
const SHA = 'ab'.repeat(32)

export async function baseSala(sabotaje = ''): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(SUPABASE_MINIMO)
  await db.exec(SQL_SALA)
  await db.exec(SQL_SALA)
  await db.exec(`
    insert into sala_participante values ('${TEN_A}', '${H.a}', 'miembro'), ('${TEN_A}', '${H.a2}', 'miembro'), ('${TEN_B}', '${H.b}', 'miembro');
    insert into sala_canales (id, tenant_id, slug, nombre, tipo) values ('${C1}', '${TEN_A}', 'consultora-a', 'Consultora A', 'publico'),
      ('${C2}', '${TEN_B}', 'consultora-b', 'Consultora B', 'publico');
    insert into sala_mensajes (id, tenant_id, canal_id, autor_tipo, autor_agente, cuerpo, task_id, bloques) values
      ('${M1}', '${TEN_A}', '${C1}', 'agente', 'soporte-sap-a2a', 'Plan para MIGO: reabrir periodo en el simulador', 'tarea-1',
       '[{"tipo":"acciones","acciones":["aprobar","rechazar","a_revision"],"sha256":"${SHA}","taskId":"tarea-1"}]'),
      ('${M2}', '${TEN_B}', '${C2}', 'agente', 'soporte-sap-a2a', 'Plan para el CFDI', 'tarea-2', '[]');
  `)
  if (sabotaje) await db.exec(sabotaje)
  return db
}

const comoHumano = async (db: PGlite, u: string, sql: string) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${u}', false);`)
  try { return (await db.query(sql)).rows } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`) }
}
const comoRol = async (db: PGlite, rol: string, tenant: string, sql: string) => {
  await db.exec(`set role ${rol}; select set_config('sala.tenant', '${tenant}', false);`)
  try { return (await db.query(sql)).rows } finally { await db.exec(`reset role; select set_config('sala.tenant', '', false);`) }
}
const falla = async (f: () => Promise<unknown>): Promise<boolean> => { try { await f(); return false } catch { return true } }

export interface Comprobacion { readonly id: string; readonly clase: 'conducta' | 'estructura'; readonly que: string; readonly ok: boolean }

export interface Opciones { readonly enruta?: typeof enrutaReal }

const aprobacion = (decide: string) => `insert into sala_aprobaciones (tenant_id, mensaje_id, accion, task_id, sha256_artefacto, decidida_por)
  values ('${TEN_A}', '${M1}', 'aprobar', 'tarea-1', '${SHA}', '${decide}')`

async function aislamiento(db: PGlite): Promise<Comprobacion[]> {
  const bLee = await comoHumano(db, H.b, `select id from sala_mensajes where tenant_id = '${TEN_A}'`)
  const entrega = await comoHumano(db, H.b, `select id from sala_mensajes where id = '${M1}'`)
  const sinForce = await db.query(`select relname from pg_class where relnamespace = 'public'::regnamespace and relname like 'sala\\_%' and relkind = 'r' and not (relrowsecurity and relforcerowsecurity)`)
  return [
    { id: 'S1', clase: 'conducta', que: 'un humano del tenant B lee los mensajes del tenant A', ok: bLee.length === 0 },
    { id: 'S1·estr', clase: 'estructura', que: 'toda tabla sala_* con RLS y force', ok: sinForce.rows.length === 0 },
    { id: 'S6', clase: 'conducta', que: 'Realtime (la entrega se autoriza como el suscriptor): B no recibe la fila de A', ok: entrega.length === 0 },
  ]
}

async function candado(db: PGlite): Promise<Comprobacion[]> {
  const porOtro = await falla(() => comoHumano(db, H.a, aprobacion(H.a2)))
  const propia = !(await falla(() => comoHumano(db, H.a, aprobacion(H.a))))
  const restrictiva = await db.query<{ p: boolean }>(`select polpermissive as p from pg_policy where polname = 'aprobacion_solo_humana' and polrelid = 'public.sala_aprobaciones'::regclass`)
  return [
    { id: 'S2', clase: 'conducta', que: 'un humano legítimo firma una aprobación a nombre de otro', ok: porOtro },
    { id: 'S2·control', clase: 'conducta', que: 'control positivo: el humano firma a su nombre y entra', ok: propia },
    { id: 'S2·estr', clase: 'estructura', que: 'aprobacion_solo_humana existe y es RESTRICTIVA', ok: restrictiva.rows.length === 1 && restrictiva.rows[0]!.p === false },
  ]
}

async function servicios(db: PGlite): Promise<Comprobacion[]> {
  const roles = (await db.query<{ r: string }>(`select rolname as r from pg_roles where rolname in ('service_role', 'sala_agente', 'soporte_sap_agente')`)).rows.map((x) => x.r)
  const privilegios = await db.query<{ r: string }>(`select r from unnest(array[${roles.map((r) => `'${r}'`).join(',')}]) as r where has_table_privilege(r, 'public.sala_aprobaciones', 'INSERT')`)
  const servicio = await falla(() => comoRol(db, 'service_role', TEN_A, aprobacion(H.a2)))
  const agente = await falla(() => comoRol(db, 'sala_agente', TEN_A, aprobacion(H.a2)))
  return [
    { id: 'S2b·estr', clase: 'estructura', que: `ningún rol de servicio o de agente (${roles.join(', ')}) tiene INSERT en sala_aprobaciones`, ok: privilegios.rows.length === 0 },
    { id: 'S2b', clase: 'conducta', que: 'service_role (bypassrls) inserta una aprobación', ok: servicio },
    { id: 'S7', clase: 'conducta', que: 'el agente o el chat del HIL insertan una aprobación', ok: agente },
  ]
}

async function forma(db: PGlite, opciones: Opciones): Promise<Comprobacion[]> {
  const respuesta = '60000000-0000-4000-8000-0000000000f1'
  await db.exec(`insert into sala_mensajes (id, tenant_id, canal_id, hilo_id, autor_tipo, autor_agente, cuerpo) values ('${respuesta}', '${TEN_A}', '${C1}', '${M1}', 'agente', 'x', 'respuesta')`)
  const nieto = await falla(() => db.exec(`insert into sala_mensajes (tenant_id, canal_id, hilo_id, autor_tipo, autor_agente, cuerpo) values ('${TEN_A}', '${C1}', '${respuesta}', 'agente', 'x', 'nieto')`))
  const deptoHumano = await falla(() => db.exec(`insert into sala_mensajes (tenant_id, canal_id, autor_tipo, autor_usuario, departamento, cuerpo) values ('${TEN_A}', '${C1}', 'humano', '${H.a}', 'procesos', 'x')`))
  const agenteComoHumano = await falla(() => comoRol(db, 'sala_agente', TEN_A, `insert into sala_mensajes (tenant_id, canal_id, autor_tipo, autor_usuario, cuerpo) values ('${TEN_A}', '${C1}', 'humano', '${H.a}', 'soy humano')`))
  const humanoComoAgente = await falla(() => comoHumano(db, H.a, `insert into sala_mensajes (tenant_id, canal_id, autor_tipo, autor_agente, cuerpo) values ('${TEN_A}', '${C1}', 'agente', 'soporte-sap-a2a', 'soy el agente')`))
  const espejo: Mensaje = { id: 'e1', tenant: TEN_A, canal: C1, hilo: null, autor: { tipo: 'humano', id: H.a }, departamento: null, cuerpo: '@dep-procesos revisa esto', bloques: [], origen: 'espejo_slack', creado: '2026-10-04T00:00:00Z' }
  const r = (opciones.enruta ?? enrutaReal)(espejo, ['procesos'])
  return [
    { id: 'S3', clase: 'conducta', que: 'una respuesta a una respuesta (hilo de segundo nivel)', ok: nieto },
    { id: 'S4', clase: 'conducta', que: 'un mensaje humano con departamento', ok: deptoHumano },
    { id: 'S5', clase: 'conducta', que: 'un mensaje de espejo con mención crea una tarea', ok: r.tarea === null && r.aviso !== null },
    { id: 'S8', clase: 'conducta', que: 'el agente publica como si fuera un humano', ok: agenteComoHumano },
    { id: 'S9', clase: 'conducta', que: 'un humano publica como si fuera el agente', ok: humanoComoAgente },
  ]
}

/** Corre la suite completa sobre una base (con o sin sabotaje). */
export async function corre(db: PGlite, opciones: Opciones = {}): Promise<Comprobacion[]> {
  return [...await aislamiento(db), ...await candado(db), ...await servicios(db), ...await forma(db, opciones)]
}

export interface Sabotaje { readonly id: string; readonly que: string; readonly sql?: string; readonly opciones?: Opciones; readonly caza: readonly string[] }

export const SABOTAJES: readonly Sabotaje[] = [
  { id: 'S1', que: 'quitar RLS de sala_mensajes', sql: 'alter table sala_mensajes disable row level security;', caza: ['S1', 'S1·estr'] },
  { id: 'S1·force', que: 'quitar force de sala_mensajes', sql: 'alter table sala_mensajes no force row level security;', caza: ['S1·estr'] },
  { id: 'S2', que: 'la política del candado pasa a permisiva (la r1)', sql: `drop policy aprobacion_solo_humana on sala_aprobaciones;
    create policy aprobacion_solo_humana on sala_aprobaciones as permissive for insert to authenticated with check (decidida_por = auth.uid());`, caza: ['S2', 'S2·estr'] },
  { id: 'S2b', que: 'conceder INSERT en sala_aprobaciones a service_role', sql: 'grant insert on sala_aprobaciones to service_role;', caza: ['S2b·estr', 'S2b'] },
  { id: 'S3', que: 'desactivar el disparador de hilos', sql: 'alter table sala_mensajes disable trigger tg_sala_hilo_un_nivel;', caza: ['S3'] },
  { id: 'S4', que: 'quitar el check del departamento', sql: 'alter table sala_mensajes drop constraint depto_solo_de_agente;', caza: ['S4'] },
  { id: 'S5', que: 'quitar la guarda del espejo en el ruteo', opciones: { enruta: (m, deps) => {
    const d = /@dep-([a-z0-9-]+)/.exec(m.cuerpo)?.[1]
    return { tarea: d && deps.includes(d) ? { departamento: d, mensaje: m.id } : null, aviso: null }
  } }, caza: ['S5'] },
  { id: 'S6', que: 'la política de lectura de mensajes con using (true)', sql: `drop policy tenant_sala_mensajes on sala_mensajes;
    create policy tenant_sala_mensajes on sala_mensajes for select to authenticated using (true);`, caza: ['S6', 'S1'] },
  { id: 'S7', que: 'darle al chat (rol del agente) permiso de insertar aprobaciones', sql: `grant insert on sala_aprobaciones to sala_agente;
    create policy chat_aprueba on sala_aprobaciones for insert to sala_agente with check (true);`, caza: ['S2b·estr', 'S7'] },
]
