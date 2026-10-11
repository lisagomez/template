/**
 * El corte semántico y el job que lo escribe. El job de métricas lee a TODAS las consultoras (para
 * dar totales), pero los privilegios por columna le cierran el texto: lo que no puede leer no lo
 * puede filtrar. El corte se lee por nivel: el laboratorio, agregados; la consultora, lo suyo y lo de
 * sus clientes; el cliente, solo lo suyo.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { baseSoporte, como, comoServicio, falla, tokenDe, ORG, USR } from './_base.ts'
import { HERRAMIENTA } from './_ayuda.ts'
import { marcaLoQueVeElLaboratorio } from '../semantica/grupo-minimo.ts'
import type { Corte } from '../src/corte.ts'

const METRICAS = tokenDe(ORG.L, 'soporte_sap_metricas')

const CORTE = `insert into ss_metrica (version, metrica, periodo, alcance, tamano, consultora_id, cliente_id, valor, visible_al_cliente) values
  ('v1', 'volumen', '2026-09-01', 'total', null, null, null, 3, true),
  ('v1', 'volumen', '2026-09-01', 'tamano', 'L', null, null, 1, true),
  ('v1', 'volumen', '2026-09-01', 'consultora', null, '${ORG.CA}', null, 2, true),
  ('v1', 'volumen', '2026-09-01', 'consultora', null, '${ORG.CB}', null, 1, true),
  ('v1', 'volumen', '2026-09-01', 'cliente', null, '${ORG.CA}', '${ORG.A1}', 1, true),
  ('v1', 'volumen', '2026-09-01', 'cliente', null, '${ORG.CA}', '${ORG.A2}', 1, true),
  ('v1', 'volumen', '2026-09-01', 'cliente', null, '${ORG.CB}', '${ORG.B1}', 1, true),
  ('v1', 'riesgo_de_baja', '2026-09-01', 'cliente', null, '${ORG.CA}', '${ORG.A1}', 1, false)`
/** Cuántos clientes tiene cada grupo (D14): el total 3, la consultora A 2, la B 1 y el tamaño L 1. */
const CARTERA = `insert into ss_metrica (version, metrica, periodo, alcance, tamano, consultora_id, cliente_id, etapa, valor) values
  ('v1', 'clientes_en_cartera', '2026-09-01', 'total', null, null, null, 'operacion', 3),
  ('v1', 'clientes_en_cartera', '2026-09-01', 'consultora', null, '${ORG.CA}', null, 'operacion', 2),
  ('v1', 'clientes_en_cartera', '2026-09-01', 'consultora', null, '${ORG.CB}', null, 'operacion', 1),
  ('v1', 'clientes_en_cartera', '2026-09-01', 'tamano', 'L', null, null, 'operacion', 1)`

test('el job de métricas lee a todos los tenants, pero ninguna columna de texto', async () => {
  const db = await baseSoporte()
  const filas = await comoServicio<{ n: number }>(db, METRICAS, `select count(*)::int as n from ss_incidencia`)
  assert.equal(filas[0]?.n, 3, 'para dar totales lee las tres incidencias, de las dos consultoras')
  for (const sql of [
    'select titulo from ss_incidencia', 'select descripcion from ss_incidencia', 'select * from ss_incidencia',
    'select nombre from ss_organizacion', 'select consultor from ss_horas', 'select texto from ss_caso_sandbox',
    'select contenido from ss_crudo', 'select contenido from ss_chat_mensaje', 'select motivo from ss_importacion_fila',
  ]) assert.match(await falla(() => comoServicio(db, METRICAS, sql)) ?? 'PASÓ', /permission denied/, sql)
})

