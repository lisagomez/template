/** El SAP simulado: el dry-run no cambia nada; ejecutar exige aprobación; el plan quita el síntoma. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { simula, ejecuta, reproduce, sapDeLaboratorio, MATRIZ_LABORATORIO, pasosDe, extraeParametros } from '../dist/index.js'

const sap = sapDeLaboratorio('alimentos-del-bajio', 'S4HANA')
const caso = (regla: string) => MATRIZ_LABORATORIO.find((e) => e.regla === regla)!

test('dry-run: predice el después y no cambia el estado', () => {
  const pasos = pasosDe(caso('SS-MM-PERIODO'), { sociedad: '1000', periodo: '2026-10' })
  const r = simula(sap, pasos)
  assert.match(r.resultados[0]!.despues, /2026-10/)
  assert.ok(!sap.periodos['1000']!.mm.includes('2026-10'), 'el estado original no cambió')
  assert.ok(r.final.periodos['1000']!.mm.includes('2026-10'), 'la previsión sí lo trae')
})

test('ejecutar sin aprobación humana no corre', () => {
  const pasos = pasosDe(caso('SS-BC-USUARIO'), { usuario: 'ALMACEN01' })
  assert.throws(() => ejecuta(sap, pasos, null), /sin aprobación humana/)
  const r = ejecuta(sap, pasos, { taskId: 't1', sha256: 'ab'.repeat(32), decididaPor: 'usr-1' })
  assert.equal(r.final.usuarios['ALMACEN01']?.bloqueado, false)
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
