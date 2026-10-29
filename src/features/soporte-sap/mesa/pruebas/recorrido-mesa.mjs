#!/usr/bin/env node
/**
 * El recorrido de la mesa del experto con Playwright: una captura por paso, lo que debe verse comprobado, y los errores
 * de consola contados. Corre contra la mesa en esta máquina (`npm run dev` o `docker run`) o contra la alojada.
 *
 *   Local:    MESA_IDENTIDAD=local:<carpeta> node src/features/soporte-sap/mesa/pruebas/recorrido-mesa.mjs <url> <capturas>
 *             (sirve unas llaves de prueba en MESA_LLAVES_PUERTO, 8799 por defecto; la app arranca con `entornoLocal`)
 *   Alojada:  MESA_IDENTIDAD=servicio node --env-file=$HOME/.soporte-sap-mesa.env <este archivo> <url> <capturas>
 *             (los tokens de servicio de Access: CF_ACCESS_EXPERTO_ID/_SECRETO y CF_ACCESS_LABORATORIO_ID/_SECRETO)
 *   --tras-reinicio   solo comprueba que el último caso sigue, con su retro, después de dormir o redesplegar.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { identidadLocal, sirveLlaves } from '../../../../../scripts/laboratorio-alojado/identidad-local.mjs'

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const [base = 'http://127.0.0.1:3012', carpeta = 'docs/goals/soporte-sap-capturas/mesa'] = args
const TRAS_REINICIO = process.argv.includes('--tras-reinicio')
mkdirSync(carpeta, { recursive: true })
const modo = process.env['MESA_IDENTIDAD'] ?? ''

/** Las cabeceras de cada identidad: el JWT local, o el token de servicio que Access convierte en su JWT. */
async function cabecerasDe() {
  if (modo.startsWith('local:')) {
    const id = identidadLocal(modo.slice(6))
    const servidor = await sirveLlaves(id.jwks, Number(process.env['MESA_LLAVES_PUERTO'] ?? 8799), process.env['MESA_LLAVES_HOST'] ?? '127.0.0.1')
    return { cerrar: () => servidor.close(), experto: { 'cf-access-jwt-assertion': id.firma({ email: 'experto@prueba.local' }) }, laboratorio: { 'cf-access-jwt-assertion': id.firma({ email: 'laboratorio@prueba.local' }) }, falso: { 'cf-access-jwt-assertion': id.firma({ email: 'experto@prueba.local' }, -60) } }
  }
  if (modo === 'servicio') {
    const t = (q) => ({ 'cf-access-client-id': process.env[`CF_ACCESS_${q}_ID`] ?? '', 'cf-access-client-secret': process.env[`CF_ACCESS_${q}_SECRETO`] ?? '' })
    return { cerrar: () => {}, experto: t('EXPERTO'), laboratorio: t('LABORATORIO'), falso: { 'cf-access-jwt-assertion': 'eyJhbGciOiJSUzI1NiJ9.e30.x' } }
  }
  console.error('MESA_IDENTIDAD=local:<carpeta> o MESA_IDENTIDAD=servicio'); process.exit(2)
}

const id = await cabecerasDe()
const navegador = await chromium.launch()
const errores = []
const pasos = []
const sel = (p) => `[data-prueba="${p}"]`
/** La mesa alojada guarda lo de corridas anteriores: si este token ya validó el candidato, «Cambiar» reabre el formulario. */
const reabre = async (c) => { if (await c.locator(sel('validacion-hecha')).count()) await c.locator(sel('cambiar-validacion')).click() }
/** La mesa vive dentro de la capa: su guía de primer arranque se recorre aparte (`recorrido-conversacion.mjs`); aquí ya se
 *  vio. Es la única clave que la mesa deja en el navegador, sin texto del experto (`services/almacen-capa.ts`). */