test('el job de métricas solo escribe el corte, y no lo cambia ni lo borra', async () => {
  const db = await baseSoporte()
  await comoServicio(db, METRICAS, CORTE)
  for (const sql of [
    `update ss_metrica set valor = 99`, `delete from ss_metrica`,
    `insert into ss_incidencia (consultora_id, cliente_id, titulo) values ('${ORG.CA}', '${ORG.A1}', 'x')`,
    `update ss_incidencia set prioridad = 'P1'`, `insert into ss_horas (consultora_id, cliente_id, consultor, minutos, fecha) values ('${ORG.CA}', '${ORG.A1}', 'usr-000000000001', 1, current_date)`,
  ]) assert.match(await falla(() => comoServicio(db, METRICAS, sql)) ?? 'PASÓ', /permission denied/, sql)
  assert.match(await falla(() => comoServicio(db, METRICAS, `insert into ss_metrica (version, metrica, periodo, alcance, consultora_id, cliente_id, valor)
    values ('v1', 'volumen', '2026-09-01', 'cliente', '${ORG.CB}', '${ORG.A1}', 1)`)) ?? 'PASÓ', /no es de la consultora/)
  assert.match(await falla(() => comoServicio(db, METRICAS, `insert into ss_metrica (version, metrica, periodo, alcance, consultora_id, valor)
    values ('v1', 'volumen', '2026-09-01', 'total', '${ORG.CA}', 1)`)) ?? 'PASÓ', /ss_metrica_alcance/)
})

test('el corte se lee por nivel: agregados, lo suyo y lo de sus clientes, solo lo suyo', async () => {
  const db = await baseSoporte()
  await comoServicio(db, METRICAS, CORTE)
  await comoServicio(db, METRICAS, CARTERA)
  const ve = async (u: string) => (await como<{ k: string }>(db, u, `select alcance || ':' || coalesce(tamano, '') || coalesce(right(consultora_id::text, 2), '') || coalesce('/' || right(cliente_id::text, 2), '') as k from ss_metrica where metrica = 'volumen' order by 1`)).map((r) => r.k)
  const internas = async (u: string) => (await como<{ m: string }>(db, u, `select metrica as m from ss_metrica where metrica = 'riesgo_de_baja'`)).length
  assert.deepEqual(await ve(USR.sup), ['total:'], 'el laboratorio ve agregados de 3 clientes o más (D14), ningún cliente')
  assert.deepEqual(await ve(USR.ca), ['cliente:a0/a1', 'cliente:a0/a2', 'consultora:a0'], 'la consultora ve lo suyo, ni el total ni a la otra')
  assert.deepEqual(await ve(USR.ua1), ['cliente:a0/a1'], 'el cliente ve solo lo suyo')
  assert.deepEqual(await ve(USR.ub1), ['cliente:b0/b1'])
  assert.equal(await internas(USR.ua1), 0, 'el cliente no lee su propio riesgo de baja (no es visible al cliente)')
  assert.equal(await internas(USR.ca), 1, 'su consultora sí')
  assert.match(await falla(() => como(db, USR.sup, `insert into ss_metrica (version, metrica, periodo, alcance, valor) values ('v2', 'volumen', '2026-09-01', 'total', 1)`)) ?? 'PASÓ', /permission denied/)
  assert.match(await falla(() => comoServicio(db, tokenDe(ORG.CA), `select * from ss_metrica`)) ?? 'PASÓ', /permission denied/, 'el agente no lee el corte de tabla: lo recibe por su tarea')
})

