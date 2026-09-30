#!/usr/bin/env node
/**
 * Pruebas del formato de trayectoria, de la captura en la linea de aplicacion y de como el informe
 * junta un periodo (spec 011).
 * `node --test scripts/prueba-trayectorias.ts`. Sin red, sin disco, sin base de datos.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validaTrayectoria, cobertura, idDe } from './trayectorias/formato.mjs'
import { metricasDe, agrega, razon } from './trayectorias/metricas.mjs'
import { trayectoriaDeUso, conTrayectoria, type Trayectoria } from '../src/lib/ai/trayectorias.ts'
import { registraUso, type EventoDeUso, type Registrador } from '../src/lib/ai/contabilidad.ts'

const buena = (): Record<string, unknown> => ({
  version: 1, id: idDe('fabrica', 'sesion-1'), linea: 'fabrica',
  origen: { tipo: 'sesion', referencia: 'abcd1234' }, cuando: { inicio: '2026-09-13T10:00:00.000Z', fin: '2026-09-13T11:00:00.000Z' },
  actor: { skills: ['goal-compiler'] }, modelos: { 'claude-opus-5': 12 },
  acciones: { herramientas: { Bash: 40, Read: 3 }, llamadasAlModelo: 12, turnos: 4 },
  uso: { entrada: 1000, salida: 500, cacheLectura: 90000 }, costoUsd: 0.12,
  tiempos: { totalMs: 3600000 }, gates: [{ nombre: 'validate', resultado: 'verde', veces: 1 }],
  resultado: { errores: 2 }, cobertura: cobertura([]),
})

test('una trayectoria de forma pasa; el id es estable y corto', () => {
  assert.deepEqual(validaTrayectoria(buena()), [])
  assert.equal(idDe('fabrica', 'x'), idDe('fabrica', 'x'))
  assert.match(idDe('herramientas', 'y'), /^herramientas-[0-9a-f]{8}$/)
})

test('RECHAZA un valor de documento: RFC, CURP o correo en cualquier cadena', () => {
  for (const valor of ['AAA010101AA1', 'DUZG290613MQTCPQD9', 'persona@dominio.mx']) {
    const t = buena(); t.avisos = [valor]
    assert.ok(validaTrayectoria(t).some((e) => /forma de (RFC|CURP|correo)/.test(e)), valor)
  }
  const t = buena(); (t.actor as { skills: string[] }).skills = ['leyo el RFC AAA010101AA1 del empleado']
  assert.ok(validaTrayectoria(t).some((e) => /RFC/.test(e)))
})

test('RECHAZA algo con forma de secreto, y una ruta de maquina', () => {
  for (const valor of ['sk-abcdefghijklmnopqrstuv', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', 'OPENROUTER_API_KEY=sk-or-v1-xxxxxxxx', '/home/alguien/proyecto']) {
    const t = buena(); t.avisos = [valor]
    assert.ok(validaTrayectoria(t).length > 0, valor)
  }
})

test('RECHAZA un identificador de caso del corpus de regresion, y texto largo o con saltos de linea', () => {
  // El identificador se CONSTRUYE: escrito literal, el verificador de gobernanza lo cazaria en este archivo.
  const conCaso = buena(); conCaso.avisos = [`fallo el caso ${'T'}${3 + 4}`]
  assert.ok(validaTrayectoria(conCaso).some((e) => /identificador de caso/.test(e)))
  const largo = buena(); largo.avisos = ['x'.repeat(81)]
  assert.ok(validaTrayectoria(largo).some((e) => /caracteres/.test(e)))
  const salto = buena(); salto.avisos = ['linea 1\nlinea 2']
  assert.ok(validaTrayectoria(salto).some((e) => /saltos de linea/.test(e)))
})

test('RECHAZA claves no admitidas: un campo libre es por donde se cuela el contenido', () => {
  const t = buena(); t.prompt = 'hola'
  assert.ok(validaTrayectoria(t).some((e) => /clave no admitida "prompt"/.test(e)))
  const anidado = buena(); (anidado.resultado as Record<string, unknown>).texto = 'x'
  assert.ok(validaTrayectoria(anidado).some((e) => /resultado: clave no admitida/.test(e)))
})

test('ACEPTA coste null sin uso, con la cobertura declarandolo; y rechaza un coste con uso null', () => {
  const sinUso = buena(); sinUso.uso = null; sinUso.costoUsd = null; sinUso.cobertura = cobertura(['uso'])
  assert.deepEqual(validaTrayectoria(sinUso), [])
  const inventado = buena(); inventado.uso = null; inventado.costoUsd = 0; inventado.cobertura = cobertura(['uso'])
  assert.ok(validaTrayectoria(inventado).some((e) => /nunca estimado/.test(e)))
  const callado = buena(); callado.uso = null; callado.costoUsd = null; callado.cobertura = cobertura([])
  assert.ok(validaTrayectoria(callado).some((e) => /declarar "uso"/.test(e)))
})

// --- Linea de aplicacion --------------------------------------------------------------------------

test('cada llamada registrada emite una trayectoria valida, y sin uso va con coste null y cobertura incompleta', async () => {
  const guardados: EventoDeUso[] = []
  const base: Registrador = {
    async guarda(e) { guardados.push(e) },
    async resumen() { return { gastadoUsd: guardados.reduce((a, e) => a + (e.costoUsd ?? 0), 0), filasSinCosto: guardados.filter((e) => e.costoUsd === null).length } },
  }
  const emitidas: Trayectoria[] = []
  const registrador = conTrayectoria(base, { async emite(t) { emitidas.push(t) } }, () => ({ feature: 'chat', duracionMs: 850 }))
  await registraUso(registrador, 'implementar-feature', { entrada: 1200, salida: 300, cacheados: 1000 })
  await registraUso(registrador, 'implementar-feature', null)
  assert.equal(guardados.length, 2, 'la contabilidad no cambia')
  assert.equal(emitidas.length, 2, 'cada llamada emite una trayectoria')
  for (const t of emitidas) assert.deepEqual(validaTrayectoria(t), [], JSON.stringify(t))
  assert.equal(emitidas[0].costoUsd, guardados[0].costoUsd)
  assert.equal(emitidas[0].uso?.cacheLectura, 1000)
  assert.equal(emitidas[1].uso, null)
  assert.equal(emitidas[1].costoUsd, null)
  assert.ok(emitidas[1].cobertura.faltan.includes('uso'))
  assert.equal((await registrador.resumen()).filasSinCosto, 1, 'el resumen sigue declarando filas sin costo')
  assert.equal(emitidas[0].actor.feature, 'chat')
  assert.ok(!JSON.stringify(emitidas).includes('prompt'))
})

test('sin duracion medida, tiempos.totalMs es null y se declara; con fallo, errores=1', () => {
  const evento: EventoDeUso = { tarea: 'implementar-feature', modelo: 'anthropic/claude-sonnet-5', uso: { entrada: 1, salida: 1 }, costoUsd: 0.000005, cuando: '2026-09-13T12:00:00.000Z' }
  const t = trayectoriaDeUso(evento, { fallo: true })
  assert.equal(t.tiempos.totalMs, null)
  assert.ok(t.cobertura.faltan.includes('tiempos'))
  assert.equal(t.resultado.errores, 1)
  assert.deepEqual(validaTrayectoria(t), [])
})

test('la trayectoria que emite `dictado dictar` pasa el validador del template (forma, sin contenido)', async () => {
  const { construyeTrayectoria, creaContadores } = await import('../tools/dictado/dist/node/trayectoria.js')
  const c = creaContadores()
  c.turnos = 2; c.pegados = 2; c.latenciasMs.push(800, 950); c.msMotor.push(220, 260); c.msPegado.push(30, 28); c.duracionesMs.push(3000, 4200); c.picosDb.push(-15)
  const t = construyeTrayectoria(c, { motorId: 'sherpa:nemo-parakeet-tdt-0.6b-v3-int8', modo: 'manosLibres', silencioMs: 1000, gananciaDb: 0, umbralVozDb: -45, inicio: new Date('2026-09-20T10:00:00Z'), fin: new Date('2026-09-20T10:01:00Z') })
  assert.deepEqual(validaTrayectoria(t), [])
  assert.equal((t as { linea: string }).linea, 'herramientas')
})

/** Una sesion de la fabrica con `errores` sobre `usos` herramientas. */
const sesion = (errores: number, usos: number) => ({ ...buena(), acciones: { herramientas: { Bash: usos }, llamadasAlModelo: 10, turnos: 1 }, resultado: { errores } })
const errores = (...ss: ReturnType<typeof sesion>[]) => agrega(ss.map((t) => metricasDe(t).erroresPorHerramienta))

