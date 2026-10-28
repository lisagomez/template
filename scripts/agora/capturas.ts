/**
 * Las capturas del goal, cada una con su comprobación EN LA BASE (no solo la pantalla): el tablero en sus tres vistas
 * con la propuesta de un agente; el Editor rechazado y Finanzas aprobando un monto sobre el umbral (comprometido antes y
 * después); los costos por centro con el gasto de los agentes en MXN y las filas sin costo; el cierre por el freno y
 * Contabilidad aceptando la póliza cuadrada; el socio revocado cuya siguiente llamada se rechaza; las métricas que
 * cuadran con el libro.
 *
 * Uso: node scripts/agora/capturas.ts [url] [carpeta]. Solo laboratorio: mueve la base del laboratorio (aprueba,
 * cierra, revoca); `npm run agora:laboratorio` la vuelve a sembrar. Corre después de `e2e-capa.ts` o en una base nueva.
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
const resultados: Array<[string, boolean]> = []
const comprueba = (nombre: string, ok: boolean, detalle = '') => { resultados.push([nombre, ok]); console.log(`${ok ? '✓' : '✗'} ${nombre}${detalle ? ` — ${detalle}` : ''}`) }
const errores: string[] = []

async function como(persona: string): Promise<Page> {
  const c = await nav.newContext({ viewport: { width: 1680, height: 1050 }, locale: 'es-MX' })
  await c.addCookies([{ name: 'agora_persona', value: persona, url: URL }])
  await c.addInitScript(() => { try { localStorage.setItem('capa:agora:capa/agora/golfo-norte/capa/primer-arranque', JSON.stringify({ version: 1, terminado: true, paso: 5, nivel: 'lo-importante', voz: false })) } catch {} })
  const p = await c.newPage()
  p.on('console', (m) => { if (m.type() === 'error') errores.push(`${persona}: ${m.text()}`) })
  p.on('pageerror', (e) => errores.push(`${persona}: ${String(e)}`))
  return p
}
const ve = async (p: Page, ruta: string) => { await p.goto(`${URL}${ruta}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800) }
const captura = (p: Page, nombre: string) => p.screenshot({ path: join(CARPETA, `${nombre}.png`) })
/** El contenido vive en un contenedor con scroll (la ventana de la capa), no en la página. */
const baja = (p: Page, sel: string) => p.locator(sel).first().evaluate((e) => e.scrollIntoView({ block: 'start' })).then(() => p.waitForTimeout(300))
async function dile(p: Page, texto: string): Promise<string> {
  const antes = await p.locator('[data-capa-mensaje][data-de="asistente"]').count()
  await p.locator('[data-capa-entrada]').fill(texto)
  await p.locator('[data-capa-boton="enviar"]').click()
  await p.waitForFunction((n) => document.querySelectorAll('[data-capa-mensaje][data-de="asistente"]').length > n, antes, { timeout: 20_000 })
  await p.waitForTimeout(600)
  return (await p.locator('[data-capa-mensaje][data-de="asistente"]').last().innerText()).trim()
}

// 1. El tablero: tabla, kanban y Gantt, con la propuesta de un agente como fantasma (no aplicada).
{
  const p = await como('paula')
  for (const [vista, n] of [['tabla', '01'], ['kanban', '02'], ['gantt', '03']] as const) {
    await ve(p, `/agora/tablero?vista=${vista}`)
    const fantasmas = await p.locator('[data-fantasma]').count()
    comprueba(`tablero en ${vista}: la propuesta de un agente se ve como fantasma, sin aplicarse`, (await p.locator(`[data-vista="${vista}"]`).count()) === 1 && fantasmas > 0, `${fantasmas} fantasma(s)`)
    await captura(p, `${n}-tablero-${vista}`)
  }
}

