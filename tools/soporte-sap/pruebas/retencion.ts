/**
 * D8, fase 2 (PRP-012): el job de retención y salida, el export de un cliente, el congelamiento al registrar la salida y
 * la lista de bajas tras restaurar. El job corre con el rol de plataforma: lo que borra, lo permite la base (fase 1).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PGlite } from '@electric-sql/pglite'
import {
  planDeRetencion, ejecutaRetencion, trasRestaurar, listaDeBajas, exportaTenant, exportIntegro, restauraTenant, calculaResultadosSla, LISTA_VACIA,
  type Almacen, type Consulta, type ExportCliente,
} from '../dist/index.js'
import { baseSoporte, como, tokenDe, falla, ORG, USR, INC, SECRETO_RESPALDOS as S } from './_base.ts'

const AHORA = '2026-10-10T12:00:00.000Z'
const consultaDe = (db: PGlite): Consulta => async <T>(sql: string, p?: unknown[]) => (await db.query<T>(sql, p)).rows
async function comoPlataforma<T>(db: PGlite, consultora: string, f: (q: Consulta) => Promise<T>): Promise<T> {
  await db.exec(`set role soporte_sap_plataforma; select set_config('ss.tarea', '${tokenDe(consultora, 'soporte_sap_plataforma')}', false);`)
  try { return await f(consultaDe(db)) } finally { await db.exec(`reset role; select set_config('ss.tarea', '', false);`) }
}
/** Storage en el laboratorio: la tabla, con la sesión de quien llama (las políticas deciden). El contenido va en metadata. */
const almacenDe = (q: Consulta): Almacen => ({
  sube: async (bucket, ruta, contenido) => { await q(`insert into storage.objects (bucket_id, name, metadata) values ($1, $2, jsonb_build_object('contenido', $3::text))`, [bucket, ruta, contenido]) },
  borra: async (bucket, ruta) => { await q(`delete from storage.objects where bucket_id = $1 and name = $2`, [bucket, ruta]) },
  lista: async (bucket, prefijo) => (await q<{ n: string }>(`select name as n from storage.objects where bucket_id = $1 and starts_with(name, $2) order by 1`, [bucket, prefijo])).map((r) => r.n),
})
const corre = (db: PGlite, consultora: string) => comoPlataforma(db, consultora, async (q) => ejecutaRetencion(q, almacenDe(q), await planDeRetencion(q, consultora), AHORA, S))

const sinDisparadores = (db: PGlite, sql: string) => db.exec(`set session_replication_role = replica; ${sql}; set session_replication_role = origin;`)
const contrato = (db: PGlite, id: string, cliente: string, version: number, dias: Record<string, number>) => db.exec(`insert into ss_contrato_sla (id, version, nivel, consultora_id, cliente_id, contenido, vigente_desde)
  values ('${id}', ${version}, 'N2-N3', '${ORG.CA}', '${cliente}', '${JSON.stringify(Object.fromEntries(Object.entries(dias).map(([k, v]) => [k, { valor: v, quienDecide: 'prueba' }])))}', current_date)`)
const resuelta = (db: PGlite, inc: string, haceDias: number) =>
  sinDisparadores(db, `update ss_incidencia set estado = 'resuelta', resuelta_en = now() - interval '${haceDias} days' where id = '${inc}'`)
const sale = (db: PGlite, usuario: string, cliente: string) => como(db, usuario, `insert into ss_baja (consultora_id, cliente_id) values ('${ORG.CA}', '${cliente}')`)
const venceLaGracia = (db: PGlite, cliente: string) => sinDisparadores(db, `update ss_baja set borrar_desde = now() - interval '1 day' where cliente_id = '${cliente}'`)
const hay = async (db: PGlite, sql: string) => (await db.query<{ n: number }>(`select count(*)::int as n from (${sql}) x`)).rows[0]?.n ?? 0
const original = (cliente: string, inc: string) => `select 1 from storage.objects where bucket_id = 'ss-originales' and name like '${ORG.CA}/${cliente}/${inc}/%'`
const deCliente = (cliente: string) => `select 1 from ss_incidencia where cliente_id = '${cliente}' union all select 1 from ss_evento where cliente_id = '${cliente}'
  union all select 1 from storage.objects where name like '${ORG.CA}/${cliente}/%'`

