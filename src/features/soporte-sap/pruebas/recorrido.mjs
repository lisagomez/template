#!/usr/bin/env node
/**
 * El recorrido del DoF (punto 7, pasos 1–12) con Playwright contra el laboratorio corriendo, con una
 * captura por paso y los errores de consola contados. Necesita el servidor con SOPORTE_SAP_LABORATORIO=1
 * (y el OCR local para leer la captura).
 *
 * Uso: node src/features/soporte-sap/pruebas/recorrido.mjs http://localhost:3001 docs/goals/soporte-sap-capturas
 */
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

const [base = 'http://localhost:3001', carpeta = 'docs/goals/soporte-sap-capturas'] = process.argv.slice(2)
const DOCS = resolve('tools/soporte-sap/documentos')
mkdirSync(carpeta, { recursive: true })

const navegador = await chromium.launch()
const pagina = await navegador.newPage({ viewport: { width: 1440, height: 1000 } })
const errores = []
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
pagina.on('pageerror', (e) => errores.push(e.message))
const pasos = []
const sel = (p) => `[data-prueba="${p}"]`

/** Captura la celda del bento que prueba el paso (o la vista, si no se dice cuál) y comprueba lo que debe verse. */
async function captura(n, que, comprueba, foco = null) {
  const [entero, decimal] = String(n).split('.')
  const archivo = join(carpeta, `paso-${entero.padStart(2, '0')}${decimal ? `-${decimal}` : ''}-${que.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40)}.jpg`)
  if (foco) await pagina.locator(foco).first().screenshot({ path: archivo, type: 'jpeg', quality: 60 })
  else await pagina.screenshot({ path: archivo, type: 'jpeg', quality: 60 })
  const ok = comprueba ? await comprueba() : true
  pasos.push({ paso: n, que, ok, archivo })
  console.log(`${ok ? '✓' : '✗'} ${n}. ${que} → ${archivo}`)
}
const rol = async (r) => { await pagina.click(sel(`rol-${r}`)); await pagina.waitForSelector(sel(`vista-${r}`)) }
const texto = async (s) => (await pagina.locator(s).allInnerTexts()).join('\n')
async function levanta(titulo, descripcion, archivos) {
  await pagina.fill(sel('titulo'), titulo)
  await pagina.fill(sel('descripcion'), descripcion)
  await pagina.setInputFiles(sel('adjuntos'), archivos.map((a) => join(DOCS, a)))
  await pagina.click(sel('levantar'))
  await pagina.waitForFunction(() => !document.querySelector('[data-prueba="levantar"]')?.hasAttribute('disabled'), null, { timeout: 120_000 })
}
async function decide(mensajeContiene, accion, motivo) {
  const m = pagina.locator('li[data-prueba^="sala-"]', { hasText: mensajeContiene }).filter({ has: pagina.locator(sel('acciones-sala')) }).first()
  if (motivo) { await m.locator(sel('motivo')).fill(motivo); await m.locator(sel('a-revision')).click() }
  else await m.locator(sel(accion)).click()
  await pagina.waitForTimeout(400)
}
async function chatea(t) { await pagina.fill(sel('chat-texto'), t); await pagina.click(sel('chat-enviar')); await pagina.waitForTimeout(400) }

await pagina.goto(`${base}/soporte-sap`)
await pagina.click(sel('reinicia'))
await rol('cliente')

// 1–3: el N3 levanta con una captura y un CFDI; la evidencia y la categorización con su traza.
await levanta('MIGO no deja contabilizar la entrada', 'Al contabilizar la entrada 101 en MIGO sale el mensaje M7 053 en sociedad 1000; necesitamos el periodo 2026/10 y toda la planta está detenida hoy.', ['captura-migo.png', 'cfdi-rechazado.xml'])
await captura(1, 'N3 levanta una incidencia con adjuntos', async () => (await texto(sel('incidencias'))).includes('inc-001'), sel('vista-cliente'))
await pagina.locator(sel('evidencia')).scrollIntoViewIfNeeded()
await captura(2, 'evidencia extraida por campo y en revision', async () => { const t = await texto(sel('evidencia')); return /captura-migo\.png/.test(t) && /cfdi-rechazado\.xml/.test(t) && /por revisar/.test(t) }, sel('evidencia'))
await pagina.click(`${sel('cadena')} summary`)
await captura(3, 'el agente categoriza con la evidencia y la traza', async () => { const t = await texto(sel('categorizacion')); return /Prioridad P[12]/.test(t) && /SS-MM-PERIODO/.test(t) && /íntegra ✓/.test(await texto(sel('cadena'))) }, sel('detalle-inc-001'))