// 2. El Editor no puede aprobar un monto sobre el umbral; Finanzas sí, y el comprometido sube por el monto.
{
  // Cambia el monto de la pauta (de «antes» a «después»): el comprometido sube la DIFERENCIA, no el monto entero.
  const pr = await uno<{ id: string; cat: string; monto: string; antes: string }>(`select id, categoria_id cat, monto_mxn::text monto, (payload -> 'cambios' -> 0 ->> 'antes') antes from agora.propuesta where clave = 'siembra:p-radio'`)
  const comp = async () => Number((await uno<{ c: string }>(`select coalesce(sum(comprometido_mxn), 0)::text c from agora.v_centro_periodo where categoria_id = $1`, [pr.cat])).c)
  const antes = await comp()
  const ed = await como('daniel')
  await ve(ed, `/agora/buzon?cat=${pr.cat}&propuesta=${pr.id}`)
  await baja(ed, `[data-propuesta="${pr.id}"]`)
  await ed.locator(`[data-propuesta="${pr.id}"] [data-decide="intentar"]`).click()
  await ed.locator(`[data-propuesta="${pr.id}"] [data-aviso-decision]`).waitFor({ timeout: 15_000 })
  const aviso = await ed.locator(`[data-propuesta="${pr.id}"] [data-aviso-decision]`).innerText()
  comprueba('el Editor intenta aprobar 132 000 MXN y la BASE lo rechaza', /matriz|finanzas|no te deja/i.test(aviso) && (await uno<{ n: string }>('select count(*) n from agora.aprobacion where propuesta_id = $1', [pr.id])).n === '0', aviso.slice(0, 120))
  await captura(ed, '04-editor-rechazado')
  const fi = await como('mariana')
  await ve(fi, `/agora/costos`)
  await captura(fi, '05-comprometido-antes')
  await ve(fi, `/agora/buzon?cat=${pr.cat}&propuesta=${pr.id}`)
  await baja(fi, `[data-propuesta="${pr.id}"]`)
  await fi.locator(`[data-propuesta="${pr.id}"] [data-decide="aprobar"]`).click()
  await fi.waitForFunction((id) => document.querySelector(`[data-propuesta="${id}"]`)?.getAttribute('data-estado') === 'aplicada', pr.id, { timeout: 20_000 }).catch(() => {})
  await captura(fi, '06-finanzas-aprueba')
  const despues = await comp()
  const delta = Number(pr.monto) - Number(pr.antes)
  comprueba('Finanzas aprueba con su clic y el comprometido sube exactamente lo que cambió el monto', delta > 0 && Math.round((despues - antes) * 100) === Math.round(delta * 100), `${antes} → ${despues} (${pr.antes} → ${pr.monto}: +${delta})`)
  await ve(fi, `/agora/costos`)
  await captura(fi, '07-comprometido-despues')
}

// 3. Costos por centro con el gasto de los agentes en MXN y las filas sin costo declaradas.
{
  const p = await como('mariana')
  await ve(p, '/agora/costos?periodo=2026-10')
  const sin = Number(await p.locator('[data-sin-costo]').first().getAttribute('data-sin-costo'))
  const base = Number((await uno<{ n: string }>(`select count(*) n from agora.gasto_modelo where periodo = '2026-10' and costo_mxn is null`)).n)
  comprueba('costos: las filas sin costo de la pantalla son las de la base (null, no cero)', sin === base && base > 0, `${sin} = ${base}`)
  await captura(p, '08-costos-por-centro')
  await baja(p, '[data-gasto-agentes]')
  await captura(p, '09-gasto-de-agentes-en-mxn')
}

