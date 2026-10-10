/** El SAP simulado: el dry-run no cambia nada; ejecutar exige aprobación; el plan quita el síntoma. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { simula, ejecuta, reproduce, sapDeLaboratorio, MATRIZ_LABORATORIO, pasosDe, extraeParametros, huellaDePlan } from '../dist/index.js'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { lee, RAIZ } from './_ayuda.ts'

const sap = sapDeLaboratorio('alimentos-del-bajio', 'S4HANA')
const caso = (regla: string) => MATRIZ_LABORATORIO.find((e) => e.regla === regla)!

test('dry-run: predice el después y no cambia el estado', () => {
  const pasos = pasosDe(caso('SS-MM-PERIODO'), { sociedad: '1000', periodo: '2026-10' })
  const r = simula(sap, pasos)
  assert.match(r.resultados[0]!.despues, /2026-10/)
  assert.ok(!sap.periodos['1000']!.mm.includes('2026-10'), 'el estado original no cambió')
  assert.ok(r.final.periodos['1000']!.mm.includes('2026-10'), 'la previsión sí lo trae')
})

/** El artefacto que se aprueba: tarea, versión, regla, parámetros y pasos. */
const artefacto = (parametros: Record<string, string>, extra: { taskId?: string; version?: number } = {}) =>
  ({ taskId: extra.taskId ?? 't1', version: extra.version ?? 1, regla: 'SS-BC-USUARIO', parametros, pasos: pasosDe(caso('SS-BC-USUARIO'), parametros) })

test('ejecutar sin aprobación humana no corre', () => {
  const a = artefacto({ usuario: 'ALMACEN01' })
  assert.throws(() => ejecuta(sap, a, null), /sin aprobación humana/)
  const r = ejecuta(sap, a, { taskId: 't1', sha256: huellaDePlan(a), decididaPor: 'usr-1' })
  assert.equal(r.final.usuarios['ALMACEN01']?.bloqueado, false)
})

// PRP-010 H-11: la aprobación es de UN artefacto. Antes, `ejecuta` recibía los pasos sueltos y nunca miraba la huella:
// con la aprobación de desbloquear a ALMACEN01 se desbloqueaba a cualquiera.
test('H-11 · una aprobación de otro artefacto no ejecuta: otro parámetro, otra versión u otra tarea invalidan la huella', () => {
  const dosBloqueados = { ...sap, usuarios: { ...sap.usuarios, VENTAS02: { bloqueado: true } } }
  const aprobadoEs = artefacto({ usuario: 'ALMACEN01' })
  const aprobacion = { taskId: 't1', sha256: huellaDePlan(aprobadoEs), decididaPor: 'usr-1' }
  const otros = [artefacto({ usuario: 'VENTAS02' }), artefacto({ usuario: 'ALMACEN01' }, { version: 2 }), artefacto({ usuario: 'ALMACEN01' }, { taskId: 't2' })]
  // El ataque funciona sin el control: cada «otro» es ejecutable en este estado.
  for (const otro of otros) assert.doesNotThrow(() => simula(dosBloqueados, otro.pasos), JSON.stringify(otro))
  for (const otro of otros) assert.throws(() => ejecuta(dosBloqueados, otro, aprobacion), /la aprobación es de otro artefacto/, JSON.stringify(otro))
  assert.equal(ejecuta(dosBloqueados, aprobadoEs, aprobacion).final.usuarios['ALMACEN01']?.bloqueado, false, 'control: el aprobado sí corre')
})

test('el síntoma se reproduce antes y no después', () => {
  const e = caso('SS-MM-PERIODO')
  const { parametros } = extraeParametros(e, 'M7 053 en sociedad 1000 para el periodo 2026-10')
  const s = e.sintoma!(parametros)
  assert.ok(reproduce(sap, s))
  assert.equal(reproduce(simula(sap, pasosDe(e, { ...parametros, periodo: '2026-10' })).final, s), false)
})

test('CFDI: corregir un RFC que tampoco está en la LCO no aplica; el orden de los pasos importa', () => {
  const e = caso('SS-CFDI-LCO')
  const uuid = '6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7'
  assert.throws(() => simula(sap, pasosDe(e, { bp: '1000452', rfc: 'AAA010101AAA', uuid })), /tampoco está en la LCO/)
  const r = simula(sap, pasosDe(e, { bp: '1000452', rfc: 'EKU9003173C9', uuid }))
  assert.equal(r.final.cfdis[uuid]?.estado, 'timbrado')
  assert.throws(() => simula(sap, [pasosDe(e, { bp: '1000452', rfc: 'EKU9003173C9', uuid })[1]!]), /sigue fuera de la LCO/)
})

test('un parámetro con forma inválida no entra al simulador', () => {
  assert.throws(() => simula(sap, pasosDe(caso('SS-BC-USUARIO'), { usuario: "ALMACEN01'; drop table" })), /forma inválida/)
})

/** Un cliente de SAP: RFC (node-rfc, sapnwrfc) o los SDK de SAP. */
const CLIENTE_SAP = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"](node-rfc|sapnwrfc|node-sap[^'"]*|@sap\/[^'"]+|@sap-cloud-sdk\/[^'"]+)['"]/
const DEL_PRODUCTO = ['tools/soporte-sap/src', 'tools/soporte-sap/clis', 'src/features/soporte-sap', 'src/app']
const codigoDelProducto = () => DEL_PRODUCTO.flatMap((d) => readdirSync(join(RAIZ, d), { recursive: true, encoding: 'utf8' })
  .map((f) => `${d}/${f}`)
  .filter((f) => /\.(ts|tsx|mjs|js)$/.test(f) && (!f.startsWith('src/app') || f.includes('soporte-sap'))))

test('D6 · el producto no se conecta a un SAP real: ningún módulo importa un cliente de SAP ni lo declara como dependencia', () => {
  for (const muestra of ["import { Client } from 'node-rfc'", "const c = require('sapnwrfc')", "import '@sap-cloud-sdk/http-client'", "await import('@sap/xsenv')"]) {
    assert.match(muestra, CLIENTE_SAP, `control positivo: ${muestra}`)
  }
  const archivos = codigoDelProducto()
  assert.ok(archivos.some((f) => f.endsWith('simulador.ts')) && archivos.some((f) => f.includes('src/app/') && f.includes('soporte-sap')), 'recorre el dominio y las rutas')
  assert.deepEqual(archivos.filter((f) => CLIENTE_SAP.test(lee(f))), [], 'ningún módulo importa un cliente de SAP')
  for (const pkg of ['package.json', 'tools/soporte-sap/package.json']) {
    const j = JSON.parse(lee(pkg)) as Record<string, Record<string, string> | undefined>
    const deps = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].flatMap((k) => Object.keys(j[k] ?? {}))
    assert.deepEqual(deps.filter((d) => CLIENTE_SAP.test(`from '${d}'`)), [], `${pkg} no declara un cliente de SAP`)
  }
})

test('D6 · la pantalla dice que lo aplicado fue al simulador, no al SAP del cliente, y de quién es llevarlo a su SAP', () => {
  const plan = lee('src/features/soporte-sap/components/incidencias.tsx')
  const bloque = plan.slice(plan.indexOf('data-prueba="antes-despues"'), plan.indexOf('</p>', plan.indexOf('data-prueba="antes-despues"')))
  assert.match(bloque, />Aplicado en el simulador, no en el SAP del cliente · antes:/)
  assert.match(bloque, /data-prueba="fuera-del-producto"[^>]*>Llevarlo a su SAP lo hace una persona con su propio acceso y el control de cambios del cliente, fuera del producto/)
})