// 4: caso conocido → ejecutor → supervisor → sala → aprobación humana → simulador con antes y después.
await rol('superadmin')
await captura(4, 'plan del caso conocido en la sala con veredicto del supervisor', async () => /Supervisor \(agente:supervisor-sap\): 6\/6/.test(await texto(sel('sala'))), sel('sala'))
await decide('Plan v1 para inc-001', 'aprobar')
await rol('cliente')
await pagina.locator(sel('antes-despues')).first().scrollIntoViewIfNeeded()
await captura(4.5, 'aprobado por el HIL y aplicado al simulador antes y despues', async () => /error presente.*error ausente/s.test(await texto(sel('antes-despues'))), sel('plan-v1'))

// 5: caso desconocido → anonimiza → sandbox → el experto enseña en el chat → propuesta de regla y de CLI.
await levanta('La app Fiori F0842 se queda en blanco', 'La app Fiori F0842 se queda en blanco al abrirla desde el launchpad; lo reporta Xóchitl Tzompantzi, xtzompantzi@alimentos.example', [])
await rol('experto')
await chatea('Te enseño el caso inc-002 de la app Fiori en blanco: en Alimentos del Bajío pasa con la ZFI_FIORI_CACHE; hay que limpiar la caché del launchpad, y vuelve a abrir')
await captura(5, 'caso desconocido anonimizado al sandbox y el experto enseña', async () => { const s = await texto(sel('sandbox')); const p = await texto(sel('propuestas')); return /\[NOMBRE\]/.test(s) && !/Tzompantzi/.test(s) && /ss-limpiar-cache/.test(p) && /regla/.test(p) && /a medida de andina/.test(p) && (await pagina.locator('[data-prueba^="al-nucleo-"]').count()) === 0 && !/Fiori F0842 se queda en blanco|Tzompantzi/.test(await texto(sel('incidencias'))) })

// 5.1 (PRP-010 H-19): lo enseñado queda a medida de la consultora; al núcleo lo sube el superadministrador, generalizado.
await rol('superadmin')
await pagina.locator('[data-prueba^="al-nucleo-"]').first().click()
await pagina.waitForTimeout(400)
await captura(5.1, 'el superadministrador sube la enseñanza al núcleo generalizada', async () => { const p = await texto(sel('propuestas')); return /núcleo/.test(p) && /\[CLIENTE\]/.test(p) && /\[OBJETO_PROPIO\]/.test(p) && !/Bajío|ZFI_FIORI_CACHE/.test(p) && (await pagina.locator('[data-prueba^="al-nucleo-"]').count()) === 0 }, sel('propuestas'))

// 6: revisión → el agente corrige y vuelve a proponer.
await rol('cliente')
await levanta('FB01 no deja contabilizar', 'FB01 marca F5 201: el periodo contable no está abierto en sociedad 1000 para el periodo 2026/10', [])
await rol('superadmin')
await decide('Plan v1 para inc-003', 'a_revision', 'El periodo correcto es el periodo 2026/11; corrige y vuelve a proponer')
await captura(6, 'a revision el agente corrige y propone la v2', async () => /Plan v2 para inc-003[\s\S]*periodo: 2026\/10 → 2026\/11/.test(await texto(sel('sala'))), sel('sala'))

// 10: el chat del HIL: métrica con definición; aprobar desde el chat se promueve a la sala y se aprueba allí.
await chatea('¿Cuál fue el MTTR de Consultora Andina en septiembre de 2026?')
await chatea('Aprueba la tarea-inc-003, ya lo revisé')
await captura(10, 'chat del HIL metrica con definicion y peticion promovida a la sala', async () => { const c = await texto(sel('chat')); const s = await texto(sel('sala')); return /Definición:/.test(c) && /capa semántica · mttr_horas/.test(c) && /No apruebo desde el chat/.test(c) && /desde el chat del HIL/.test(s) }, sel('chat'))
await decide('Plan v2 para inc-003', 'aprobar')
await captura(10.5, 'la v2 se aprueba en la sala con la sesion humana', async () => /aprobar por usr-superadmin/.test(await texto(sel('sala'))), sel('sala'))

