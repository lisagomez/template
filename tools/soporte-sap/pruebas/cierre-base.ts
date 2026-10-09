/**
 * Cierre de la base (PRP-010): lo que la AISIA y el C3 prometían y la base no cumplía. Tanda 1a, datos personales
 * y decisiones humanas; 1b, prioridad y SLA; 1c y 1d, roles y tenencia; 1e, la plataforma y la restauración. Cada prueba es una sonda de la revisión del 2026-10-07 con el
 * resultado que debe dar; cada una tiene su fila y su sabotaje en `firmas/matriz.ts`. Las de la sala
 * (H-06) viven en `tools/sala-a2a/pruebas/_suite.ts` (S10 y S10b).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SENALES, CONTEXTO_PERSONAL, anonimiza, categoriza, emiteTokenDeTarea, verificaCadena, exportaTenant, huellaTenant, restauraTenant, type EventoIncidencia, type Consulta } from '../dist/index.js'
import { refirma } from './respaldo.ts'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { baseSoporte, como, comoAgente, comoServicio, falla, tokenDe, ORG, USR, INC, SQL_SOPORTE, SECRETO_TAREAS, SECRETO_RESPALDOS as S, SUPABASE_MINIMO } from './_base.ts'
import { HERRAMIENTA } from './_ayuda.ts'
import { casosDelSandbox, VALIDADORES } from './_anonimizacion.ts'
import { BANCO_ANONIMIZA } from './_banco-independiente.ts'

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
/** La primera respuesta es un mensaje al cliente (DP-4): la base exige su texto (PRP-010, tercera revisión: R3-07). */
const MENSAJE = '{"mensaje":"Ya lo revisamos, te confirmo hoy mismo"}'
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
  await como(db, USR.ca, evento(INC.a1, 'PRIMERA_RESPUESTA', await seudonimoDe(db, USR.ca), MENSAJE))
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

test('H-17 · ni el cliente ni el laboratorio responden, pausan, resuelven o cambian la prioridad: solo una persona de la consultora', async () => {
  const db = await baseSoporte()
  const ua1 = await seudonimoDe(db, USR.ua1), ca = await seudonimoDe(db, USR.ca), sup = await seudonimoDe(db, USR.sup)
  const actos = [['PRIMERA_RESPUESTA', MENSAJE], ['ESPERA_CLIENTE', '{"pide":"el log de la ST22 del 3 de octubre"}'], ['RESUELTA', '{}'],
    ['CAMBIO_PRIORIDAD', '{"prioridad":"P1","motivo":"lo decide el cliente por su cuenta"}']] as const
  for (const [tipo, datos] of actos) {
    assert.match(await falla(() => como(db, USR.ua1, evento(INC.a1, tipo, ua1, datos))) ?? '', /lo emite una persona de la consultora/, `el cliente: ${tipo}`)
  }
  const i = await incidencia(db, INC.a1)
  assert.deepEqual([i.prioridad, i.estado, i.primera_respuesta_en], [null, 'nueva', null], 'la incidencia sigue como estaba')
  // El laboratorio, en lo que la consultora le escaló: lee, pero no responde por ella.
  await como(db, USR.ca, `insert into ss_escalamiento (incidencia_id, consultora_id, cliente_id, motivo, escalada_por)
    values ('${INC.a2}', '${ORG.CA}', '${ORG.A2}', 'el plan necesita la mirada del laboratorio', '${ca}')`)
  const delLab = `insert into ss_evento (incidencia_id, consultora_id, cliente_id, seq, tipo, datos, actor, fecha, anterior, hash)
    values ('${INC.a2}', '${ORG.CA}', '${ORG.A2}', (select coalesce(max(seq), 0) + 1 from ss_evento where incidencia_id = '${INC.a2}'),
            'PRIMERA_RESPUESTA', '${MENSAJE}', '${sup}', now(), 'previo', '${'a'.repeat(64)}')`
  assert.match(await falla(() => como(db, USR.sup, delLab)) ?? '', /lo emite una persona de la consultora/, 'el laboratorio')
  await como(db, USR.ca, evento(INC.a1, 'PRIMERA_RESPUESTA', ca, MENSAJE))
  assert.notEqual((await incidencia(db, INC.a1)).primera_respuesta_en, null, 'control: el consultor sí')
})

