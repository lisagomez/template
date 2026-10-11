/**
 * D8 en la base (PRP-012): la retención de los originales y la salida de un tenant. Cada prueba intenta primero lo que
 * funcionaba sin el control: la plataforma borraba lo de su consultora en cualquier momento, y nada vencía.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { baseSoporte, como, comoServicio, tokenDe, falla, ORG, USR, INC, SHA } from './_base.ts'

type Db = Awaited<ReturnType<typeof baseSoporte>>
const plataforma = <T = Record<string, unknown>>(db: Db, consultora: string, sql: string) => comoServicio<T>(db, tokenDe(consultora, 'soporte_sap_plataforma'), sql)
const ingesta = (db: Db, consultora: string, sql: string) => comoServicio(db, tokenDe(consultora, 'soporte_sap_ingesta'), sql)
const RUTA = {
  a1: `${ORG.CA}/${ORG.A1}/${INC.a1}/${SHA.a1}`, a2: `${ORG.CA}/${ORG.A2}/${INC.a2}/${SHA.a2}`, b1: `${ORG.CB}/${ORG.B1}/${INC.b1}/${SHA.b1}`,
} as const
const ADJ = { a1: '70000000-0000-4000-8000-0000000000a1', a2: '70000000-0000-4000-8000-0000000000a2' } as const
const E1 = 'e'.repeat(64)

/** Como dueño y sin disparadores: mueve el reloj de una fila, que por la API pone la base. */
const sinDisparadores = (db: Db, sql: string) => db.exec(`set session_replication_role = replica; ${sql}; set session_replication_role = origin;`)
/** Una versión vigente desde hoy de un contrato, con sus plazos (DP-4). */
const plazos = (db: Db, id: string, cliente: string | null, consultora = ORG.CA, dias: Record<string, number> = { retencion_originales_dias: 30, gracia_salida_dias: 30 }) =>
  db.exec(`insert into ss_contrato_sla (id, version, nivel, consultora_id, cliente_id, contenido, vigente_desde)
    values ('${id}', 2, '${cliente ? 'N2-N3' : 'N1-N2'}', '${consultora}', ${cliente ? `'${cliente}'` : 'null'}, '${JSON.stringify(dias)}', current_date)`)
const resuelta = (db: Db, inc: string, haceDias: number) =>
  sinDisparadores(db, `update ss_incidencia set estado = 'resuelta', resuelta_en = now() - interval '${haceDias} days' where id = '${inc}'`)
const hay = async (db: Db, sql: string) => (await db.query<{ n: number }>(`select count(*)::int as n from (${sql}) x`)).rows[0]?.n ?? 0
const objeto = (ruta: string) => `select 1 from storage.objects where bucket_id = 'ss-originales' and name = '${ruta}'`
const borraBytes = (db: Db, consultora: string, ruta: string) => plataforma(db, consultora, `delete from storage.objects where bucket_id = 'ss-originales' and name = '${ruta}'`)
const registra = (cliente: string | null, consultora: string = ORG.CA) => `insert into ss_baja (consultora_id, cliente_id) values ('${consultora}', ${cliente ? `'${cliente}'` : 'null'})`

test('D8 · sin una baja vencida la plataforma no borra nada de su consultora: ni una incidencia, ni un original, ni su mapeo', async () => {
  const db = await baseSoporte()
  await plataforma(db, ORG.CA, `delete from ss_incidencia where id = '${INC.a2}'`)
  assert.equal(await hay(db, `select 1 from ss_incidencia where id = '${INC.a2}'`), 1, 'la incidencia sigue')
  await borraBytes(db, ORG.CA, RUTA.a2)
  assert.equal(await hay(db, objeto(RUTA.a2)), 1, 'el original sigue')
  await plataforma(db, ORG.CA, `delete from ss_mapeo where consultora_id = '${ORG.CA}'`)
  assert.equal(await hay(db, `select 1 from ss_mapeo where consultora_id = '${ORG.CA}'`), 1, 'el mapeo sigue')
  assert.match(await falla(() => plataforma(db, ORG.CA, `update ss_adjunto set original_borrado_en = now() where id = '${ADJ.a2}'`)) ?? '', /todavía no vence/)
  assert.match(await falla(() => db.exec(`delete from ss_evento where incidencia_id = '${INC.a1}'`)) ?? '', /solo agregar/, 'la cadena, ni el dueño')
})