// 7 y 11: el workspace del consultor con SLA y horas; el reloj corre, se pausa, se reanuda; el incumplimiento con su evidencia.
await rol('consultor')
// PRP-010 H-17 (DP-4): el plan de inc-001 fue a la sala (y se aplicó), y eso NO es haberle respondido al cliente; la
// primera respuesta la da el consultor. Se mira el ESTADO del reloj y la CADENA (textContent: el <details> está cerrado),
// no los minutos: «respuesta 0 min» se ve igual antes y después. Y la cadena sola tampoco basta: el código viejo
// marcaba la primera respuesta en el reloj sin anotarla en la cadena, así que el estado del reloj es lo que la delata
// (con el código viejo, esta P1 decía «respuesta en meta» sin que nadie hubiera respondido).
const cadena = async () => (await pagina.locator(sel('cadena')).first().textContent()) ?? ''
await pagina.click(sel('incidencia-inc-001'))
await captura(11.1, 'con el plan ya en la sala nadie le ha respondido al cliente', async () => { const c = await cadena(), r = await texto(sel('reloj-incidencia')); return /ENVIADA_A_SALA/.test(c) && !/PRIMERA_RESPUESTA/.test(c) && /en plazo/.test(r) && !/respuesta en meta/.test(r) }, sel('reloj-incidencia'))
await pagina.fill(`${sel('responde-al-cliente')} input`, 'Ya revisamos el periodo contable; te confirmamos hoy mismo.')
await pagina.click(`${sel('responde-al-cliente')} button`)
await pagina.waitForTimeout(400)
await captura(11.2, 'la primera respuesta la marca el consultor al responder', async () => /PRIMERA_RESPUESTA · usr-consultor/.test(await cadena()) && /respuesta en meta/.test(await texto(sel('reloj-incidencia'))), sel('reloj-incidencia'))
await pagina.click(sel('incidencia-inc-002'))
await pagina.click(sel('espera-cliente'))
await pagina.waitForTimeout(1200)
await pagina.click(sel('responde-cliente'))
await pagina.waitForTimeout(400)
await captura(7, 'workspace del consultor con SLA y horas', async () => { const t = await texto(sel('sla')); return /P1/.test(t) && /SAP Enterprise Support/.test(t) && (await texto(sel('horas'))).includes('Horas') }, sel('sla'))
await captura(11, 'reloj de una incidencia corre se pausa y se reanuda', async () => { const r = await texto(sel('reloj-incidencia')); return /pausa/.test(r) && /RESPUESTA_CLIENTE/.test(r) }, sel('reloj-incidencia'))
await pagina.locator(sel('reloj-demo')).scrollIntoViewIfNeeded()
await captura(11.5, 'incumplimiento de SLA con su evidencia', async () => { const d = await texto(sel('reloj-demo')); return /fuera de meta/.test(d) && /ESPERA_CLIENTE/.test(d) && /RESPUESTA_CLIENTE/.test(d) }, sel('reloj-demo'))
await pagina.locator(sel('accionables')).scrollIntoViewIfNeeded()
await captura(12, 'accionables con impacto en MXN en el tablero del consultor', async () => { const t = await texto(sel('accionables')); return /Fórmula:/.test(t) && /Supuestos:/.test(t) && /MXN al mes/.test(t) && /para la consultora/.test(t) }, sel('accionables'))

// 8: el tablero del N3 con métricas y FODA; 12 también en el N3.
await rol('cliente')
await captura(8, 'tablero del N3 con metricas y FODA que cita su dato', async () => { const f = await texto(sel('foda')); return /Dato: /.test(f) && /Criterio: /.test(f) && /capa semántica/.test(await pagina.locator(sel('tablero')).innerHTML()) }, sel('foda'))
await pagina.locator(sel('accionables')).scrollIntoViewIfNeeded()
await captura(12.5, 'accionables con impacto en MXN en el tablero del N3', async () => { const t = await texto(sel('accionables')); return /para el cliente/.test(t) && !/para la consultora/.test(t) }, sel('accionables'))

