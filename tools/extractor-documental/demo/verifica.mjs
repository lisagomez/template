#!/usr/bin/env node
/**
 * Verifica la demo EN UN NAVEGADOR DE VERDAD.
 *
 * POR QUE EXISTE. La demo es HTML con un modulo dentro: `npm run prueba` no la ve, `tsc` no la
 * typechequea y el gate no la toca. Es el unico artefacto del paquete sin red de seguridad, y ya
 * se cobro dos:
 *
 *   - Un boton con `hidden` que se veia SIEMPRE, porque `.fila { display:flex }` le ganaba por
 *     especificidad. Ninguna revision del codigo lo vio; lo cazo abrir la pagina.
 *   - Una llamada a `puedeValidarseSinRevision(filas)` que se quedo con un argumento cuando la
 *     funcion paso a exigir dos. Compilaba —no hay compilador aqui— y devolvia lo contrario.
 *
 * NO ESTA EN `npm run prueba` NI EN EL GATE, y es deliberado: necesita Playwright, que este
 * paquete no declara como dependencia porque su nucleo no tiene ninguna. Se corre a mano, como
 * `medicion/deriva.mjs`.
 *
 *   node demo/verifica.mjs
 *
 * Si Playwright no esta instalado lo dice y sale con 2, en vez de fallar como si la demo
 * estuviera rota.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(aqui, '..')

/** Se busca donde se pueda: la raiz del monorepo, este paquete, o lo global. */
async function traeChromium() {
  // Una via explicita, para quien lo tenga instalado en otro sitio de la maquina:
  //   PLAYWRIGHT_DESDE=/ruta/a/node_modules/playwright node demo/verifica.mjs
  // Existe porque sin ella este script seria de los que se escriben y nunca se ejecutan.
  if (process.env.PLAYWRIGHT_DESDE !== undefined) {
    return (await import(process.env.PLAYWRIGHT_DESDE)).chromium
  }
  const requiere = createRequire(join(RAIZ, 'noop.js'))
  for (const desde of [join(RAIZ, '..', '..', 'noop.js'), join(RAIZ, 'noop.js')]) {
    try {
      const ruta = createRequire(desde).resolve('playwright')
      return (await import(ruta)).chromium
    } catch {
      // Se sigue buscando. El fallo util es el de abajo, no este.
    }
  }
  try {
    return (await import(requiere.resolve('playwright'))).chromium
  } catch {
    console.error('\nPlaywright no esta instalado, y esta verificacion lo necesita.')
    console.error('No es una dependencia del paquete a proposito: el nucleo no tiene ninguna.')
    console.error('\n  npx playwright install chromium\n')
    process.exit(2)
  }
}

const chromium = await traeChromium()

const SAT = 'https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx'
const QR_BUENO = `${SAT}?id=11111111-2222-3333-4444-555555555555&re=AAA010101AAA&rr=XAXX010101000&tt=1160.00&fe=NUcQ9Roz`
const QR_MANIPULADO = `${SAT}?id=11111111-2222-3333-4444-555555555555&re=AAA010101AAA&rr=XAXX010101000&tt=116.00&fe=NUcQ9Roz`

/** El fixture sintetico del repo: datos inventados, estructura fiel. */
const XML = join(RAIZ, 'pruebas', 'fixtures', 'cfdi-40-ingreso.xml')
/** Un PDF escaneado SINTETICO: un JPEG minimo dentro, para no meter documentos reales aqui. */
const ESCANEO = join(RAIZ, 'pruebas', 'fixtures', 'escaneo.pdf')

