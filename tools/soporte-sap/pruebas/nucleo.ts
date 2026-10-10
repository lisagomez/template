/**
 * Lo del núcleo llega generalizado o no entra (PRP-010 H-19). La base lo exige al proponerlo y al promoverlo con su
 * propio cerrojo (`ss_priv.propuesta_nucleo_generalizada`), que no depende de `generaliza`. Y lo que `generaliza` deja
 * del banco independiente, la base lo acepta: dos cerrojos que no se contradicen.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generaliza } from '../dist/index.js'
import { baseSoporte, como, comoAgente, falla, ORG, USR, INC } from './_base.ts'
import { VALIDADORES } from './_anonimizacion.ts'
import { BANCO_GENERALIZA, NOMBRES_DEL_CLIENTE } from './_banco-independiente.ts'
import { CONTROL_GENERALIZA, NOMBRES_CONTROL } from './_banco-de-control.ts'

const NUEVA = '80000000-0000-4000-8000-0000000000f1'
const json = (texto: string) => JSON.stringify({ texto }).replaceAll("'", "''")
const propone = (alcance: 'nucleo' | 'a_medida', texto: string, id = 'gen_random_uuid()', incidencia = 'null') => `insert into ss_propuesta (id, tipo, origen, alcance, consultora_id, contenido, propuesta_por, incidencia_id)
  values (${id}, 'caso', 'sandbox', '${alcance}', ${alcance === 'a_medida' ? `'${ORG.CA}'` : 'null'}, '${json(texto)}', 'agente:soporte-sap-a2a', ${incidencia})`
/** Lo del laboratorio entra directo al núcleo como dueño; el agente ya no (D1, PRP-011). El cerrojo de la
 *  generalización no depende del rol, así que se prueba igual. */
const comoDueno = (db: Awaited<ReturnType<typeof baseSoporte>>, sql: string) => db.query(sql).then((r) => r.rows)

type Db = Awaited<ReturnType<typeof baseSoporte>>
/** El consentimiento de una organización (D1): la consultora CA con su contrato N1-N2, su cliente A1 con el N2-N3. */
const consiente = (quien: 'consultora' | 'cliente') => quien === 'consultora'
  ? `insert into ss_consentimiento_nucleo (consultora_id, cliente_id, contrato_id, contrato_version, otorgado_por) values ('${ORG.CA}', null, 'sla-ca', 1, '${USR.ca}') returning id`
  : `insert into ss_consentimiento_nucleo (consultora_id, cliente_id, contrato_id, contrato_version, otorgado_por) values ('${ORG.CA}', '${ORG.A1}', 'sla-a1', 1, '${USR.ua1}') returning id`
async function consienten(db: Db): Promise<void> { await como(db, USR.ca, consiente('consultora')); await como(db, USR.ua1, consiente('cliente')) }

const SIN_GENERALIZAR = [
  'En Aceros del Norte la MIGO no contabiliza', 'en alimentos del bajio pasa lo mismo', 'Consultora Boreal ya lo resolvió',
  'La ZMM_PRECIOS truena al grabar', 'el programa yfi_pagos no corre', 'El FM /ACME/GET_TIPO no regresa nada',
  'el campo VBAK-ZZRUTA no se llena', 'falla en la Sociedad: 2000', 'BUKRS = 2000', 'en el centro 1010 no hay stock',
  'escribir a soporte@aceros.mx', 'el RFC AAA010101AA1 no está en la LCO', 'llamar al 55·4821·3907',
]

test('H-19 · la base rechaza al núcleo lo que llega sin generalizar: un nombre, un objeto propio, la estructura o un identificador', async () => {
  const db = await baseSoporte()
  const pasaron: string[] = []
  for (const t of SIN_GENERALIZAR) if (!/se generaliza antes/.test(await falla(() => comoDueno(db, propone('nucleo', t))) ?? '')) pasaron.push(t)
  assert.deepEqual(pasaron, [])
  assert.equal(await falla(() => comoAgente(db, ORG.CA, propone('a_medida', SIN_GENERALIZAR[0]!))), null, 'control: a medida de su consultora, entra tal cual')
  for (const t of ['la planta 3 está detenida desde ayer', 'BSEG-ZLSCH viene vacío y EKKO-ZTERM no existe', 'ya quedó la zona de transporte en la VL02N', 'el periodo 2026/10/01 no abre en la OB52'])
    assert.equal(await falla(() => comoDueno(db, propone('nucleo', t))), null, `control: lo estándar sí entra al núcleo («${t}»)`)
})

