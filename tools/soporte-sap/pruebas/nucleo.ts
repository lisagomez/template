/**
 * Lo del núcleo llega generalizado o no entra (PRP-010 H-19). La base lo exige al proponerlo y al promoverlo con su
 * propio cerrojo (`ss_priv.propuesta_nucleo_generalizada`), que no depende de `generaliza`. Y lo que `generaliza` deja
 * del banco independiente, la base lo acepta: dos cerrojos que no se contradicen.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generaliza } from '../dist/index.js'
import { baseSoporte, como, comoAgente, falla, ORG, USR } from './_base.ts'
import { VALIDADORES } from './_anonimizacion.ts'
import { BANCO_GENERALIZA, NOMBRES_DEL_CLIENTE } from './_banco-independiente.ts'

const NUEVA = '80000000-0000-4000-8000-0000000000f1'
const json = (texto: string) => JSON.stringify({ texto }).replaceAll("'", "''")
const propone = (alcance: 'nucleo' | 'a_medida', texto: string, id = 'gen_random_uuid()') => `insert into ss_propuesta (id, tipo, origen, alcance, consultora_id, contenido, propuesta_por)
  values (${id}, 'caso', 'sandbox', '${alcance}', ${alcance === 'a_medida' ? `'${ORG.CA}'` : 'null'}, '${json(texto)}', 'agente:soporte-sap-a2a')`

const SIN_GENERALIZAR = [
  'En Aceros del Norte la MIGO no contabiliza', 'en alimentos del bajio pasa lo mismo', 'Consultora Boreal ya lo resolvió',
  'La ZMM_PRECIOS truena al grabar', 'el programa yfi_pagos no corre', 'El FM /ACME/GET_TIPO no regresa nada',
  'el campo VBAK-ZZRUTA no se llena', 'falla en la Sociedad: 2000', 'BUKRS = 2000', 'en el centro 1010 no hay stock',
  'escribir a soporte@aceros.mx', 'el RFC AAA010101AA1 no está en la LCO', 'llamar al 55·4821·3907',
]

test('H-19 · la base rechaza al núcleo lo que llega sin generalizar: un nombre, un objeto propio, la estructura o un identificador', async () => {
  const db = await baseSoporte()
  const pasaron: string[] = []
  for (const t of SIN_GENERALIZAR) if (!/se generaliza antes/.test(await falla(() => comoAgente(db, ORG.CA, propone('nucleo', t))) ?? '')) pasaron.push(t)
  assert.deepEqual(pasaron, [])
  assert.equal(await falla(() => comoAgente(db, ORG.CA, propone('a_medida', SIN_GENERALIZAR[0]!))), null, 'control: a medida de su consultora, entra tal cual')
  for (const t of ['la planta 3 está detenida desde ayer', 'BSEG-ZLSCH viene vacío y EKKO-ZTERM no existe', 'ya quedó la zona de transporte en la VL02N', 'el periodo 2026/10/01 no abre en la OB52'])
    assert.equal(await falla(() => comoAgente(db, ORG.CA, propone('nucleo', t))), null, `control: lo estándar sí entra al núcleo («${t}»)`)
})

test('H-19 · promover al núcleo sin generalizar falla; con lo que deja generaliza, el superadministrador lo sube', async () => {
  const db = await baseSoporte()
  const texto = 'En Aceros del Norte la ZMM_PRECIOS truena en la sociedad MX01'
  await comoAgente(db, ORG.CA, propone('a_medida', texto, `'${NUEVA}'`))
  const promueve = (t: string) => como(db, USR.sup, `update ss_propuesta set alcance = 'nucleo', consultora_id = null, contenido = '${json(t)}' where id = '${NUEVA}' returning id`)
  assert.match(await falla(() => promueve(texto)) ?? 'PASÓ', /se generaliza antes/)
  const g = generaliza(texto, VALIDADORES, ['Aceros del Norte'])
  assert.equal(g.veredicto, 'entra', g.senales.join('; '))
  assert.equal((await promueve(g.texto)).length, 1, 'generalizado, sube')
})

test('H-19 · lo que generaliza deja del banco independiente, la base lo acepta: los dos cerrojos no se contradicen', async () => {
  const db = await baseSoporte()
  const orgs = (await db.query<{ nombre: string }>(`select nombre from ss_organizacion where tipo in ('consultora', 'cliente')`)).rows.map((r) => r.nombre)
  const rechazados: string[] = []
  for (const c of BANCO_GENERALIZA) {
    const g = generaliza(c.texto, VALIDADORES, [...NOMBRES_DEL_CLIENTE, ...orgs])
    const e = g.veredicto === 'entra' ? await falla(() => comoAgente(db, ORG.CA, propone('nucleo', g.texto))) : null
    if (e) rechazados.push(`${g.texto} → ${e}`)
  }
  assert.deepEqual(rechazados, [])
})