test('una tasa del periodo es total ÷ total: una sesion corta no pesa lo mismo que una larga', () => {
  assert.equal(errores(sesion(7, 47), sesion(9, 2000)), 16 / 2047)
  assert.notEqual(errores(sesion(7, 47), sesion(9, 2000)), (7 / 47 + 9 / 2000) / 2, 'la media de tasas es la que fabricaba la regresion')
})

test('el caso del 2026-09-30: la media de tasas subia y el agregado bajaba; el informe sigue al agregado', () => {
  const antes = [sesion(28, 1000), sesion(28, 1000), sesion(28, 1000)]
  const despues = [sesion(7, 47), sesion(5, 49), sesion(40, 2000), sesion(40, 2000)]
  const mediaDeTasas = (ss: ReturnType<typeof sesion>[]) => ss.reduce((a, t) => a + t.resultado.errores / t.acciones.herramientas.Bash, 0) / ss.length
  assert.ok(mediaDeTasas(despues) > mediaDeTasas(antes) * 1.2, 'la trampa: con la media saldria regresion')
  assert.ok((errores(...despues) as number) < (errores(...antes) as number), 'con el agregado no la hay')
})

test('los huecos no entran como ceros: sin denominador la tasa es null, y un periodo sin datos da null', () => {
  assert.equal(metricasDe(sesion(0, 0)).erroresPorHerramienta, null)
  assert.equal(razon(null, 10), null)
  assert.equal(agrega([null, razon(1, 4), null]), 0.25)
  assert.equal(agrega([null, null]), null)
  assert.equal(agrega([]), null)
})

test('los valores sueltos siguen siendo media, y mezclarlos con razones es un error, no un numero', () => {
  assert.equal(agrega([0.5, 1]), 0.75)
  assert.throws(() => agrega([0.5, razon(1, 2)]), /mezclad/)
})

