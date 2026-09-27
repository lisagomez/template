/**
 * El motor TS (PRP-005 Fase 3) sobre ESTA fuente única, contra el corpus del motor de Hermes.
 *
 * Es la misma vara que `paridad-migracion.json` le aplicó al motor Python de Hermes corrido
 * sobre este paquete: idéntico o igual salvo el orden de sus listas, y las diferencias de
 * contenido son EXACTAMENTE las firmadas en `diferencias-esperadas.json`. Si las dos varas dan lo
 * mismo, el motor TS y el de Hermes dicen lo mismo sobre el mismo conocimiento.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import conocimiento from '../dist/index.js'
import {
  aSalidaHermes,
  CorpusParidad,
  evalua,
  expandeSalida,
  validaConocimiento,
  type SalidaHermes,
} from '../../grafo-conocimiento/dist/index.js'

const lee = (ruta: string): unknown => JSON.parse(readFileSync(new URL(ruta, import.meta.url), 'utf8'))
const c = validaConocimiento(conocimiento).conocimiento!
const corpus = CorpusParidad.parse(lee('../../grafo-conocimiento/pruebas/paridad/corpus.json'))
const esperadas = lee('./diferencias-esperadas.json') as { contenido: { id: string }[] }
const medida = lee('./paridad-migracion.json') as { solo_orden: number; distintos_en_contenido: { id: string }[] }

const ordena = <T>(xs: T[]) => [...xs].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
const sinOrden = (s: SalidaHermes): SalidaHermes => ({
  ...s,
  conceptos: s.conceptos.map((x) => ({ ...x, banderas: ordena(x.banderas), checklist: ordena(x.checklist) })),
  banderas_rojas: ordena(s.banderas_rojas),
  checklist: ordena(s.checklist),
  fuentes: ordena(s.fuentes),
})

const regulatorio = (descripcion: string, dimension = 'regulatorio', fecha = '2026-09-06') =>
  evalua(c, { contexto: { jurisdiccion: 'MX', dimension, regimen: 'PM_TITULO_II', fecha }, conceptos: [{ descripcion }] }).conceptos[0]!

test('paridad: sobre los 782 casos, el motor TS da lo que el de Hermes salvo las 12 diferencias firmadas', () => {
  let soloOrden = 0
  const distintos: string[] = []
  for (const caso of corpus.casos) {
    const antes = expandeSalida(corpus, caso)
    const ahora = aSalidaHermes(evalua(c, caso.entrada), antes.disclaimer)
    if (isDeepStrictEqual(ahora, antes)) continue
    if (isDeepStrictEqual(sinOrden(ahora), sinOrden(antes))) soloOrden++
    else distintos.push(caso.id)
  }
  assert.deepEqual(distintos.sort(), esperadas.contenido.map((d) => d.id).sort())
  // La misma vara que el motor de Hermes sobre este paquete: mismas diferencias y mismo «solo orden».
  assert.deepEqual(distintos.sort(), medida.distintos_en_contenido.map((d) => d.id).sort())
  assert.equal(soloOrden, medida.solo_orden)
})

test('incidente «drones»: el agente de seguros cae en su dominio, con motivo regla', () => {
  const x = regulatorio('quiero ser un agente de seguros para drones delivery')
  assert.deepEqual([x.categoria, x.dominio, x.motivo, x.veredicto], ['AGENTES_SEGUROS', 'mx-agentes-de-seguros', 'regla', 'permitido'])
})

test('confidencialidad: 2024 cita la ley de 2010, 2026 la de 2025 (firmado en 0.2.0)', () => {
  const antes = regulatorio('clausula de confidencialidad', 'contractual', '2024-06-01')
  const despues = regulatorio('clausula de confidencialidad', 'contractual', '2026-06-01')
  assert.deepEqual([antes.motivo, antes.fuente?.clave], ['regla', 'MX-LFPDPPP-21-CONFIDENCIALIDAD'])
  assert.deepEqual([despues.motivo, despues.fuente?.clave], ['regla', 'MX-LFPDPPP2025-20-CONFIDENCIALIDAD'])
})

test('INTERESES: ya no hay conflicto; una sola rectora, dudoso (firmado en 0.2.0)', () => {
  const x = regulatorio('Intereses del credito bancario', 'fiscal')
  assert.deepEqual([x.motivo, x.veredicto, x.fuente?.clave], ['regla', 'dudoso', 'MX-LISR-28-XXVII'])
  assert.ok(!x.banderas.some((b) => b.startsWith('Reglas vigentes en conflicto')))
})

test('la pregunta H1 de la spec, sin parser todavía: sin regla y sin veredicto (Fase 5)', () => {
  const x = regulatorio('¿puedo hacer envios internacionales sin permiso especial?')
  assert.deepEqual([x.motivo, x.veredicto, x.fuente], ['sin_regla', null, null])
})