// 4. El cierre por el freno (Mariana) y Contabilidad acepta la póliza cuadrada (Sofía).
{
  const p = await como('mariana')
  await ve(p, '/agora/contabilidad?periodo=2026-09')
  const cerrado = async () => (await uno<{ n: string }>(`select count(*) n from agora.periodo where periodo = '2026-09' and estado = 'cerrado'`)).n === '1'
  if (!(await cerrado())) {
    await dile(p, 'cierra los costos de septiembre')
    await p.locator('[data-capa-boton="confirmar-freno"]').last().click()
    await p.waitForFunction(() => /Cerr[eé] los costos/.test(document.body.innerText), undefined, { timeout: 20_000 }).catch(() => {})
  }
  comprueba('Finanzas cerró septiembre por el freno', await cerrado())
  await captura(p, '10-cierre-por-el-freno')
  const s = await como('sofia')
  await ve(s, '/agora/contabilidad?periodo=2026-09')
  const pol = await uno<{ id: string; cargos: string; abonos: string }>(`select p.id, sum(m.importe) filter (where m.naturaleza = 'cargo')::text cargos, sum(m.importe) filter (where m.naturaleza = 'abono')::text abonos
      from agora.poliza p join agora.poliza_movimiento m on m.poliza_id = p.id where p.periodo = '2026-09' group by p.id`)
  await baja(s, `[data-poliza="${pol.id}"]`)
  await s.locator(`[data-poliza="${pol.id}"] [data-acepta]`).click()
  await s.waitForFunction((id) => document.querySelector(`[data-poliza="${id}"]`)?.getAttribute('data-estado-poliza') === 'aceptada', pol.id, { timeout: 20_000 }).catch(() => {})
  const est = await uno<{ estado: string }>('select estado from agora.poliza where id = $1', [pol.id])
  comprueba('Contabilidad acepta la póliza CUADRADA (cargos = abonos)', est.estado === 'aceptada' && pol.cargos === pol.abonos, `${pol.cargos} = ${pol.abonos}`)
  await captura(s, '11-contabilidad-acepta-la-poliza')
}

// 5. El socio revocado por el freno: su siguiente llamada se rechaza y llamadas_tras_revocar = 0.
{
  const p = await como('paula')
  await ve(p, '/agora/agentes')
  await dile(p, 'revoca a fletes del golfo')
  await p.locator('[data-capa-boton="confirmar-freno"]').last().click()
  await p.waitForFunction(() => /Revoqu[eé] a/.test(document.body.innerText), undefined, { timeout: 20_000 }).catch(() => {})
  comprueba('Paula revocó a Fletes del Golfo por el freno', (await uno<{ estado: string }>(`select estado from agora.agente where slug = 'fletes-golfo'`)).estado === 'revocado')
  await ve(p, '/agora/agentes')
  await p.locator('[data-socio-simulado] select').selectOption('fletes-golfo')
  await p.locator('[data-socio-simulado] [data-escenario="valida"]').click()
  await p.locator('[data-resultados-socio] li').first().waitFor({ timeout: 15_000 })
  const r = await p.locator('[data-resultados-socio] li').first().getAttribute('data-resultado')
  const tras = await uno<{ n: string }>(`select coalesce(sum(llamadas), 0)::text n from agora.v_llamadas_tras_revocar`)
  comprueba('la siguiente llamada del socio revocado se rechaza y llamadas_tras_revocar = 0', r === 'rechazada' && tras.n === '0', `${r}; tras revocar: ${tras.n}`)
  await baja(p, '[data-socio-simulado]')
  await captura(p, '12-socio-revocado-rechazado')
}

// 6. Las métricas cuadran con el libro.
{
  const p = await como('paula')
  await ve(p, '/agora/metricas?periodo=2026-10')
  const marcas = await p.locator('[data-cuadra]').evaluateAll((xs) => xs.map((x) => x.getAttribute('data-cuadra')))
  comprueba('cada cifra sumable de las métricas cuadra al centavo con el libro', marcas.length >= 6 && marcas.every((x) => x === 'si'), marcas.join(','))
  await captura(p, '13-metricas-cuadran')
}

comprueba('sin errores de consola en ninguna pantalla', errores.length === 0, errores.join(' | ').slice(0, 300))
await nav.close()
await db.end()
const malas = resultados.filter(([, ok]) => !ok).length
console.log(malas ? `\n${malas} comprobación(es) en rojo` : `\nTodo en verde: ${resultados.length}/${resultados.length}`)
process.exit(malas ? 1 : 0)