const GUIA_VISTA = ['capa:soporte-sap:capa/soporte-sap/mesa/capa/primer-arranque', JSON.stringify({ version: 1, terminado: true, paso: 4, nivel: 'lo-importante', voz: false })]
async function pagina(cabeceras, viewport = { width: 1440, height: 1000 }) {
  const ctx = await navegador.newContext({ viewport, extraHTTPHeaders: cabeceras, acceptDownloads: true })
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v) } catch { /* sin almacenamiento: la guía taparía la mesa */ } }, GUIA_VISTA)
  const p = await ctx.newPage()
  p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
  p.on('pageerror', (e) => errores.push(e.message))
  return p
}
async function captura(p, n, que, comprueba, foco = null, completa = false) {
  const archivo = join(carpeta, `mesa-${String(n).padStart(2, '0')}-${que.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 44)}.jpg`)
  if (foco) await (typeof foco === 'string' ? p.locator(foco).first() : foco).screenshot({ path: archivo, type: 'jpeg', quality: 62 })
  else await p.screenshot({ path: archivo, type: 'jpeg', quality: 62, fullPage: completa })
  let ok = true
  try { ok = comprueba ? Boolean(await comprueba()) : true } catch { ok = false }
  pasos.push({ paso: n, que, ok, archivo })
  console.log(`${ok ? '✓' : '✗'} ${n}. ${que} → ${archivo}`)
}
const texto = async (p, s) => (await p.locator(s).allInnerTexts()).join('\n')
const termina = async (p) => { await p.waitForSelector(sel('linea-de-tiempo'), { timeout: 90_000 }); await p.waitForSelector(sel('trabajando'), { state: 'detached', timeout: 30_000 }) }
async function ejemplo(p, cual) {
  await p.click(sel('nuevo-caso'))
  await p.locator(`${sel('ejemplos')} button`, { hasText: cual }).click()
}

