/**
 * La segregación QUITADA deja huella donde se ve (registro de riesgo de Ágora, 2026-10-29). En la base del laboratorio,
 * por las mismas puertas que la app:
 *   1. Finanzas cierra septiembre por el freno (si no estaba cerrado);
 *   2. la Propietaria quita la segregación, también por el freno;
 *   3. Contabilidad acepta la póliza.
 * Después se mira en la ventana: Mariana (Finanzas) ve el aviso fijo en Costos, y Sofía (Contabilidad) ve la aceptación
 * marcada en el paquete. Al final deja la segregación PUESTA otra vez. Ensucia el laboratorio: después,
 * `npm run agora:laboratorio` siembra una base nueva.
 *
 * Requiere el laboratorio sembrado y `npm run agora:dev`. Uso: node scripts/agora/segregacion-quitada.ts [url] [carpeta]
 */
import { chromium } from 'playwright'
import { join } from 'node:path'
import { leeEntorno, RAIZ } from './entorno.ts'
const [URL = 'http://localhost:3021', CARPETA = join(RAIZ, 'docs/goals/agora-a2a-capturas')] = process.argv.slice(2)
const { basePostgres } = await import('../../tools/agora/dist/base/pg.js')
const { atestigua, cambiaSegregacion, cierraPeriodo, decidePoliza } = await import('../../tools/agora/dist/index.js')
const { GOLFO, persona } = await import('../../tools/agora/dist/laboratorio/datos.js')
const env = leeEntorno()
if (!env.AGORA_PG_URL || !env.AGORA_SECRETO) { console.error('✗ no hay laboratorio (AGORA_PG_URL / AGORA_SECRETO: ausentes): npm run agora:laboratorio'); process.exit(2) }
const e = { base: basePostgres(env.AGORA_PG_URL), secreto: env.AGORA_SECRETO }
let malas = 0
const ok = (bien: boolean, texto: string) => { if (!bien) malas++; console.log(`${bien ? '✓' : '✗'} ${texto}`) }

const cerrado = (await e.base.consulta<{ n: string }>(`select count(*) n from agora.periodo where org_id = $1 and periodo = '2026-09' and estado = 'cerrado'`, [GOLFO]))[0]!.n !== '0'
if (!cerrado) {
  await atestigua(e, persona('mariana'), ['cierra los costos de septiembre de 2026'])
  await cierraPeriodo(e, persona('mariana'), { org: GOLFO, periodo: '2026-09', cita: 'cierra los costos de septiembre de 2026' })
}
await atestigua(e, persona('paula'), ['quita la segregación de funciones'])
await cambiaSegregacion(e, persona('paula'), GOLFO, false, 'quita la segregación de funciones')
const [pol] = await e.base.consulta<{ id: string; sha256: string; estado: string }>(`select id, sha256, estado from agora.poliza where org_id = $1 and periodo = '2026-09' order by generada_en desc limit 1`, [GOLFO])
if (pol?.estado === 'propuesta') await decidePoliza(e, persona('sofia'), { poliza: pol.id, sha256: pol.sha256, decision: 'acepta' })
const [d] = await e.base.consulta<{ m: boolean }>('select sin_segregacion m from agora.poliza_decision where poliza_id = $1 and decision = $2', [pol?.id, 'acepta'])
ok(d?.m === true, `la base marcó la aceptación de la póliza: sin_segregacion = ${d?.m}`)

const nav = await chromium.launch()
const errores: string[] = []
async function mira(quien: string, ruta: string, selector: string, archivo: string, que: string) {
  const c = await nav.newContext({ viewport: { width: 1680, height: 1050 }, locale: 'es-MX' })
  await c.addCookies([{ name: 'agora_persona', value: quien, url: URL }])
  await c.addInitScript(() => { try { localStorage.setItem('capa:agora:capa/agora/golfo-norte/capa/primer-arranque', JSON.stringify({ version: 1, terminado: true, paso: 5, nivel: 'lo-importante', voz: false })) } catch { /* sin almacenamiento */ } })
  const p = await c.newPage()
  p.on('pageerror', (x) => errores.push(String(x)))
  await p.goto(`${URL}${ruta}`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1200)
  const el = p.locator(selector).first()
  const visto = await el.isVisible().catch(() => false)
  if (visto) await el.scrollIntoViewIfNeeded()
  ok(visto, `${que}: «${visto ? (await el.innerText()).replace(/\s+/g, ' ').slice(0, 140) : 'no está'}»`)
  await p.screenshot({ path: join(CARPETA, archivo) })
  await c.close()
}
await mira('mariana', '/agora/costos', '[data-aviso="segregacion_off"]', '40-segregacion-quitada-aviso-finanzas.png', 'Mariana (Finanzas) ve el aviso fijo en Costos')
await mira('sofia', '/agora/contabilidad?periodo=2026-09', '[data-sin-segregacion]', '41-poliza-aceptada-sin-segregacion.png', 'Sofía (Contabilidad) ve la aceptación marcada en el paquete')
await nav.close()

await cambiaSegregacion(e, persona('paula'), GOLFO, true, 'vuelve a poner la segregación')
const fijos = (await e.base.consulta<{ n: string }>(`select count(*) n from agora.aviso where org_id = $1 and tipo = 'segregacion_off' and not atendido`, [GOLFO]))[0]!.n
ok(fijos === '0', `puesta otra vez, el aviso queda atendido (avisos fijos: ${fijos})`)
ok(errores.length === 0, `errores de página: ${errores.length}${errores.length ? ` — ${errores[0]}` : ''}`)
await e.base.cierra()
console.log(malas ? `✗ ${malas} en rojo` : 'Todo en verde: la segregación quitada se ve en Costos y en el paquete')
process.exit(malas ? 1 : 0)
