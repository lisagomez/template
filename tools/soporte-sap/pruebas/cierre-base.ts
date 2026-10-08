/**
 * Cierre de la base (PRP-010): lo que la AISIA y el C3 prometían y la base no cumplía. Tanda 1a, datos personales
 * y decisiones humanas; tanda 1b, prioridad y SLA; tanda 1c, roles y tenencia. Cada prueba es una sonda de la revisión del 2026-10-07 con el
 * resultado que debe dar; cada una tiene su fila y su sabotaje en `firmas/matriz.ts`. Las de la sala
 * (H-06) viven en `tools/sala-a2a/pruebas/_suite.ts` (S10 y S10b).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SENALES, CONTEXTO_PERSONAL, categoriza, emiteTokenDeTarea } from '../dist/index.js'
import { baseSoporte, como, comoAgente, comoServicio, falla, ORG, USR, INC, SQL_SOPORTE, SECRETO_TAREAS } from './_base.ts'

const otorga = (extra = '', valores = '') => `insert into ss_acceso_motivado (usuario_id, cliente_id, motivo, otorgado_por, vence_en${extra})
  values ('${USR.sup}', '${ORG.A1}', 'aprobar la solución de la incidencia MIGO', '${USR.ca}', ${valores || "now() + interval '24 hours'"})`
const vigentes = (db: Awaited<ReturnType<typeof baseSoporte>>) =>
  db.query<{ horas: number }>(`select round(extract(epoch from (vence_en - now())) / 3600) as horas from ss_acceso_motivado where usuario_id = '${USR.sup}' and revocado_en is null`)
const originalesQueVeElLaboratorio = async (db: Awaited<ReturnType<typeof baseSoporte>>) =>
  (await como(db, USR.sup, `select name from storage.objects where bucket_id = 'ss-originales'`)).length

// --- H-02 · el acceso a originales: 72 h como máximo y revocable -----------------------------------

test('H-02 · un acceso a originales no dura más de 72 h aunque quien lo otorga declare otra fecha de alta', async () => {
  const db = await baseSoporte()
  // La sonda del 07/10: alta declarada dentro de un año y vencimiento 72 h después. Antes: 8 832 h vigentes.
  const error = await falla(() => como(db, USR.ca, otorga(', creado_en',
    "now() + interval '365 days 72 hours', now() + interval '365 days'")))
  const horas = (await vigentes(db)).rows.map((r) => Number(r.horas))
  assert.ok(error !== null || horas.every((h) => h <= 72), `vigencia real: ${horas.join(', ')} h`)
  assert.match(error ?? '', /ss_acceso_con_tope/)
})

test('H-02 · la consultora revoca un acceso y el laboratorio deja de ver los originales', async () => {
  const db = await baseSoporte()
  await como(db, USR.ca, otorga())
  assert.equal(await originalesQueVeElLaboratorio(db), 1, 'control positivo: con el acceso, ve el original de A1')
  await como(db, USR.ca, `update ss_acceso_motivado set revocado_en = now() where usuario_id = '${USR.sup}'`)
  assert.equal(await originalesQueVeElLaboratorio(db), 0, 'revocado, ya no ve nada')
})

test('H-02 · un acceso revocado no se reabre, y revocar no le toca a otra consultora', async () => {
  const db = await baseSoporte()
  await como(db, USR.ca, otorga())
  const ajena = await como(db, USR.cb, `update ss_acceso_motivado set revocado_en = now() where usuario_id = '${USR.sup}' returning id`)
  assert.equal(ajena.length, 0, 'la consultora B no revoca un acceso de un cliente de A')
  await como(db, USR.ca, `update ss_acceso_motivado set revocado_en = now() where usuario_id = '${USR.sup}'`)
  assert.match(await falla(() => como(db, USR.ca, `update ss_acceso_motivado set revocado_en = null where usuario_id = '${USR.sup}'`)) ?? '', /no se reabre/)
})

// --- H-01 · escalar al laboratorio lo decide la consultora, a su nombre --------------------------

const escala = (por: string) => `insert into ss_escalamiento (incidencia_id, consultora_id, cliente_id, motivo, escalada_por)
  values ('${INC.a2}', '${ORG.CA}', '${ORG.A2}', 'el plan necesita la mirada del laboratorio', '${por}')`

test('H-01 · el agente no escala al laboratorio, ni a su nombre ni al de un consultor', async () => {
  const db = await baseSoporte()
  const seudo = (await db.query<{ s: string }>(`select ss_priv.seudonimo('${USR.ca}') as s`)).rows[0]!.s
  assert.ok(await falla(() => comoAgente(db, ORG.CA, escala('agente:soporte-sap-a2a'))), 'a su nombre')
  assert.ok(await falla(() => comoAgente(db, ORG.CA, escala(seudo))), 'con el seudónimo de un consultor')
  const lee = await como(db, USR.sup, `select titulo from ss_incidencia where id = '${INC.a2}'`)
  assert.equal(lee.length, 0, 'sin escalamiento, el laboratorio no lee la incidencia')
})

test('H-01 · control: el consultor escala a su nombre y el laboratorio pasa a leerla', async () => {
  const db = await baseSoporte()
  const seudo = (await db.query<{ s: string }>(`select ss_priv.seudonimo('${USR.ca}') as s`)).rows[0]!.s
  assert.ok(await falla(() => como(db, USR.ca, escala('otro-seudonimo'))), 'a nombre de otro, no')
  await como(db, USR.ca, escala(seudo))
  assert.equal((await como(db, USR.sup, `select titulo from ss_incidencia where id = '${INC.a2}'`)).length, 1)
})

// --- H-03 · al sandbox no entra un identificador con forma; la cuarentena, solo señales ---------

const alSandbox = (texto: string) => `insert into ss_caso_sandbox (origen_consultora_id, texto) values ('${ORG.CA}', '${texto.replace(/'/g, "''")}')`

test('H-03 · el sandbox rechaza un identificador formal aunque lo escriba el agente', async () => {
  const db = await baseSoporte()
  const crudos = [
    'el RFC TOCX850312K77 no cuadra', 'la CURP TOCX850312HDFRRN09 está duplicada', 'avísale a xochitl@acme.mx',
    'xochitl arroba acme punto com', 'su NSS 12345678901 no aparece', 'deposita a la CLABE 012180001234567897',
    'llámale al 55 1234 5678',
  ]
  const pasan = []
  for (const t of crudos) if (!(await falla(() => comoAgente(db, ORG.CA, alSandbox(t))))) pasan.push(t)
  assert.deepEqual(pasan, [])
})

test('H-03 · control: el texto que deja el anonimizador sí entra al sandbox', async () => {
  const db = await baseSoporte()
  for (const t of ['el RFC [RFC] del receptor no está en la LCO', 'MIGO 101 rechaza la entrada en la sociedad [SOCIEDAD]',
    'el número [NUMERO] de la factura se repite', 'PC00_M32_CALC aborta con el mensaje 3G 029']) {
    assert.equal(await falla(() => comoAgente(db, ORG.CA, alSandbox(t))), null, t)
  }
})

test('H-03 · la cuarentena solo guarda señales del vocabulario fijo, nunca el dato', async () => {
  const db = await baseSoporte()
  const cuarentena = (senal: string) => `insert into ss_cuarentena (incidencia_id, consultora_id, cliente_id, senales)
    values ('${INC.a2}', '${ORG.CA}', '${ORG.A2}', array['${senal}'])`
  // La sonda del 07/10: el agente guardaba el dato como si fuera una señal, y el experto lo leía.
  assert.match(await falla(() => comoAgente(db, ORG.CA, cuarentena('RFC TOCX850312K77 de Xochitl'))) ?? '', /ss_cuarentena_solo_senales/)
  assert.equal(await falla(() => comoAgente(db, ORG.CA, cuarentena(SENALES.digitos))), null, 'control: una señal del vocabulario entra')
})

test('H-03 · la lista de señales de la base es la del anonimizador (no se separan)', () => {
  const bloque = /ss_cuarentena_solo_senales check \(cardinality\(senales\) > 0 and senales <@ array\[([\s\S]*?)\]::text\[\]\)/.exec(SQL_SOPORTE)
  assert.ok(bloque, 'no encuentro la restricción en el SQL')
  const enLaBase = [...bloque[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()
  assert.deepEqual(enLaBase, Object.values(SENALES).sort())
})

// === Tanda 1b · prioridad y SLA ====================================================================

type Db = Awaited<ReturnType<typeof baseSoporte>>
const NOM = '20000000-0000-4000-8000-00000000000f'
/** Una incidencia de nómina, sembrada sin categorizar (como dueño: así entra la historia). */
async function conNomina(): Promise<Db> {
  const db = await baseSoporte()
  await db.exec(`insert into ss_incidencia (id, consultora_id, cliente_id, titulo, descripcion)
    values ('${NOM}', '${ORG.CA}', '${ORG.A1}', 'No se pagó el aguinaldo', 'la planta no recibió el depósito')`)
  return db
}
const incidencia = async (db: Db, id: string) =>
  (await db.query<{ prioridad: string | null; estado: string; creada_en: Date; primera_respuesta_en: Date | null; resuelta_en: Date | null }>(
    `select prioridad, estado, creada_en, primera_respuesta_en, resuelta_en from ss_incidencia where id = '${id}'`)).rows[0]!
