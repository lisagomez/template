/**
 * El riesgo de baja es un aviso para que la consultora atienda, no una decisión (AISIA §4): se ve con su
 * fórmula y su umbral supuesto junto al número, el cliente no lo ve, y ni el precio ni la prioridad lo
 * leen. Goal de firmas de la AISIA y el C3 (2026-10-05): la pantalla no lo enseñaba y se arregló aquí.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tableroN2, tableroN3, type Corte } from '../dist/index.js'
import { HERRAMIENTA, lee } from './_ayuda.ts'

const CORTE: Corte = JSON.parse(readFileSync(join(HERRAMIENTA, 'semantica', 'corte.json'), 'utf8'))
const PERIODO = '2026-09'

test('el riesgo de baja llega al tablero de la consultora con su fórmula y su umbral supuesto, y la pantalla los enseña', () => {
  const n2 = tableroN2(CORTE, 'andina', PERIODO)
  const tarjetas = n2.clientes.flatMap((c) => c.tarjetas).filter((t) => t.nombre === 'riesgo_de_baja')
  assert.ok(tarjetas.length > 0, 'la consultora ve el riesgo de baja de sus clientes')
  for (const t of tarjetas) {
    assert.match(t.metrica.descripcion, /0\.85/, 'la descripción dice el umbral')
    assert.match(t.metrica.descripcion, /SUPUESTO/, 'y que es un supuesto')
    assert.ok(t.metrica.supuestos, 'el catálogo declara el supuesto')
  }
  assert.match(lee('src/features/soporte-sap/services/vistas.ts'), /definicion: t\.metrica\.descripcion, supuestos: t\.metrica\.supuestos/)
  assert.match(lee('src/features/soporte-sap/components/ui.tsx'), /\{t\.supuestos && <p data-supuesto=\{t\.nombre\}[^>]*>\{t\.definicion\} Supuesto: \{t\.supuestos\}/)
})

test('el cliente no ve su propio riesgo de baja', () => {
  const n3 = tableroN3(CORTE, 'andina', 'alimentos-del-bajio', PERIODO)
  assert.ok(n3.tarjetas.length > 0)
  assert.ok(!n3.tarjetas.some((t) => t.nombre === 'riesgo_de_baja' || t.nombre === 'salud_cuenta'))
})

test('el riesgo de baja no entra al precio ni a la prioridad: ni el pricing ni el categorizador lo leen', () => {
  for (const f of ['src/pricing.ts', 'src/categoriza.ts']) {
    const fuente = readFileSync(join(HERRAMIENTA, f), 'utf8')
    assert.doesNotMatch(fuente, /riesgo_de_baja|riesgoDeBaja|salud_cuenta|saludCuenta/, `${f} lee el riesgo o la salud`)
  }
})
