#!/usr/bin/env node
/**
 * El recorrido de la RANURA DE CONVERSACIÓN de la mesa (goal «capa Arbrain», punto 9 del HECHO), con Playwright: el
 * experto le habla al asistente de Soporte SAP y el enrutador de la capa (sin LLM) lo resuelve con la mesa. Una captura
 * por paso, lo que debe verse comprobado, y la evidencia de que nada sale de esta máquina por el navegador y de que en su
 * navegador no queda lo que escribió:
 *   · cada petición del navegador, con su origen (tiene que ser solo el de la mesa);
 *   · lo que queda en localStorage, sessionStorage, IndexedDB, Cache Storage y cookies (nada con su texto);
 *   · tras recargar, la conversación se fue con la pestaña y sus casos siguen en la mesa.
 *
 *   MESA_IDENTIDAD=local:<carpeta> node src/features/soporte-sap/mesa/pruebas/recorrido-conversacion.mjs <url> <capturas> [--sin-llaves]
 *
 * Sirve las llaves de prueba en MESA_LLAVES_HOST:MESA_LLAVES_PUERTO (127.0.0.1:8799), salvo con `--sin-llaves`: en la
 * prueba sin salida (`mesa-sin-salida.mjs`) las sirve un contenedor al lado de la mesa, en su propia red.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { identidadLocal, sirveLlaves } from '../../../../../scripts/laboratorio-alojado/identidad-local.mjs'

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const [base = 'http://127.0.0.1:8090', carpeta = 'docs/goals/capa-arbrain-capturas/mesa'] = args
const SIN_LLAVES = process.argv.includes('--sin-llaves')
const modo = process.env['MESA_IDENTIDAD'] ?? ''
if (!modo.startsWith('local:')) { console.error('MESA_IDENTIDAD=local:<carpeta>'); process.exit(2) }
mkdirSync(carpeta, { recursive: true })
const id = identidadLocal(modo.slice(6))
const llaves = SIN_LLAVES ? null : await sirveLlaves(id.jwks, Number(process.env['MESA_LLAVES_PUERTO'] ?? 8799), process.env['MESA_LLAVES_HOST'] ?? '127.0.0.1')
const origen = new URL(base).origin

/** Lo que escribe el experto en esta corrida: lo que después NO puede estar en su navegador. */
const FIORI = 'prueba este caso: la app de Fiori abre en blanco tras el transporte'
const MIGO = 'prueba este caso: MIGO da M7 053'
const LARGO = 'Una app del launchpad de Fiori abre en blanco después del transporte de ayer, a todos los usuarios de la planta, y en el navegador no sale ningún mensaje.'
const DATO = 'prueba este caso: lo reportó juan.perez@empresa.com y la MIGO no contabiliza'
const ENSENANZA = 'Hay que limpiar la caché del launchpad con /UI2/INVALIDATE_GLOBAL_CACHES y volver a entrar a la app'
const SUYO = ['la app de Fiori abre en blanco', 'MIGO da M7 053', 'launchpad de Fiori abre en blanco después', 'juan.perez', 'INVALIDATE_GLOBAL_CACHES', 'por qué dijiste', 'lo que te enseñé', 'borra mi último']

const navegador = await chromium.launch()
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-MX', colorScheme: 'light', extraHTTPHeaders: { 'cf-access-jwt-assertion': id.firma({ email: 'experto@prueba.local' }) } })
const peticiones = []
ctx.on('request', (r) => peticiones.push({ metodo: r.method(), origen: new URL(r.url()).origin, ruta: new URL(r.url()).pathname, tipo: r.resourceType() }))
const p = await ctx.newPage()
const errores = []
p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
p.on('pageerror', (e) => errores.push(e.message))
/** Las respuestas con error: la única esperada es el 400 con que la mesa rechaza el caso con forma de dato personal. */
const fallidas = []
p.on('response', (r) => { if (r.status() >= 400) fallidas.push({ status: r.status(), metodo: r.request().method(), ruta: new URL(r.url()).pathname }) })