const seudonimoDe = async (db: Db, u: string) => (await db.query<{ s: string }>(`select ss_priv.seudonimo('${u}') as s`)).rows[0]!.s
/** Un evento de la cadena; `actor` lo exige la base (el seudónimo de la sesión o `agente:`). */
const evento = (inc: string, tipo: string, actor: string, datos = '{}') => `insert into ss_evento
  (incidencia_id, consultora_id, cliente_id, seq, tipo, datos, actor, fecha, anterior, hash)
  values ('${inc}', '${ORG.CA}', '${ORG.A1}', (select coalesce(max(seq), 0) + 1 from ss_evento where incidencia_id = '${inc}'),
          '${tipo}', '${datos}', '${actor}', now(), 'previo', '${'a'.repeat(64)}')`

test('H-16 · el cliente no elige la fecha de alta, la prioridad ni el estado al levantar una incidencia', async () => {
  const db = await baseSoporte()
  const [fila] = await como<{ id: string }>(db, USR.ua1, `insert into ss_incidencia (consultora_id, cliente_id, titulo, descripcion, prioridad, estado, creada_en)
    values ('${ORG.CA}', '${ORG.A1}', 'Urgente desde hace un mes', 'x', 'P1', 'resuelta', now() - interval '30 days') returning id`)
  const i = await incidencia(db, fila!.id)
  assert.equal(i.prioridad, null)
  assert.equal(i.estado, 'nueva')
  assert.ok(Math.abs(i.creada_en.getTime() - Date.now()) < 60_000, `creada_en: ${i.creada_en.toISOString()}`)
})