test('H-19 · promover al núcleo sin generalizar falla; con lo que deja generaliza, el superadministrador lo sube', async () => {
  const db = await baseSoporte()
  const texto = 'En Aceros del Norte la ZMM_PRECIOS truena en la sociedad MX01'
  await comoAgente(db, ORG.CA, propone('a_medida', texto, `'${NUEVA}'`, `'${INC.a1}'`))
  await consienten(db)
  const promueve = (t: string) => como(db, USR.sup, `update ss_propuesta set alcance = 'nucleo', consultora_id = null, contenido = '${json(t)}' where id = '${NUEVA}' returning id`)
  assert.match(await falla(() => promueve(texto)) ?? 'PASÓ', /se generaliza antes/)
  const g = generaliza(texto, VALIDADORES, ['Aceros del Norte'])
  assert.equal(g.veredicto, 'entra', g.senales.join('; '))
  assert.equal((await promueve(g.texto)).length, 1, 'generalizado, sube')
})

test('H-19 · lo que generaliza deja de los dos bancos, la base lo acepta: los dos cerrojos no se contradicen', async () => {
  const db = await baseSoporte()
  const orgs = (await db.query<{ nombre: string }>(`select nombre from ss_organizacion where tipo in ('consultora', 'cliente')`)).rows.map((r) => r.nombre)
  const rechazados: string[] = []
  for (const c of [...BANCO_GENERALIZA, ...CONTROL_GENERALIZA]) {
    const g = generaliza(c.texto, VALIDADORES, [...NOMBRES_DEL_CLIENTE, ...NOMBRES_CONTROL, ...orgs])
    const e = g.veredicto === 'entra' ? await falla(() => comoDueno(db, propone('nucleo', g.texto))) : null
    if (e) rechazados.push(`${g.texto} → ${e}`)
  }
  assert.deepEqual(rechazados, [])
})

// === D1 (PRP-011): al núcleo común, solo con el consentimiento de la consultora y del cliente de origen ===========

const GENERALIZADO = 'el periodo de MM está cerrado: abrirlo en la OB52 y volver a contabilizar'
const promueve = (db: Db, id: string) => como(db, USR.sup, `update ss_propuesta set alcance = 'nucleo', consultora_id = null where id = '${id}' returning id`)
const aMedida = (db: Db, id: string, incidencia: string | null = INC.a1) => comoAgente(db, ORG.CA, propone('a_medida', GENERALIZADO, `'${id}'`, incidencia ? `'${incidencia}'` : 'null'))

test('D1 · el agente no propone directo al núcleo: al núcleo se llega promoviendo, y una propuesta nace de una incidencia de su consultora', async () => {
  const db = await baseSoporte()
  assert.ok(await falla(() => comoAgente(db, ORG.CA, propone('nucleo', GENERALIZADO))), 'directo al núcleo, no')
  assert.match(await falla(() => comoAgente(db, ORG.CA, propone('a_medida', GENERALIZADO, 'gen_random_uuid()', `'${INC.b1}'`))) ?? '', /incidencia de su consultora/, 'con la incidencia de otra consultora, no')
  assert.equal(await falla(() => aMedida(db, '80000000-0000-4000-8000-0000000000d1')), null, 'control: a medida, desde su incidencia, sí')
  const fila = (await db.query<{ incidencia_id: string | null }>(`select incidencia_id from ss_propuesta where id = '80000000-0000-4000-8000-0000000000d1'`)).rows[0]!
  assert.equal(fila.incidencia_id, null, 'la fila no se queda con su origen')
  assert.match(await falla(() => como(db, USR.sup, 'select * from ss_priv.propuesta_origen')) ?? '', /permission denied/, 'y el origen no lo lee nadie de la API')
})

test('D1 · sin el consentimiento de la consultora o del cliente de origen no sube al núcleo; con los dos, sí', async () => {
  const db = await baseSoporte()
  const id = '80000000-0000-4000-8000-0000000000d2'
  await aMedida(db, id)
  assert.match(await falla(() => promueve(db, id)) ?? '', /consentimiento de la consultora de origen/)
  await como(db, USR.ca, consiente('consultora'))
  assert.match(await falla(() => promueve(db, id)) ?? '', /consentimiento del cliente de origen/)
  await como(db, USR.ua1, consiente('cliente'))
  assert.equal((await promueve(db, id)).length, 1, 'con los dos, sube')
  const sinOrigen = '80000000-0000-4000-8000-0000000000d3'
  await aMedida(db, sinOrigen, null)
  assert.match(await falla(() => promueve(db, sinOrigen)) ?? '', /origen registrado/, 'sin origen, no sube aunque haya consentimientos')
})