test('D8 · el plan (dry-run) dice qué vence, en qué punto va cada baja y lo que no hará, y no borra nada', async () => {
  const db = await baseSoporte()
  await contrato(db, 'sla-a1', ORG.A1, 2, { retencionOriginalesDias: 30, graciaSalidaDias: 30 })
  await contrato(db, 'sla-a2', ORG.A2, 1, {})
  await resuelta(db, INC.a1, 40)
  await resuelta(db, INC.a2, 400)
  await sale(db, USR.ua2, ORG.A2)
  const plan = await comoPlataforma(db, ORG.CA, (q) => planDeRetencion(q, ORG.CA))
  assert.deepEqual(plan.originales.map((o) => o.adjunto), ['70000000-0000-4000-8000-0000000000a1'], 'vence el de A1; el de A2 no tiene N y está congelado')
  assert.deepEqual(plan.bajas.map((b) => [b.cliente, b.estado]), [[ORG.A2, 'sin_export']])
  assert.ok(plan.avisos.some((a) => a.includes(ORG.A2) && /no vencen \(DP-4\)/.test(a)), plan.avisos.join(' | '))
  assert.equal(await hay(db, original(ORG.A1, INC.a1)), 1, 'el dry-run no borra')
  const deCB = await comoPlataforma(db, ORG.CB, (q) => planDeRetencion(q, ORG.CB))
  assert.deepEqual([deCB.originales.length, deCB.bajas.length], [0, 0], 'la plataforma de otra consultora no ve nada de esta')
})

test('D8 · ejecutar borra los bytes de lo vencido y los marca, genera el export de quien se va, y no toca a un tenant congelado', async () => {
  const db = await baseSoporte()
  await contrato(db, 'sla-a1', ORG.A1, 2, { retencionOriginalesDias: 30, graciaSalidaDias: 30 })
  await contrato(db, 'sla-a2', ORG.A2, 1, {})
  await resuelta(db, INC.a1, 40)
  await sale(db, USR.ua2, ORG.A2)
  assert.deepEqual(await corre(db, ORG.CA), { originales: 1, exportes: 1, bajasCumplidas: 0 })
  assert.equal(await hay(db, original(ORG.A1, INC.a1)), 0, 'los bytes vencidos se van')
  assert.equal(await hay(db, `select 1 from ss_adjunto where id = '70000000-0000-4000-8000-0000000000a1' and original_borrado_en is not null`), 1, 'y quedan marcados')
  assert.equal(await hay(db, original(ORG.A2, INC.a2)), 1, 'el congelado sigue entero hasta su baja')
  const [sha] = (await db.query<{ s: string }>(`select export_sha256 as s from ss_baja where cliente_id = '${ORG.A2}'`)).rows
  assert.equal(await hay(db, `select 1 from storage.objects where bucket_id = 'ss-exportes' and name like '${ORG.CA}/${ORG.A2}/%-${sha?.s}.json'`), 1, 'su export, con su huella')
  const otra = await comoPlataforma(db, ORG.CA, (q) => planDeRetencion(q, ORG.CA))
  assert.deepEqual(otra.bajas.map((b) => b.estado), ['sin_plazo'], 'sin gracia en el contrato, no se borra')
  assert.ok(otra.avisos.some((a) => /no tiene gracia/.test(a)))
})