test('D8 · un original vence N días después de resolver y sin impugnación abierta: solo entonces se borran sus bytes, y la fila y sus campos se quedan', async () => {
  const db = await baseSoporte()
  await resuelta(db, INC.a1, 400)
  await borraBytes(db, ORG.CA, RUTA.a1)
  assert.equal(await hay(db, objeto(RUTA.a1)), 1, 'sin plazo en el contrato no vence nunca (DP-4)')
  await plazos(db, 'sla-a1', ORG.A1)
  await resuelta(db, INC.a1, 10)
  await borraBytes(db, ORG.CA, RUTA.a1)
  assert.equal(await hay(db, objeto(RUTA.a1)), 1, 'a los 10 de 30 días, todavía no')
  await resuelta(db, INC.a1, 31)
  await sinDisparadores(db, `insert into ss_impugnacion (incidencia_id, consultora_id, cliente_id, campo, motivo, creada_por)
    values ('${INC.a1}', '${ORG.CA}', '${ORG.A1}', 'resolucion', 'no quedó resuelta del todo', '${USR.ua1}')`)
  await borraBytes(db, ORG.CA, RUTA.a1)
  assert.equal(await hay(db, objeto(RUTA.a1)), 1, 'con una impugnación abierta no vence (DP-3)')
  await sinDisparadores(db, `update ss_impugnacion set estado = 'rechazada', resuelta_por = '${USR.ca}', resuelta_en = now() where incidencia_id = '${INC.a1}'`)
  await borraBytes(db, ORG.CA, RUTA.a1)
  assert.equal(await hay(db, objeto(RUTA.a1)), 1, 'el plazo cuenta desde la última resolución: la de la impugnación')
  await sinDisparadores(db, `update ss_impugnacion set resuelta_en = now() - interval '31 days' where incidencia_id = '${INC.a1}'`)
  await borraBytes(db, ORG.CB, RUTA.a1)
  assert.equal(await hay(db, objeto(RUTA.a1)), 1, 'otra consultora no lo borra aunque venció')
  assert.match(await falla(() => plataforma(db, ORG.CA, `update ss_adjunto set original_borrado_en = now() where id = '${ADJ.a1}'`)) ?? '', /siguen en Storage/, 'primero se borran los bytes')
  await borraBytes(db, ORG.CA, RUTA.a1)
  assert.equal(await hay(db, objeto(RUTA.a1)), 0, 'vencido, se borra')
  assert.equal(await hay(db, objeto(RUTA.a2)), 1, 'el de otra incidencia sigue')
  await plataforma(db, ORG.CA, `update ss_adjunto set original_borrado_en = '2000-01-01' where id = '${ADJ.a1}'`)
  const en = (await db.query<{ ok: boolean }>(`select original_borrado_en > now() - interval '1 minute' as ok from ss_adjunto where id = '${ADJ.a1}'`)).rows[0]?.ok
  assert.equal(en, true, 'la fecha la pone la base')
  assert.equal(await hay(db, `select 1 from ss_campo_extraido where adjunto_id = '${ADJ.a1}'`), 1, 'los campos revisados se quedan')
  assert.match(await falla(() => plataforma(db, ORG.CA, `update ss_adjunto set original_borrado_en = null where id = '${ADJ.a1}'`)) ?? '', /no se des-borra/)
  assert.ok(await falla(() => ingesta(db, ORG.CA, `insert into storage.objects (bucket_id, name) values ('ss-originales', '${RUTA.a1}')`)), 'un original borrado no vuelve a subir')
})

