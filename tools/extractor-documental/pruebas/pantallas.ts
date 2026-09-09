import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  borradorDeLote,
  editaTitulo,
  refrescaSugerencia,
  tituloValido,
  puedeBuscar,
  puedeLanzar,
  totalDelLote,
  costeLegible,
  impedimentosParaSuprimir,
  puedeSuprimir,
  candidatosPorRetencion,
  admiteMasDocumentos,
} from '../dist/react/pantallas.js'
import type { Estimacion } from '../dist/costes.js'
import type { Lote } from '../dist/registros.js'

const resumen = (documentos: number, contraparte?: string) => ({
  tipoTrabajo: 'facturas' as const,
  documentos,
  contraparte,
  fecha: new Date('2026-03-01T10:00:00Z'),
})

const estimacion = (costeUsd: number | null, paginas = 10): Estimacion => ({
  paginas,
  costeUsd,
  mensaje: costeUsd === null ? 'sin tarifa declarada' : 'estimado',
})

// --- TAR-46: titulo sugerido pero editable ---------------------------------------------------------

test('se propone un titulo derivado del contenido', () => {
  const borrador = borradorDeLote(resumen(12, 'ACME'))
  assert.ok(borrador.titulo.length > 0)
  assert.equal(borrador.esSugerido, true)
})

test('editar el titulo lo marca como propio', () => {
  const propio = editaTitulo(borradorDeLote(resumen(12)), 'Facturas de marzo, revisadas')
  assert.equal(propio.titulo, 'Facturas de marzo, revisadas')
  assert.equal(propio.esSugerido, false)
})

test('la sugerencia se refresca mientras nadie la haya tocado', () => {
  const inicial = borradorDeLote(resumen(1))
  const refrescado = refrescaSugerencia(inicial, resumen(40, 'ACME'))
  assert.notEqual(refrescado.titulo, inicial.titulo)
})

test('pero NO pisa un titulo escrito a mano, aunque lleguen mas documentos', () => {
  const propio = editaTitulo(borradorDeLote(resumen(1)), 'Lo que yo quiera')
  const despues = refrescaSugerencia(propio, resumen(40, 'ACME'))
  assert.equal(despues.titulo, 'Lo que yo quiera', 'pisar lo que una persona escribio es peor que un titulo viejo')
})

test('un titulo en blanco no vale, pero repetido si', () => {
  assert.equal(tituloValido('   '), false)
  assert.equal(tituloValido('Facturas de marzo'), true)
  // No hay comprobacion de unicidad a proposito: dos tandas pueden llamarse igual (§2.14).
})

test('sin criterios no se busca, y se dice por que', () => {
  const resultado = puedeBuscar({ titulo: '', identificador: '' })
  assert.equal(resultado.puede, false)
  assert.equal(resultado.puede === false ? resultado.motivo : null, 'sin_criterios')
})

test('con un identificador si se busca', () => {
  assert.equal(puedeBuscar({ titulo: '', identificador: '7501234567890' }).puede, true)
})

// --- TAR-47: el coste ANTES de gastarlo -------------------------------------------------------------

test('ver la cifra no es aceptarla: sin aceptacion no se lanza', () => {
  const { puede } = puedeLanzar({ estimacion: estimacion(3.5), aceptado: false })
  assert.equal(puede, false)
})

test('con aceptacion explicita se lanza', () => {
  assert.equal(puedeLanzar({ estimacion: estimacion(3.5), aceptado: true }).puede, true)
})

test('un coste desconocido NO bloquea, pero se marca', () => {
  // Bloquear por no saber dejaria la herramienta inservible en cuanto un motor no declare precio;
  // lanzar en silencio seria gastar sin avisar.
  const { puede, avisoDeCosteDesconocido } = puedeLanzar({ estimacion: estimacion(null), aceptado: true })
  assert.equal(puede, true)
  assert.equal(avisoDeCosteDesconocido, true)
})