const e = await pagina(id.experto)
if (TRAS_REINICIO) {
  await e.goto(`${base}/mesa/soporte-sap`); await e.waitForSelector(sel('casos'))
  // El caso del paso 5: el que tiene veredicto «lo resolvió» y retro en sus pasos.
  await e.locator(`${sel('casos')} li button`, { hasText: 'lo resolvió' }).first().click()
  await e.waitForSelector(sel('linea-de-tiempo'))
  await captura(e, 20, 'tras dormir o redesplegar, el caso sigue con su retro', async () => (await e.locator(sel('no-vive')).count()) === 1 && (await e.locator(sel('retro-guardada')).count()) >= 2 && (await e.locator(sel('aprobar')).count()) === 0)
} else {
  await e.goto(`${base}/mesa/soporte-sap`); await e.waitForSelector(sel('compositor'))
  await captura(e, 1, 'la mesa abre con el compositor y el aviso', async () => (await texto(e, sel('aviso-sintetico'))).includes('datos sintéticos') && (await texto(e, sel('identidad'))).includes('Experto'))

  // 1. Un caso que el agente conoce, con su evidencia, de punta a punta.
  await e.locator(`${sel('ejemplos')} button`, { hasText: 'Uno que el agente conoce' }).click()
  await e.click(sel('correr')); await termina(e)
  await captura(e, 2, 'caso conocido: la línea de tiempo y la solución', async () => ['paso-recibe', 'paso-entiende', 'paso-busca', 'paso-plan', 'paso-sala'].every((x) => x) && (await e.locator(sel('resultado-solucion')).count()) === 1 && (await e.locator(sel('paso-sala')).count()) > 0)
  await captura(e, 3, 'la evidencia leída con OCR', async () => /OCR/.test(await texto(e, sel('paso-evidencia'))) && !/0 campos/.test(await texto(e, sel('paso-evidencia'))), sel('paso-evidencia'))
  await e.click(sel('aprobar')); await e.waitForSelector(sel('antes-despues'))
  await captura(e, 4, 'aprueba en la sala: el antes y el después del simulador', async () => /ya no se reproduce/.test(await texto(e, sel('antes-despues'))), sel('solucion'))
  await e.locator(`${sel('paso-recibe')} ${sel('gesto-bien')}`).click()
  await e.locator(`${sel('paso-entiende')} ${sel('gesto-mal')}`).click()
  await e.locator(`${sel('paso-entiende')} ${sel('esperaba')}`).fill('que me preguntara el tipo de movimiento antes de decidir la prioridad')
  await e.locator(`${sel('paso-entiende')} ${sel('guarda-esperaba')}`).click()
  await e.click(sel('veredicto-resuelto')); await e.click(sel('guarda-veredicto')); await e.waitForSelector(sel('veredicto-estado'))
  await captura(e, 5, 'retro por paso y veredicto del caso, guardados', async () => (await e.locator(sel('retro-guardada')).count()) >= 2 && /Guardado/.test(await texto(e, sel('veredicto-estado'))))

  // 2. Uno que no conoce: «no lo sé» y la enseñanza.
  await ejemplo(e, 'Uno que no conoce'); await e.click(sel('correr')); await termina(e)
  await e.fill(sel('texto-ensenanza'), 'Hay que limpiar la caché del launchpad con /UI2/INVALIDATE_GLOBAL_CACHES y volver a entrar a la app')
  await e.click(sel('ensenar')); await e.waitForSelector(sel('propuestas'))
  await captura(e, 6, 'no lo sé, la enseñanza y la propuesta de regla y de CLI', async () => (await e.locator(sel('no-lo-se')).count()) === 1 && /Propuesta de regla/.test(await texto(e, sel('propuestas'))) && /Propuesta de CLI/.test(await texto(e, sel('propuestas'))), sel('solucion'))

  // 3. Un texto con forma de dato personal: se dice antes de enviar.
  await ejemplo(e, 'Uno que el agente conoce')
  await e.fill(sel('intento'), 'Lo reportó juan.perez@empresa.com desde la planta')
  await e.click(sel('correr')); await e.waitForSelector(sel('resumen-de-errores'))
  await captura(e, 7, 'un dato personal se rechaza antes de enviarse', async () => /forma de dato personal/.test(await texto(e, sel('resumen-de-errores'))) && !(await texto(e, sel('resumen-de-errores'))).includes('juan'), sel('compositor'))

  // 4. Uno de nómina: cuarentena, explicada.
  await e.fill(sel('intento'), '')
  await ejemplo(e, 'Uno de nómina'); await e.click(sel('correr')); await termina(e)
  await captura(e, 8, 'un caso de nómina queda en cuarentena', async () => /cuarentena/.test(await texto(e, sel('cuarentena'))), sel('solucion'))

  // 5. A ancho de teléfono.
  const m = await pagina(id.experto, { width: 390, height: 844 })
  await m.goto(`${base}/mesa/soporte-sap`); await m.waitForSelector(sel('casos'))
  await m.locator(`${sel('casos')} li button`).last().click(); await m.waitForSelector(sel('linea-de-tiempo'))
  await captura(m, 9, 'la mesa a ancho de teléfono', async () => (await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)), null, true)

  // 6. Lo que ve el laboratorio, y su export.
  const l = await pagina(id.laboratorio)
  await l.goto(`${base}/mesa/soporte-sap/laboratorio?pestana=casos`); await l.waitForSelector(sel('laboratorio'))
  await captura(l, 10, 'lo que dijo el experto, para el laboratorio', async () => Number(await texto(l, `${sel('lab-casos')} p`).then((t) => t.split('\n')[0])) + 0 >= 0 && /Lo resolvió/.test(await texto(l, sel('laboratorio'))) && /👎/.test(await texto(l, sel('pasos-mal'))), null, true)
  const [descarga] = await Promise.all([l.waitForEvent('download'), l.click(sel('export-md'))])
  const md = join(carpeta, 'mesa-export-del-laboratorio.md')
  await descarga.saveAs(md)
  console.log(`✓ export del laboratorio → ${md}`)

  // 7. Validar conocimiento: el experto ve hipótesis de sapstack con su fuente y corrige una (antes y después).
  await e.goto(`${base}/mesa/soporte-sap?pestana=candidatos`); await e.waitForSelector(sel('candidatos'))
  await captura(e, 11, 'el experto ve los candidatos como hipótesis, con su fuente', async () => (await e.locator('[data-prueba^="candidato-"]').count()) > 0 && /Hipótesis/.test(await texto(e, sel('candidatos'))) && /data\/tcodes\.yaml:\d+/.test(await texto(e, sel('candidatos'))))
  // La mesa alojada guarda lo de corridas anteriores: este token pudo validar MIRO ya. «Todos» lo muestra y «Cambiar»
  // reabre el formulario (validar otra vez reemplaza la anterior); así el «antes» es el mismo en la primera corrida y después.
  await e.getByRole('button', { name: 'Todos', exact: true }).click()
  await e.fill(sel('busca'), 'MIRO')
  const miro = e.locator('[data-prueba^="candidato-"]', { hasText: 'Invoice Verification' }).first()
  await miro.waitFor()
  await reabre(miro)
  await captura(e, 12, 'antes: la hipótesis de MIRO, sin validar', async () => (await miro.locator(sel('formulario-validacion')).count()) === 1 && (await miro.locator(sel('validacion-hecha')).count()) === 0, '[data-prueba^="candidato-"]')
  await miro.locator(sel('valora-corrige')).click()
  await miro.locator(sel('correccion')).fill('MIRO es de MM: la verificación de facturas (LIV) vive en MM y contabiliza en FI')
  await miro.locator(sel('comentario')).fill('en S/4 también está la app de Fiori para lo mismo')
  await miro.locator(sel('enviar-validacion')).click(); await miro.locator(sel('validacion-hecha')).waitFor()
  await captura(e, 13, 'después: su corrección queda como propuesta', async () => /Propuesta para el laboratorio/.test(await miro.innerText()) && /Lo corrijo/.test(await miro.innerText()), '[data-prueba^="candidato-"]')

  // 8. El mapa del laboratorio: conteos reales, el detalle de un nodo y la propuesta del experto.
  await l.goto(`${base}/mesa/soporte-sap/laboratorio`); await l.waitForSelector(sel('mapa'))
  // «Corregidos» solo cuenta expertos reales (22/10). Con los tokens de servicio, la corrección del paso 13 es de PRUEBA y el
  // mapa la cuenta aparte, en el nodo del experto; con la identidad local, el experto cuenta y la métrica sube.
  // El nodo solo pinta su texto desplegado: se despliega para leerlo y se pliega otra vez (los pasos que siguen lo ven igual).
  const corregidoDondeToca = async () => {
    if (modo !== 'servicio') return Number(await texto(l, `${sel('metrica-corregidos')} p:nth-child(2)`)) >= 1
    const nodo = l.locator(sel('nodo-experto')), pliega = nodo.locator('button[aria-expanded]')
    await pliega.click()
    const n = Number((await nodo.innerText()).match(/De prueba, aparte: (\d+)/)?.[1] ?? 0)
    await pliega.click()
    return n >= 1
  }
  await captura(l, 14, 'el mapa del laboratorio, con sus conteos reales', async () => /335/.test(await texto(l, sel('nodo-sapstack'))) && await corregidoDondeToca() && /sin datos|%/.test(await texto(l, sel('metrica-al-experto'))), null, true)
  await l.click(sel('nodo-sapstack-abre')); await l.waitForSelector(sel('detalle-sapstack'))
  await captura(l, 15, 'el detalle de un nodo: candidatos por módulo', async () => /FI · \d+ candidatos/.test(await texto(l, sel('detalle-sapstack'))), sel('detalle-sapstack'))
  await captura(l, 16, 'el laboratorio ve la corrección del experto como propuesta', async () => { const t = await texto(l, sel('propuestas')); return /MIRO/.test(t) && /propuesta/.test(t) && /Lo corrijo/.test(t) }, sel('propuestas'))

  // 9. Para el experto, el mapa no existe. (Se abre sin escuchar la consola: el 404 es lo esperado, y Chromium lo anota.)
  const ctx404 = await navegador.newContext({ viewport: { width: 1440, height: 700 }, extraHTTPHeaders: id.experto })
  const p404 = await ctx404.newPage()
  const r404 = await p404.goto(`${base}/mesa/soporte-sap/laboratorio`)
  await captura(p404, 17, 'el experto recibe 404 en el mapa', async () => r404?.status() === 404)
  const lm = await pagina(id.laboratorio, { width: 390, height: 844 })
  await lm.goto(`${base}/mesa/soporte-sap/laboratorio`); await lm.waitForSelector(sel('mapa'))
  await captura(lm, 18, 'el mapa a ancho de teléfono', async () => (await lm.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)), null, true)

  // 10. La web de BASIS: el nodo con sus conteos reales, un candidato web con su cita y su fecha, uno de sapstack con su
  // corroboración, y la validación del experto, de la mesa al mapa del laboratorio.
  const WEB = JSON.parse(readFileSync('src/features/soporte-sap/mesa/fuentes/web/candidatos-web.json', 'utf8'))
  await l.goto(`${base}/mesa/soporte-sap/laboratorio`); await l.waitForSelector(sel('mapa'))
  await l.click(sel('nodo-web-abre')); await l.waitForSelector(sel('detalle-web'))
  await captura(l, 19, 'el nodo de la web en el mapa, con sus conteos reales', async () => (await texto(l, sel('nodo-web'))).includes(String(WEB.candidatos.length)) && /al día|hay versión nueva/.test(await texto(l, sel('nodo-web'))), sel('mapa-lienzo'))
  await captura(l, 20, 'el detalle de la web: pins, cruce y vigencia', async () => /corroborados/.test(await texto(l, sel('detalle-web'))) && (await texto(l, sel('detalle-web'))).includes(`${WEB.resumen.cruce.corroborados} corroborados`) && /@[0-9a-f]{12}/.test(await texto(l, sel('detalle-web'))), sel('detalle-web'))
  await e.goto(`${base}/mesa/soporte-sap?pestana=candidatos`); await e.waitForSelector(sel('candidatos'))
  await e.getByRole('button', { name: 'Todos', exact: true }).click()
  await e.click(sel('origen-web')); await e.fill(sel('busca'), '3797111')
  const nota = e.locator('[data-prueba^="candidato-nota-"]', { hasText: '3797111' }).first()
  await nota.waitFor(); await reabre(nota)
  await captura(e, 21, 'un candidato de la web con su cita y su fecha', async () => { const t = await nota.innerText(); return /SAP Note 3797111/.test(t) && t.includes(`Capturada el ${WEB.pin.capturadoEl}`) && /Hot News/.test(t) && (await nota.locator(sel('formulario-validacion')).count()) === 1 }, nota)
  await e.click(sel('origen-sapstack')); await e.fill(sel('busca'), 'STRUST')
  const strust = e.locator('[data-prueba^="candidato-tcode-"]', { hasText: 'STRUST' }).first()
  await strust.waitFor()
  await captura(e, 22, 'un candidato de sapstack con su corroboración', async () => (await strust.locator(sel('cruce-corroborado')).count()) === 1 && /help\.sap\.com/.test(await strust.locator(`${sel('cruce-corroborado')} a`).first().getAttribute('href') ?? ''), strust)
  await e.click(sel('origen-web')); await e.fill(sel('busca'), '3797111'); await nota.waitFor(); await reabre(nota)
  await captura(e, 23, 'antes: el experto ante la nota de seguridad, sin validar', async () => (await nota.locator(sel('validacion-hecha')).count()) === 0, nota)
  await nota.locator(sel('valora-correcto')).click()
  await nota.locator(sel('comentario')).fill('aplica a los sistemas con el componente encendido; si está apagado, baja la urgencia')
  await nota.locator(sel('enviar-validacion')).click(); await nota.locator(sel('validacion-hecha')).waitFor()
  await captura(e, 24, 'después: su validación queda como propuesta', async () => /Propuesta para el laboratorio/.test(await nota.innerText()) && /Es correcto/.test(await nota.innerText()), nota)
  await l.goto(`${base}/mesa/soporte-sap/laboratorio`); await l.waitForSelector(sel('propuestas'))
  const prop = l.locator('[data-prueba^="propuesta-nota-"]', { hasText: '3797111' }).first()
  await captura(l, 25, 'el laboratorio ve la validación de la web como propuesta', async () => { const t = await prop.innerText(); return /propuesta/.test(t) && /Es correcto/.test(t) && /SAP Note 3797111/.test(t) && /capturada el/.test(t) }, prop)
  const ctxWeb = await navegador.newContext({ viewport: { width: 1440, height: 700 }, extraHTTPHeaders: id.experto })
  const p404w = await ctxWeb.newPage()
  const r404w = await p404w.goto(`${base}/mesa/soporte-sap/laboratorio`)
  await captura(p404w, 26, 'con la web dentro, el experto sigue recibiendo 404 en el mapa', async () => r404w?.status() === 404 && !/3797111|La web/.test(await p404w.content()))

  // 7. Las negativas, por la API.
  const negativas = []
  const pide = async (que, url, cabeceras) => { const r = await fetch(url, { headers: cabeceras, redirect: 'manual' }); negativas.push(`${que}: ${r.status}`); return r.status }
  await pide('sin identidad, la mesa', `${base}/mesa/soporte-sap`, {})
  await pide('sin identidad, la API', `${base}/api/mesa/soporte-sap`, {})
  await pide('un JWT vencido', `${base}/api/mesa/soporte-sap`, id.falso)
  await pide('el experto, la vista del laboratorio', `${base}/api/mesa/soporte-sap?vista=laboratorio`, id.experto)
  await pide('el experto, la página del laboratorio', `${base}/mesa/soporte-sap/laboratorio`, id.experto)
  await pide('el experto, el mapa por la API', `${base}/api/mesa/soporte-sap?vista=mapa`, id.experto)
  await pide('el experto, la ruta de las identidades elegibles (superadmin)', `${base}/api/soporte-sap?rol=superadmin`, id.experto)
  writeFileSync(join(carpeta, 'mesa-negativas.txt'), negativas.join('\n') + '\n')
  for (const n of negativas) console.log(`  negativa · ${n}`)
}

await navegador.close(); id.cerrar()
const malos = pasos.filter((p) => !p.ok)
console.log(`\n${pasos.length - malos.length}/${pasos.length} pasos en verde · ${errores.length} errores de consola`)
for (const x of errores.slice(0, 10)) console.log(`  consola: ${x.slice(0, 200)}`)
process.exit(malos.length || errores.length ? 1 : 0)
