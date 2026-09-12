import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { motorPorProceso } from '../dist/motores/proceso-local.js'

const PROCESO = fileURLToPath(new URL('./fixtures/proceso/proceso.mjs', import.meta.url))
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

const motor = (modo: string, espera = 5000) =>
  motorPorProceso({ comando: process.execPath, argumentos: [PROCESO], modelo: 'proceso-de-prueba-1', entorno: { MODO: modo }, milisegundosDeEspera: espera })

test('escribe la imagen en un temporal, el proceso la ve, la respuesta pasa por validaPaginas y el temporal desaparece', async () => {
  let uso: unknown = 'no-se-llamo'
  const paginas = await motor('bien').extrae(JPEG, { alConsumirTokens: (u) => { uso = u } })
  assert.equal(paginas.length, 1)
  const dir = /dir=(\S+)/.exec(paginas[0].markdown)?.[1]
  assert.ok(dir !== undefined && dir.includes('extractor-'))
  assert.match(paginas[0].markdown, /imagen=true/, 'la imagen existia mientras corria el proceso')
  assert.match(paginas[0].markdown, /mime=image\/jpeg/)
  assert.equal(existsSync(dir), false, 'el documento no se queda en disco')
  assert.equal(paginas[0].confianza, 0.8, 'la confianza de pagina declarada por el motor viaja')
  assert.equal(paginas[0].campos[0].procedencia, 'ocr')
  assert.equal(uso, null, 'un proceso local no declara tokens: null, no cero')
})

test('una confianza de pagina que no es numero en [0,1] se descarta, sin romper', async () => {
  const [pagina] = await motor('confianza-en-texto').extrae(JPEG)
  assert.equal(pagina.confianza, undefined)
})

test('stdout que no es JSON: error que NO incluye el stdout', async () => {
  await assert.rejects(motor('basura').extrae(JPEG), (e: Error) => /no es JSON valido/.test(e.message) && !/esto no es json/.test(e.message))
})

test('exit distinto de 0: solo el codigo y la linea de stderr con prefijo extractor:, nunca el resto', async () => {
  await assert.rejects(motor('falla').extrae(JPEG), (e: Error) =>
    /codigo 2/.test(e.message) && /falta el idioma spa/.test(e.message) && !/TRAZA/.test(e.message))
  await assert.rejects(motor('falla-sin-prefijo').extrae(JPEG), (e: Error) => /codigo 3/.test(e.message) && !/SECRETO/.test(e.message))
})

test('un proceso colgado se mata al vencer la espera, y el temporal desaparece igual', async () => {
  let dirVisto: string | undefined
  const m = motorPorProceso({
    comando: process.execPath, argumentos: [PROCESO], modelo: 'proceso-de-prueba-1', entorno: { MODO: 'cuelga' }, milisegundosDeEspera: 300,
    ejecuta: async (comando, argumentos, opciones) => {
      dirVisto = argumentos[argumentos.length - 1].replace(/\/peticion\.json$/, '')
      assert.ok(existsSync(dirVisto))
      void comando
      return new Promise((resuelve) => setTimeout(() => resuelve({ codigo: null, stdout: '', stderr: '', cortado: true }), opciones.milisegundosDeEspera))
    },
  })
  await assert.rejects(m.extrae(JPEG), /se corto a los 300 ms/)
  assert.ok(dirVisto !== undefined && !existsSync(dirVisto), 'tras el corte, el temporal tambien se borra')
})

test('el cuelgue real (sin ejecutor inyectado) tambien se corta por SIGKILL', async () => {
  const t0 = Date.now()
  await assert.rejects(motor('cuelga', 400).extrae(JPEG), /se corto a los 400 ms/)
  assert.ok(Date.now() - t0 < 5000, 'no espero a los 10 minutos del proceso')
})

test('un modelo con alias autoactualizable se rechaza al construir, y el tope de bytes antes de escribir nada', async () => {
  assert.throws(() => motorPorProceso({ comando: 'x', modelo: 'tesseract:latest' }), /C1/)
  const m = motorPorProceso({ comando: 'x', modelo: 'tesseract-5.5.0-spa-1', limites: { bytesMaximos: 4 } })
  await assert.rejects(m.extrae(JPEG), /topa en 4/)
})
