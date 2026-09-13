#!/usr/bin/env node
/**
 * Pruebas del formato de trayectoria y de la captura en la linea de aplicacion (spec 011).
 * `node --test scripts/prueba-trayectorias.ts`. Sin red, sin disco, sin base de datos.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validaTrayectoria, cobertura, idDe } from './trayectorias/formato.mjs'
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
  const conCaso = buena(); conCaso.avisos = ['fallo el caso T7']
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
