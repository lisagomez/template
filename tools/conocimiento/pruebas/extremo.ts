/**
 * De punta a punta sobre la fuente única (PRP-005 Fase 6, TAR-11 y TAR-12): un proyecto registra
 * drones de reparto y agentes de seguros, y pregunta con oraciones reales. Oración → parser sin
 * modelo → motor → redactor, sin payload armado a mano. Lo que sin modelo no se entiende (una
 * paráfrasis sin keywords) da «no hay información suficiente»: el fail-safe, no una suposición.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import conocimiento from '../dist/index.js'
import { seleccionaDominios, validaConocimiento } from '../../grafo-conocimiento/dist/index.js'
import { estructuradorSinModelo, responde } from '../../grafo-conocimiento/dist/lenguaje/index.js'

const todo = validaConocimiento(conocimiento).conocimiento!
const mio = seleccionaDominios(todo, ['mx-drones-de-reparto', 'mx-agentes-de-seguros'])
const pregunta = (texto: string, c = mio, regimen = 'GENERAL') =>
  responde(texto, { conocimiento: c, jurisdiccion: 'MX', regimen, hoy: '2026-09-27', estructurador: estructuradorSinModelo(c, 'MX') })

test('el incidente «drones», como oración: el agente de seguros recibe la regla de la CNSF, con cita', async () => {
  const r = await pregunta('Quiero ser agente de seguros para drones delivery, ¿qué necesito?')
  assert.equal(r.tipo === 'resultado' && r.resultado.conceptos[0]!.categoria, 'AGENTES_SEGUROS')
  assert.match(r.texto, /está permitido\. Fuente: Ley de Instituciones de Seguros y de Fianzas/)
})

test('reparto con drones: la Ley de Aviación Civil, sus requisitos y la fecha de corte del dominio', async () => {
  const r = await pregunta('¿Puedo repartir paquetes con drones en Monterrey?')
  assert.equal(r.tipo === 'resultado' && r.resultado.conceptos[0]!.categoria, 'DRONES_DELIVERY')
  assert.match(r.texto, /Fuente: Ley de Aviacion Civil/)
  assert.match(r.texto, /Registro del RPAS ante la Agencia Federal de Aviacion Civil/)
  assert.match(r.texto, /Conocimiento con corte al 2026-07-10/)
})

test('H1 de la spec sin modelo: no hay keyword, no hay suposición', async () => {
  const r = await pregunta('¿Puedo hacer envíos internacionales sin permiso especial?')
  assert.equal(r.tipo === 'resultado' && r.resultado.conceptos[0]!.motivo, 'sin_regla')
  assert.match(r.texto, /no hay información suficiente/)
})

test('un proyecto que solo registró drones y seguros no responde de fiscal, aunque la fuente única lo tenga', async () => {
  const r = await pregunta('¿Es deducible un hotel de $2,400 en un viaje de trabajo?')
  assert.equal(r.tipo === 'resultado' && r.resultado.conceptos[0]!.motivo, 'sin_regla')
})

test('con todo el conocimiento: fecha e importe escritos llegan al motor, y el régimen importa', async () => {
  const r = await pregunta('¿Es deducible un hotel de $2,400 en un viaje de trabajo el 15/03/2026?', todo, 'PM_TITULO_II')
  assert.equal(r.tipo, 'resultado')
  if (r.tipo !== 'resultado') return
  assert.deepEqual([r.resultado.contexto.dimension, r.resultado.contexto.fecha, r.resultado.conceptos[0]!.categoria], ['fiscal', '2026-03-15', 'VIATICOS'])
  assert.equal(r.resultado.conceptos[0]!.motivo, 'regla')
})