test('D14 · el laboratorio ve un agregado solo con 3 clientes o más en su grupo, y sin poder despejar un grupo chico restando del total', async () => {
  const db = await baseSoporte()
  const fila = (alcance: string, tamano: string | null, n: number, valor: number) => `
    ('v1', 'clientes_en_cartera', '2026-09-01', '${alcance}', ${tamano ? `'${tamano}'` : 'null'}, null, null, 'operacion', ${n}),
    ('v1', 'volumen', '2026-09-01', '${alcance}', ${tamano ? `'${tamano}'` : 'null'}, null, null, null, ${valor})`
  const corte = (tamanos: ReadonlyArray<[string, number]>) => `insert into ss_metrica (version, metrica, periodo, alcance, tamano, consultora_id, cliente_id, etapa, valor) values
    ${[fila('total', null, tamanos.reduce((a, [, n]) => a + n, 0), 50), ...tamanos.map(([t, n]) => fila('tamano', t, n, n * 10))].join(',')}`
  const ve = async () => (await como<{ k: string }>(db, USR.sup, `select alcance || ':' || coalesce(tamano, '') as k from ss_metrica where metrica = 'volumen' order by 1`)).map((r) => r.k)
  await comoServicio(db, METRICAS, corte([['L', 3], ['M', 3]]))
  assert.deepEqual(await ve(), ['tamano:L', 'tamano:M', 'total:'], 'control: grupos de 3, visibles')
  await db.exec(`delete from ss_metrica`)
  await comoServicio(db, METRICAS, corte([['L', 3], ['M', 1]]))
  assert.deepEqual(await ve(), ['total:'], 'M tiene 1: se suprime, y L también, porque L = total − M despejaría a M')
  await db.exec(`delete from ss_metrica`)
  await comoServicio(db, METRICAS, corte([['L', 3], ['M', 2], ['S', 2]]))
  assert.deepEqual(await ve(), ['tamano:L', 'total:'], 'M y S se suprimen; juntos suman 4, y restarlos del total no despeja a ninguno')
  await db.exec(`delete from ss_metrica`)
  await comoServicio(db, METRICAS, `insert into ss_metrica (version, metrica, periodo, alcance, valor) values ('v1', 'volumen', '2026-09-01', 'total', 9)`)
  assert.deepEqual(await ve(), [], 'sin el conteo de clientes del grupo, no se ve')
})

test('D14 · la base y el corte del laboratorio aplican la misma regla: el laboratorio ve en la base exactamente lo que el corte marca', async () => {
  const corte = JSON.parse(readFileSync(join(HERRAMIENTA, 'semantica', 'corte.json'), 'utf8')) as Corte
  assert.deepEqual(corte.filas, marcaLoQueVeElLaboratorio(corte.filas), 'el corte versionado es el que marca grupo-minimo.ts')
  const db = await baseSoporte()
  const org: Record<string, string> = { andina: ORG.CA, boreal: ORG.CB }
  const filas = corte.filas.filter((f) => f.alcance !== 'cliente' && (f.metrica === 'clientes_en_cartera' || f.metrica === 'volumen'))
  const lit = (x: string | null) => (x === null ? 'null' : `'${x}'`)
  for (let k = 0; k < filas.length; k += 200) {
    await comoServicio(db, METRICAS, `insert into ss_metrica (version, metrica, periodo, alcance, tamano, consultora_id, cliente_id, etapa, valor) values ${filas.slice(k, k + 200)
      .map((f) => `('v1', '${f.metrica}', '${f.periodo}-01', '${f.alcance}', ${lit(f.tamano)}, ${f.consultora ? `'${org[f.consultora]}'` : 'null'}, null, ${lit(f.etapa)}, ${f.valor ?? 'null'})`).join(',')}`)
  }
  const clave = (r: { periodo: string; alcance: string; tamano: string | null; consultora: string | null; etapa: string | null; metrica: string }) =>
    [r.metrica, r.periodo, r.alcance, r.tamano ?? '', r.consultora ?? '', r.etapa ?? ''].join('|')
  const enLaBase = (await como<{ metrica: string; periodo: string; alcance: string; tamano: string | null; consultora: string | null; etapa: string | null }>(db, USR.sup,
    `select metrica, to_char(periodo, 'YYYY-MM') as periodo, alcance, tamano, case consultora_id when '${ORG.CA}' then 'andina' when '${ORG.CB}' then 'boreal' end as consultora, etapa from ss_metrica`)).map(clave).sort()
  const enElCorte = filas.filter((f) => f.visibleAlLaboratorio === true).map(clave).sort()
  assert.ok(enElCorte.length > 0 && enElCorte.length < filas.length, `${enElCorte.length} de ${filas.length}: el corte marca algo visible y algo suprimido`)
  assert.deepEqual(enLaBase, enElCorte)
})
