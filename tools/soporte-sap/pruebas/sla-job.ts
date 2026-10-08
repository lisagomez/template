/**
 * El job del SLA (PRP-010 H-16): calcula el resultado de cada incidencia DESDE LA BASE (la fecha de alta que pone
 * la base, los eventos de su cadena y el contrato vigente) y lo escribe con el rol de plataforma. Lo ESPERADO se
 * calcula aquí aparte, con `relojSla` sobre eventos armados a mano: si saliera del mismo código del job, un error
 * del job estaría también en lo esperado y la prueba no caería nunca.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PGlite } from '@electric-sql/pglite'
import { calculaResultadosSla, contratoDeLaboratorio, relojSla, type Consulta } from '../dist/index.js'
import { baseSoporte, como, comoAgente, falla, tokenDe, ORG, USR, INC } from './_base.ts'

const NUEVA = '20000000-0000-4000-8000-00000000051a'
const consultaDe = (db: PGlite): Consulta => async <T>(sql: string, p?: unknown[]) => (await db.query<T>(sql, p)).rows

async function comoPlataforma<T>(db: PGlite, consultora: string, f: (q: Consulta) => Promise<T>): Promise<T> {
  await db.exec(`set role soporte_sap_plataforma; select set_config('ss.tarea', '${tokenDe(consultora, 'soporte_sap_plataforma')}', false);`)
  try { return await f(consultaDe(db)) } finally { await db.exec(`reset role; select set_config('ss.tarea', '', false);`) }
}

/** Una base con (o sin) un contrato N2–N3 de verdad para A1 y una incidencia nueva de A1, categorizada (o no) P2. */
async function escenario({ categorizada = true, contrato = true } = {}) {
  const db = await baseSoporte()
  const k = contratoDeLaboratorio(ORG.CA, ORG.A1, '2026-04-01')
  if (contrato) await db.query(`insert into ss_contrato_sla (id, version, nivel, consultora_id, cliente_id, contenido, vigente_desde)
    values ($1, $2, 'N2-N3', $3, $4, $5, '2026-04-01')`, [k.id, k.version, ORG.CA, ORG.A1, JSON.stringify(k)])
  await db.exec(`insert into ss_incidencia (id, consultora_id, cliente_id, titulo, descripcion) values ('${NUEVA}', '${ORG.CA}', '${ORG.A1}', 'MIGO no contabiliza', 'M7 053')`)
  const evento = (tipo: string, actor: string, datos = '{}') => `insert into ss_evento (incidencia_id, consultora_id, cliente_id, seq, tipo, datos, actor, fecha, anterior, hash)
    values ('${NUEVA}', '${ORG.CA}', '${ORG.A1}', 1, '${tipo}', '${datos}', '${actor}', now(), 'x', 'x')`
  if (categorizada) await comoAgente(db, ORG.CA, evento('CATEGORIZADA', 'agente:soporte-sap-a2a', '{"prioridad":"P2"}'))
  const seudo = (await db.query<{ s: string }>(`select ss_priv.seudonimo('${USR.ca}') as s`)).rows[0]!.s
  await como(db, USR.ca, evento('PRIMERA_RESPUESTA', seudo))
  return { db, k }
}
const iso = (db: PGlite, sql: string) => db.query<{ f: string }>(`select to_char(f at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as f from (${sql}) x`).then((r) => r.rows[0]!.f)

test('H-16 · el job calcula el resultado desde los eventos de la base, igual que relojSla, y lo escribe con el rol de plataforma', async () => {
  const { db, k } = await escenario()
  const corte = new Date(Date.now() + 60_000).toISOString()
  const corrida = await comoPlataforma(db, ORG.CA, (q) => calculaResultadosSla(q, ORG.CA, corte))
  assert.equal(corrida.calculadas, 1, JSON.stringify(corrida.omitidas))
  const alta = await iso(db, `select creada_en as f from ss_incidencia where id = '${NUEVA}'`)
  const respuesta = await iso(db, `select fecha as f from ss_evento where incidencia_id = '${NUEVA}' and tipo = 'PRIMERA_RESPUESTA'`)
  const esperado = relojSla([{ tipo: 'RECIBIDA', fecha: alta }, { tipo: 'PRIMERA_RESPUESTA', fecha: respuesta }], 'P2', k, corte)
  const [r] = (await db.query<{ prioridad: string; estado: string; cumple_respuesta: boolean | null; meta_respuesta_min: number | null; respuesta_min: number | null }>(
    `select prioridad, estado, cumple_respuesta, meta_respuesta_min, respuesta_min from ss_sla_resultado where incidencia_id = '${NUEVA}'`)).rows
  assert.deepEqual(r, { prioridad: esperado.prioridad, estado: esperado.estado, cumple_respuesta: esperado.cumpleRespuesta,
    meta_respuesta_min: esperado.metaRespuestaMin, respuesta_min: esperado.respuestaMin === null ? null : Math.round(esperado.respuestaMin) })
  assert.notEqual(r!.respuesta_min, null, 'la primera respuesta del consultor está en el resultado')
})

test('H-16 · sin contrato válido o sin prioridad inicial, el job no inventa un resultado: lo omite y dice por qué', async () => {
  const motivoDe = (c: Awaited<ReturnType<typeof calculaResultadosSla>>, inc: string) => c.omitidas.find((o) => o.incidencia === inc)?.motivo ?? ''
  // Con contrato y sin el evento CATEGORIZADA: no hay prioridad inicial que medir. A2 no tiene contrato N2-N3.
  const sinPrioridad = await escenario({ categorizada: false })
  const c1 = await comoPlataforma(sinPrioridad.db, ORG.CA, (q) => calculaResultadosSla(q, ORG.CA, new Date().toISOString()))
  assert.match(motivoDe(c1, NUEVA), /sin prioridad inicial/)
  assert.match(motivoDe(c1, INC.a2), /sin contrato N2-N3 válido/)
  // Sin el contrato de verdad, A1 solo tiene el sembrado `{}`: un contrato a medias no se mide.
  const aMedias = await escenario({ contrato: false })
  const c2 = await comoPlataforma(aMedias.db, ORG.CA, (q) => calculaResultadosSla(q, ORG.CA, new Date().toISOString()))
  assert.match(motivoDe(c2, INC.a1), /sin contrato N2-N3 válido/)
  assert.deepEqual([c1.calculadas, c2.calculadas], [0, 0])
  for (const db of [sinPrioridad.db, aMedias.db]) assert.equal((await db.query('select 1 from ss_sla_resultado')).rows.length, 0, 'ninguna fila inventada')
})

test('H-16 · el job de una consultora no escribe resultados de otra', async () => {
  const { db, k } = await escenario()
  const ajeno = `insert into ss_sla_resultado (incidencia_id, contrato_id, contrato_version, consultora_id, cliente_id, cumple_respuesta, prioridad, estado)
    values ('${INC.b1}', '${k.id}', ${k.version}, '${ORG.CB}', '${ORG.B1}', true, 'P1', 'resuelta')`
  assert.ok(await falla(() => comoPlataforma(db, ORG.CA, (q) => q(ajeno))), 'con una tarea de A, no escribe el resultado de B')
})