const pasos = []
async function captura(n, que, comprueba, foco = null) {
  const archivo = join(carpeta, `conversacion-${String(n).padStart(2, '0')}-${que.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 48)}.jpg`)
  await p.waitForTimeout(250)
  if (foco) await p.locator(foco).first().screenshot({ path: archivo, type: 'jpeg', quality: 70 })
  else await p.screenshot({ path: archivo, type: 'jpeg', quality: 70 })
  let ok = false
  try { ok = Boolean(await comprueba()) } catch { ok = false }
  pasos.push({ paso: n, que, ok, archivo })
  console.log(`${ok ? '✓' : '✗'} ${n}. ${que} → ${archivo}`)
}

const ASISTENTE = '[data-capa-mensaje][data-de="asistente"]'
const cuantos = () => p.locator(ASISTENTE).count()
const ultimo = async () => { const m = p.locator(ASISTENTE).last(); return { estado: await m.getAttribute('data-estado'), texto: await m.innerText() } }
const esperaRespuesta = (n) => p.waitForFunction(([sel, k]) => document.querySelectorAll(sel).length > k, [ASISTENTE, n], { timeout: 90_000 })
/** Le escribe al asistente y espera su respuesta. */
async function dile(texto) {
  const n = await cuantos()
  await p.fill('[data-capa-entrada]', texto)
  await p.press('[data-capa-entrada]', 'Enter')
  await esperaRespuesta(n)
  return ultimo()
}
/** Contesta «Sí» al «¿Lo hago?» con un clic, como el experto. */
async function si() {
  const n = await cuantos()
  await p.locator(ASISTENTE).last().locator('button.capa-chip', { hasText: 'Sí' }).click()
  await esperaRespuesta(n)
  return ultimo()
}
const lineaLista = async () => { await p.waitForSelector('[data-prueba="linea-de-tiempo"]', { timeout: 90_000 }); await p.waitForSelector('[data-prueba="trabajando"]', { state: 'detached', timeout: 30_000 }) }

// 1. La primera vez: la guía de la capa, con la marca y el asistente de Soporte SAP.
await p.goto(`${base}/mesa/soporte-sap`)
await p.waitForSelector('[data-capa-ventana="soporte-sap"]')
await p.waitForSelector('[data-capa-ranura="primer-arranque"]')
await captura(1, 'primer arranque con la marca de soporte sap', async () => /Hola, soy el asistente de Soporte SAP/.test(await p.locator('[data-capa-ranura="primer-arranque"]').innerText()) && /probar un caso/.test(await p.locator('[data-capa-ranura="primer-arranque"]').innerText()))
const guia = []
while (await p.locator('[data-capa-boton="primer-arranque-sigue"]').count()) {
  const paso = p.locator('[data-capa-paso]')
  guia.push({ paso: await paso.getAttribute('data-capa-paso'), texto: (await paso.innerText()).replace(/\s+/g, ' ').trim() })
  await p.click('[data-capa-boton="primer-arranque-sigue"]')
}
await captura(2, 'la mesa con su ranura de conversacion', async () => (await p.locator('.capa-marca').innerText()).includes('Soporte SAP · mesa del experto') && /prueba este caso:/.test(await p.locator('[data-capa-ranura="conversacion"]').innerText()) && /no cabe un motor local/.test(await p.locator('[data-capa-ranura="voz"]').innerText()))