test('el coste se enseña como texto, y `null` NO se pinta como 0,00', () => {
  assert.equal(costeLegible(estimacion(3.5)), '3.50 USD')
  assert.match(costeLegible(estimacion(null)), /desconocido/)
  assert.doesNotMatch(costeLegible(estimacion(null)), /0\.00/, 'un cero se leeria como "no cuesta nada"')
})

test('una suma con un hueco dentro es un total desconocido', () => {
  const total = totalDelLote([estimacion(1.5), estimacion(null), estimacion(2)])
  assert.equal(total.costeUsd, null, 'sumar huecos como ceros da una factura que parece completa y no lo es')
})

// --- TAR-48: suprimir exige las tres cosas ------------------------------------------------------------

test('un rol sin permiso no suprime', () => {
  const faltan = impedimentosParaSuprimir({ rol: 'operario', motivo: 'duplicado', confirmado: true })
  assert.deepEqual(faltan, ['sin_permiso'])
})

test('sin motivo no se suprime, aunque el rol pueda', () => {
  assert.deepEqual(impedimentosParaSuprimir({ rol: 'revisor', motivo: '  ', confirmado: true }), ['sin_motivo'])
})

test('sin confirmacion explicita tampoco', () => {
  assert.deepEqual(impedimentosParaSuprimir({ rol: 'revisor', motivo: 'duplicado', confirmado: false }), ['sin_confirmar'])
})

test('se dicen TODOS los impedimentos, no solo el primero', () => {
  // Decir "no puedes" sin decir que falta obliga a adivinar, y quien adivina prueba combinaciones
  // hasta que una funciona — lo ultimo que quieres con un borrado.
  const faltan = impedimentosParaSuprimir({ rol: 'consulta', motivo: '', confirmado: false })
  assert.deepEqual([...faltan].sort(), ['sin_confirmar', 'sin_motivo', 'sin_permiso'])
})

test('con las tres, se suprime', () => {
  assert.equal(puedeSuprimir({ rol: 'revisor', motivo: 'duplicado del lote 12', confirmado: true }), true)
})

// --- RF-63: vencer NO borra ---------------------------------------------------------------------------

test('la retencion vencida produce una LISTA, no un borrado', () => {
  const candidatos = candidatosPorRetencion(
    [
      { id: 'a', venceEn: '2026-01-01T00:00:00Z' },
      { id: 'b', venceEn: '2027-01-01T00:00:00Z' },
    ],
    new Date('2026-06-01T00:00:00Z'),
  )
  assert.deepEqual(candidatos.map((c) => c.id), ['a'])
})

test('una fecha ilegible NO se trata como vencida', () => {
  const candidatos = candidatosPorRetencion([{ id: 'x', venceEn: 'ayer por la tarde' }], new Date())
  assert.deepEqual(candidatos, [], 'ante la duda no se propone borrar nada')
})

test('el modulo no expone ninguna funcion que borre', async () => {
  // El patron exige frontera de palabra —`(?![a-z])`— y no es cosmetico: la primera version cazaba
  // `borradorDeLote`, que es un BORRADOR de titulo y no borra nada. Una guarda con falsos
  // positivos se acaba relajando entera para que pase, y entonces deja de guardar.
  const modulo = (await import('../dist/react/pantallas.js')) as Record<string, unknown>
  const borradoras = Object.keys(modulo).filter((n) => /^(borra|elimina|purga|suprime)(?![a-z])/.test(n))
  assert.deepEqual(borradoras, [], `hay funciones que podrian borrar: ${borradoras.join(', ')}`)
})

// --- Lote cerrado ---------------------------------------------------------------------------------------

test('un lote cerrado no admite mas documentos', () => {
  const lote = { estado: 'cerrado' } as unknown as Lote
  assert.equal(admiteMasDocumentos(lote), false)
})

test('uno abierto si', () => {
  assert.equal(admiteMasDocumentos({ estado: 'abierto' } as unknown as Lote), true)
})
