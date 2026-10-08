/**
 * Cierre de la base, tanda 1a (PRP-010): lo que la AISIA y el C3 prometían sobre datos personales y
 * decisiones humanas y la base no cumplía. Cada prueba es una sonda de la revisión del 2026-10-07 con el
 * resultado que debe dar; cada una tiene su fila y su sabotaje en `firmas/matriz.ts`. Las de la sala
 * (H-06) viven en `tools/sala-a2a/pruebas/_suite.ts` (S10 y S10b).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SENALES } from '../dist/index.js'
import { baseSoporte, como, comoAgente, falla, ORG, USR, INC, SQL_SOPORTE } from './_base.ts'

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
