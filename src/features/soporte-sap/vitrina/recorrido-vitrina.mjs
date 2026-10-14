#!/usr/bin/env node
/**
 * El recorrido de la vitrina con Playwright: una captura por paso, cada una con su comprobación, y los errores de consola
 * contados. Corre igual contra la máquina del laboratorio que contra Vercel; detrás de la protección de Vercel entra con
 * el bypass de automatización (`VERCEL_AUTOMATION_BYPASS_SECRET`, que se lee del entorno y no se imprime).
 *
 * Uso: node src/features/soporte-sap/vitrina/recorrido-vitrina.mjs <base> <carpeta> [--apagado]
 *   --apagado: la máquina del laboratorio está apagada; se comprueba el aviso en vez de actuar en vivo.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const [base, carpeta = 'capturas-vitrina'] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const APAGADO = process.argv.includes('--apagado')
if (!base) { console.error('uso: recorrido-vitrina.mjs <base> <carpeta> [--apagado]'); process.exit(2) }
mkdirSync(carpeta, { recursive: true })
const R = '/vitrina/soporte-sap'
const bypass = process.env['VERCEL_AUTOMATION_BYPASS_SECRET']
const cabeceras = bypass ? { 'x-vercel-protection-bypass': bypass, 'x-vercel-set-bypass-cookie': 'true' } : {}

const navegador = await chromium.launch()
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: cabeceras })
const pagina = await contexto.newPage()
const errores = []
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
pagina.on('pageerror', (e) => errores.push(e.message))
const pasos = []
const sel = (p) => `[data-prueba="${p}"]`
const texto = async (s) => (await pagina.locator(s).allInnerTexts()).join('\n')

async function captura(id, que, comprueba, foco = null) {
  const archivo = join(carpeta, `${id}.jpg`)
  const ok = comprueba ? await comprueba().catch(() => false) : true
  if (foco) await pagina.locator(foco).first().screenshot({ path: archivo, type: 'jpeg', quality: 70 })
  else await pagina.screenshot({ path: archivo, type: 'jpeg', quality: 70, fullPage: false })
  pasos.push({ id, que, ok })
  console.log(`${ok ? '✓' : '✗'} ${id} · ${que} → ${archivo}`)
}
const ve = (ruta) => pagina.goto(`${base}${ruta}`, { waitUntil: 'load' })

async function vitrina() {
  await ve(R)
  await captura('01-inicio', 'el inicio de la vitrina, con el aviso de datos sintéticos', async () => (await pagina.locator(sel('portada')).count()) === 1 && /sintéticos/.test(await texto(sel('aviso-sintetico'))))
  await ve(`${R}/niveles?rol=cliente&momento=03-aprueba`)
  await pagina.waitForSelector(sel('vista-cliente'))
  await captura('02-nivel-n3', 'la vista del cliente (N3), congelada y de solo lectura', async () => /Tus incidencias/i.test(await texto(sel('vista-cliente'))) && await pagina.locator(`${sel('levantar')}`).isDisabled())
  await pagina.click(sel('rol-consultor')); await pagina.waitForSelector(sel('vista-consultor'))
  await captura('03-nivel-n2', 'la vista de la consultora (N2)', async () => /Bandeja de la consultora/i.test(await texto(sel('vista-consultor'))))
  await pagina.click(sel('rol-superadmin')); await pagina.waitForSelector(sel('vista-superadmin'))
  await captura('04-nivel-n1', 'la vista del laboratorio (N1)', async () => /Todas las consultoras/i.test(await texto(sel('vista-superadmin'))))
  await ve(`${R}/journey`)
  await captura('05-journey', 'el journey: el mapa de carriles y sus pasos', async () => (await pagina.locator('[data-prueba^="paso-"]').count()) === 21 && (await pagina.locator(sel('mapa-journey')).count()) === 1)
  await ve(`${R}/deck`)
  await pagina.locator('[data-lamina]').nth(10).scrollIntoViewIfNeeded()
  const pdf = await pagina.request.get(`${base}${R}/soporte-sap-deck.pdf`)
  await captura('06-deck', 'una lámina del deck, y su PDF se descarga', async () => (await pagina.locator('[data-lamina]').count()) === 13 && pdf.status() === 200 && /application\/pdf/.test(pdf.headers()['content-type'] ?? ''), '[data-lamina] >> nth=10')
  await ve(`${R}/manual`)
  for (const [id, rol] of [['07-manual-n3', 'cliente'], ['08-manual-n2', 'consultor'], ['09-manual-n1', 'laboratorio']]) {
    await captura(id, `el manual del rol ${rol}`, async () => (await pagina.locator(`${sel(`manual-${rol}`)} article`).count()) >= 4, sel(`manual-${rol}`))
  }
}

async function enVivo() {
  await ve(`${R}/en-vivo`)
  if (APAGADO) {
    await pagina.waitForSelector(sel('en-vivo-apagado'), { timeout: 60_000 })
    return captura('13-en-vivo-apagado', 'con la máquina apagada, la sección lo dice y la vitrina sigue', async () => /apagado/i.test(await texto(sel('en-vivo-apagado'))))
  }
  await pagina.waitForSelector(sel('en-vivo-encendido'), { timeout: 60_000 })
  await pagina.click(sel('reinicia')); await pagina.waitForTimeout(800)
  await pagina.fill(sel('titulo'), 'MIGO no deja contabilizar la entrada')
  await pagina.fill(sel('descripcion'), 'Al contabilizar la entrada 101 en MIGO sale el mensaje M7 053 en sociedad 1000; necesitamos el periodo 2026/10 y toda la planta está detenida hoy.')
  await pagina.check(sel('muestra-captura-migo.png'))
  await pagina.click(sel('levantar'))
  await pagina.locator(sel('incidencias'), { hasText: 'MIGO no deja contabilizar' }).first().waitFor({ timeout: 120_000 })
  await captura('10-en-vivo-n3', 'en vivo: el N3 levanta con un documento de muestra', async () => /datos sintéticos/.test(await texto(sel('en-vivo-aviso'))) && (await pagina.locator(sel('adjuntos')).count()) === 0, sel('vista-cliente'))
  await pagina.click(sel('rol-consultor')); await pagina.waitForSelector(sel('vista-consultor'))
  await pagina.click(sel('incidencia-inc-001')); await pagina.click(sel('escala')); await pagina.waitForTimeout(800)
  await captura('11-en-vivo-n2', 'en vivo: el consultor la ve y la escala a su nombre', async () => /Escalada al laboratorio por usr-consultor-andina/.test(await texto(sel('detalle-inc-001'))), sel('detalle-inc-001'))
  await pagina.click(sel('rol-superadmin')); await pagina.waitForSelector(sel('vista-superadmin'))
  await pagina.locator('li[data-prueba^="sala-"]', { hasText: 'Plan v1 para inc-001' }).filter({ has: pagina.locator(sel('acciones-sala')) }).first().locator(sel('aprobar')).click()
  await pagina.waitForTimeout(800)
  await captura('12-en-vivo-sala', 'en vivo: pasa por la sala y una persona la aprueba', async () => /aprobar por usr-superadmin/.test(await texto(sel('sala'))), sel('sala'))
}

await vitrina()
await enVivo()
await navegador.close()
const malos = pasos.filter((p) => !p.ok)
console.log(`\n${pasos.length} capturas · ${malos.length} comprobaciones en rojo · ${errores.length} errores de consola${errores.length ? `:\n  ${errores.join('\n  ')}` : ''}`)
process.exit(malos.length || errores.length ? 1 : 0)