test('D8 · la salida de un cliente: su export firmado lo leen él y su consultora y nadie más; tras la gracia el job borra todo, el export incluido', async () => {
  const db = await baseSoporte()
  await contrato(db, 'sla-a1', ORG.A1, 2, { retencionOriginalesDias: 30, graciaSalidaDias: 30 })
  await sale(db, USR.ua1, ORG.A1)
  assert.equal((await corre(db, ORG.CA)).exportes, 1)
  const [fila] = (await db.query<{ c: string }>(`select metadata ->> 'contenido' as c from storage.objects where bucket_id = 'ss-exportes' and name like '${ORG.CA}/${ORG.A1}/%'`)).rows
  const e = JSON.parse(fila?.c ?? '{}') as ExportCliente
  assert.ok(exportIntegro(e, S), 'firmado por el job')
  const incidencias = e.tablas.ss_incidencia as Array<{ cliente_id: string }>
  assert.ok(incidencias.length === 1 && incidencias.every((i) => i.cliente_id === ORG.A1), 'solo lo suyo')
  assert.equal((e.tablas.ss_evento ?? []).length, 1, 'con su cadena')
  assert.deepEqual(e.objetos.map((o) => o.nombre.split('/')[1]), [ORG.A1], 'y el manifiesto de sus originales')
  const ve = async (usuario: string) => (await como<{ n: string }>(db, usuario, `select name as n from storage.objects where bucket_id = 'ss-exportes'`)).map((r) => r.n.split('/').length)
  assert.deepEqual(await ve(USR.ua1), [3], 'el cliente ve su export, y no el de su consultora')
  assert.deepEqual((await ve(USR.ca)).sort(), [2, 3], 'su consultora ve los dos')
  assert.deepEqual([await ve(USR.ua2), await ve(USR.cb), await ve(USR.ub1)], [[], [], []], 'nadie más')
  assert.equal((await corre(db, ORG.CA)).bajasCumplidas, 0, 'en la gracia no se borra')
  await venceLaGracia(db, ORG.A1)
  assert.equal((await corre(db, ORG.CA)).bajasCumplidas, 1)
  assert.equal(await hay(db, deCliente(ORG.A1)), 0, 'no queda nada de A1, ni su export')
  assert.equal(await hay(db, `select 1 from ss_baja where cliente_id = '${ORG.A1}' and borrada_en is not null`), 1, 'la baja, cumplida')
  assert.equal(await hay(db, `select 1 from ss_incidencia where id in ('${INC.a2}', '${INC.b1}')`), 2, 'el vecino y la otra consultora siguen')
})

test('D8 · con la salida registrada el tenant se congela: nada suyo se escribe ni cambia, y el job del SLA lo omite', async () => {
  const db = await baseSoporte()
  await sale(db, USR.ua1, ORG.A1)
  const congelado = /salida de este tenant está registrada/
  assert.match(await falla(() => como(db, USR.ca, `update ss_incidencia set modulo = 'MM' where id = '${INC.a1}'`)) ?? '', congelado, 'su consultora no lo atiende')
  assert.match(await falla(() => db.exec(`insert into ss_evento (incidencia_id, consultora_id, cliente_id, seq, tipo, actor, fecha, anterior, hash)
    values ('${INC.a1}', '${ORG.CA}', '${ORG.A1}', 2, 'NOTA', 'usr-000000000001', now(), '${'1'.repeat(64)}', '${'3'.repeat(64)}')`)) ?? '', congelado, 'ni la cadena crece')
  assert.match(await falla(() => db.exec(`insert into ss_horas (consultora_id, cliente_id, consultor, minutos, fecha) values ('${ORG.CA}', '${ORG.A1}', 'usr-000000000001', 30, current_date)`)) ?? '', congelado, 'ni se cargan horas')
  await como(db, USR.ca, `update ss_incidencia set modulo = 'MM' where id = '${INC.a2}'`)
  assert.equal(await hay(db, `select 1 from ss_incidencia where id = '${INC.a2}' and modulo = 'MM'`), 1, 'el vecino, sí')
  const sla = await comoPlataforma(db, ORG.CA, (q) => calculaResultadosSla(q, ORG.CA, AHORA))
  assert.ok(sla.omitidas.some((o) => o.incidencia === INC.a1 && /registró la salida/.test(o.motivo)), JSON.stringify(sla.omitidas))
})

