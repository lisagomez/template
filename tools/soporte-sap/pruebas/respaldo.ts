/**
 * Restaurar a UN tenant sin tocar a los demás (en efímero, PGlite): export de A → daño sembrado →
 * restauración solo de A → A igual a su export y B igual que antes. Y la demostración de por qué
 * un snapshot de la base entera no sirve para eso: regresa en el tiempo también a B.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PGlite } from '@electric-sql/pglite'
import { exportaTenant, huellaTenant, restauraTenant, verificaRestauracion, TABLAS_DE_TENANT, type Consulta } from '../dist/index.js'
import { baseSoporte, ORG, INC } from './_base.ts'

const consulta = (db: PGlite): Consulta => async <T>(sql: string, p?: unknown[]) => (await db.query<T>(sql, p)).rows

/** Un job defectuoso con privilegio de dueño borra todo lo de A (el daño que hay que deshacer). */
async function danaA(db: PGlite): Promise<void> {
  await db.exec(`begin; set local session_replication_role = replica;
    delete from ss_evento where consultora_id = '${ORG.CA}'; delete from ss_campo_extraido where consultora_id = '${ORG.CA}';
    delete from ss_adjunto where consultora_id = '${ORG.CA}'; delete from ss_escalamiento where consultora_id = '${ORG.CA}';
    delete from ss_incidencia where consultora_id = '${ORG.CA}'; update ss_mapeo set contenido = '{"roto":true}' where consultora_id = '${ORG.CA}'; commit;`)
}

test('restaurar solo a la consultora A: A vuelve a su export y B no cambia', async () => {
  const db = await baseSoporte()
  const q = consulta(db)
  const e = await exportaTenant(q, ORG.CA, '2026-10-04T12:00:00Z')
  assert.ok(e.huella.conteos['ss_incidencia']! >= 2 && e.huella.conteos['ss_evento']! >= 1)
  const bAntes = await huellaTenant(q, ORG.CB)
  await danaA(db)
  assert.notEqual((await huellaTenant(q, ORG.CA)).total, e.huella.total, 'el daño cambió a A')
  const r = await restauraTenant(q, e)
  assert.ok(r.insertadas > 0)
  const v = verificaRestauracion(e, await huellaTenant(q, ORG.CA), { [ORG.CB]: bAntes }, { [ORG.CB]: await huellaTenant(q, ORG.CB) })
  assert.deepEqual(v.diferencias, [])
  assert.ok(v.tenantIgual && v.otrosIguales)
})

test('un export lleva el manifiesto de sus objetos de Storage, no sus bytes', async () => {
  const e = await exportaTenant(consulta(await baseSoporte()), ORG.CA, '2026-10-04T12:00:00Z')
  assert.ok(e.objetos.some((o) => o.bucket === 'ss-originales' && o.nombre.startsWith(ORG.CA)))
  assert.ok(e.objetos.every((o) => o.nombre.startsWith(ORG.CA)), 'nada de otro tenant')
})

/** La copia de la base ENTERA, como la del proveedor o un snapshot: todas las tablas, todos los tenants. */
export async function fotoBaseEntera(db: PGlite): Promise<void> {
  const tablas = (await db.query<{ t: string }>(`select relname as t from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname like 'ss\\_%'`)).rows
  await db.exec('drop schema if exists foto cascade; create schema foto;')
  for (const { t } of tablas) await db.exec(`create table foto.${t} as table public.${t};`)
}

/** Restaurar la base entera desde esa copia: todo vuelve al instante de la foto. */
export async function restauraBaseEntera(db: PGlite): Promise<void> {
  const tablas = (await db.query<{ t: string }>(`select table_name as t from information_schema.tables where table_schema = 'foto'`)).rows
  await db.exec(`begin; set local session_replication_role = replica;`)
  for (const { t } of tablas) await db.exec(`delete from public.${t}; insert into public.${t} select * from foto.${t};`)
  await db.exec('commit;')
}

test('restaurar la base entera (snapshot o respaldo del proveedor) regresa en el tiempo a TODOS', async () => {
  const db = await baseSoporte()
  await fotoBaseEntera(db)
  await db.exec(`insert into ss_incidencia (consultora_id, cliente_id, titulo) values ('${ORG.CB}', '${ORG.B1}', 'nueva de B después de la foto')`)
  const bConLaNueva = await huellaTenant(consulta(db), ORG.CB)
  await restauraBaseEntera(db)
  const bTrasRestaurar = await huellaTenant(consulta(db), ORG.CB)
  assert.equal(bTrasRestaurar.conteos['ss_incidencia'], bConLaNueva.conteos['ss_incidencia']! - 1, 'B perdió una incidencia que no tenía nada que ver')
  void INC
})

test('restaurar es una transacción: si falla, no queda nada a medias', async () => {
  const db = await baseSoporte()
  const q = consulta(db)
  const e = await exportaTenant(q, ORG.CA, '2026-10-04T12:00:00Z')
  const antes = await huellaTenant(q, ORG.CA)
  const roto = { ...e, tablas: { ...e.tablas, ss_horas: [{ id: 'no-es-uuid' }] } }
  await assert.rejects(restauraTenant(q, roto))
  assert.equal((await huellaTenant(q, ORG.CA)).total, antes.total)
})

test('toda tabla con datos de una consultora está en el respaldo por tenant, o se declara derivada', async () => {
  const db = await baseSoporte()
  const conTenant = (await db.query<{ t: string }>(`select distinct table_name as t from information_schema.columns
    where table_schema = 'public' and table_name like 'ss\\_%' and column_name in ('consultora_id', 'origen_consultora_id') order by 1`)).rows.map((r) => r.t)
  // ss_metrica es DERIVADA: se regenera con la capa semántica después de restaurar; no se respalda aparte.
  const DERIVADAS = ['ss_metrica']
  assert.deepEqual(conTenant.filter((t) => !DERIVADAS.includes(t)).sort(), TABLAS_DE_TENANT.map(([t]) => t).sort())
})

