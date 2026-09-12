import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { lectorZxing } from '../dist/lectores/zxing.js'
import type { ModuloZxing } from '../dist/lectores/zxing.js'
import { analizaCarga } from '../dist/codigos.js'

const fixture = (nombre: string): Uint8Array => new Uint8Array(readFileSync(new URL(`./fixtures/qr/${nombre}.png`, import.meta.url)))

// --- Con un modulo de mentira: el contrato del adaptador, sin el peer -------------------------

test('no carga el modulo al construir, lo carga UNA vez, filtra invalidos y vacios, y pasa los formatos', async () => {
  let cargas = 0
  let formatosPedidos: readonly string[] | undefined
  const falso: ModuloZxing = {
    prepareZXingModule: () => undefined,
    readBarcodes: async (_img, opciones) => {
      formatosPedidos = opciones?.formats
      return [
        { text: 'https://siat.sat.gob.mx/x/validadorqr.jsf?D1=1&D2=1&D3=1_SAT970701NN3', format: 'QRCode', isValid: true },
        { text: 'basura', format: 'QRCode', isValid: false },
        { text: '', format: 'Code128', isValid: true },
      ]
    },
  }
  const lector = lectorZxing({ formatos: ['QRCode'], carga: async () => { cargas++; return falso }, wasm: async () => new ArrayBuffer(0) })
  assert.equal(lector.cargado(), false)
  const a = await lector.lee(new Uint8Array([1]))
  const b = await lector.lee(new Uint8Array([2]))
  assert.equal(cargas, 1)
  assert.equal(lector.cargado(), true)
  assert.deepEqual(a, ['https://siat.sat.gob.mx/x/validadorqr.jsf?D1=1&D2=1&D3=1_SAT970701NN3'])
  assert.deepEqual(b, a)
  assert.deepEqual(formatosPedidos, ['QRCode'])
})

// --- Con zxing-wasm de verdad, si esta instalado: y SIN red ----------------------------------

let peerDisponible = true
try {
  await import('zxing-wasm/reader')
} catch {
  peerDisponible = false
}

test('lee los fixtures sinteticos sin tocar la red: csf, curp, otro tipo, sin codigo y dos codigos', { skip: peerDisponible ? false : 'zxing-wasm no esta instalado (peer opcional)' }, async () => {
  const fetchOriginal = globalThis.fetch
  globalThis.fetch = (() => { throw new Error('la red no se toca: el wasm sale del paquete instalado') }) as typeof fetch
  try {
    const lector = lectorZxing()
    const csf = await lector.lee(fixture('csf-corta'))
    assert.equal(csf.length, 1)
    assert.equal(analizaCarga(csf[0]).tipo, 'csf')
    assert.equal(analizaCarga((await lector.lee(fixture('csf-larga')))[0]).tipo, 'csf')
    assert.equal(analizaCarga((await lector.lee(fixture('curp-pipes')))[0]).tipo, 'curp')
    assert.equal(analizaCarga((await lector.lee(fixture('curp-etiquetas')))[0]).tipo, 'curp')
    assert.equal(analizaCarga((await lector.lee(fixture('otro-tipo')))[0]).tipo, 'url')
    assert.deepEqual(await lector.lee(fixture('sin-qr')), [], 'una pagina sin codigo devuelve vacio, no lanza')
    const dos = await lector.lee(fixture('dos-qr'))
    assert.equal(dos.length, 2)
    assert.deepEqual(dos.map((c) => analizaCarga(c).tipo).sort(), ['csf', 'curp'])
  } finally {
    globalThis.fetch = fetchOriginal
  }
})