test('H-16 · nadie reescribe las fechas de una incidencia: ni el consultor ni el agente', async () => {
  const db = await baseSoporte()
  assert.ok(await falla(() => como(db, USR.ca, `update ss_incidencia set creada_en = now() - interval '1 day' where id = '${INC.a1}'`)), 'creada_en')
  assert.ok(await falla(() => como(db, USR.ca, `update ss_incidencia set primera_respuesta_en = now() where id = '${INC.a1}'`)), 'primera_respuesta_en')
  assert.ok(await falla(() => comoAgente(db, ORG.CA, `update ss_incidencia set resuelta_en = now() where id = '${INC.a1}'`)), 'resuelta_en por el agente')
})

test('H-16 · las marcas del reloj salen de los eventos de una persona de la consultora', async () => {
  const db = await baseSoporte()
  await como(db, USR.ca, evento(INC.a1, 'PRIMERA_RESPUESTA', await seudonimoDe(db, USR.ca)))
  assert.notEqual((await incidencia(db, INC.a1)).primera_respuesta_en, null, 'la primera respuesta queda marcada')
  await como(db, USR.ca, evento(INC.a1, 'RESUELTA', await seudonimoDe(db, USR.ca)))
  const i = await incidencia(db, INC.a1)
  assert.equal(i.estado, 'resuelta')
  assert.notEqual(i.resuelta_en, null)
  assert.ok(await falla(() => como(db, USR.ca, `update ss_incidencia set estado = 'cerrada' where id = '${INC.a1}'`)), 'cerrar sin su evento')
})

test('H-17 · el agente no marca la primera respuesta, ni pausa el reloj, ni resuelve (DP-4)', async () => {
  const db = await baseSoporte()
  for (const tipo of ['PRIMERA_RESPUESTA', 'ESPERA_CLIENTE', 'RESUELTA']) {
    assert.match(await falla(() => comoAgente(db, ORG.CA, evento(INC.a1, tipo, 'agente:soporte-sap-a2a'))) ?? '', /lo emite una persona/, tipo)
  }
  assert.equal((await incidencia(db, INC.a1)).primera_respuesta_en, null)
})

