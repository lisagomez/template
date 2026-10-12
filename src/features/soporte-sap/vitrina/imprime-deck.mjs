#!/usr/bin/env node
/**
 * Imprime el deck de la vitrina a PDF, una lámina por página de 1280 × 720, con el mismo navegador que el recorrido.
 * El PDF es lo que se lleva una consultora: sale de la página, no se maqueta aparte.
 *
 * Uso: node src/features/soporte-sap/vitrina/imprime-deck.mjs http://localhost:3012
 */
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const [base = 'http://localhost:3012'] = process.argv.slice(2)
const SALIDA = resolve('public/vitrina/soporte-sap/soporte-sap-deck.pdf')
const navegador = await chromium.launch()
const pagina = await navegador.newPage({ viewport: { width: 1280, height: 720 } })
await pagina.goto(`${base}/vitrina/soporte-sap/deck`, { waitUntil: 'load' })
// Las capturas tienen que estar cargadas antes de imprimir: si no, el PDF sale con huecos. Next las carga en diferido
// (`loading="lazy"`), y las de abajo no llegan nunca sin pasar por ellas: se piden ya, y se espera con tope.
await pagina.evaluate(() => { for (const i of document.images) i.loading = 'eager' })
await pagina.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 60_000 })
await pagina.emulateMedia({ media: 'print' })
const laminas = await pagina.locator('[data-lamina]').count()
await pagina.pdf({ path: SALIDA, width: '1280px', height: '720px', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
await navegador.close()
console.log(`✓ ${laminas} láminas → ${SALIDA}`)
