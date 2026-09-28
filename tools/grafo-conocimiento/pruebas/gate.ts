/**
 * El gate de siembra (PRP-005 Fase 4) con fixtures: cada retroceso de RF-14 y la detección de
 * contenciones de RF-12, con sus controles negativos. Lo que se permite (cerrar una vigencia,
 * añadir) también se prueba: un gate que prohíbe de más se acaba saltando.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Conocimiento } from '../dist/index.js'
import { comparaVersiones, contenciones, huellas } from '../dist/gate-entrada.js'

type Regla = Conocimiento['reglas'][number]
const regla = (clave: string, categoria: string, veredicto: string): Regla => ({
  clave,
  jurisdiccion: 'MX',
  dimension: 'regulatorio',
  titulo: `Titulo ${clave}`,
  texto_resumen: 'Resumen.',
  fuente_cita: `Ley ${clave}`,
  fuente_url: 'https://ejemplo.gob.mx/ley.pdf',
  vigente_desde: '2020-01-01',
  vigente_hasta: null,
  impactos: [{ categoria, regimen: 'GENERAL', veredicto_base: veredicto, requisitos: [], banderas: [], parametros: {} }],
})

function base(): Conocimiento {
  return {
    version: '0.1.0',
    procedencia: 'fixture',
    jurisdicciones: [{ codigo: 'MX', nombre: 'México' }],
    dimensiones: [{ codigo: 'regulatorio', nombre: 'Regulatorio', vocabulario: ['permitido', 'no_permitido', 'dudoso'] }],
    dominios: [
      { clave: 'mx-aduanas', nombre: 'Aduanas', jurisdiccion: 'MX', dimension: 'regulatorio', cita: 'publica', corte: '2026-09-01', procedencia: 'fixture', categorias: ['DESPACHO', 'VALOR'] },
    ],
    categorias: [
      { clave: 'DESPACHO', nombre: 'Despacho', keywords: ['aduana', 'despacho'], exclusiones: [] },
      { clave: 'VALOR', nombre: 'Valor', keywords: ['valor en aduana'], exclusiones: [] },
    ],
    reglas: [regla('R-DESP', 'DESPACHO', 'permitido'), regla('R-VAL', 'VALOR', 'dudoso')],
  }
}

const cambia = (f: (c: Conocimiento) => void): Conocimiento => {
  const c = structuredClone(base())
  f(c)
  return c
}
const tipos = (ahora: Conocimiento, firmadas: string[] = []) => comparaVersiones(huellas(base()), huellas(ahora), firmadas).map((r) => `${r.tipo}:${r.clave}`)

test('RF-12: detecta la contención entre categorías, y la da por cubierta si una exclusión la descarta', () => {
  assert.deepEqual(contenciones(base()), [{ corta: 'aduana', categoria_corta: 'DESPACHO', larga: 'valor en aduana', categoria_larga: 'VALOR', cubierta: false }])
  const cubierta = cambia((c) => (c.categorias[0]!.exclusiones = ['valor en aduana']))
  assert.equal(contenciones(cubierta)[0]!.cubierta, true)
})

test('RF-12: categorías que no comparten ámbito no compiten, aunque sus keywords se contengan', () => {
  const otra = cambia((c) => {
    c.dimensiones.push({ codigo: 'fiscal', nombre: 'Fiscal', vocabulario: ['deducible'] })
    c.reglas[1] = { ...c.reglas[1]!, dimension: 'fiscal', impactos: [{ ...c.reglas[1]!.impactos[0]!, veredicto_base: 'deducible' }] }
  })
  assert.deepEqual(contenciones(otra), [])
})

test('RF-14: sin cambios no hay retrocesos, y añadir cosas tampoco es retroceso', () => {
  assert.deepEqual(tipos(base()), [])
  const mas = cambia((c) => {
    c.categorias[0]!.keywords.push('pedimento')
    c.categorias[0]!.exclusiones.push('valor en aduana')
    c.reglas.push(regla('R-NUEVA', 'DESPACHO', 'permitido'))
    c.dimensiones[0]!.vocabulario.push('condicionado')
  })
  assert.deepEqual(tipos(mas), [])
})

test('RF-14, control negativo: borrar una regla es retroceso, y no hay firma que lo permita', () => {
  const sin = cambia((c) => c.reglas.splice(0, 1))
  assert.deepEqual(tipos(sin), ['regla_borrada:R-DESP'])
  assert.deepEqual(tipos(sin, ['R-DESP']), ['regla_borrada:R-DESP'])
})

test('RF-14, control negativo: editar una regla en su sitio exige firma en la versión', () => {
  const editada = cambia((c) => (c.reglas[0]!.impactos[0]!.veredicto_base = 'dudoso'))
  assert.deepEqual(tipos(editada), ['regla_editada:R-DESP'])
  assert.deepEqual(tipos(editada, ['R-DESP']), [])
})

test('RF-14: cerrar una vigencia es retirar (permitido); reabrirla o moverla, retroceso', () => {
  const cerrada = cambia((c) => (c.reglas[0]!.vigente_hasta = '2026-12-31'))
  assert.deepEqual(tipos(cerrada), [])
  const antes = huellas(cerrada)
  const reabierta = comparaVersiones(antes, huellas(base()))
  assert.deepEqual(reabierta.map((r) => r.tipo), ['vigencia_editada'])
})

test('RF-14, control negativo: quitar keywords, exclusiones, categorías, dominios o veredictos es retroceso', () => {
  assert.deepEqual(tipos(cambia((c) => c.categorias[0]!.keywords.pop())), ['keyword_quitada:DESPACHO'])
  assert.deepEqual(tipos(cambia((c) => c.dominios[0]!.categorias.pop())), ['categoria_sacada_de_dominio:mx-aduanas'])
  assert.deepEqual(tipos(cambia((c) => c.dimensiones[0]!.vocabulario.pop())), ['veredicto_quitado_del_vocabulario:regulatorio'])
  assert.deepEqual(tipos(cambia((c) => c.dominios.pop())), ['dominio_borrado:mx-aduanas'])
  const conExclusion = cambia((c) => c.categorias[0]!.exclusiones.push('x'))
  assert.deepEqual(comparaVersiones(huellas(conExclusion), huellas(base())).map((r) => r.tipo), ['exclusion_quitada'])
})

test('las huellas van con el prefijo sha256: (audita-secretos toma 64 hex sueltos por un token)', () => {
  for (const r of Object.values(huellas(base()).reglas)) assert.match(r.huella, /^sha256:[0-9a-f]{64}$/)
})