test('D1 · consiente una persona de esa organización, a su nombre y con su contrato; nadie consiente por otra', async () => {
  const db = await baseSoporte()
  const por = (quien: string, cliente: string | null, contrato: string, otorga = quien) => `insert into ss_consentimiento_nucleo
    (consultora_id, cliente_id, contrato_id, contrato_version, otorgado_por) values ('${ORG.CA}', ${cliente ? `'${cliente}'` : 'null'}, '${contrato}', 1, '${otorga}')`
  assert.ok(await falla(() => como(db, USR.ca, por(USR.ca, ORG.A1, 'sla-a1'))), 'la consultora no consiente por su cliente')
  assert.ok(await falla(() => como(db, USR.ua1, por(USR.ua1, null, 'sla-ca'))), 'el cliente no consiente por su consultora')
  assert.ok(await falla(() => como(db, USR.sup, por(USR.sup, null, 'sla-ca'))), 'el laboratorio no consiente por nadie')
  assert.ok(await falla(() => comoAgente(db, ORG.CA, por(USR.ca, null, 'sla-ca'))), 'el agente tampoco')
  assert.ok(await falla(() => como(db, USR.ca, por(USR.ca, null, 'sla-ca', USR.cb))), 'nadie consiente a nombre de otro')
  assert.match(await falla(() => como(db, USR.ca, por(USR.ca, null, 'sla-a1'))) ?? '', /contrato de esa organización/, 'con el contrato de otra organización, no')
  await como(db, USR.ca, `insert into ss_consentimiento_nucleo (consultora_id, cliente_id, contrato_id, contrato_version, otorgado_por, otorgado_en)
    values ('${ORG.CA}', null, 'sla-ca', 1, '${USR.ca}', now() - interval '1 year')`)
  const f = (await db.query<{ horas: number }>(`select round(extract(epoch from (now() - otorgado_en)) / 3600) as horas from ss_consentimiento_nucleo`)).rows[0]!
  assert.equal(Number(f.horas), 0, 'control: el consultor consiente por su consultora, con la fecha que pone la base')
})

test('D1 · revocar frena lo que no ha subido; lo ya subido se queda, y un consentimiento revocado no se reabre', async () => {
  const db = await baseSoporte()
  await consienten(db)
  const subida = '80000000-0000-4000-8000-0000000000d4', despues = '80000000-0000-4000-8000-0000000000d5'
  await aMedida(db, subida); await aMedida(db, despues)
  await promueve(db, subida)
  await como(db, USR.ua1, `update ss_consentimiento_nucleo set revocado_en = now() where cliente_id = '${ORG.A1}'`)
  assert.match(await falla(() => promueve(db, despues)) ?? '', /consentimiento del cliente de origen/, 'revocado, lo nuevo no sube')
  assert.equal((await db.query<{ alcance: string }>(`select alcance from ss_propuesta where id = '${subida}'`)).rows[0]!.alcance, 'nucleo', 'lo ya subido se queda (DP-1)')
  assert.match(await falla(() => como(db, USR.ua1, `update ss_consentimiento_nucleo set revocado_en = null where cliente_id = '${ORG.A1}'`)) ?? '', /no se reabre/)
})

test('D1 · el consentimiento vale para la versión vigente de su contrato: un contrato nuevo pide uno nuevo', async () => {
  const db = await baseSoporte()
  await consienten(db)
  const id = '80000000-0000-4000-8000-0000000000d6'
  await aMedida(db, id)
  await db.exec(`insert into ss_contrato_sla (id, version, nivel, consultora_id, cliente_id, contenido, vigente_desde)
    values ('sla-ca', 2, 'N1-N2', '${ORG.CA}', null, '{}', current_date)`)
  assert.match(await falla(() => promueve(db, id)) ?? '', /consentimiento de la consultora de origen/, 'con la versión 2 vigente, el sí de la 1 no vale')
  await como(db, USR.ca, `insert into ss_consentimiento_nucleo (consultora_id, cliente_id, contrato_id, contrato_version, otorgado_por) values ('${ORG.CA}', null, 'sla-ca', 2, '${USR.ca}')`)
  assert.equal((await promueve(db, id)).length, 1, 'control: con el sí de la versión vigente, sube')
})