// 2. «prueba este caso: …»: pregunta antes (escribe en su mesa) y lo corre por el agente sin modelo.
const pregunta = await dile(FIORI)
await captura(3, 'prueba este caso pregunta antes de correrlo', async () => pregunta.estado === 'pregunta' && /¿Lo hago\? Probar un caso/.test(pregunta.texto))
const corrido = await si()
await lineaLista()
await captura(4, 'prueba este caso resuelto sin llm', async () => corrido.estado === 'hecho' && /Corrí tu caso \(S\/4HANA · Fiori\) con el agente de la mesa, sin modelo/.test(corrido.texto) && /Resultado: no lo sé/.test(corrido.texto) && (await p.locator('[data-prueba="paso-busca"]').count()) === 1 && (await p.locator('[data-prueba="no-lo-se"]').count()) === 1)

// 3. «¿por qué dijiste no lo sé en el paso 3?»: desde la traza de la última corrida.
const porque = await dile('¿por qué dijiste no lo sé en el paso 3?')
await captura(5, 'por que dijiste no lo se en el paso 3', async () => porque.estado === 'hecho' && /En el paso 3 \(«Busca en lo que sabe»\)/.test(porque.texto) && /Qué faltaba: la regla/.test(porque.texto))

// 4. Le enseña en la mesa y luego le pide «muéstrame lo que te enseñé»: de SU mesa.
await p.fill('[data-prueba="texto-ensenanza"]', ENSENANZA)
await p.click('[data-prueba="ensenar"]'); await p.waitForSelector('[data-prueba="propuestas"]')
const ensenado = await dile('muéstrame lo que te enseñé')
await captura(6, 'muestrame lo que te ense', async () => ensenado.estado === 'hecho' && /Esto me enseñaste, según tu mesa/.test(ensenado.texto) && ensenado.texto.includes('INVALIDATE_GLOBAL_CACHES'))

// 5. Uno que conoce, escrito en la conversación: encuentra la regla.
await dile(MIGO)
const conocido = await si()
await lineaLista()
await captura(7, 'prueba este caso con regla', async () => /encontró la regla «Periodo de MM cerrado/.test(conocido.texto) && (await p.locator('[data-prueba="resultado-solucion"]').count()) === 1)

// 6. Un caso largo: el enrutador no lo reconoce como pedido; se escribe antes y luego «prueba este caso».
const largo = await dile(LARGO)
const pedido = await dile('prueba este caso')
const delLargo = pedido.estado === 'pregunta' ? await si() : pedido
await lineaLista()
await captura(8, 'caso largo escrito antes del pedido', async () => largo.estado === 'no-se' && /^Corrí tu caso \(S\/4HANA · Fiori\)/.test(delLargo.texto))

// 7. «vuelve a correr el último caso».
await dile('vuelve a correr el último caso')
const otraVez = await si()
await lineaLista()
await captura(9, 'vuelve a correr el ultimo caso', async () => /^Volví a correr tu último caso de la mesa/.test(otraVez.texto))

// 8. Un texto con forma de dato personal: no se corre ni se guarda, y el motivo no repite el dato.
const erroresAntesDelDato = errores.length
await dile(DATO)
const rechazo = await si()
// Chromium anota en la consola el 400 del rechazo («Failed to load resource»): es el esperado, y se aparta con su respuesta.
const delDato = errores.splice(erroresAntesDelDato)
const esperados = delDato.filter((x) => /status of 400/.test(x))
errores.push(...delDato.filter((x) => !/status of 400/.test(x)))
const rechazoEsperado = fallidas.length === 1 && fallidas[0].status === 400 && fallidas[0].metodo === 'POST' && fallidas[0].ruta === '/api/mesa/soporte-sap'
await captura(10, 'un dato personal no se corre', async () => rechazoEsperado && rechazo.estado === 'error' && /forma de dato personal/.test(rechazo.texto) && !rechazo.texto.includes('juan.perez'))

// 9. «borra mi último caso»: el enrutador lo acerca a «prueba este caso» (medido), pero no corre nada: borrar es del laboratorio.
const casosAntesDeBorrar = await p.locator('[data-prueba="casos"] li').count()
const borra = await dile('borra mi último caso')
const noBorra = borra.estado === 'pregunta' ? await si() : borra
await captura(11, 'borra mi ultimo caso no corre nada', async () => /^No borro casos, y no corrí nada/.test(noBorra.texto) && (await p.locator('[data-prueba="casos"] li').count()) === casosAntesDeBorrar)