let fallos = 0
const comprueba = (que, condicion, detalle = '') => {
  console.log(`  ${condicion ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${que}${detalle ? ` \x1b[2m${detalle}\x1b[0m` : ''}`)
  if (!condicion) fallos++
}

const servidor = spawn('node', ['demo/servidor.mjs'], { cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'] })
let url = null
await new Promise((listo, falla) => {
  const tiempo = setTimeout(() => falla(new Error('el servidor no arranco en 60 s')), 60000)
  servidor.stdout.on('data', (d) => {
    const m = /http:\/\/localhost:\d+/.exec(String(d))
    if (m !== null && url === null) { url = m[0]; clearTimeout(tiempo); listo() }
  })
  servidor.stderr.on('data', (d) => process.stderr.write(String(d)))
})

const navegador = await chromium.launch()
const pagina = await navegador.newPage()
const errores = []
pagina.on('pageerror', (e) => errores.push(e.message))
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })

try {
  await pagina.goto(url, { waitUntil: 'networkidle' })

  console.log('\n\x1b[1mLa pagina carga y la seccion existe\x1b[0m')
  comprueba('sin errores de consola al cargar', errores.length === 0, errores.join(' · '))
  comprueba('la seccion 7 esta', (await pagina.locator('h2', { hasText: '7 · Cotejo' }).count()) === 1)
  comprueba('el boton de limpiar arranca OCULTO', await pagina.locator('#acciones-cotejo').isHidden())

  console.log('\n\x1b[1mSin segunda fuente no hay cotejo\x1b[0m')
  await pagina.locator('#file-xml').setInputFiles(XML)
  await pagina.locator('#acciones-cotejo').waitFor({ state: 'visible' })
  comprueba('al soltar el XML aparece el boton de limpiar', await pagina.locator('#acciones-cotejo').isVisible())
  await pagina.locator('#btn-cotejar').click()
  const sinCodigo = await pagina.locator('#salida-cotejo').innerText()
  comprueba('dice que sin segunda fuente no se auto-valida', /sin segunda fuente no hay cotejo/i.test(sinCodigo))
  comprueba('y aun asi ensena los campos leidos', /rfc_emisor/.test(sinCodigo))

  console.log('\n\x1b[1mCon el codigo que coincide\x1b[0m')
  await pagina.locator('#carga-cotejo').fill(QR_BUENO)
  await pagina.locator('#btn-cotejar').click()
  const coincide = await pagina.locator('#salida-cotejo').innerText()
  comprueba('declara que las dos fuentes coinciden', /Las dos fuentes coinciden/i.test(coincide))
  comprueba('nombra los acuerdos', /Acuerdos/.test(coincide))
  comprueba('NO inventa que el sello este verificado', /no verifica el sello/i.test(coincide))

  console.log('\n\x1b[1mCon el codigo manipulado — el caso que importa\x1b[0m')
  await pagina.locator('#carga-cotejo').fill(QR_MANIPULADO)
  await pagina.locator('#btn-cotejar').click()
  const manipulado = await pagina.locator('#salida-cotejo').innerText()
  comprueba('caza la discrepancia', /1 discrepancia/i.test(manipulado))
  comprueba('dice que va a revision', /revisi/i.test(manipulado))
  comprueba('ensena los dos valores enfrentados', /1160\.00/.test(manipulado) && /116\.00/.test(manipulado))

  console.log('\n\x1b[1mLa barrera llega a la seccion 3\x1b[0m')
  const campos = JSON.stringify([
    { clave: 'total', valor: '1160.00', confianza: 1, procedencia: 'xml' },
  ])
  await pagina.locator('#campos-json').fill(campos)
  await pagina.locator('#umbral').fill('0.8')
  await pagina.locator('#btn-revisar').click()
  const conDiscrepancia = await pagina.locator('#salida-revision').innerText()
  comprueba('con discrepancia viva, avisa de que nadie cotejo', /nadie cotej/i.test(conDiscrepancia))

  await pagina.locator('#carga-cotejo').fill(QR_BUENO)
  await pagina.locator('#btn-cotejar').click()
  await pagina.locator('#btn-revisar').click()
  const cotejado = await pagina.locator('#salida-revision').innerText()
  comprueba('tras cotejar sin discrepancias, el aviso desaparece', !/nadie cotej/i.test(cotejado))

  console.log('\n\x1b[1mLimpiar\x1b[0m')
  await pagina.locator('#btn-limpiar-cotejo').click()
  comprueba('vacia la salida', (await pagina.locator('#salida-cotejo').innerText()).trim() === '')
  comprueba('vuelve a ocultar el boton', await pagina.locator('#acciones-cotejo').isHidden())
  await pagina.locator('#btn-revisar').click()
  const trasLimpiar = await pagina.locator('#salida-revision').innerText()
  comprueba('y el cotejo deja de contar: vuelve el aviso', /nadie cotej/i.test(trasLimpiar))

  console.log('\n\x1b[1mEl motor de OCR\x1b[0m')
  comprueba('la seccion 8 esta', (await pagina.locator('h2', { hasText: '8 · Motor de OCR' }).count()) === 1)
  comprueba('los botones arrancan OCULTOS', await pagina.locator('#acciones-motor').isHidden())
  comprueba(
    'avisa de que el documento sale hacia el servidor que se ponga',
    /manda tu documento al servidor/i.test(await pagina.locator('section', { has: pagina.locator('#motor-base') }).innerText()),
  )
  comprueba(
    'NO ofrece campo para una clave de API comercial',
    (await pagina.locator('#motor-clave').count()) === 0,
    'si algun dia aparece, esta prueba lo dice',
  )

  // Del PDF escaneado tiene que salir la imagen ANTES de mandar nada.
  await pagina.locator('#file-motor').setInputFiles(ESCANEO)
  await pagina.locator('#acciones-motor').waitFor({ state: 'visible' })
  const listo = await pagina.locator('#salida-motor').innerText()
  comprueba('saca la imagen del PDF escaneado', /salió una imagen/i.test(listo), listo.slice(0, 60))

  // Y sin servidor ni modelo se niega a enviar, en vez de fallar contra la red.
  await pagina.locator('#btn-extraer').click()
  comprueba('sin modelo pineado no manda nada', /pineado/i.test(await pagina.locator('#salida-motor').innerText()))

  comprueba('ningun error de consola en toda la corrida', errores.length === 0, errores.join(' · '))
} finally {
  await navegador.close()
  servidor.kill()
}

console.log(fallos === 0 ? '\n\x1b[32mLas 22 comprobaciones en verde.\x1b[0m\n' : `\n\x1b[31m${fallos} fallo(s).\x1b[0m\n`)
process.exit(fallos === 0 ? 0 : 1)
