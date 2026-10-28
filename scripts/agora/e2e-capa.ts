/**
 * Los malos de la capa en la VENTANA de Ágora (Playwright contra el laboratorio en localhost): una intención sin LLM
 * que lleva a su pantalla, una ambigua que pregunta, «apruébalo» que no aprueba, un cambio de monto que queda como
 * propuesta, y el freno del cierre: un click() sintético y un Enter no cierran; el clic humano sí, y la base gasta el
 * testigo (la segunda vez la misma cita ya no sirve). Cada paso comprueba la BASE, no solo la pantalla, y deja captura.
 *
 * Uso: node scripts/agora/e2e-capa.ts [url] [carpeta]   ·   solo laboratorio (datos ficticios), deja el periodo cerrado:
 * `npm run agora:laboratorio` vuelve a sembrar.
 */
import { chromium, type Page } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import pg from 'pg'

const RAIZ = resolve(import.meta.dirname, '../..')
const [URL = 'http://localhost:3021', CARPETA = join(RAIZ, 'docs/goals/agora-a2a-capturas')] = process.argv.slice(2)
mkdirSync(CARPETA, { recursive: true })
const entorno = Object.fromEntries(readFileSync(join(RAIZ, 'tools/agora/.laboratorio/entorno'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const db = new pg.Client({ connectionString: entorno.AGORA_PG_URL })
await db.connect()
const uno = async <T>(sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows[0] as T

const nav = await chromium.launch()
const resultados: Array<[string, boolean, string]> = []
const comprueba = (nombre: string, ok: boolean, detalle = '') => { resultados.push([nombre, ok, detalle]); console.log(`${ok ? '✓' : '✗'} ${nombre}${detalle ? ` — ${detalle}` : ''}`) }

async function pagina(persona: string): Promise<{ p: Page; errores: string[] }> {
  const c = await nav.newContext({ viewport: { width: 1680, height: 1050 }, locale: 'es-MX' })
  await c.addCookies([{ name: 'agora_persona', value: persona, url: URL }])
  await c.addInitScript(() => { try { localStorage.setItem('capa:agora:capa/agora/golfo-norte/capa/primer-arranque', JSON.stringify({ version: 1, terminado: true, paso: 5, nivel: 'lo-importante', voz: false })) } catch {} })
  const p = await c.newPage()
  const errores: string[] = []
  p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
  p.on('pageerror', (e) => errores.push(String(e)))
  return { p, errores }
}
async function dile(p: Page, texto: string): Promise<string> {
  const antes = await p.locator('[data-capa-mensaje][data-de="asistente"]').count()
  await p.locator('[data-capa-entrada]').fill(texto)
  await p.locator('[data-capa-boton="enviar"]').click()
  await p.waitForFunction((n) => document.querySelectorAll('[data-capa-mensaje][data-de="asistente"]').length > n, antes, { timeout: 20_000 })
  await p.waitForTimeout(600)
  return (await p.locator('[data-capa-mensaje][data-de="asistente"]').last().innerText()).trim()
}
const captura = (p: Page, nombre: string) => p.screenshot({ path: join(CARPETA, `${nombre}.png`) })

// 1. Una intención sin LLM: la lleva a su pantalla.
{
  const { p, errores } = await pagina('paula')
  await p.goto(`${URL}/agora`, { waitUntil: 'networkidle' })
  await dile(p, 'quiero el cronograma del plan')
  await p.waitForURL(/\/agora\/tablero/, { timeout: 15_000 }).catch(() => {})
  comprueba('una intención sin LLM lleva a su pantalla (el Gantt)', /\/agora\/tablero/.test(p.url()), p.url())
  await captura(p, '30-intencion-sin-llm')
  // 2. Una ambigua: pregunta entre las dos, no adivina.
  const r = await dile(p, 'abre el tablero de operaciones')
  comprueba('una intención ambigua pregunta en vez de adivinar', /\?|no lo s[eé]|no sé/i.test(r), r.slice(0, 140))
  await captura(p, '31-intencion-ambigua')
  // 3. «apruébalo»: no aprueba nada.
  const antes = await uno<{ n: string }>('select count(*) n from agora.aprobacion')
  const t = await dile(p, 'apruébalo')
  const despues = await uno<{ n: string }>('select count(*) n from agora.aprobacion')
  comprueba('«apruébalo» no aprueba: la base tiene las mismas aprobaciones', antes.n === despues.n && /no apruebo/i.test(t), `${antes.n} → ${despues.n}: ${t.slice(0, 100)}`)
  await captura(p, '32-apruebalo-no-aprueba')
  // 5. Un cambio de monto pedido por intención: queda como propuesta, el ítem no cambia.
  const it = await uno<{ id: string; monto: string }>(`select id, monto_mxn::text monto from agora.item where nombre ilike 'Campaña de lanzamiento en radio%' limit 1`)
  const props = await uno<{ n: string }>(`select count(*) n from agora.propuesta where estado = 'pendiente'`)
  const pregunta = await dile(p, 'cambia el monto de la campaña de radio a 121 mil')
  if (!/¿lo hago\?/i.test(pregunta)) comprueba('lo que escribe pregunta antes («lo importante»)', false, pregunta.slice(0, 90))
  const m = await dile(p, 'sí')
  const it2 = await uno<{ monto: string }>('select monto_mxn::text monto from agora.item where id = $1', [it?.id])
  const props2 = await uno<{ n: string }>(`select count(*) n from agora.propuesta where estado = 'pendiente'`)
  comprueba('un cambio de monto por intención queda como PROPUESTA (el ítem no cambia)', it?.monto === it2?.monto && Number(props2.n) === Number(props.n) + 1, `${it?.monto} → ${it2?.monto}; pendientes ${props.n} → ${props2.n}: ${m.slice(0, 90)}`)
  await captura(p, '33-monto-por-intencion-es-propuesta')
  comprueba('sin errores de consola (Paula)', errores.length === 0, errores.join(' | ').slice(0, 200))
}

// 4. El freno del cierre (Mariana, Finanzas): click() sintético y Enter no cierran; el clic humano sí.
{
  const { p, errores } = await pagina('mariana')
  await p.goto(`${URL}/agora/contabilidad?periodo=2026-09`, { waitUntil: 'networkidle' })
  const abierto = async () => (await uno<{ n: string }>(`select count(*) n from agora.periodo where periodo = '2026-09' and estado = 'cerrado'`)).n === '0'
  await dile(p, 'cierra los costos de septiembre')
  const freno = p.locator('[data-capa-boton="confirmar-freno"]').last()
  await freno.waitFor({ timeout: 10_000 })
  await captura(p, '34-freno-del-cierre')
  await freno.evaluate((b) => (b as HTMLButtonElement).click())
  await p.waitForTimeout(1500)
  comprueba('un click() sintético no cierra el periodo', await abierto())
  await freno.focus()
  await p.keyboard.press('Enter')
  await p.waitForTimeout(1500)
  comprueba('un Enter no cierra el periodo', await abierto())
  await freno.click()
  await p.waitForFunction(() => /Cerr[eé] los costos/.test(document.body.innerText), undefined, { timeout: 20_000 }).catch(() => {})
  comprueba('el clic humano cierra, y la base gastó el testigo de Mariana', !(await abierto()) && (await uno<{ n: string }>(`select count(*) n from agora.freno_testigo where accion = 'cierra_periodo' and usado_en is not null`)).n === '1')
  await captura(p, '35-cierre-por-el-freno')
  comprueba('sin errores de consola (Mariana)', errores.length === 0, errores.join(' | ').slice(0, 200))
}

await nav.close()
await db.end()
const malas = resultados.filter(([, ok]) => !ok).length
console.log(malas ? `\n${malas} comprobación(es) en rojo` : `\nTodo en verde: ${resultados.length}/${resultados.length}`)
process.exit(malas ? 1 : 0)