test('D8 · una salida la registra una persona de esa organización (DP-2): el cliente o su consultora; la de una consultora, el superadministrador', async () => {
  const db = await baseSoporte()
  await plazos(db, 'sla-a1', ORG.A1)
  assert.ok(await falla(() => comoServicio(db, tokenDe(ORG.CA), registra(ORG.A1))), 'el agente no')
  assert.ok(await falla(() => plataforma(db, ORG.CA, registra(ORG.A1))), 'la plataforma no')
  for (const [quien, por] of [[USR.ub1, 'el cliente de otra consultora'], [USR.cb, 'otra consultora'], [USR.ua2, 'otro cliente de la misma consultora'], [USR.exp, 'el experto del laboratorio']] as const) {
    assert.ok(await falla(() => como(db, quien, registra(ORG.A1))), `${por} no`)
  }
  assert.ok(await falla(() => como(db, USR.ca, registra(null))), 'una consultora no se da de baja sola')
  assert.ok(await falla(() => como(db, USR.ca, registra(ORG.B1))), 'ni da de baja al cliente de otra')
  assert.ok(await falla(() => como(db, USR.ua1, `insert into ss_baja (consultora_id, cliente_id, borrar_desde) values ('${ORG.CA}', '${ORG.A1}', now())`)), 'nadie elige su plazo')
  assert.ok(await falla(() => como(db, USR.ua1, `insert into ss_baja (consultora_id, cliente_id, registrada_por) values ('${ORG.CA}', '${ORG.A1}', '${USR.ca}')`)), 'ni a nombre de otro')
  await como(db, USR.ua1, registra(ORG.A1))
  const b = (await db.query<{ por: string; gracia: boolean }>(`select registrada_por as por,
    borrar_desde between now() + interval '29 days' and now() + interval '31 days' as gracia from ss_baja where cliente_id = '${ORG.A1}'`)).rows[0]
  assert.deepEqual([b?.por, b?.gracia], [USR.ua1, true], 'la base pone quién y la gracia del contrato')
  await como(db, USR.sup, registra(null, ORG.CB))
  const cb = (await db.query<{ desde: string | null }>(`select borrar_desde as desde from ss_baja where consultora_id = '${ORG.CB}'`)).rows[0]
  assert.equal(cb?.desde, null, 'sin gracia en el contrato N1-N2, la baja no vence nunca (DP-4)')
})

test('D8 · con la salida registrada no entra nada nuevo de ese cliente; su vecino sigue igual', async () => {
  const db = await baseSoporte()
  await como(db, USR.ua1, registra(ORG.A1))
  const nueva = (cliente: string) => `insert into ss_incidencia (consultora_id, cliente_id, titulo) values ('${ORG.CA}', '${cliente}', 'otra más')`
  assert.ok(await falla(() => como(db, USR.ua1, nueva(ORG.A1))), 'el cliente no abre otra')
  assert.ok(await falla(() => como(db, USR.ca, nueva(ORG.A1))), 'ni su consultora por él')
  assert.ok(await falla(() => ingesta(db, ORG.CA, `insert into storage.objects (bucket_id, name) values ('ss-originales', '${ORG.CA}/${ORG.A1}/${INC.a1}/${'9'.repeat(64)}')`)), 'ni sube un original')
  assert.ok(await falla(() => ingesta(db, ORG.CA, `insert into ss_adjunto (incidencia_id, consultora_id, cliente_id, sha256, ruta, tipo_mime, bytes, via)
    values ('${INC.a1}', '${ORG.CA}', '${ORG.A1}', '${'9'.repeat(64)}', '${ORG.CA}/${ORG.A1}/${INC.a1}/${'9'.repeat(64)}', 'image/png', 10, 'ocr_local')`)), 'ni registra un adjunto')
  await como(db, USR.ua2, nueva(ORG.A2))
  assert.equal(await hay(db, `select 1 from ss_incidencia where cliente_id = '${ORG.A2}'`), 2, 'el vecino sí')
})