/** El escenario de las dos restauraciones: un export viejo de CA; luego el original de A1 vence y A2 se va. */
async function trasRetenerYDarDeBaja(db: PGlite) {
  const viejo = await exportaTenant(consultaDe(db), ORG.CA, AHORA, S)
  await contrato(db, 'sla-a1', ORG.A1, 2, { retencionOriginalesDias: 30, graciaSalidaDias: 30 })
  await contrato(db, 'sla-a2', ORG.A2, 1, { graciaSalidaDias: 30 })
  await resuelta(db, INC.a1, 40)
  await sale(db, USR.ua2, ORG.A2)
  await corre(db, ORG.CA)
  await venceLaGracia(db, ORG.A2)
  assert.equal((await corre(db, ORG.CA)).bajasCumplidas, 1)
  return { viejo, lista: await listaDeBajas(consultaDe(db), AHORA) }
}

test('D8 · restaurar un export viejo no resucita al cliente que se fue ni un original borrado; sin la lista, no se restaura', async () => {
  const db = await baseSoporte()
  const { viejo, lista } = await trasRetenerYDarDeBaja(db)
  assert.deepEqual([lista.bajas.length, lista.originales.length], [1, 1])
  assert.ok(!JSON.stringify(lista).includes('Aceros'), 'la lista no lleva nombres')
  const q = consultaDe(db)
  await assert.rejects(restauraTenant(q, viejo, S, undefined as never), /sin la lista de bajas no se restaura/)
  await restauraTenant(q, viejo, S, LISTA_VACIA)
  assert.equal(await hay(db, `select 1 from ss_incidencia where id = '${INC.a2}'`), 1, 'control: con una lista vacía, A2 resucita')
  const r = await restauraTenant(q, viejo, S, lista)
  assert.ok(r.podadas > 0)
  assert.equal(await hay(db, `select 1 from ss_incidencia where cliente_id = '${ORG.A2}'`), 0, 'con la lista, A2 no vuelve')
  assert.equal(await hay(db, `select 1 from ss_adjunto where id = '70000000-0000-4000-8000-0000000000a1' and original_borrado_en is not null`), 1, 'y el original de A1 sigue borrado')
  assert.equal(await hay(db, `select 1 from ss_incidencia where id = '${INC.a1}'`), 1, 'A1 se restaura')
})

test('D8 · tras restaurar la base entera, la lista más reciente vuelve a poner las bajas y borra filas y bytes de lo que se fue', async () => {
  const actual = await baseSoporte()
  const { lista } = await trasRetenerYDarDeBaja(actual)
  const vieja = await baseSoporte()
  const q = consultaDe(vieja)
  assert.ok(await hay(vieja, deCliente(ORG.A2)) >= 2, 'la base vieja trae a A2: su incidencia y su original')
  await assert.rejects(trasRestaurar(q, almacenDe(q), { ...lista, version: 2 } as never), /desconocida/)
  await trasRestaurar(q, almacenDe(q), lista)
  assert.equal(await hay(vieja, deCliente(ORG.A2)), 0, 'filas y bytes de A2, fuera')
  assert.equal(await hay(vieja, `select 1 from ss_baja where cliente_id = '${ORG.A2}' and borrada_en is not null`), 1, 'su baja vuelve, cumplida')
  assert.equal(await hay(vieja, original(ORG.A1, INC.a1)), 0, 'los bytes del original vencido, fuera')
  assert.equal(await hay(vieja, `select 1 from ss_adjunto where id = '70000000-0000-4000-8000-0000000000a1' and original_borrado_en is not null`), 1)
  assert.equal(await hay(vieja, `select 1 from ss_incidencia where id in ('${INC.a1}', '${INC.b1}')`), 2, 'lo demás sigue')
  assert.equal(await hay(vieja, `select 1 from ss_caso_sandbox where origen_consultora_id = '${ORG.CA}'`), 1, 'el sandbox anonimizado se queda')
})