test('pausa unilateral · pausar dice qué se le pide al cliente, y el cliente reanuda el reloj sin depender de nadie', async () => {
  const db = await baseSoporte()
  const ca = await seudonimoDe(db, USR.ca), ua1 = await seudonimoDe(db, USR.ua1), ub1 = await seudonimoDe(db, USR.ub1)
  assert.match(await falla(() => como(db, USR.ca, evento(INC.a1, 'ESPERA_CLIENTE', ca))) ?? '', /lo que se le pide al cliente/, 'sin decir qué pide')
  await como(db, USR.ca, evento(INC.a1, 'ESPERA_CLIENTE', ca, '{"pide":"el log de la ST22 del 3 de octubre"}'))
  assert.match(await falla(() => comoAgente(db, ORG.CA, evento(INC.a1, 'RESPUESTA_CLIENTE', 'agente:soporte-sap-a2a'))) ?? '', /una persona del cliente o de su consultora/, 'el agente no reanuda')
  assert.match(await falla(() => como(db, USR.ub1, evento(INC.a1, 'RESPUESTA_CLIENTE', ub1))) ?? '', /./, 'el cliente de otra consultora, tampoco')
  await como(db, USR.ua1, evento(INC.a1, 'RESPUESTA_CLIENTE', ua1))
  const tipos = (await db.query<{ tipo: string; actor: string }>(`select tipo, actor from ss_evento where incidencia_id = '${INC.a1}' order by seq`)).rows
  assert.deepEqual(tipos.slice(-2).map((r) => `${r.tipo}:${r.actor === ua1 ? 'cliente' : r.actor === ca ? 'consultor' : r.actor}`), ['ESPERA_CLIENTE:consultor', 'RESPUESTA_CLIENTE:cliente'])
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

test('H-21 · con set_config en la misma sesión, una tarea de A no lee B', async () => {
  const db = await baseSoporte()
  // La sonda del 05/10, en su forma que de verdad funciona (medido el 07/10): una sesión del agente con SQL fija la
  // variable en una sentencia y consulta en la siguiente. En una sola consulta (WHERE o LATERAL) no funciona ni con la
  // función vieja, porque la base evalúa antes la función estable, y una prueba así pasaría en vacío.
  const conAtaque = async (ataque: string) => {
    await db.exec(`set role soporte_sap_agente; select set_config('ss.tarea', '${tarea(ORG.CA)}', false); ${ataque}`)
    try { return (await db.query(deB)).rows.length }
    finally { await db.exec(`reset role; select set_config('ss.tarea', '', false); select set_config('request.jwt.claims', '', false);`) }
  }
  const claims = await conAtaque(`select set_config('request.jwt.claims', '{"consultora":"${ORG.CB}"}', false);`)
  const token = await conAtaque(`select set_config('ss.tarea', '${tarea(ORG.CB, { secreto: 'un-secreto-que-el-agente-se-invento-0000' })}', false);`)
  assert.deepEqual([claims, token], [0, 0])
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

// === Tanda 1d · la cadena, los vínculos, las horas y el chat =========================================

const CAD = '20000000-0000-4000-8000-0000000000cd'
const eventosDe = async (db: Db, inc: string): Promise<EventoIncidencia[]> =>
  (await db.query<{ seq: number; fecha: Date; tipo: string; actor: string; datos: Record<string, never>; anterior: string; hash: string }>(
    `select seq, fecha, tipo, actor, datos, anterior, hash from ss_evento where incidencia_id = '${inc}' order by seq`)).rows
    .map((e) => ({ v: 1, incidencia: inc, seq: e.seq, fecha: e.fecha.toISOString(), tipo: e.tipo as EventoIncidencia['tipo'], actor: e.actor, datos: e.datos, anterior: e.anterior, hash: e.hash }))

test('H-13 · la base calcula la cadena, y el verificador del código la acepta', async () => {
  const db = await baseSoporte()
  await db.exec(`insert into ss_incidencia (id, consultora_id, cliente_id, titulo, descripcion) values ('${CAD}', '${ORG.CA}', '${ORG.A1}', 'Cadena', 'x')`)
  const nota = (actor: string, datos: string) => `insert into ss_evento (incidencia_id, consultora_id, cliente_id, seq, tipo, datos, actor, fecha, anterior, hash)
    values ('${CAD}', '${ORG.CA}', '${ORG.A1}', 99, 'NOTA', '${datos}', '${actor}', now() - interval '3 days', 'inventado', 'inventado')`
  // Quien escribe propone seq, anterior, hash y fecha; la base los pone ella. Datos con acentos, anidados y números.
  await como(db, USR.ca, nota(await seudonimoDe(db, USR.ca), '{"texto":"Sí, ya revisé la sociedad","n":3,"z":{"b":[1,"ñ"],"a":true}}'))
  await comoAgente(db, ORG.CA, nota('agente:soporte-sap-a2a', '{"plan":"reabrir periodo","pasos":["MMPV","OB52"]}'))
  await como(db, USR.ca, nota(await seudonimoDe(db, USR.ca), '{}'))
  const cadena = await eventosDe(db, CAD)
  assert.deepEqual(cadena.map((e) => e.seq), [1, 2, 3], 'la secuencia la pone la base')
  assert.ok(cadena.every((e) => e.hash !== 'inventado' && e.anterior !== 'inventado'))
  assert.deepEqual(verificaCadena(CAD, cadena), { ok: true, n: 3, cabeza: cadena[2]!.hash })
})

const conBase = async (antes: string) => {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(SUPABASE_MINIMO)
  await db.exec(antes)
  await db.exec(SQL_SOPORTE)
  return db
}

test('H-14 · un rol de servicio que ya existía con bypassrls queda corregido al aplicar el esquema', async () => {
  const db = await conBase('create role soporte_sap_agente login bypassrls;')
  const r = (await db.query<{ b: boolean; l: boolean }>(`select rolbypassrls as b, rolcanlogin as l from pg_roles where rolname = 'soporte_sap_agente'`)).rows[0]!
  assert.deepEqual(r, { b: false, l: false })
})

test('H-14 · un bucket que ya existía público queda privado al aplicar el esquema', async () => {
  const db = await conBase(`insert into storage.buckets (id, name, public) values ('ss-originales', 'ss-originales', true);`)
  assert.deepEqual((await db.query<{ p: boolean }>(`select bool_or(public) as p from storage.buckets where id like 'ss-%'`)).rows[0], { p: false })
})

test('H-14 · un campo extraído cuelga de un adjunto de SU incidencia', async () => {
  const db = await baseSoporte()
  const adjuntoDe = async (inc: string) => (await db.query<{ id: string }>(`select id from ss_adjunto where incidencia_id = '${inc}' limit 1`)).rows[0]!.id
  const campo = (adjunto: string) => `insert into ss_campo_extraido (adjunto_id, incidencia_id, consultora_id, cliente_id, campo, valor, evidencia)
    values ('${adjunto}', '${INC.a2}', '${ORG.CA}', '${ORG.A2}', 'rfc_receptor', '[RFC]', 'página 1')`
  const [deA1, deB1] = [await adjuntoDe(INC.a1), await adjuntoDe(INC.b1)]
  assert.match(await falla(() => db.exec(campo(deA1))) ?? '', /no es de la incidencia/, 'adjunto de otra incidencia de la misma consultora')
  assert.match(await falla(() => db.exec(campo(deB1))) ?? '', /no es de la incidencia/, 'adjunto de otra consultora')
})

test('H-14 · una fila importada no cuelga del crudo de otra consultora, ni un contrato del cliente de otra', async () => {
  const db = await baseSoporte()
  const [crudoB] = (await db.query<{ id: string }>(`insert into ss_crudo (consultora_id, herramienta, huella, contenido)
    values ('${ORG.CB}', 'jira', '${'c'.repeat(64)}', '{}') returning id`)).rows
  assert.match(await falla(() => db.exec(`insert into ss_importacion_fila (crudo_id, indice, consultora_id, herramienta, version_mapeo, resultado)
    values ('${crudoB!.id}', 0, '${ORG.CA}', 'jira', 1, 'limpia')`)) ?? '', /no es de la consultora/)
  assert.match(await falla(() => db.exec(`insert into ss_contrato_sla (id, version, nivel, consultora_id, cliente_id, contenido, vigente_desde)
    values ('sla-cruzado', 1, 'N2-N3', '${ORG.CA}', '${ORG.B1}', '{}', '2026-10-01')`)) ?? '', /no es de la consultora/)
})

test('H-12 · el agente escribe solo en el chat del usuario de su turno', async () => {
  const db = await baseSoporte()
  const turno = (usuario?: string) => emiteTokenDeTarea(SECRETO_TAREAS, { consultora: ORG.CA, tarea: 'chat', rol: 'soporte_sap_agente', exp: Date.now() + 60_000, ...(usuario ? { usuario } : {}) })
  const escribe = (usuario: string) => `insert into ss_chat_mensaje (usuario_id, autor, contenido) values ('${usuario}', 'agente', 'el plan está en la sala')`
  assert.equal(await falla(() => comoServicio(db, turno(USR.exp), escribe(USR.exp))), null, 'control: en el chat de su turno, sí')
  assert.ok(await falla(() => comoServicio(db, turno(USR.exp), escribe(USR.sup))), 'en el chat de otro usuario, no')
  assert.ok(await falla(() => comoServicio(db, turno(), escribe(USR.exp))), 'sin turno de chat, no')
})

test('H-05 · cada consultor ve sus horas, no las de sus colegas', async () => {
  const db = await baseSoporte()
  const colega = '10000000-0000-4000-8000-0000000000c2'
  await db.exec(`insert into ss_miembro values ('${ORG.CA}', '${colega}', 'consultor')`)
  for (const u of [USR.ca, colega]) await como(db, u, `insert into ss_horas (consultora_id, cliente_id, consultor, minutos, fecha)
    values ('${ORG.CA}', '${ORG.A1}', '${await seudonimoDe(db, u)}', 90, current_date)`)
  const mias = await como<{ consultor: string }>(db, USR.ca, 'select consultor from ss_horas')
  assert.deepEqual(mias.map((h) => h.consultor), [await seudonimoDe(db, USR.ca)])
})

test('H-05 · el seudónimo no se revierte con un md5 del id, y la sal no la lee ningún rol de la API', async () => {
  const db = await baseSoporte()
  const md5 = `usr-${createHash('md5').update(USR.ca).digest('hex').slice(0, 12)}`
  assert.notEqual(await seudonimoDe(db, USR.ca), md5)
  assert.ok(await falla(() => como(db, USR.sup, 'select sal from ss_priv.sal_seudonimos')), 'el superadministrador no lee la sal')
})

// === Tanda 1e · la plataforma y la restauración ====================================================

const consultaDe = (db: Db): Consulta => async <T>(sql: string, p?: unknown[]) => (await db.query<T>(sql, p)).rows
const cuentaDe = async (db: Db, c: string) => (await huellaTenant(consultaDe(db), c)).total

test('H-08 · un export alterado no se restaura: la firma no cuadra', async () => {
  const db = await baseSoporte()
  const q = consultaDe(db)
  const e = await exportaTenant(q, ORG.CA, '2026-10-08T12:00:00Z', S)
  const antes = await cuentaDe(db, ORG.CA)
  const filas = (e.tablas['ss_incidencia'] as Array<Record<string, unknown>>).map((f, i) => (i === 0 ? { ...f, prioridad: 'P4' } : f))
  const alterado = { ...e, tablas: { ...e.tablas, ss_incidencia: filas } }
  await assert.rejects(restauraTenant(q, alterado, S), /no lo firmó este job/)
  assert.equal(await cuentaDe(db, ORG.CA), antes, 'la base no cambió')
})

test('H-08 · un export firmado con filas de otra consultora no se restaura', async () => {
  const db = await baseSoporte()
  const q = consultaDe(db)
  const e = await exportaTenant(q, ORG.CA, '2026-10-08T12:00:00Z', S)
  const deB = (await exportaTenant(q, ORG.CB, '2026-10-08T12:00:00Z', S)).tablas['ss_incidencia']!
  // Firmado con el secreto (un job con un error, o quien lo tiene): la firma sola no basta, hay que ver cada fila.
  const mezclado = refirma({ ...e, tablas: { ...e.tablas, ss_incidencia: [...e.tablas['ss_incidencia']!, ...deB] } })
  const [antesA, antesB] = [await cuentaDe(db, ORG.CA), await cuentaDe(db, ORG.CB)]
  await assert.rejects(restauraTenant(q, mezclado, S), /no son de la consultora/)
  assert.deepEqual([await cuentaDe(db, ORG.CA), await cuentaDe(db, ORG.CB)], [antesA, antesB])
})

test('H-08 · la verificación ocurre ANTES del commit: si la huella no cuadra, rollback', async () => {
  const db = await baseSoporte()
  const q = consultaDe(db)
  const e = await exportaTenant(q, ORG.CA, '2026-10-08T12:00:00Z', S)
  await db.exec(`insert into ss_horas (consultora_id, cliente_id, consultor, minutos, fecha) values ('${ORG.CA}', '${ORG.A1}', 'usr-000000000abc', 30, current_date)`)
  const antes = await cuentaDe(db, ORG.CA)
  // Un export cuya huella declarada no es la de sus filas (firmado): restaurar lo dejaría distinto de lo prometido.
  const mentiroso = refirma({ ...e, huella: { ...e.huella, total: 'f'.repeat(64) } })
  await assert.rejects(restauraTenant(q, mentiroso, S), /rollback/)
  assert.equal(await cuentaDe(db, ORG.CA), antes, 'nada a medias: la hora cargada después del export sigue ahí')
})

test('H-08 · el export lleva los accesos motivados de los clientes del tenant, no los de otro', async () => {
  const db = await baseSoporte()
  await db.exec(`insert into ss_acceso_motivado (usuario_id, cliente_id, motivo, otorgado_por, vence_en) values
    ('${USR.sup}', '${ORG.A1}', 'aprobar la solución de la incidencia MIGO', '${USR.ca}', now() + interval '24 hours'),
    ('${USR.sup}', '${ORG.B1}', 'aprobar la solución del CFDI de Boreal', '${USR.cb}', now() + interval '24 hours')`)
  const e = await exportaTenant(consultaDe(db), ORG.CA, '2026-10-08T12:00:00Z', S)
  const accesos = e.tablas['ss_acceso_motivado'] as Array<{ cliente_id: string }>
  assert.deepEqual(accesos.map((a) => a.cliente_id), [ORG.A1])
})

/** Una sesión del rol de plataforma con el token de su tarea, para correr el export con SU rol. */
async function comoPlataforma<T>(db: Db, consultora: string, f: (q: Consulta) => Promise<T>): Promise<T> {
  await db.exec(`set role soporte_sap_plataforma; select set_config('ss.tarea', '${tokenDe(consultora, 'soporte_sap_plataforma')}', false);`)
  try { return await f(consultaDe(db)) } finally { await db.exec(`reset role; select set_config('ss.tarea', '', false);`) }
}

test('H-07 · la plataforma exporta con su propio rol: todo lo de su consultora y nada de otra', async () => {
  const db = await baseSoporte()
  const comoDueno = await exportaTenant(consultaDe(db), ORG.CA, '2026-10-08T12:00:00Z', S)
  const conSuRol = await comoPlataforma(db, ORG.CA, (q) => exportaTenant(q, ORG.CA, '2026-10-08T12:00:00Z', S))
  assert.equal(conSuRol.huella.total, comoDueno.huella.total, 'con su rol ve lo mismo que el dueño: no le falta ninguna tabla')
  assert.deepEqual(conSuRol.objetos, comoDueno.objetos, 'y el manifiesto de objetos no sale vacío')
  const deB = await comoPlataforma(db, ORG.CA, (q) => huellaTenant(q, ORG.CB))
  assert.ok(Object.values(deB.conteos).every((n) => n === 0), 'con una tarea de A no ve nada de B')
})

test('H-07 · la plataforma no inserta decisiones ni eventos: un mapeo aprobado, un evento ajeno, horas, un campo confirmado', async () => {
  const db = await baseSoporte()
  const intentos = [
    `insert into ss_mapeo (consultora_id, herramienta, version, contenido, estado, aprobado_por) values ('${ORG.CA}', 'jira', 9, '{}', 'aprobado', '${USR.sup}')`,
    `insert into ss_evento (incidencia_id, consultora_id, cliente_id, seq, tipo, actor, fecha, anterior, hash) values ('${INC.a1}', '${ORG.CA}', '${ORG.A1}', 7, 'APROBADA', 'usr-000000000001', now(), 'h', 'h')`,
    `insert into ss_horas (consultora_id, cliente_id, consultor, minutos, fecha) values ('${ORG.CA}', '${ORG.A1}', 'usr-000000000001', 600, current_date)`,
    `insert into ss_campo_extraido (adjunto_id, incidencia_id, consultora_id, cliente_id, campo, valor, evidencia, estado, revisado_por)
      values ((select id from ss_adjunto where incidencia_id = '${INC.a1}' limit 1), '${INC.a1}', '${ORG.CA}', '${ORG.A1}', 'total', '[NUMERO]', 'página 1', 'confirmado', '${USR.ca}')`,
  ]
  const pasan = []
  for (const sql of intentos) if (!(await falla(() => comoPlataforma(db, ORG.CA, (q) => q(sql))))) pasan.push(sql.slice(12, 40))
  assert.deepEqual(pasan, [])
  // Control: los mismos intentos SÍ entran como dueño. Si no, la prueba pasaría por un SQL mal escrito y no por el permiso.
  const otra = await baseSoporte()
  for (const sql of intentos) assert.equal(await falla(() => otra.query(sql)), null, `como dueño: ${sql.slice(12, 40)}`)
})

test('H-08 · restaurar no es del rol de plataforma: necesita el privilegio de migración', async () => {
  const db = await baseSoporte()
  const e = await exportaTenant(consultaDe(db), ORG.CA, '2026-10-08T12:00:00Z', S)
  await assert.rejects(comoPlataforma(db, ORG.CA, (q) => restauraTenant(q, e, S)))
})

test('H-08 · con la sala en la misma base, las aprobaciones de la consultora viajan en su export y vuelven al restaurar', async () => {
  const SQL_SALA = readFileSync(join(HERRAMIENTA, '..', 'sala-a2a', 'migraciones', 'propuesta-sala-a2a.sql'), 'utf8')
  const db = await baseSoporte(SQL_SALA)
  const q = consultaDe(db)
  const sala = (tenant: string, canal: string, mensaje: string, humano: string) => `
    insert into sala_participante values ('${tenant}', '${humano}', 'miembro');
    insert into sala_canales (id, tenant_id, slug, nombre, tipo) values ('${canal}', '${tenant}', 'n1-n2', 'N1-N2', 'publico');
    insert into sala_mensajes (id, tenant_id, canal_id, autor_tipo, autor_agente, cuerpo, task_id) values ('${mensaje}', '${tenant}', '${canal}', 'agente', 'soporte-sap-a2a', 'plan', 't');
    insert into sala_aprobaciones (tenant_id, mensaje_id, accion, task_id, decidida_por) values ('${tenant}', '${mensaje}', 'aprobar', 't', '${humano}');`
  await db.exec(sala(ORG.CA, '50000000-0000-4000-8000-0000000000a1', '60000000-0000-4000-8000-0000000000a1', USR.ca))
  await db.exec(sala(ORG.CB, '50000000-0000-4000-8000-0000000000b1', '60000000-0000-4000-8000-0000000000b1', USR.cb))
  const e = await exportaTenant(q, ORG.CA, '2026-10-08T12:00:00Z', S)
  assert.deepEqual((e.tablas['sala_aprobaciones'] as Array<{ tenant_id: string }>).map((a) => a.tenant_id), [ORG.CA])
  await db.exec(`delete from sala_aprobaciones where tenant_id = '${ORG.CA}'`)
  await restauraTenant(q, e, S)
  assert.equal((await db.query(`select 1 from sala_aprobaciones where tenant_id = '${ORG.CA}'`)).rows.length, 1, 'la aprobación de A volvió')
  assert.equal((await db.query(`select 1 from sala_aprobaciones where tenant_id = '${ORG.CB}'`)).rows.length, 1, 'la de B no se tocó')
})

// === Tercera revisión (2026-10-09): cada sonda que mostró el ataque funcionando, con su control positivo ==========

test('R3-01 · la prioridad que mide el SLA la fija la base: la categorización es una, del agente, y dice la prioridad de la incidencia', async () => {
  const db = await baseSoporte()
  const ua1 = await seudonimoDe(db, USR.ua1), ca = await seudonimoDe(db, USR.ca)
  assert.match(await falla(() => como(db, USR.ua1, evento(INC.a1, 'CATEGORIZADA', ua1, '{"prioridad":"P1"}'))) ?? '', /lo emite el agente/, 'el cliente')
  assert.match(await falla(() => como(db, USR.ca, evento(INC.a1, 'CATEGORIZADA', ca, '{"prioridad":"P4"}'))) ?? '', /lo emite el agente/, 'el consultor')
  await comoAgente(db, ORG.CA, `update ss_incidencia set prioridad = 'P2' where id = '${INC.a1}'`)
  assert.match(await falla(() => comoAgente(db, ORG.CA, evento(INC.a1, 'CATEGORIZADA', 'agente:x', '{"prioridad":"P4"}'))) ?? '', /prioridad que fijó la base/, 'otra que la de la base')
  await comoAgente(db, ORG.CA, evento(INC.a1, 'CATEGORIZADA', 'agente:x', '{"prioridad":"P2"}'))
  assert.match(await falla(() => comoAgente(db, ORG.CA, evento(INC.a1, 'CATEGORIZADA', 'agente:x', '{"prioridad":"P2"}'))) ?? '', /es una/, 'una segunda')
})

test('R3-10 · una persona no emite los eventos que gastan presupuesto: no agota el modelo ni el OCR de su consultora', async () => {
  const db = await baseSoporte()
  const ua1 = await seudonimoDe(db, USR.ua1)
  for (const [tipo, datos] of [['PLAN_PREPARADO', '{"tokens":0}'], ['ADJUNTO_LEIDO', '{"paginasOcr":0}'], ['AVISO_PRESUPUESTO', '{}']] as const) {
    assert.match(await falla(() => como(db, USR.ua1, evento(INC.a1, tipo, ua1, datos))) ?? '', /lo emite el agente/, tipo)
  }
  assert.equal(await falla(() => comoAgente(db, ORG.CA, evento(INC.a1, 'PLAN_PREPARADO', 'agente:x', '{"tokens":1200}'))), null, 'control: el agente sí')
})

test('R3-02 · un cambio de prioridad cambia la prioridad: P2 → P2 no reinicia el reloj', async () => {
  const db = await baseSoporte()
  const ca = await seudonimoDe(db, USR.ca)
  await comoAgente(db, ORG.CA, `update ss_incidencia set prioridad = 'P2' where id = '${INC.a1}'`)
  assert.match(await falla(() => como(db, USR.ca, evento(INC.a1, 'CAMBIO_PRIORIDAD', ca, '{"prioridad":"P2","motivo":"reinicio el reloj por si acaso"}'))) ?? '', /cambia la prioridad/)
  await como(db, USR.ca, evento(INC.a1, 'CAMBIO_PRIORIDAD', ca, '{"prioridad":"P1","motivo":"el cliente confirmó que la planta está parada"}'))
  assert.equal((await incidencia(db, INC.a1)).prioridad, 'P1', 'control: un cambio de verdad entra')
})

test('R3-07 · la primera respuesta lleva el mensaje al cliente: sin su texto, no cuenta', async () => {
  const db = await baseSoporte()
  const ca = await seudonimoDe(db, USR.ca)
  assert.match(await falla(() => como(db, USR.ca, evento(INC.a1, 'PRIMERA_RESPUESTA', ca))) ?? '', /lleva su texto/)
  assert.equal((await incidencia(db, INC.a1)).primera_respuesta_en, null)
  await como(db, USR.ca, evento(INC.a1, 'PRIMERA_RESPUESTA', ca, MENSAJE))
  assert.notEqual((await incidencia(db, INC.a1)).primera_respuesta_en, null, 'control: con su texto, sí')
})

test('R3-11 · lo que declaró el cliente no se reescribe; la prioridad inicial y la espera no se ponen a mano', async () => {
  const db = await baseSoporte()
  const ca = await seudonimoDe(db, USR.ca), ua1 = await seudonimoDe(db, USR.ua1)
  assert.match(await falla(() => como(db, USR.ca, `update ss_incidencia set impacto = 3, urgencia = 3 where id = '${INC.a1}'`)) ?? '', /lo que declaró el cliente/, 'el consultor')
  assert.match(await falla(() => comoAgente(db, ORG.CA, `update ss_incidencia set urgencia = 1 where id = '${INC.a1}'`)) ?? '', /lo que declaró el cliente/, 'el agente')
  assert.match(await falla(() => como(db, USR.ca, `update ss_incidencia set prioridad = 'P4' where id = '${INC.a1}'`)) ?? '', /prioridad inicial la fija la categorización/)
  assert.match(await falla(() => comoAgente(db, ORG.CA, `update ss_incidencia set estado = 'espera_cliente' where id = '${INC.a1}'`)) ?? '', /evento ESPERA_CLIENTE/)
  await como(db, USR.ca, evento(INC.a1, 'ESPERA_CLIENTE', ca, '{"pide":"el log de la ST22 del 3 de octubre"}'))
  assert.equal((await incidencia(db, INC.a1)).estado, 'espera_cliente', 'control: la pausa por su evento')
  await como(db, USR.ua1, evento(INC.a1, 'RESPUESTA_CLIENTE', ua1))
  assert.equal((await incidencia(db, INC.a1)).estado, 'en_atencion', 'y la respuesta del cliente la reanuda')
})

test('R3-04 · el laboratorio lee lo leído de un original (RFC, total) solo con el acceso motivado vigente', async () => {
  const db = await baseSoporte()
  const campos = async () => (await como(db, USR.sup, `select valor from ss_campo_extraido where incidencia_id = '${INC.a1}'`)).length
  assert.equal(await campos(), 0, 'escalada, pero sin acceso')
  await como(db, USR.ca, otorga())
  assert.equal(await campos(), 1, 'control: con el acceso que otorga la consultora, sí')
})

test('R3-05 · una propuesta a medida no cambia de consultora ni de contenido; al núcleo la sube el superadministrador', async () => {
  const db = await baseSoporte()
  const id = '90000000-0000-4000-8000-0000000000a1'
  await comoAgente(db, ORG.CA, `insert into ss_propuesta (id, tipo, origen, alcance, consultora_id, contenido, propuesta_por)
    values ('${id}', 'caso', 'sandbox', 'a_medida', '${ORG.CA}', '{"texto":"en Alimentos del Bajío la ZMIGO_BAJIO del centro BJ01"}', 'agente:x')`)
  const lleva = `update ss_propuesta set consultora_id = '${ORG.CB}', estado = 'aprobada', decidida_por = '${USR.exp}' where id = '${id}'`
  assert.match(await falla(() => como(db, USR.exp, lleva)) ?? '', /no cambia de consultora/, 'el experto la lleva a B')
  assert.match(await falla(() => como(db, USR.exp, `update ss_propuesta set contenido = '{"texto":"otra cosa"}' where id = '${id}'`)) ?? '', /no cambia/, 'ni la reescribe')
  await como(db, USR.exp, `update ss_propuesta set estado = 'aprobada', decidida_por = '${USR.exp}' where id = '${id}'`)
  assert.equal((await como(db, USR.cb, `select id from ss_propuesta where id = '${id}'`)).length, 0, 'control: aprobada, sigue siendo de A')
})

test('R3-12 · un campo revisado no se deshace, y la evidencia es la del documento', async () => {
  const db = await baseSoporte()
  await como(db, USR.ca, `update ss_campo_extraido set estado = 'confirmado', revisado_por = '${USR.ca}' where incidencia_id = '${INC.a1}'`)
  const deshace = `update ss_campo_extraido set valor = 'MB1C', evidencia = 'captura: «Transacción MB1C»', estado = 'por_revisar', revisado_por = null where incidencia_id = '${INC.a1}'`
  assert.match(await falla(() => como(db, USR.ua1, deshace)) ?? '', /revisado no se deshace/)
  const otra = await baseSoporte()
  assert.match(await falla(() => como(otra, USR.ua1, `update ss_campo_extraido set evidencia = 'lo que yo diga' where incidencia_id = '${INC.a1}'`)) ?? '', /la evidencia es la del documento/)
  await como(otra, USR.ua1, `update ss_campo_extraido set valor = 'MIGO_GR', estado = 'corregido', revisado_por = '${USR.ua1}' where incidencia_id = '${INC.a1}'`)
  assert.equal((await otra.query<{ estado: string }>(`select estado from ss_campo_extraido where incidencia_id = '${INC.a1}'`)).rows[0]!.estado, 'corregido', 'control: corregir a su nombre, sí')
})

test('R3-06 · al sandbox no entran las formas que la revisión pasó, y al bucket del sandbox nadie sube', async () => {
  const db = await baseSoporte()
  const formas = ['teléfono 55/1234/5678', 'teléfono 55 - 1234 - 5678', 'tel 55_1234_5678', 'escribir a xochitl.tzompantzi at acme.mx',
    'correo xochitl＠acme.mx', 'el RFC TOCX 850312 K77 no timbra', 'la CURP TOCX-850312-HDFRRN09', 'el NSS １２３４５６７８９０１']
  const pasan = []
  for (const t of formas) if (!(await falla(() => comoAgente(db, ORG.CA, alSandbox(t))))) pasan.push(t)
  assert.deepEqual(pasan, [])
  assert.ok(await falla(() => comoAgente(db, ORG.CA, `insert into storage.objects (bucket_id, name) values ('ss-sandbox', '${ORG.CA}/caso-x/captura-con-rfc.png')`)), 'el agente no sube objetos al sandbox')
})

test('R3-06 · los dos cerrojos están de acuerdo: lo que el anonimizador deja entrar, la base lo acepta', async () => {
  const db = await baseSoporte()
  const rechazados: string[] = []
  for (const c of [...casosDelSandbox(), ...BANCO_ANONIMIZA]) {
    const r = anonimiza(c.texto, VALIDADORES)
    if (r.veredicto !== 'entra') continue
    const e = await falla(() => comoAgente(db, ORG.CA, alSandbox(r.texto)))
    if (e) rechazados.push(`${r.texto.slice(0, 80)} → ${e}`)
  }
  assert.deepEqual(rechazados, [])
})

test('R3-09 · la plataforma no borra una impugnación: es la evidencia de una queja', async () => {
  const db = await baseSoporte()
  await como(db, USR.ua1, `insert into ss_impugnacion (incidencia_id, consultora_id, cliente_id, campo, motivo, creada_por)
    values ('${INC.a1}', '${ORG.CA}', '${ORG.A1}', 'resolucion', 'no quedó resuelto: sigue saliendo el M7 053', '${USR.ua1}')`)
  assert.ok(await falla(() => comoPlataforma(db, ORG.CA, (q) => q(`delete from ss_impugnacion where incidencia_id = '${INC.a1}'`))), 'la plataforma no la borra')
  assert.equal((await db.query(`select id from ss_impugnacion where incidencia_id = '${INC.a1}'`)).rows.length, 1)
})

test('R3-18 · el seudónimo de otro no lo calcula nadie por la API, y el laboratorio no lee la cuarentena', async () => {
  const db = await baseSoporte()
  assert.match(await falla(() => como(db, USR.sup, `select ss_priv.seudonimo('${USR.ca}') as s`)) ?? '', /permission denied/, 'el seudónimo de otro')
  assert.equal((await como<{ s: string }>(db, USR.ca, 'select ss_priv.mi_seudonimo() as s'))[0]!.s, await seudonimoDe(db, USR.ca), 'control: el suyo, sí')
  await comoAgente(db, ORG.CA, `insert into ss_cuarentena (incidencia_id, consultora_id, cliente_id, senales) values ('${INC.a2}', '${ORG.CA}', '${ORG.A2}', array['${SENALES.personal}'])`)
  assert.equal((await como(db, USR.sup, 'select incidencia_id from ss_cuarentena')).length, 0, 'el laboratorio')
  assert.equal((await como(db, USR.ca, 'select incidencia_id from ss_cuarentena')).length, 1, 'control: la consultora la ve')
})

test('R3-03 · en la base, al laboratorio lo escala la consultora, y una decisión de la sala la registra el laboratorio', async () => {
  const db = await baseSoporte()
  const ua1 = await seudonimoDe(db, USR.ua1), ca = await seudonimoDe(db, USR.ca)
  assert.match(await falla(() => como(db, USR.ua1, evento(INC.a1, 'ESCALADA', ua1))) ?? '', /lo escala la consultora/, 'el cliente no escala')
  assert.match(await falla(() => comoAgente(db, ORG.CA, evento(INC.a1, 'ESCALADA', 'agente:x'))) ?? '', /./, 'el agente tampoco')
  assert.match(await falla(() => como(db, USR.ua1, evento(INC.a1, 'APROBADA', ua1))) ?? '', /la persona del laboratorio que decide/, 'el cliente no aprueba')
  assert.match(await falla(() => como(db, USR.ca, evento(INC.a1, 'APROBADA', ca))) ?? '', /la persona del laboratorio que decide/, 'ni el consultor')
  assert.equal(await falla(() => como(db, USR.ca, evento(INC.a1, 'ESCALADA', ca))), null, 'control: el consultor escala, a su nombre')
})