test('H-16 · el resultado de SLA no lo guarda el agente, y es de un contrato que existe', async () => {
  const db = await baseSoporte()
  const resultado = (contrato: string, version: number) => `insert into ss_sla_resultado
    (incidencia_id, contrato_id, contrato_version, consultora_id, cliente_id, cumple_respuesta, cumple_resolucion, prioridad, estado)
    values ('${INC.a1}', '${contrato}', ${version}, '${ORG.CA}', '${ORG.A1}', true, true, 'P1', 'resuelta')`
  assert.ok(await falla(() => comoAgente(db, ORG.CA, resultado('sla-a1', 1))), 'el agente no escribe un «cumple»')
  assert.match(await falla(() => db.exec(resultado('contrato-inventado', 99))) ?? '', /ss_sla_de_un_contrato/)
  assert.equal(await falla(() => db.exec(resultado('sla-a1', 1))), null, 'control: con el contrato real, entra')
})

test('H-15 · el categorizador pone en P2 lo que la revisión vio en P4 (IMSS, PTU, aguinaldo, la quincena…)', () => {
  const frases = ['Baja IMSS rechazada por el IDSE', 'La trabajadora no tiene PTU calculada', 'No se pagó el aguinaldo a la planta',
    'Incapacidad no se descuenta en la PA40', 'El depósito de la quincena no llegó', 'No cuadra el infotipo 0008', 'Las vacaciones no se descuentan']
  const bajas = frases.filter((f) => ['P3', 'P4'].includes(categoriza(f).prioridad))
  assert.deepEqual(bajas, [])
  assert.equal(categoriza('MIGO no contabiliza la entrada').prioridad, 'P4', 'control: sin nómina, el piso no aplica')
})

test('H-15 · una incidencia de nómina no queda en P3 ni P4 al categorizarla', async () => {
  const db = await conNomina()
  assert.match(await falla(() => comoAgente(db, ORG.CA, `update ss_incidencia set prioridad = 'P4' where id = '${NOM}'`)) ?? '', /piso de nómina/)
  assert.match(await falla(() => como(db, USR.ca, `update ss_incidencia set prioridad = 'P3' where id = '${NOM}'`)) ?? '', /piso de nómina/)
  await comoAgente(db, ORG.CA, `update ss_incidencia set prioridad = 'P2', categoria = 'HCM' where id = '${NOM}'`)
  assert.equal((await incidencia(db, NOM)).prioridad, 'P2', 'control: P2 entra, y el agente actualiza su incidencia (H-09)')
})

test('H-15 · la prioridad, una vez fijada, cambia solo con un evento de una persona y con motivo', async () => {
  const db = await conNomina()
  await comoAgente(db, ORG.CA, `update ss_incidencia set prioridad = 'P2' where id = '${NOM}'`)
  assert.match(await falla(() => comoAgente(db, ORG.CA, `update ss_incidencia set prioridad = 'P1' where id = '${NOM}'`)) ?? '', /CAMBIO_PRIORIDAD/)
  assert.match(await falla(() => como(db, USR.ca, `update ss_incidencia set prioridad = 'P1' where id = '${NOM}'`)) ?? '', /CAMBIO_PRIORIDAD/)
  const seudo = await seudonimoDe(db, USR.ca)
  assert.ok(await falla(() => como(db, USR.ca, evento(NOM, 'CAMBIO_PRIORIDAD', seudo, '{"prioridad":"P4"}'))), 'sin motivo, no')
  assert.ok(await falla(() => comoAgente(db, ORG.CA, evento(NOM, 'CAMBIO_PRIORIDAD', 'agente:x', '{"prioridad":"P4","motivo":"el cliente lo pidió por escrito"}'))), 'el agente, no')
  await como(db, USR.ca, evento(NOM, 'CAMBIO_PRIORIDAD', seudo, '{"prioridad":"P4","motivo":"el cliente confirmó que ya se pagó por fuera"}'))
  assert.equal((await incidencia(db, NOM)).prioridad, 'P4', 'una persona lo baja, con motivo y queda en la cadena')
})

test('H-15 · el vocabulario del piso en la base es el del anonimizador y el categorizador (no se separan)', () => {
  const sql = /select t ~\* '\\m\((.+)\)\\M'/.exec(SQL_SOPORTE)
  assert.ok(sql, 'no encuentro ss_priv.contexto_personal en el SQL')
  const ts = /^\\b\((.+)\)\\b$/.exec(CONTEXTO_PERSONAL.source)
  assert.ok(ts, `forma inesperada de CONTEXTO_PERSONAL: ${CONTEXTO_PERSONAL.source}`)
  assert.equal(sql[1], ts[1])
})

