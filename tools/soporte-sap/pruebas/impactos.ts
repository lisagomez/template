/**
 * Impactos en MXN y accionables: ningún peso sin fórmula, supuestos y rango; la evidencia sale del
 * corte; cambiar un parámetro recalcula y deja ver el antes y el después; el FODA del N3 cita su dato y
 * solo usa lo que el cliente ve de sí mismo.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { digitoVerificadorRfc, digitoVerificadorCurp } from '../../extractor-documental/dist/index.js'
import { accionables, recalcula, foda, generaCorpus, relojSla, contratoDeLaboratorio, PARAMETROS_LABORATORIO, CRITERIOS_FODA, type Corte } from '../dist/index.js'
import { HERRAMIENTA } from './_ayuda.ts'

const CORTE: Corte = JSON.parse(readFileSync(join(HERRAMIENTA, 'semantica', 'corte.json'), 'utf8'))
const P = '2026-09'
const valor = (m: string, cliente: string, periodo = P) => CORTE.filas.find((f) => f.metrica === m && f.alcance === 'cliente' && f.cliente === cliente && f.periodo === periodo)!.valor

test('cada accionable trae evidencia del corte, fórmula, supuestos, rango, confianza y responsable', () => {
  const xs = accionables(CORTE, 'andina', 'alimentos-del-bajio', P)
  assert.ok(xs.length >= 2, xs.map((x) => x.id).join(', '))
  for (const a of xs) {
    assert.ok(a.evidencia.length > 0 && a.evidencia.every((e) => /capa semántica · /.test(e.fuente)), a.id)
    for (const e of a.evidencia) assert.equal(e.valor, valor(e.metrica, 'alimentos-del-bajio'), `${a.id}: ${e.metrica} es el del corte`)
    assert.match(a.formula, /×/)
    assert.ok(a.supuestos.length > 0 && a.supuestos.every((s) => /SUPUESTO|factor de carga/.test(s.fuente)), a.id)
    assert.ok(a.impactoMxn.bajo <= a.impactoMxn.central && a.impactoMxn.central <= a.impactoMxn.alto, a.id)
    assert.ok(['baja', 'media'].includes(a.confianza), 'con supuestos de por medio, nunca alta')
    assert.ok(a.responsable.length > 3)
    assert.match(a.aviso, /no una promesa/)
  }
})

test('la fórmula se puede rehacer a mano con los valores que muestra', () => {
  const a = accionables(CORTE, 'andina', 'alimentos-del-bajio', P).find((x) => x.id === 'reducir-reaperturas')!
  const [res, reab, horas] = a.evidencia.map((e) => e.valor) as [number, number, number]
  const p = PARAMETROS_LABORATORIO
  assert.equal(a.impactoMxn.central, Math.round(res * reab * horas * p.retrabajoPorReapertura!.rango.central * p.costoHoraConsultor!.rango.central))
})

test('el costo hora sale de una fuente pública por un factor de carga declarado', () => {
  const c = PARAMETROS_LABORATORIO.costoHoraConsultor!
  assert.match(c.fuente, /Jooble.*201\.19.*SUPUESTO/)
  assert.deepEqual([c.rango.bajo, c.rango.central, c.rango.alto], [262, 322, 402])
  for (const [k, p] of Object.entries(PARAMETROS_LABORATORIO)) if (k !== 'costoHoraConsultor') assert.equal(p.naturaleza, 'supuesta', k)
})

test('si un parámetro cambia, la proyección se recalcula y se ve el antes y el después', () => {
  const r = recalcula(CORTE, 'andina', 'alimentos-del-bajio', P, 'costoHoraConsultor', { bajo: 400, central: 500, alto: 600 })
  const c = r.cambios.find((x) => x.id === 'reducir-reaperturas')!
  assert.ok(c.despues.central > c.antes.central)
  assert.ok(Math.abs(c.despues.central / c.antes.central - 500 / 322) < 0.01)
  assert.match(r.parametros.costoHoraConsultor!.fuente, /capturado por la consultora/)
  const n3 = r.cambios.find((x) => x.id === 'responder-a-tiempo')
  if (n3) assert.deepEqual(n3.antes, n3.despues, 'el costo hora del consultor no mueve el paro del cliente')
})

test('sin dato en el corte no hay accionable (no se inventa)', () => {
  assert.deepEqual(accionables(CORTE, 'andina', 'alimentos-del-bajio', '2025-01'), [])
})

test('el FODA del N3 cita su dato en cada punto, con el criterio a la vista, y solo con lo que el cliente ve', () => {
  const f = foda(CORTE, 'andina', 'alimentos-del-bajio', P)
  const puntos = [...f.fortalezas, ...f.debilidades, ...f.oportunidades, ...f.amenazas]
  assert.ok(puntos.length >= 2)
  const visibles = new Set(CORTE.metricas.filter((m) => m.visibleAlCliente).map((m) => m.nombre))
  for (const p of puntos) {
    assert.ok(p.datos.length > 0, p.texto)
    for (const d of p.datos) assert.ok(visibles.has(d.metrica), `${p.texto}: ${d.metrica} no es visible al cliente`)
    assert.ok(p.criterio.length > 10)
  }
  assert.ok([...f.fortalezas, ...f.debilidades].every((p) => p.criterio.includes(CRITERIOS_FODA.fuente)))
  assert.ok(f.oportunidades.every((o) => /proyección/.test(o.texto)))
})

test('las respuestas tardías del corte son las que da el reloj sobre los eventos (la base del impacto para el N3)', () => {
  const corpus = generaCorpus({ rfc: digitoVerificadorRfc, curp: digitoVerificadorCurp })
  for (const [cliente, periodo] of [['alimentos-del-bajio', '2026-09'], ['bebidas-del-sur', '2026-07']] as const) {
    const tardias = (pr: 'P1' | 'P2') => corpus.incidencias.filter((i) => i.cliente === cliente && i.creada.startsWith(periodo) && i.prioridad === pr)
      .filter((i) => relojSla(i.eventos, i.prioridad, contratoDeLaboratorio(i.consultora, i.cliente, '2026-04-01'), corpus.corte).cumpleRespuesta === false).length
    assert.equal(valor('respuestas_tardias_p1', cliente, periodo), tardias('P1'), `${cliente} ${periodo} P1`)
    assert.equal(valor('respuestas_tardias_p2', cliente, periodo), tardias('P2'), `${cliente} ${periodo} P2`)
  }
})

test('con pocos datos la confianza baja: un cliente de 8 incidencias da «baja», uno de 45 da «media»', () => {
  const pocos = accionables(CORTE, 'andina', 'farmacias-del-centro', P)
  const muchos = accionables(CORTE, 'andina', 'alimentos-del-bajio', P)
  assert.equal(valor('volumen', 'farmacias-del-centro'), 8)
  assert.ok(pocos.length > 0 && pocos.every((a) => a.confianza === 'baja'), JSON.stringify(pocos.map((a) => a.confianza)))
  assert.ok(muchos.length > 0 && muchos.every((a) => a.confianza === 'media'), JSON.stringify(muchos.map((a) => a.confianza)))
})
