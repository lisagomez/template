/**
 * El presupuesto del mes (PRP-010 H-18). «P1 y P2 nunca se cortan por presupuesto» era una función que nadie llamaba,
 * el aviso no llegaba a nadie y nadie leía `ss_presupuesto`: el tope de OCR vivía en memoria y sin periodo. Ahora el
 * tope sale de la base por mes, lo gastado sale de la cadena del mes, el enjambre no corre sin el visto bueno, y el
 * runtime pasa cada paso que gasta modelo por el presupuesto, con el aviso en la cadena.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PGlite } from '@electric-sql/pglite'
import { guardiaPresupuesto } from '../../sala-a2a/dist/index.js'
import {
  leePresupuesto, veredictoDelMes, ocrDelMes, usoDelMes, mesDe, accionAnteElPresupuesto, preparaPlan, corrige, SinPresupuesto,
  sapDeLaboratorio, MATRIZ_LABORATORIO, type Consulta, type PresupuestoDelMes,
} from '../dist/index.js'
import { baseSoporte, comoAgente, tokenDe, ORG, INC } from './_base.ts'
import { lee } from './_ayuda.ts'

const consultaDe = (db: PGlite): Consulta => async <T>(sql: string, p?: unknown[]) => (await db.query<T>(sql, p)).rows
async function comoAgenteLee<T>(db: PGlite, consultora: string, f: (q: Consulta) => Promise<T>): Promise<T> {
  await db.exec(`set role soporte_sap_agente; select set_config('ss.tarea', '${tokenDe(consultora)}', false);`)
  try { return await f(consultaDe(db)) } finally { await db.exec(`reset role; select set_config('ss.tarea', '', false);`) }
}
const evento = (tipo: string, datos: object) => `insert into ss_evento (incidencia_id, consultora_id, cliente_id, seq, tipo, datos, actor, fecha, anterior, hash)
  values ('${INC.a1}', '${ORG.CA}', '${ORG.A1}', 1, '${tipo}', '${JSON.stringify(datos)}', 'agente:soporte-sap-a2a', now(), 'x', 'x')`
const ESTE_MES = mesDe(new Date().toISOString())
const MES_PASADO = mesDe(new Date(Date.parse(ESTE_MES) - 86_400_000).toISOString())
const del = (p: Partial<PresupuestoDelMes>): PresupuestoDelMes =>
  ({ consultora: 'andina', mes: ESTE_MES, topeTokens: 100_000, topePaginasOcr: 10, tokens: 0, paginasOcr: 0, tokensSinMedir: 0, ocrSinMedir: 0, ...p })

test('H-18 · el tope sale de la base por mes y lo gastado de la cadena del mes: otro mes no cuenta', async () => {
  const db = await baseSoporte()
  await db.exec(`insert into ss_presupuesto (consultora_id, mes, tope_tokens, tope_paginas_ocr) values
    ('${ORG.CA}', '${ESTE_MES}', 20000, 10), ('${ORG.CA}', '${MES_PASADO}', 5000, 2)`)
  await comoAgente(db, ORG.CA, evento('PLAN_PREPARADO', { tokens: 9000, tokensSon: 'estimados' }))
  await comoAgente(db, ORG.CA, evento('ADJUNTO_LEIDO', { via: 'ocr_local', paginasOcr: 3 }))
  await comoAgente(db, ORG.CA, evento('ADJUNTO_LEIDO', { via: 'capa0', paginasOcr: 0 }))
  const hoy = await comoAgenteLee(db, ORG.CA, (q) => leePresupuesto(q, ORG.CA, new Date().toISOString()))
  assert.deepEqual([hoy.topeTokens, hoy.topePaginasOcr, hoy.tokens, hoy.paginasOcr], [20000, 10, 9000, 3])
  const antes = await comoAgenteLee(db, ORG.CA, (q) => leePresupuesto(q, ORG.CA, MES_PASADO))
  assert.deepEqual([antes.topeTokens, antes.tokens, antes.paginasOcr], [5000, 0, 0], 'los eventos de este mes no cuentan para el pasado')
  assert.deepEqual(ocrDelMes(hoy), { maximas: 10, usadas: 3 })
})

test('H-18 · el agente no lee el presupuesto de otra consultora: para él no hay tope, y sin tope nada llama al modelo', async () => {
  const db = await baseSoporte()
  await db.exec(`insert into ss_presupuesto (consultora_id, mes, tope_tokens, tope_paginas_ocr) values ('${ORG.CB}', '${ESTE_MES}', 999999, 999)`)
  const ajeno = await comoAgenteLee(db, ORG.CA, (q) => leePresupuesto(q, ORG.CB, new Date().toISOString()))
  assert.deepEqual([ajeno.topeTokens, ajeno.topePaginasOcr], [null, null])
  assert.equal(veredictoDelMes(ajeno, 1).permitido, false)
})

test('H-18 · sin tope del mes, o con un plan sin sus tokens, no se llama al modelo: P1 y P2 a una persona, P3 y P4 esperan', () => {
  for (const p of [del({ topeTokens: null }), del({ tokensSinMedir: 1 })]) {
    const v = veredictoDelMes(p, 9000)
    assert.equal(v.permitido, false, JSON.stringify(p))
    for (const pr of ['P1', 'P2'] as const) assert.equal(accionAnteElPresupuesto(v, pr).accion, 'a_humano')
    for (const pr of ['P3', 'P4'] as const) assert.equal(accionAnteElPresupuesto(v, pr).accion, 'espera')
  }
  assert.deepEqual(usoDelMes([{ tipo: 'PLAN_PREPARADO', datos: {} }, { tipo: 'ADJUNTO_LEIDO', datos: { via: 'ocr_local' } }]), { tokens: 0, paginasOcr: 0, tokensSinMedir: 1, ocrSinMedir: 1 }, 'ausente no es cero')
  assert.equal(ocrDelMes(del({ topePaginasOcr: null })).maximas, 0, 'sin tope de OCR del mes, el OCR no corre')
  assert.equal(ocrDelMes(del({ ocrSinMedir: 1 })).maximas, 0, 'con lecturas sin medir, tampoco')
})

test('H-18 · veredictoDelMes sigue las reglas de la guardia de la sala (fail-closed, aviso al 80 %)', () => {
  for (const [tope, gastado, costo] of [[100, 0, 10], [100, 70, 10], [100, 79, 1], [100, 95, 10], [100, 100, 0], [0, 0, 1]] as const) {
    const sala = guardiaPresupuesto([{ tenant: 'andina', claseTarea: 'triage', tope, gastado }], 'andina', 'triage', costo)
    const mes = veredictoDelMes(del({ topeTokens: tope, tokens: gastado }), costo)
    const forma = (v: typeof sala) => (v.permitido ? [true, v.restante, v.aviso] : [false, v.motivo])
    assert.deepEqual(forma(mes), forma(sala), `tope ${tope}, gastado ${gastado}, costo ${costo}`)
  }
})

test('H-18 · el enjambre no prepara ni corrige un plan sin el visto bueno del presupuesto', () => {
  const MM = MATRIZ_LABORATORIO.find((e) => e.regla === 'SS-MM-PERIODO')!
  const sap = sapDeLaboratorio('alimentos-del-bajio', 'S4HANA')
  const texto = 'MIGO no deja contabilizar la entrada: mensaje M7 053 en sociedad 1000; necesitamos el periodo 2026/10'
  const base = { ejecutor: 'e', incidencia: 'inc-1', taskId: 't1', entrada: MM, texto, sap }
  for (const presupuesto of [{ accion: 'a_humano' as const, aviso: 'al tope' }, { accion: 'espera' as const, aviso: 'al tope' }]) {
    assert.throws(() => preparaPlan({ ...base, presupuesto }), SinPresupuesto)
  }
  const p = preparaPlan({ ...base, presupuesto: { accion: 'llama_modelo', aviso: null } })
  assert.throws(() => corrige({ ejecutor: 'e', plan: p, motivo: 'el periodo 2026/11', entrada: MM, texto, sap, presupuesto: { accion: 'espera', aviso: 'al tope' } }), SinPresupuesto)
})

const cuerpoDe = (codigo: string, funcion: string) => { const d = codigo.indexOf(`function ${funcion}(`); return codigo.slice(d, codigo.indexOf('\n}\n', d)) }
test('H-18 · en la app, todo paso que gasta modelo pasa por el presupuesto del mes, el aviso queda en la cadena y el OCR lee su tope del mes', () => {
  const runtime = lee('src/features/soporte-sap/services/runtime.ts')
  const levanta = cuerpoDe(runtime, 'levanta'), revisa = cuerpoDe(runtime, 'revisa'), con = cuerpoDe(runtime, 'conPresupuesto')
  assert.match(levanta, /conPresupuesto\(i, \(presupuesto\) => proponPlan\(i, preparaPlan\(\{[^\n]*presupuesto, version: 1/, 'el plan de un caso conocido pasa por el presupuesto')
  assert.match(revisa, /conPresupuesto\(i, \(presupuesto\) => \{\n\s+const r = corrige\(\{[^}]*presupuesto \}\)/, 'la versión corregida también')
  assert.match(con, /veredictoDelMes\(presupuestoDe\(i\.consultora\), TOKENS_POR_PLAN\)/, 'con el presupuesto del mes de su consultora')
  for (const tipo of ['AVISO_PRESUPUESTO', 'A_HUMANO_POR_PRESUPUESTO', 'EN_ESPERA_POR_PRESUPUESTO']) assert.match(con, new RegExp(`anota\\(i, '${tipo}'`), `el aviso ${tipo} queda en la cadena`)
  assert.match(levanta, /ocrDelMes\(presupuestoDe\(cl\.consultora\)\)/, 'el tope de OCR es el del mes')
  assert.match(levanta, /if \(sinLeer\.length && \(clasificacion\.prioridad === 'P1' \|\| clasificacion\.prioridad === 'P2'\)\) \{\n\s+anota\(i, 'A_HUMANO_POR_PRESUPUESTO'[^\n]*evidencia sin leer/, 'un P1 o un P2 con evidencia sin leer pasa a una persona')
  assert.match(runtime, /'PLAN_PREPARADO', EJECUTOR, \{[^\n]*tokens: TOKENS_POR_PLAN/, 'cada plan anota lo que gasta')
  assert.doesNotMatch(runtime.replace(/conPresupuesto\(i, \(presupuesto\) => proponPlan\(i, preparaPlan\(/, ''), /preparaPlan\(/, 'ningún otro camino prepara un plan')
})
