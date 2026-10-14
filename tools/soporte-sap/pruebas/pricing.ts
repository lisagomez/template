/**
 * El modelo de pricing: variables del N3 → tier con umbrales declarados como supuesto; el costo por
 * tier sale del estimado (cada cifra con su naturaleza) y de las horas del corte; NINGÚN precio
 * inventado; las variables que son métricas vienen del corte; el control de costos avisa al 80 % y
 * nunca deja sin atención un P1 o un P2.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  tierDe, costoDelTier, accionAnteElPresupuesto, pide24x7, TABLA_DE_PRECIOS, UMBRALES_TIER, insumosPricing, contratoDeLaboratorio, contratoN1N2DeLaboratorio,
  type Corte, type Insumos, type VariablesN3,
} from '../dist/index.js'
import { guardiaPresupuesto } from '../../sala-a2a/dist/index.js'
import { HERRAMIENTA } from './_ayuda.ts'

const CORTE: Corte = JSON.parse(readFileSync(join(HERRAMIENTA, 'semantica', 'corte.json'), 'utf8'))
const INSUMOS: Insumos = JSON.parse(readFileSync(join(HERRAMIENTA, 'medicion', 'estimado.json'), 'utf8')).insumos
const base: VariablesN3 = { tamano: 'S', volumenMes: 8, proporcionCritica: 0.1, proporcionCompleja: 0.2, respuesta24x7: false }

test('variables → tier, con los umbrales declarados como supuesto (D11)', () => {
  assert.equal(tierDe(base).tier, 'esencial')
  assert.equal(tierDe({ ...base, proporcionCompleja: 0.5 }).tier, 'profesional')
  assert.equal(tierDe({ ...base, tamano: 'M' }).tier, 'profesional')
  assert.equal(tierDe({ ...base, respuesta24x7: true, proporcionCritica: 0.35 }).tier, 'critico')
  assert.equal(tierDe({ ...base, tamano: 'L', proporcionCritica: 0.25 }).tier, 'critico')
  assert.deepEqual(tierDe({ ...base, proporcionCritica: null, respuesta24x7: true }).faltan, ['proporción crítica'], 'lo que falta se dice; no se sube de tier por adivinar')
  for (const u of Object.values(UMBRALES_TIER)) { assert.equal(u.naturaleza, 'supuesta'); assert.match(u.fuente, /D11/) }
  assert.equal(pide24x7(contratoDeLaboratorio('andina', 'x', '2026-04-01')), true)
  assert.equal(pide24x7(contratoN1N2DeLaboratorio('andina', '2026-04-01')), false)
})

test('ningún precio inventado: precio, modelo de cobro y precios unitarios, por decidir', () => {
  for (const f of TABLA_DE_PRECIOS) { assert.equal(f.precio.valor, null); assert.match(f.precio.quienDecide, /ERP-7/); assert.equal(f.modeloDeCobro.valor, null) }
  for (const t of ['S', 'M', 'L'] as const) {
    for (const l of costoDelTier(INSUMOS, t, 1.5)) {
      assert.equal(l.precioUnitario.valor, null, l.rubro)
      assert.equal(l.costo.valor, null, `${l.rubro}: sin precio unitario, el costo es «no medido», nunca un cero`)
    }
  }
})

test('el costo por tier sale del estimado: cada consumo dice si es medido, derivado o supuesto', () => {
  const lineas = costoDelTier(INSUMOS, 'M', 1.5)
  assert.ok(lineas.length >= 9)
  for (const l of lineas) { assert.ok(['medida', 'derivada', 'supuesta'].includes(l.consumo.naturaleza)); assert.ok(l.consumo.fuente.length > 10) }
  const horas = lineas.find((l) => l.rubro === 'horasConsultor')!
  assert.equal(horas.consumo.valor, 30, '1.5 h por incidencia × 20 incidencias al mes de un M')
  assert.match(horas.consumo.fuente, /capa semántica/)
  assert.equal(costoDelTier(INSUMOS, 'M', null).find((l) => l.rubro === 'horasConsultor')!.consumo.valor, null)
})

test('las variables del N3 que son métricas vienen del corte, sin calcularse', () => {
  const p = insumosPricing(CORTE, { nivel: 'N2', consultora: 'andina' }, 'andina', '2026-09', 'alimentos-del-bajio')
  const fila = (m: string) => CORTE.filas.find((f) => f.metrica === m && f.alcance === 'cliente' && f.cliente === 'alimentos-del-bajio' && f.periodo === '2026-09')!.valor
  assert.equal(p.volumen.valor, fila('volumen'))
  assert.equal(p.proporcionCritica.valor, fila('proporcion_critica'))
  assert.equal(p.proporcionCompleja.valor, fila('proporcion_compleja'))
})

test('control de costos: avisa al 80 %; al tope, P1 y P2 pasan a una persona y P3 y P4 esperan; sin fila, nada llama al modelo', () => {
  const filas = [{ tenant: 'andina', claseTarea: 'triage', tope: 100_000, gastado: 70_000 }]
  const al80 = accionAnteElPresupuesto(guardiaPresupuesto(filas, 'andina', 'triage', 15_000), 'P3')
  assert.deepEqual([al80.accion, /80 %/.test(al80.aviso ?? '')], ['llama_modelo', true])
  assert.equal(accionAnteElPresupuesto(guardiaPresupuesto(filas, 'andina', 'triage', 1_000), 'P3').aviso, null)
  for (const p of ['P1', 'P2'] as const) {
    assert.equal(accionAnteElPresupuesto(guardiaPresupuesto(filas, 'andina', 'triage', 40_000), p).accion, 'a_humano')
    assert.equal(accionAnteElPresupuesto(guardiaPresupuesto([], 'andina', 'triage', 1), p).accion, 'a_humano', 'sin fila: P1/P2 a una persona')
  }
  for (const p of ['P3', 'P4'] as const) assert.equal(accionAnteElPresupuesto(guardiaPresupuesto(filas, 'andina', 'triage', 40_000), p).accion, 'espera')
})
