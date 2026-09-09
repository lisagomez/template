import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  encola, marcaSincronizada, marcaFallida, esperaAntesDeReintentar, desfaseDeReloj, avisoDeCola,
} from '../dist/cola.js'
import { identidadDeLectura } from '../dist/identidad.js'
import type { LecturaDeCodigo } from '../dist/identidad.js'

const lectura = (instante: string): LecturaDeCodigo => ({
  clase: 'evento', carga: '449044304130', instanteDispositivo: instante, puesto: 'muelle-1',
})

/**
 * LA prueba de la cola. Si el instante se sellara al sincronizar, varios eventos encolados sin
 * conexion y enviados a la vez compartirian instante y **se deduplicarian entre si**: la trazabilidad
 * de toda una manana desapareceria al recuperar la cobertura.
 */
test('el instante se sella al escanear, no al sincronizar', async () => {
  const a = encola('1', lectura('2026-09-07T08:00:00.000Z'))
  const b = encola('2', lectura('2026-09-07T11:45:00.000Z'))

  // Las dos se sincronizan en el MISMO instante de servidor, como pasa al recuperar cobertura.
  const llegada = '2026-09-07T12:00:00.000Z'
  const aSync = marcaSincronizada(a, llegada)
  const bSync = marcaSincronizada(b, llegada)

  assert.equal(aSync.lectura.instanteDispositivo, '2026-09-07T08:00:00.000Z', 'el instante del hecho sobrevive')
  assert.notEqual(
    await identidadDeLectura(aSync.lectura),
    await identidadDeLectura(bSync.lectura),
    'dos eventos sincronizados a la vez NO pueden colapsar en una sola identidad',
  )
})

test('una lectura sin instante de dispositivo no se puede encolar', () => {
  assert.throws(() => encola('x', { ...lectura('2026-09-07T08:00:00.000Z'), instanteDispositivo: '' }), /orden de los hechos/)
})

test('nace pendiente, se marca sincronizada, y el fallo cuenta intentos', () => {
  const e = encola('1', lectura('2026-09-07T08:00:00.000Z'))
  assert.equal(e.estado, 'pendiente')
  assert.equal(e.instanteServidor, null)

  assert.equal(marcaSincronizada(e, '2026-09-07T09:00:00.000Z').estado, 'sincronizada')

  const fallida = marcaFallida(e, 'sin red')
  assert.equal(fallida.estado, 'fallida')
  assert.equal(fallida.intentos, 1)
  assert.equal(marcaFallida(fallida, 'sin red').intentos, 2)
  assert.equal(e.intentos, 0, 'no muta la entrada original')
})

test('el retroceso crece pero tiene tope', () => {
  assert.equal(esperaAntesDeReintentar(0), 1000)
  assert.equal(esperaAntesDeReintentar(3), 8000)
  assert.equal(esperaAntesDeReintentar(50), 300_000, 'sin tope, una cola grande se reintenta sola para siempre')
  assert.throws(() => esperaAntesDeReintentar(-1), RangeError)
})

test('el desfase de reloj se mide, porque el reloj del movil puede estar mal', () => {
  const e = encola('1', lectura('2026-09-07T08:00:00.000Z'))
  assert.equal(desfaseDeReloj(e), null, 'sin sincronizar no hay desfase que medir')
  assert.equal(desfaseDeReloj(marcaSincronizada(e, '2026-09-07T08:00:05.000Z')), 5000)
})

/**
 * iOS purga el almacenamiento a los 7 dias de no usarse y **exime a las apps instaladas en la
 * pantalla de inicio**. Sin instalar, una cola pendiente puede borrarse sola y los eventos se
 * pierden sin ningun error. El usuario no puede saberlo: hay que decirselo.
 */
test('con cola pendiente y app SIN instalar, se avisa del riesgo de purga', () => {
  const a = avisoDeCola(12, false)
  assert.equal(a.riesgoDePurga, true)
  assert.match(a.mensaje, /pantalla de inicio/)
  assert.match(a.mensaje, /12/)
})

test('instalada, hay cola pero no hay riesgo de purga', () => {
  const a = avisoDeCola(12, true)
  assert.equal(a.riesgoDePurga, false)
  assert.doesNotMatch(a.mensaje, /pantalla de inicio/)
})

test('sin cola no se avisa de nada, ni siquiera sin instalar', () => {
  assert.equal(avisoDeCola(0, false).riesgoDePurga, false)
  assert.match(avisoDeCola(0, true).mensaje, /Todo enviado/)
})