// 9: las vistas del superadministrador y del experto.
await rol('superadmin')
await captura(9, 'vista del superadministrador', async () => /Todas las consultoras/.test(await texto(sel('tablero'))) && !/inc-002/.test(await texto(sel('incidencias'))))
await rol('experto')
await captura(9.5, 'vista del experto', async () => { const t = await texto(sel('tablero')); return /Todas las consultoras/.test(t) && !/Horas por incidencia/.test(t) })

// 13 (PRP-010 H-18): el presupuesto del mes. El superadministrador lo deja en 0: un P1 con una captura pasa a una
// persona AHORA (por la imagen sin leer y por el presupuesto) y un P4 espera, con aviso. El consultor lo ve.
await rol('superadmin')
await pagina.fill(sel('tope-tokens-andina'), '0')
await pagina.fill(sel('tope-ocr-andina'), '0')
await pagina.locator(`${sel('fija-presupuesto-andina')} button`).click()
await pagina.waitForTimeout(400)
await rol('cliente')
await levanta('MIGO detenida otra vez', 'Al contabilizar la entrada 101 en MIGO sale el mensaje M7 053 en sociedad 1000; necesitamos el periodo 2026/10 y toda la planta está detenida hoy.', ['captura-migo.png'])
await levanta('Usuario bloqueado', 'El usuario ALMACEN01 está bloqueado en SU01, cuando puedan', [])
await rol('consultor')
await pagina.locator(sel('presupuesto')).scrollIntoViewIfNeeded()
await captura(13, 'al tope del presupuesto el P1 pasa a una persona y el P4 espera', async () => {
  const t = await texto(sel('presupuesto'))
  return /tokens [\d.,]+ de 0/.test(t) && /a una persona[^\n]*evidencia sin leer/.test(t) && /a una persona[^\n]*no alcanza[^\n]*P1 pasa a una persona/.test(t) && /en espera[^\n]*P4 espera/.test(t)
}, sel('presupuesto'))

// 14 (PRP-010 H-10): el cliente impugna la prioridad; la consultora la resuelve a su nombre, y una resuelta no se reabre.
const abre = (titulo) => pagina.locator('[data-prueba^="incidencia-"]', { hasText: titulo }).first().click()
await rol('cliente')
await abre('Usuario bloqueado')
await pagina.selectOption(sel('impugna-campo'), 'prioridad')
await pagina.fill(sel('impugna-motivo'), 'Es P4, pero nadie del almacén puede surtir sin ese usuario')
await pagina.click(sel('impugna-envia'))
await pagina.waitForTimeout(400)
await rol('consultor')
await abre('Usuario bloqueado')
await pagina.click(sel('impugnacion-acepta'))
await pagina.waitForTimeout(400)
await rol('cliente')
await abre('Usuario bloqueado')
await captura(14, 'el cliente impugna y la consultora la resuelve a su nombre', async () => {
  const t = await texto(sel('impugnaciones'))
  return /aceptada/.test(t) && /prioridad/.test(t) && /nadie del almacén/.test(t) && /resuelta por usr-consultor-andina/.test(t) && (await pagina.locator(sel('impugnacion-acepta')).count()) === 0
}, sel('impugnaciones'))

// H-28: el FODA dice su confianza, y una proyección dice que no es una promesa.
await captura(14.5, 'el FODA lleva su confianza y la proyección su aviso', async () => {
  const f = await texto(sel('foda')), a = await texto(sel('accionables'))
  return /confianza (media|baja)/.test(f) && /Proyección con supuestos, no una promesa/.test(a)
}, sel('foda'))

await navegador.close()
const malos = pasos.filter((p) => !p.ok)
console.log(`\n${pasos.length} capturas · ${malos.length} comprobaciones en rojo · ${errores.length} errores de consola${errores.length ? `:\n  ${errores.join('\n  ')}` : ''}`)
process.exit(malos.length || errores.length ? 1 : 0)
