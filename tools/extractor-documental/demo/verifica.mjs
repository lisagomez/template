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

  console.log('\n\x1b[1mLa pagina carga y el bento grid existe\x1b[0m')
  comprueba('sin errores de consola al cargar', errores.length === 0, errores.join(' · '))
  comprueba('el contenedor .bento existe', (await pagina.locator('.bento').count()) === 1)
  const tarjetas = pagina.locator('.tarjeta')
  comprueba('hay diez tarjetas (ocho de siempre + catalogos + uso de tokens)', (await tarjetas.count()) === 10)

  // Geometria real, no solo CSS declarado: en viewport ancho dos tarjetas de medio ancho quedan
  // LADO A LADO; en uno angosto, la regla `@media` las apila. Es lo unico que demuestra que el
  // grid funciona de verdad y no solo que la clase esta escrita.
  await pagina.setViewportSize({ width: 1400, height: 1000 })
  const cajaCapa0 = await pagina.locator('.tarjeta.span-6').first().boundingBox()
  const cajaIngesta = await pagina.locator('.tarjeta.span-6').nth(1).boundingBox()
  comprueba(
    'en ancho, dos tarjetas span-6 quedan lado a lado',
    cajaCapa0 !== null && cajaIngesta !== null && Math.abs(cajaCapa0.y - cajaIngesta.y) < 5 && cajaIngesta.x > cajaCapa0.x,
  )
  await pagina.setViewportSize({ width: 480, height: 1000 })
  const cajaCapa0Angosta = await pagina.locator('.tarjeta.span-6').first().boundingBox()
  const cajaIngestaAngosta = await pagina.locator('.tarjeta.span-6').nth(1).boundingBox()
  comprueba(
    'bajo 760px las mismas dos tarjetas se apilan (una columna)',
    cajaCapa0Angosta !== null && cajaIngestaAngosta !== null && cajaIngestaAngosta.y > cajaCapa0Angosta.y + cajaCapa0Angosta.height - 5,
  )
  await pagina.setViewportSize({ width: 1400, height: 1000 })

  comprueba('la seccion Cotejo esta (el bento reordeno: antes era la 7)', (await pagina.locator('h2', { hasText: 'Cotejo' }).count()) === 1)
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
  comprueba('la seccion Motor de OCR esta', (await pagina.locator('h2', { hasText: 'Motor de OCR' }).count()) === 1)
  comprueba('los botones arrancan OCULTOS', await pagina.locator('#acciones-motor').isHidden())
  comprueba(
    'avisa de que el documento sale hacia el servidor que se ponga',
    /manda tu documento al servidor/i.test(await pagina.locator('.tarjeta', { has: pagina.locator('#motor-base') }).innerText()),
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

  // Lo que motivo este diagnostico: "failed to fetch" no le dice nada a nadie.
  await pagina.locator('#motor-base').fill('http://localhost:59999/v1')
  await pagina.locator('#btn-probar-motor').click()
  await pagina.locator('#salida-conexion').getByText(/No se pudo contactar|Nadie contest/i).waitFor({ timeout: 15000 })
  const diagnostico = await pagina.locator('#salida-conexion').innerText()
  comprueba('contra un puerto muerto NO repite "failed to fetch"', !/failed to fetch/i.test(diagnostico))
  comprueba('enumera las tres causas posibles', /nadie escuchando/i.test(diagnostico) && /CORS|OLLAMA_ORIGINS/i.test(diagnostico) && /WSL/i.test(diagnostico))
  comprueba('dice que el documento NO salio', /no salió/i.test(diagnostico))

  // Y al extraer contra ese mismo puerto, tampoco se manda el documento a ciegas.
  await pagina.locator('#motor-modelo').fill('modelo-pineado-1.0')
  await pagina.locator('#btn-extraer').click()
  await pagina.locator('#salida-motor').getByText(/No se pudo contactar|Nadie contest/i).waitFor({ timeout: 15000 })
  comprueba('no manda el documento si el servidor no contesta', true)

  /**
   * Los errores que esta misma prueba PROVOCA no cuentan.
   *
   * Apuntar a un puerto muerto hace que el navegador escriba `ERR_CONNECTION_REFUSED` en la
   * consola, y eso es la prueba funcionando, no la pagina rota. Se filtran por el puerto exacto
   * que se uso — no por la palabra "connection", que taparia un fallo de verdad contra otro sitio.
   */
  const inesperados = errores.filter((e) => !e.includes('59999') && !/ERR_CONNECTION_REFUSED/.test(e))
  comprueba('ningun error de consola no provocado', inesperados.length === 0, inesperados.join(' · '))
  comprueba(
    'y los provocados si aparecieron: la prueba del puerto muerto fue real',
    errores.some((e) => /ERR_CONNECTION_REFUSED/.test(e)),
  )

  console.log('\n\x1b[1mCatálogos configurables por el usuario\x1b[0m')
  comprueba('la seccion Catalogos esta', (await pagina.locator('h2', { hasText: 'Catálogos' }).count()) === 1)
  comprueba('sin nada guardado, el selector lo dice', /ningún catálogo guardado/i.test(await pagina.locator('#cat-selector').innerText()))

  await pagina.locator('#cat-nuevo-nombre').fill('proveedores-prueba')
  await pagina.locator('#btn-cat-crear').click()
  comprueba('el catalogo nuevo queda seleccionado', await pagina.locator('#cat-selector').inputValue() === 'proveedores-prueba')
  comprueba('vacio, la tabla lo dice en vez de aparecer en blanco', /no tiene filas todavía/i.test(await pagina.locator('#cat-tabla-cont').innerText()))

  await pagina.locator('#cat-fila-id').fill('1874')
  await pagina.locator('#cat-fila-etiqueta').fill('ACME S.A. de C.V.')
  await pagina.locator('#btn-cat-anadir-fila').click()
  const tablaCatalogo = await pagina.locator('#cat-tabla-cont').innerText()
  comprueba('la fila añadida aparece en la tabla', /1874/.test(tablaCatalogo) && /ACME S\.A\. de C\.V\./.test(tablaCatalogo))
  comprueba('el contador de filas del selector sube', /1 fila/.test(await pagina.locator('#cat-selector').innerText()))

  await pagina.locator('#btn-cat-cargar-activo').click()
  comprueba('«cargar catálogo activo» rellena el textarea de reconciliación', /1874 \| ACME S\.A\. de C\.V\./.test(await pagina.locator('#catalogo').inputValue()))

  console.log('\n\x1b[1mLos catálogos persisten entre recargas (localStorage, no memoria)\x1b[0m')
  await pagina.reload({ waitUntil: 'networkidle' })
  comprueba('el catalogo sigue ahi tras recargar', /proveedores-prueba/.test(await pagina.locator('#cat-selector').innerText()))
  comprueba('con su fila intacta', /1874/.test(await pagina.locator('#cat-tabla-cont').innerText()))

  console.log('\n\x1b[1mEliminar un catálogo\x1b[0m')
  pagina.once('dialog', (d) => d.accept())
  await pagina.locator('#btn-cat-eliminar').click()
  comprueba('desaparece del selector', !/proveedores-prueba/.test(await pagina.locator('#cat-selector').innerText()))

  console.log('\n\x1b[1mUso de tokens: solo lo que el servidor declara, nunca un cero inventado\x1b[0m')
  comprueba('la seccion Uso de tokens esta', (await pagina.locator('h2', { hasText: 'Uso de tokens' }).count()) === 1)
  comprueba('sin corridas, lo dice', /Sin corridas todavía/i.test(await pagina.locator('#tokens-resumen').innerText()))

  // Servidor de mentira: /models contesta para pasar `pruebaLaConexion`, y /chat/completions
  // devuelve un `usage` real que la pagina tiene que leer y registrar — sin este intercept no hay
  // forma de probar el flujo entero sin depender de un motor de verdad.
  let cuerpoDeCompletions = { choices: [{ message: { content: JSON.stringify({ paginas: [{ indice: 0, markdown: 'FACTURA', campos: [{ clave: 'total', valor: '100.00', confianza: 0.9 }] }] }) } }], usage: { prompt_tokens: 1200, completion_tokens: 340, total_tokens: 1540 } }
  await pagina.route('**/uso-tokens.test/v1/models', (ruta) => ruta.fulfill({ status: 200, body: '{}' }))
  await pagina.route('**/uso-tokens.test/v1/chat/completions', (ruta) => ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cuerpoDeCompletions) }))

  await pagina.locator('#motor-base').fill('http://uso-tokens.test/v1')
  await pagina.locator('#motor-modelo').fill('modelo-pineado-1.0')
  await pagina.locator('#file-motor').setInputFiles(ESCANEO)
  await pagina.locator('#acciones-motor').waitFor({ state: 'visible' })
  await pagina.locator('#btn-extraer').click()
  await pagina.locator('#salida-motor').getByText(/campo\(s\) en/i).waitFor({ timeout: 15000 })
  comprueba('con usage en la respuesta, avisa cuánto declaró el servidor', /declaró.*1,?540 tokens/i.test((await pagina.locator('#salida-motor').innerText()).replace(/ /g, ' ')))

  const resumenTrasUna = await pagina.locator('#tokens-resumen').innerText()
  comprueba('el analisis cuenta la corrida', /1 corrida/.test(resumenTrasUna) && /1.*con uso declarado/.test(resumenTrasUna))
  comprueba('y suma el total real, no un estimado', /1,?540/.test(resumenTrasUna.replace(/ /g, ' ')))
  const filaTokens = await pagina.locator('#tokens-tabla').innerText()
  comprueba('la fila de la tabla trae el modelo y las paginas', /modelo-pineado-1\.0/.test(filaTokens) && /1[.,]?200/.test(filaTokens))

  console.log('\n\x1b[1mSin `usage` en la respuesta, se declara "sin declarar" — nunca cero\x1b[0m')
  cuerpoDeCompletions = { choices: [{ message: { content: JSON.stringify({ paginas: [{ indice: 0, markdown: 'FACTURA', campos: [{ clave: 'total', valor: '100.00', confianza: 0.9 }] }] }) } }] }
  await pagina.locator('#btn-extraer').click()
  await pagina.locator('#salida-motor').getByText(/no declaró/i).waitFor({ timeout: 15000 })
  comprueba('la pantalla del motor dice que no declaró, sin inventar un numero', /no declaró/i.test(await pagina.locator('#salida-motor').innerText()))

  const resumenTrasDos = await pagina.locator('#tokens-resumen').innerText()
  comprueba('ahora hay 2 corridas y sigue habiendo solo 1 con uso declarado', /2 corrida/.test(resumenTrasDos) && /1.*con uso declarado/.test(resumenTrasDos))
  comprueba('dice explicitamente que la sin declarar no cuenta como cero', /1.*sin declarar/.test(resumenTrasDos) && /no cuentan como cero/i.test(resumenTrasDos))
  comprueba('el total de tokens NO cambio: la corrida sin usage no sumo cero', /1,?540/.test(resumenTrasDos.replace(/ /g, ' ')))

  console.log('\n\x1b[1mBorrar el historial de tokens\x1b[0m')
  pagina.once('dialog', (d) => d.accept())
  await pagina.locator('#btn-tokens-limpiar').click()
  comprueba('vuelve a decir que no hay corridas', /Sin corridas todavía/i.test(await pagina.locator('#tokens-resumen').innerText()))

  const inesperadosFinal = errores.filter((e) => !e.includes('59999') && !/ERR_CONNECTION_REFUSED/.test(e))
  comprueba('ningun error de consola no provocado en toda la corrida', inesperadosFinal.length === 0, inesperadosFinal.join(' · '))
} finally {
  await navegador.close()
  servidor.kill()
}

console.log(fallos === 0 ? '\n\x1b[32mTodas las comprobaciones en verde.\x1b[0m\n' : `\n\x1b[31m${fallos} fallo(s).\x1b[0m\n`)
process.exit(fallos === 0 ? 0 : 1)
