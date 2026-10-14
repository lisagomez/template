/**
 * La matriz dominio × capa del SDD (lazo «ninguna celda huérfana»): sin celdas vacías, cada
 * celda con su tipo, los activos citados existen en el inventario y el bloque de reuso del SDD
 * es el recontado. Si alguien edita la matriz y no recuenta, esta prueba lo dice.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leeMatriz, cuentaReuso, bloqueReuso, bloqueReusoActual } from '../dist/index.js'
import { idsDelInventario, lee } from './_ayuda.ts'

const SDD = lee('docs/SDD-soporte-sap.md')

test('la matriz no tiene celdas vacías ni mal formadas', () => {
  const m = leeMatriz(SDD)
  assert.deepEqual(m.errores, [])
  assert.equal(m.capas.length, 6)
  assert.ok(m.celdas.length >= 6 * 11, 'al menos los once dominios de la spec')
})

test('todo activo citado existe en el inventario', () => {
  const ids = idsDelInventario()
  const faltan = leeMatriz(SDD).celdas.flatMap((c) => c.activos.filter((a) => !ids.has(a)).map((a) => `${c.dominio} × ${c.capa}: ${a}`))
  assert.deepEqual(faltan, [])
})

test('el bloque de reuso del SDD es el que sale de recontar la matriz', () => {
  const recontado = bloqueReuso(cuentaReuso(leeMatriz(SDD).celdas))
  assert.equal(bloqueReusoActual(SDD), recontado, 'corre `node tools/soporte-sap/clis/ss-reuso.mjs --escribe`')
})

test('la matriz rechaza lo que no debe pasar', () => {
  const tabla = (fila: string) => `<!-- matriz:inicio -->\n| D | A | B |\n|---|---|---|\n${fila}\n<!-- matriz:fin -->`
  assert.match(leeMatriz(tabla('| X | | F algo |')).errores.join(), /celda vacía/)
  assert.match(leeMatriz(tabla('| X | R sin activo | F algo |')).errores.join(), /sin activo/)
  assert.match(leeMatriz(tabla('| X | C TPL-x sin suma | F algo |')).errores.join(), /qué se suma/)
  assert.match(leeMatriz(tabla('| X | Q TPL-x | F algo |')).errores.join(), /R, C, F o N/)
  assert.match(leeMatriz(tabla('| X | F solo una |')).errores.join(), /1 celdas para 2 capas/)
})

test('la cuenta: N no entra al denominador', () => {
  const tabla = '<!-- matriz:inicio -->\n| D | A | B |\n|---|---|---|\n| X | R TPL-a | N no aplica |\n| Y | C TPL-b + algo | F nuevo |\n<!-- matriz:fin -->'
  const c = cuentaReuso(leeMatriz(tabla).celdas)
  assert.deepEqual([c.reusadas, c.compuestas, c.fabricadas, c.noAplica, c.denominador], [1, 1, 1, 1, 3])
  assert.equal(c.amplio, 0.667)
  assert.equal(c.estricto, 0.333)
})
