/**
 * Mira una pantalla de Ágora como la vería una persona del laboratorio: abre la ruta, espera a la red, opcionalmente
 * desplaza el panel (`DESPLAZA=<px>`, el contenido vive en un contenedor con scroll, no en la página) y guarda la
 * captura. Dice en qué ventana y módulo cayó y los errores de consola. Solo laboratorio, en localhost.
 */
import { chromium } from 'playwright'
const [url, archivo] = process.argv.slice(2)
const nav = await chromium.launch()
const c = await nav.newContext({ viewport: { width: Number(process.env.ANCHO ?? 1440), height: Number(process.env.ALTO ?? 900) }, locale: 'es-MX' })
await c.addInitScript(() => { try { localStorage.setItem('capa:agora:capa/agora/golfo-norte/capa/primer-arranque', JSON.stringify({ version: 1, terminado: true, paso: 5, nivel: 'lo-importante', voz: false })) } catch {} })
const p = await c.newPage()
const errores: string[] = []
p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
p.on('pageerror', (e) => errores.push(String(e)))
await p.goto(url!, { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)
const px = Number(process.env.DESPLAZA ?? 0)
if (px) {
  await p.evaluate((y) => {
    const x = document.querySelector('[data-agora-pantalla], [data-agora-agentes], main')
    for (let e: Element | null = x; e; e = e.parentElement) if (e.scrollHeight > e.clientHeight + 4 && getComputedStyle(e).overflowY !== 'visible') { e.scrollTop = y; return }
  }, px)
  await p.waitForTimeout(400)
}
await p.screenshot({ path: archivo!, fullPage: process.env.COMPLETA === '1' })
console.log(JSON.stringify({ ventana: await p.locator('[data-capa-ventana]').getAttribute('data-capa-ventana').catch(() => null), modulo: await p.locator('[data-capa-ventana]').getAttribute('data-capa-modulo').catch(() => null), arbol: await p.locator('[data-agora-arbol]').count(), errores }, null, 1))
await nav.close()
