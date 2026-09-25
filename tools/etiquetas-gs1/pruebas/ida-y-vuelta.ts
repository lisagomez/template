/**
 * Ida y vuelta: una etiqueta, dos salidas, tres lecturas que tienen que coincidir.
 *
 *   cadena → SVG (bwip-js) → Chromium la rasteriza → zxing la decodifica
 *   cadena → ZPL (^BC modo D) → zebrash la dibuja como una Zebra → zxing la decodifica
 *
 * Todo LOCAL: ni el ZPL ni la imagen salen de la maquina (Labelary no se usa aqui, C4). Se
 * imprime la tabla de casos para dejar evidencia. Si falta Chromium, la prueba se salta
 * diciendolo; si falta zebrash o zxing, falla (son dependencias del repo).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import bwipjs from 'bwip-js/node'
import type { Browser } from 'playwright'
import { zplToBase64Async } from 'zpl-renderer-js'
import * as zxing from 'zxing-wasm/reader'
import {
  aTransmitida, aZpl, codigosDe, disenaDesdeDatos, disenaEtiqueta, esErrorLectura, lineasLegibles, mismosElementos,
  parseaLectura, PERFIL_EJEMPLO, type DatosEtiqueta, type Diseno, type PerfilImpresora, type Simbolo,
} from '../dist/index.js'
import { aSvg } from '../dist/svg.js'

const wasm = await readFile(fileURLToPath(import.meta.resolve('zxing-wasm/reader/zxing_reader.wasm')))
zxing.prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer }, fireImmediately: true })

interface Lectura { texto: string; simbologia: string; x0: number; x1: number; y: number }

interface Punto { x: number; y: number }
interface ResultadoZxing { isValid: boolean; text: string; symbologyIdentifier: string; position: { topLeft: Punto; topRight: Punto; bottomLeft: Punto; bottomRight: Punto } }

async function decodifica(png: Uint8Array): Promise<Lectura[]> {
  const r = (await zxing.readBarcodes(png, { formats: ['Code128'], tryHarder: true, textMode: 'Plain', maxNumberOfSymbols: 8 })) as unknown as ResultadoZxing[]
  return r.filter((x) => x.isValid).map((x) => ({
    texto: x.text, simbologia: x.symbologyIdentifier,
    x0: Math.min(x.position.topLeft.x, x.position.bottomLeft.x), x1: Math.max(x.position.topRight.x, x.position.bottomRight.x), y: x.position.topLeft.y,
  })).sort((a: Lectura, b: Lectura) => a.y - b.y)
}

let navegador: Browser | undefined
try {
  const { chromium } = await import('playwright')
  navegador = await chromium.launch()
} catch { navegador = undefined }

async function rasterizaSvg(svg: string, d: Diseno): Promise<Uint8Array> {
  const pagina = await navegador!.newPage({ viewport: { width: d.ancho + 40, height: d.alto + 40 } })
  await pagina.setContent(`<html><body style="margin:20px;background:#fff">${svg}</body></html>`)
  const png = await pagina.locator('svg').first().screenshot()
  await pagina.close()
  return png
}

const dpmm = (dpi: number) => Math.round(dpi / 25.4)
const p203: PerfilImpresora = { ...PERFIL_EJEMPLO, altoMm: 76.2 }
const p300: PerfilImpresora = { ...PERFIL_EJEMPLO, dpi: 300, altoMm: 76.2 }
const tarima: PerfilImpresora = { ...PERFIL_EJEMPLO, altoMm: 152.4 }

const CASOS: { nombre: string; perfil: PerfilImpresora; datos?: DatosEtiqueta; simbolos?: Simbolo[] }[] = [
  { nombre: 'caja 203 dpi', perfil: p203, datos: { tipo: 'caja', producto: 'Yogurt natural 1 kg', gtin: '09521234000020', caducidad: '2026-10-30', lote: 'L4471' } },
  { nombre: 'caja 300 dpi, DD=00', perfil: p300, datos: { tipo: 'caja', producto: 'Atún en agua 140 g', gtin: '19521234000027', caducidad: '2028-02-01', diaCero: true, lote: 'AT-2291/B' } },
  { nombre: 'caja, lote numérico impar', perfil: p203, datos: { tipo: 'caja', producto: 'Pan de caja', gtin: '09520123456788', caducidad: '2026-10-02', lote: '123' } },
  { nombre: 'tarima (2 códigos)', perfil: tarima, datos: { tipo: 'tarima', producto: 'Yogurt natural 1 kg', sscc: '095212340005678903', gtinContenido: '09521234000020', cantidad: 50, caducidad: '2026-10-30', lote: 'L4471' } },
  { nombre: 'libre (01)(15)(10) signos', perfil: p203, simbolos: [[{ ai: '01', valor: '09524000059109' }, { ai: '15', valor: '270115' }, { ai: '10', valor: "X.1-2/3+4*5=6?_%&'" }]] },
]

test('ida y vuelta: SVG y ZPL decodifican a la misma cadena GS1 que los origino', { skip: navegador ? false : 'Chromium de Playwright no esta instalado (npx playwright install chromium)' }, async () => {
  const tabla: string[] = ['| caso | código | cadena de origen | SVG→zxing | ZPL→zebrash→zxing | ancho previsto / zebrash (puntos) |', '|---|---|---|---|---|---|']
  try {
    for (const caso of CASOS) {
      const diseno = caso.datos
        ? disenaDesdeDatos(caso.datos, caso.perfil, 2026)
        : disenaEtiqueta({ simbolos: caso.simbolos!, titulo: 'Libre', lineas: lineasLegibles(caso.simbolos!, 2026), unidad: 'caja' }, caso.perfil)
      const codigos = codigosDe(diseno)
      const svgPng = await rasterizaSvg(aSvg(diseno, bwipjs), diseno)
      const zpl = aZpl(diseno, caso.perfil)
      const zplPng = Buffer.from(await zplToBase64Async(zpl, caso.perfil.anchoMm, caso.perfil.altoMm, dpmm(caso.perfil.dpi)), 'base64')
      const deSvg = await decodifica(svgPng)
      const deZpl = await decodifica(zplPng)
      assert.equal(deSvg.length, codigos.length, `${caso.nombre}: el SVG debia dar ${codigos.length} codigos`)
      assert.equal(deZpl.length, codigos.length, `${caso.nombre}: el ZPL debia dar ${codigos.length} codigos`)
      codigos.forEach((c, i) => {
        const esperado = aTransmitida(c.simbolo, false)
        for (const [fuente, lecturas] of [['SVG', deSvg], ['ZPL', deZpl]] as const) {
          const l = lecturas[i]!
          assert.equal(l.simbologia, ']C1', `${caso.nombre} ${fuente}: sin ]C1 no es GS1-128`)
          assert.equal(l.texto, esperado, `${caso.nombre} ${fuente}`)
          const p = parseaLectura(l.simbologia + l.texto)
          assert.ok(!esErrorLectura(p) && mismosElementos(p.elementos, c.simbolo), `${caso.nombre} ${fuente}: parseo`)
        }
        // zebrash dibuja a 1 pixel por punto: el ancho de sus barras debe ser el que la revision
        // uso para decidir si cabe (tolerancia: el modulo del borde que zxing no cuenta).
        const anchoZebrash = Math.round(deZpl[i]!.x1 - deZpl[i]!.x0)
        const previsto = diseno.medidas[i]!.anchoPuntos
        assert.ok(Math.abs(anchoZebrash - previsto) <= 2 * c.puntosPorModulo, `${caso.nombre}: ancho ${anchoZebrash} vs ${previsto}`)
        const ver = (s: string) => s.replace(/\x1d/g, '<GS>')
        tabla.push(`| ${caso.nombre} | ${i + 1} | \`${ver(']C1' + esperado)}\` | \`${ver(deSvg[i]!.simbologia + deSvg[i]!.texto)}\` ✓ | \`${ver(deZpl[i]!.simbologia + deZpl[i]!.texto)}\` ✓ | ${previsto} / ${anchoZebrash} |`)
      })
    }
  } finally {
    await navegador?.close()
  }
  console.log('\n' + tabla.join('\n') + '\n')
})
