/**
 * El corpus de paridad (PRP-005 Fase 1): la salida del motor REAL de Hermes en el corte pineado.
 *
 * Aquí no se compara ningún motor todavía (eso es la Fase 3). Se comprueba que el corpus es lo
 * que dice ser: del corte pineado, completo, sin pérdida al expandirse, y que la validación del
 * seed de ese corte da EXACTAMENTE las divergencias declaradas. Se regenera con
 * `npm run paridad:genera -- --hermes <clon>`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { CORTE_HERMES, CorpusParidad, expandeSalida, RAZON_SIN_REGLA_HERMES, SalidaHermes } from '../dist/index.js'

const archivo = (nombre: string) => new URL(`./paridad/${nombre}`, import.meta.url)
const lee = (nombre: string): unknown => JSON.parse(readFileSync(archivo(nombre), 'utf8'))

const corpus = CorpusParidad.parse(lee('corpus.json'))
const salidas = new Map(corpus.casos.map((c) => [c.id, expandeSalida(corpus, c)]))
const porDescripcion = (texto: string, fecha?: string) =>
  corpus.casos.filter(
    (c) =>
      c.familia === 'incidente' &&
      c.entrada.conceptos[0]?.descripcion === texto &&
      (fecha === undefined || c.entrada.contexto.fecha === fecha),
  )

test('el corpus es del corte pineado: commit, huella del seed y huella del motor', () => {
  assert.equal(corpus.procedencia.commit, CORTE_HERMES.commit)
  assert.equal(corpus.procedencia.seed_sha256, CORTE_HERMES.seed_sha256)
  assert.equal(corpus.procedencia.motor_sha256, CORTE_HERMES.motor_sha256)
})

test('casos: ids únicos, familias contadas y todas las familias presentes', () => {
  assert.equal(new Set(corpus.casos.map((c) => c.id)).size, corpus.casos.length)
  const cuenta: Record<string, number> = {}
  for (const c of corpus.casos) cuenta[c.familia] = (cuenta[c.familia] ?? 0) + 1
  assert.deepEqual(cuenta, corpus.familias)
  for (const f of ['keyword', 'exclusion', 'sin_regla', 'vigencia', 'regimen', 'agregado', 'ambito_cruzado', 'incidente']) {
    assert.ok((corpus.familias[f] ?? 0) > 0, `falta la familia ${f}`)
  }
})

test('cada salida se expande a la forma exacta de Hermes, con un concepto por concepto de entrada', () => {
  for (const c of corpus.casos) {
    const s = salidas.get(c.id)!
    assert.equal(SalidaHermes.safeParse(s).success, true, c.id)
    assert.equal(s.conceptos.length, c.entrada.conceptos.length, c.id)
    assert.deepEqual(s.contexto, c.entrada.contexto, c.id)
  }
})

test('invariante que el port hereda: fuente null ⇔ «sin regla aplicable», y nunca con veredicto afirmativo', () => {
  for (const [id, s] of salidas) {
    for (const x of s.conceptos) {
      assert.equal(x.fuente === null, x.razon === RAZON_SIN_REGLA_HERMES, id)
      if (x.fuente === null) assert.equal(x.estado, 'dudoso', id)
    }
  }
})

test('incidente «drones»: la frase del agente de seguros cae en AGENTES_SEGUROS, no en DRONES_DELIVERY', () => {
  const [seguros] = porDescripcion('quiero ser un agente de seguros para drones delivery')
  const [reparto] = porDescripcion('Uso de drones para delivery en Mexico')
  assert.equal(salidas.get(seguros!.id)!.conceptos[0]!.categoria, 'AGENTES_SEGUROS')
  assert.equal(salidas.get(reparto!.id)!.conceptos[0]!.categoria, 'DRONES_DELIVERY')
})

test('divergencia INTERESES: Hermes responde dudoso con bandera de conflicto en cada consulta', () => {
  const [intereses] = porDescripcion('Intereses del credito bancario')
  const c = salidas.get(intereses!.id)!.conceptos[0]!
  assert.equal(c.estado, 'dudoso')
  assert.ok(c.banderas.some((b) => b.startsWith('Reglas vigentes en conflicto')))
})

test('divergencia de la baja: la confidencialidad de 2024 se quedó sin regla; la de 2026 sí la tiene', () => {
  const [antes] = porDescripcion('clausula de confidencialidad', '2024-06-01')
  const [despues] = porDescripcion('clausula de confidencialidad', '2026-06-01')
  assert.equal(salidas.get(antes!.id)!.conceptos[0]!.razon, RAZON_SIN_REGLA_HERMES)
  assert.notEqual(salidas.get(despues!.id)!.conceptos[0]!.razon, RAZON_SIN_REGLA_HERMES)
})

test('la validación del seed del corte da EXACTAMENTE las divergencias declaradas', () => {
  const validacion = lee('validacion-seed.json') as { procedencia: { commit: string }; problemas: { tipo: string; clave: string }[] }
  const declaradas = lee('divergencias.json') as { validacion: { tipo: string; clave: string; porque: string }[] }
  assert.equal(validacion.procedencia.commit, CORTE_HERMES.commit)
  const llave = (p: { tipo: string; clave: string }) => `${p.tipo}|${p.clave}`
  assert.deepEqual(validacion.problemas.map(llave).sort(), declaradas.validacion.map(llave).sort())
  for (const d of declaradas.validacion) assert.ok(d.porque.length > 40, `${d.clave}: una divergencia se declara con su porqué`)
})

test('el corpus sigue compacto (el crudo pesaba 2,98 MB)', () => {
  assert.ok(statSync(archivo('corpus.json')).size < 600_000)
})