test('H-10 · la consultora no reescribe la queja del cliente; la resuelve a su nombre y no se reabre', async () => {
  const db = await baseSoporte()
  const [imp] = await como<{ id: string }>(db, USR.ua1, `insert into ss_impugnacion (incidencia_id, consultora_id, cliente_id, campo, motivo, creada_por)
    values ('${INC.a1}', '${ORG.CA}', '${ORG.A1}', 'pausa', 'pausaron el reloj sin que les pidiéramos nada', '${USR.ua1}') returning id`)
  assert.ok(imp, 'el cliente impugna una pausa del reloj')
  assert.ok(await falla(() => como(db, USR.ca, `update ss_impugnacion set motivo = 'el cliente se equivocó de botón' where id = '${imp!.id}'`)), 'reescribir la queja')
  assert.ok(await falla(() => como(db, USR.ca, `update ss_impugnacion set creada_por = '${USR.ca}' where id = '${imp!.id}'`)), 'cambiar quién la levantó')
  await como(db, USR.ca, `update ss_impugnacion set estado = 'rechazada', resuelta_por = '${USR.ca}' where id = '${imp!.id}'`)
  const r = (await db.query<{ resuelta_en: Date | null }>(`select resuelta_en from ss_impugnacion where id = '${imp!.id}'`)).rows[0]!
  assert.notEqual(r.resuelta_en, null, 'la resolución queda fechada por la base')
  assert.match(await falla(() => como(db, USR.ca, `update ss_impugnacion set estado = 'abierta', resuelta_por = null where id = '${imp!.id}'`)) ?? '', /no se reabre/)
})

// === Tanda 1c · roles y tenencia ===================================================================

const tarea = (consultora: string, opciones: { secreto?: string; exp?: number; rol?: 'soporte_sap_agente' | 'soporte_sap_ingesta' } = {}) =>
  emiteTokenDeTarea(opciones.secreto ?? SECRETO_TAREAS, { consultora, tarea: 't', rol: opciones.rol ?? 'soporte_sap_agente', exp: opciones.exp ?? Date.now() + 60_000 })
const deB = `select id from ss_incidencia where consultora_id = '${ORG.CB}'`

test('H-21 · con set_config dentro de la consulta, una tarea de A no lee B', async () => {
  const db = await baseSoporte()
  // La sonda del 05/10: el alcance era `request.jwt.claims`, y la sesión lo reescribía en la misma consulta.
  const claims = await comoAgente(db, ORG.CA, `select id from ss_incidencia
    where consultora_id = '${ORG.CB}' and set_config('request.jwt.claims', '{"consultora":"${ORG.CB}"}', true) is not null`)
  const token = await comoAgente(db, ORG.CA, `select id from ss_incidencia
    where consultora_id = '${ORG.CB}' and set_config('ss.tarea', '${tarea(ORG.CB, { secreto: 'un-secreto-que-el-agente-se-invento-0000' })}', true) is not null`)
  assert.deepEqual([claims.length, token.length], [0, 0])
})

test('H-21 · un token falso, vencido o de otro rol no da alcance', async () => {
  const db = await baseSoporte()
  const falso = await comoServicio(db, tarea(ORG.CB, { secreto: 'otro-secreto-que-no-es-el-del-orquestador' }), deB)
  const vencido = await comoServicio(db, tarea(ORG.CB, { exp: Date.now() - 1000 }), deB)
  // Un token legítimo de la INGESTA de B, presentado por una sesión del agente: el rol no cuadra.
  const ingesta = tarea(ORG.CB, { rol: 'soporte_sap_ingesta' })
  await db.exec(`set role soporte_sap_agente; select set_config('ss.tarea', '${ingesta}', false);`)
  const otroRol = (await db.query(deB).finally(() => db.exec(`reset role; select set_config('ss.tarea', '', false);`))).rows
  assert.deepEqual([falso.length, vencido.length, otroRol.length], [0, 0, 0])
})

test('H-21 · control: con el token firmado de su tarea, el agente lee su consultora y nada más', async () => {
  const db = await baseSoporte()
  const propias = await comoServicio<{ consultora_id: string }>(db, tarea(ORG.CB), 'select consultora_id from ss_incidencia')
  assert.ok(propias.length > 0 && propias.every((f) => f.consultora_id === ORG.CB), `vio ${propias.length}`)
})

test('H-21 · el secreto de firma no lo lee ningún rol de la API', async () => {
  const db = await baseSoporte()
  for (const [quien, f] of [
    ['agente', () => comoAgente(db, ORG.CA, 'select secreto from ss_priv.secreto_tareas')],
    ['persona', () => como(db, USR.sup, 'select secreto from ss_priv.secreto_tareas')],
  ] as const) assert.ok(await falla(f), quien)
})