// 10. Lo que queda en su navegador.
const almacenado = await p.evaluate(async () => ({
  localStorage: Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])),
  sessionStorage: Object.fromEntries(Object.keys(sessionStorage).map((k) => [k, sessionStorage.getItem(k)])),
  indexedDB: typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).map((d) => d.name) : 'sin indexedDB.databases',
  cacheStorage: typeof caches === 'undefined' ? 'sin caches' : await caches.keys(),
  serviceWorkers: (await navigator.serviceWorker?.getRegistrations?.() ?? []).map((r) => r.active?.scriptURL ?? null),
}))
almacenado.cookies = await ctx.cookies()
const volcado = JSON.stringify(almacenado)
const delExpertoEnElNavegador = SUYO.filter((t) => volcado.includes(t))

// 11. Tras recargar: la conversación se fue con la pestaña; sus casos siguen en la mesa.
await p.reload()
await p.waitForSelector('[data-capa-ventana="soporte-sap"]'); await p.waitForSelector('[data-prueba="casos"]')
const casosTrasRecargar = await p.locator('[data-prueba="casos"] li').count()
await captura(12, 'tras recargar la conversacion se fue y los casos siguen', async () => (await p.locator('[data-capa-ranura="primer-arranque"]').count()) === 0 && (await p.locator('[data-capa-mensaje][data-de="persona"]').count()) === 0 && casosTrasRecargar >= 5)

await navegador.close(); llaves?.close()
const origenes = [...new Set(peticiones.map((x) => x.origen))]
const ajenas = peticiones.filter((x) => x.origen !== origen && !x.origen.startsWith('data:') && !x.origen.startsWith('blob:'))
const evidencia = { base, fecha: new Date().toISOString(), pasos, errores, erroresEsperados: esperados, respuestasConError: fallidas, guia, peticiones: { total: peticiones.length, origenes, ajenas, api: peticiones.filter((x) => x.ruta.startsWith('/api/')).map((x) => `${x.metodo} ${x.ruta}`) }, navegador: almacenado, delExpertoEnElNavegador, casosTrasRecargar }
writeFileSync(join(carpeta, 'conversacion-evidencia.json'), `${JSON.stringify(evidencia, null, 2)}\n`)
const malos = pasos.filter((x) => !x.ok)
console.log(`\nPeticiones del navegador: ${peticiones.length}, a ${origenes.length} origen(es): ${origenes.join(', ')} · ajenas: ${ajenas.length}`)
console.log(`APIs que tocó: ${[...new Set(evidencia.peticiones.api)].join(' · ')}`)
console.log(`localStorage: ${JSON.stringify(almacenado.localStorage)}`)
console.log(`sessionStorage: ${Object.keys(almacenado.sessionStorage).length} claves · IndexedDB: ${JSON.stringify(almacenado.indexedDB)} · Cache Storage: ${JSON.stringify(almacenado.cacheStorage)} · cookies: ${almacenado.cookies.length}`)
console.log(`Texto del experto en su navegador: ${delExpertoEnElNavegador.length ? delExpertoEnElNavegador.join(', ') : 'ninguno'}`)
console.log(`Respuestas con error: ${JSON.stringify(fallidas)} (esperada: el 400 del caso con forma de dato personal) · en la consola, apartados por eso: ${esperados.length}`)
console.log(`\n${pasos.length - malos.length}/${pasos.length} pasos en verde · ${errores.length} errores de consola`)
for (const x of errores.slice(0, 10)) console.log(`  consola: ${x.slice(0, 200)}`)
process.exit(malos.length || errores.length || ajenas.length || delExpertoEnElNavegador.length ? 1 : 0)