test('D8 · tras la gracia y con el export, la plataforma borra todo el tenant, la cadena incluida, y la baja se cumple solo si no queda nada', async () => {
  const db = await baseSoporte()
  await plazos(db, 'sla-a1', ORG.A1)
  await como(db, USR.ua1, registra(ORG.A1))
  const borraA1 = async (consultora: string = ORG.CA) => {
    for (const sql of [
      `delete from storage.objects where bucket_id = 'ss-originales' and name like '${ORG.CA}/${ORG.A1}/%'`,
      `delete from ss_horas where cliente_id = '${ORG.A1}'`, `delete from ss_importacion_fila where cliente_id = '${ORG.A1}'`,
      `delete from ss_acceso_motivado where cliente_id = '${ORG.A1}'`, `delete from ss_consentimiento_nucleo where cliente_id = '${ORG.A1}'`,
      `delete from ss_incidencia where cliente_id = '${ORG.A1}'`, `delete from ss_contrato_sla where cliente_id = '${ORG.A1}'`,
      `delete from ss_mapeo where consultora_id = '${ORG.CA}'`, `delete from storage.objects where bucket_id = 'ss-exportes'`,
    ]) await plataforma(db, consultora, sql)
  }
  const deA1 = () => hay(db, `select 1 from ss_incidencia where cliente_id = '${ORG.A1}' union all select 1 from ss_evento where cliente_id = '${ORG.A1}'
    union all select 1 from storage.objects where name like '${ORG.CA}/${ORG.A1}/%' union all select 1 from ss_contrato_sla where cliente_id = '${ORG.A1}'`)
  const antes = await deA1()
  assert.ok(antes >= 5, `el escenario tiene datos de A1 (${antes})`)
  await borraA1()
  assert.equal(await deA1(), antes, 'durante la gracia no se borra nada')
  await sinDisparadores(db, `update ss_baja set borrar_desde = now() - interval '1 day' where cliente_id = '${ORG.A1}'`)
  await borraA1()
  assert.equal(await deA1(), antes, 'sin el export de quien se va, tampoco')
  await plataforma(db, ORG.CA, `update ss_baja set export_sha256 = '${E1}' where cliente_id = '${ORG.A1}'`)
  assert.match(await falla(() => plataforma(db, ORG.CA, `update ss_baja set export_sha256 = '${'f'.repeat(64)}' where cliente_id = '${ORG.A1}'`)) ?? '', /una sola vez/)
  assert.match(await falla(() => plataforma(db, ORG.CA, `update ss_baja set borrada_en = now() where cliente_id = '${ORG.A1}'`)) ?? '', /quedan datos/)
  await borraA1(ORG.CB)
  assert.equal(await deA1(), antes, 'la plataforma de otra consultora no lo borra')
  await borraA1()
  assert.equal(await deA1(), 0, 'con la gracia terminada y el export, se borra todo, la cadena incluida')
  assert.equal(await hay(db, `select 1 from ss_mapeo where consultora_id = '${ORG.CA}'`), 1, 'lo de la consultora no se va con un cliente')
  assert.equal(await hay(db, `select 1 from storage.objects where bucket_id = 'ss-exportes'`), 1, 'ni sus exportes')
  await plataforma(db, ORG.CA, `update ss_baja set borrada_en = '2000-01-01' where cliente_id = '${ORG.A1}'`)
  const c = (await db.query<{ ok: boolean; nombre: string }>(`select b.borrada_en > now() - interval '1 minute' as ok, o.nombre
    from ss_baja b join ss_organizacion o on o.id = b.cliente_id where b.cliente_id = '${ORG.A1}'`)).rows[0]
  assert.deepEqual([c?.ok, c?.nombre], [true, 'dada de baja'], 'cumplida con la fecha de la base, y sin nombre')
  assert.equal(await hay(db, `select 1 from ss_miembro where organizacion_id = '${ORG.A1}'`), 0, 'sus personas se van')
  assert.match(await falla(() => plataforma(db, ORG.CA, `update ss_baja set borrada_en = null where cliente_id = '${ORG.A1}'`)) ?? '', /no se reabre/)
  assert.equal(await hay(db, `select 1 from ss_incidencia where id in ('${INC.a2}', '${INC.b1}')`), 2, 'el vecino y la otra consultora siguen')
  assert.equal((await hay(db, objeto(RUTA.a2))) + (await hay(db, objeto(RUTA.b1))), 2, 'con sus originales')
  assert.equal(await hay(db, `select 1 from ss_caso_sandbox where origen_consultora_id = '${ORG.CA}'`), 1, 'el sandbox anonimizado se queda')
})

test('D8 · la salida de una consultora entera: el superadministrador la registra, y tras su gracia se va con sus clientes', async () => {
  const db = await baseSoporte()
  await plazos(db, 'sla-cb', null, ORG.CB, { gracia_salida_dias: 15 })
  await como(db, USR.sup, registra(null, ORG.CB))
  await sinDisparadores(db, `update ss_baja set borrar_desde = now() - interval '1 day', export_sha256 = '${E1}' where consultora_id = '${ORG.CB}'`)
  for (const sql of [`delete from storage.objects where bucket_id = 'ss-originales'`, `delete from ss_incidencia`, `delete from ss_contrato_sla`]) {
    await plataforma(db, ORG.CB, sql)
  }
  await plataforma(db, ORG.CB, `update ss_baja set borrada_en = now() where consultora_id = '${ORG.CB}'`)
  assert.equal(await hay(db, `select 1 from ss_miembro where organizacion_id in ('${ORG.CB}', '${ORG.B1}')`), 0, 'sus personas y las de sus clientes')
  assert.equal(await hay(db, `select 1 from ss_organizacion where id in ('${ORG.CB}', '${ORG.B1}') and nombre = 'dada de baja'`), 2)
  assert.equal(await hay(db, `select 1 from ss_incidencia where consultora_id = '${ORG.CA}'`), 2, 'la otra consultora, intacta')
  assert.equal(await hay(db, objeto(RUTA.a1)), 1)
})
