/**
 * Recorrido del lienzo del Estudio con Playwright, en escritorio y celular: los 7 flujos del spec con capturas,
 * axe-core (WCAG 2.2 AA, solo serias y críticas) y una GUARDIA DE RED (toda petición del navegador fuera de la app
 * se aborta y se anota). Usa el agente REAL (Haiku 5.5 pineado, con el tope del lienzo).
 *
 * Requiere el servidor con ESTUDIO_LABORATORIO=1 y la llave en su entorno:  ESTUDIO_URL=http://localhost:3001
 * Uso: node scripts/estudio-dashboards/recorrido.ts   → docs/goals/estudio-dashboards-capturas/ + recorrido.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';

const BASE = process.env['ESTUDIO_URL'] ?? 'http://localhost:3001';
const CAPTURAS = join(process.cwd(), 'docs/goals/estudio-dashboards-capturas');
mkdirSync(CAPTURAS, { recursive: true });
type Vista = 'escritorio' | 'celular';
const VISTAS: Record<Vista, { viewport: { width: number; height: number }; isMobile: boolean; hasTouch: boolean }> = {
  escritorio: { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
  celular: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};
const registro = { externas: [] as string[], errores: [] as string[], axe: [] as { paso: string; vista: Vista; serias: { id: string; impacto: string; nodos: number; ayuda: string }[] }[], pasos: [] as { vista: Vista; paso: string; ms: number; detalle: string }[] };
const OCULTA_DEV = 'nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; }';

async function captura(p: Page, vista: Vista, nombre: string, opciones: { completa?: boolean; selector?: string } = {}) {
  await p.addStyleTag({ content: OCULTA_DEV }).catch(() => undefined);
  await p.waitForTimeout(300);
  const ruta = join(CAPTURAS, `${vista}-${nombre}.png`);
  if (opciones.selector) await p.locator(opciones.selector).first().screenshot({ path: ruta });
  else await p.screenshot({ path: ruta, fullPage: opciones.completa ?? false });
}

async function axe(p: Page, vista: Vista, paso: string) {
  await p.addScriptTag({ path: join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
  const r = await p.evaluate(async () => {
    const a = (window as unknown as { axe: { run(c: unknown, o: unknown): Promise<{ violations: { id: string; impact: string | null; nodes: unknown[]; help: string }[] }> } }).axe;
    return a.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
  });
  registro.axe.push({ paso, vista, serias: r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => ({ id: v.id, impacto: v.impact ?? '', nodos: v.nodes.length, ayuda: v.help })) });
}

async function paso(vista: Vista, nombre: string, f: () => Promise<string | void>) {
  const t = Date.now();
  const detalle = (await f()) ?? '';
  registro.pasos.push({ vista, paso: nombre, ms: Date.now() - t, detalle });
  console.log(`  ✓ ${vista} · ${nombre} (${((Date.now() - t) / 1000).toFixed(1)} s)${detalle ? ` · ${detalle}` : ''}`);
}

async function instruye(p: Page, texto: string): Promise<string> {
  await p.getByLabel('Instrucción para el agente').fill(texto);
  await p.getByRole('button', { name: 'Regenerar' }).click();
  const entendi = p.getByRole('region', { name: 'Lo que entendí' });
  await entendi.waitFor({ timeout: 90_000 });
  return (await entendi.locator('[class*="ficha"]').allTextContents()).join(' · ');
}

async function aplica(p: Page, version: number) {
  await p.getByRole('button', { name: 'Aplicar como versión nueva' }).click();
  await p.getByText(new RegExp(`versión ${version}\\b`)).first().waitFor({ timeout: 60_000 });
}

async function nodo(p: Page, tienda: string) {
  return (await p.locator(`[data-nodo][aria-label^="${tienda}:"]`).boundingBox())!;
}

async function flujos(b: Browser, vista: Vista) {
  const ctx = await b.newContext({ ...VISTAS[vista], locale: 'es-MX', timezoneId: 'America/Mexico_City' });
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); if (u.origin === BASE || ['data:', 'blob:'].includes(u.protocol)) return r.continue(); registro.externas.push(u.origin + u.pathname); return r.abort(); });
  const p = await ctx.newPage();
  p.on('pageerror', (x) => registro.errores.push(`${vista} · ${String(x).slice(0, 200)}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/hmr|webpack|React DevTools/i.test(m.text())) registro.errores.push(`${vista} · ${m.text().slice(0, 200)}`); });
  await p.request.post(`${BASE}/api/estudio-dashboards`, { data: { accion: 'reinicia', tablero: 'growth' } });
  await p.goto(`${BASE}/laboratorio-estudio-dashboards`);
  await p.getByText(/versión 0\b/).first().waitFor({ timeout: 90_000 });
  await p.locator('[data-componente="ciclo"] article').first().waitFor({ timeout: 90_000 });
  await axe(p, vista, 'inicial');
  await paso(vista, '1 · margen por región sin mayoreo', async () => {
    await captura(p, vista, '1a-antes');
    const e = await instruye(p, 'Muéstrame margen por región en 2026, sin mayoreo, y resalta las tiendas debajo del 23 %');
    await captura(p, vista, '1b-lo-que-entendi', { completa: vista === 'escritorio' });
    await axe(p, vista, 'lo que entendí');
    await aplica(p, 1);
    await captura(p, vista, '1c-despues', { completa: true });
    return e;
  });
  await paso(vista, '2 · ahora por mes y compáralo con 2025', async () => {
    const e = await instruye(p, 'ahora por mes y compáralo con 2025');
    await captura(p, vista, '2a-lo-que-entendi');
    await aplica(p, 2);
    await captura(p, vista, '2b-despues', { completa: true });
    return e;
  });
  await paso(vista, '3 · mapa: arrastrar, acercar, lazo y «¿por qué estas bajaron?»', async () => {
    // El flujo 3 es independiente: parte del tablero growth (si el flujo 1 se leyó como CREAR, el tablero nuevo no
    // trae mapa; las dos lecturas son válidas y el agente las alterna entre corridas).
    await p.getByRole('button', { name: 'Reiniciar laboratorio' }).click();
    await p.getByText(/versión 0\b/).first().waitFor({ timeout: 60_000 });
    const mapa = p.getByRole('group', { name: /Mapa de tiendas/ });
    await mapa.scrollIntoViewIfNeeded();
    await mapa.getByRole('button', { name: 'Acercar' }).click();
    const c = (await mapa.boundingBox())!;
    await p.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    await p.mouse.down(); await p.mouse.move(c.x + c.width / 2 - 100, c.y + c.height / 2 - 30, { steps: 8 }); await p.mouse.up();
    await captura(p, vista, '3a-mapa-arrastrado-acercado', { selector: '[data-componente="mapa"]' });
    await mapa.getByRole('button', { name: 'Lazo' }).click();
    const m = await nodo(p, 'Mérida');
    const [cx, cy, r] = [m.x + m.width / 2, m.y + m.height / 2, Math.max(m.width, m.height) / 2 + 12];
    await p.mouse.move(cx - r, cy - r); await p.mouse.down();
    for (const [dx, dy] of [[r, -r], [r, r], [-r, r], [-r, -r]] as const) await p.mouse.move(cx + dx, cy + dy, { steps: 4 });
    await p.mouse.up();
    await p.getByText(/selección: Mérida/).first().waitFor({ timeout: 30_000 });
    await mapa.getByRole('button', { name: 'Lazo' }).click();
    const o = await nodo(p, 'Oaxaca');
    await p.mouse.click(o.x + o.width / 2, o.y + o.height / 2);
    await p.getByText(/selección: Mérida, Oaxaca/).first().waitFor({ timeout: 30_000 });
    await captura(p, vista, '3b-seleccion-por-lazo-filtra', { completa: vista === 'escritorio' });
    const e = await instruye(p, '¿por qué estas bajaron?');
    await captura(p, vista, '3c-por-que-estas-bajaron');
    await aplica(p, 3);
    await captura(p, vista, '3d-hallazgo', { selector: '[data-componente^="hallazgo"]' });
    return e;
  });
  await paso(vista, '4 · procedencia abierta', async () => {
    await p.locator('[data-componente="principal"]').getByRole('button', { name: 'Procedencia' }).click();
    await p.getByText('SQL compilado por la capa', { exact: false }).first().waitFor();
    await captura(p, vista, '4-procedencia', { selector: 'aside' });
    await axe(p, vista, 'procedencia');
  });
  await paso(vista, '5 · volver a una versión y comparar dos', async () => {
    await p.getByRole('tab', { name: 'Versiones' }).click();
    await p.locator('aside li', { hasText: 'v1 ·' }).getByRole('button', { name: 'Volver a esta' }).click();
    await p.getByText(/versión 4\b/).first().waitFor({ timeout: 60_000 });
    await p.locator('aside li', { hasText: 'v1 ·' }).getByRole('checkbox').check();
    await p.locator('aside li', { hasText: 'v3 ·' }).getByRole('checkbox').check();
    await p.getByRole('button', { name: 'Comparar las dos elegidas' }).click();
    const comparacion = p.getByRole('region', { name: 'Comparación de versiones' });
    await comparacion.waitFor({ timeout: 60_000 });
    await comparacion.scrollIntoViewIfNeeded();
    await captura(p, vista, '5-versiones-comparadas', { selector: 'aside' });
    await axe(p, vista, 'versiones');
  });
  await paso(vista, '6 · detectar → aprender con tarjetas en el mapa', async () => {
    await p.getByRole('button', { name: 'Reiniciar laboratorio' }).click();
    await p.getByText(/versión 0\b/).first().waitFor({ timeout: 60_000 });
    // En celular las tarjetas van como lista enlazada bajo el mapa (encima lo taparían); en escritorio, sobre el mapa.
    await p.locator(vista === 'celular' ? '[aria-label="Señales enlazadas a tiendas del mapa"] li' : '[data-componente="mapa"] [class*="tarjetaSenal"]').first().waitFor({ timeout: 60_000 });
    await captura(p, vista, '6a-mapa-con-senales', { selector: '[data-componente="mapa"]' });
    await captura(p, vista, '6b-ciclo-detectar-aprender', { selector: '[data-componente="ciclo"]' });
    await axe(p, vista, 'ciclo');
    return `${await p.locator('[data-componente="ciclo"] article').count()} tarjetas`;
  });
  await paso(vista, '7 · pregunta sin métrica', async () => {
    const e = await instruye(p, '¿Cuál es el NPS por tienda?');
    await captura(p, vista, '7-sin-metrica', { selector: '[aria-label="Lo que entendí"]' });
    return `${e} · ${await p.getByRole('region', { name: 'Lo que entendí' }).locator('p').first().textContent()}`;
  });
  await ctx.close();
}

const t0 = Date.now();
const b = await chromium.launch();
try { for (const v of ['escritorio', 'celular'] as const) await flujos(b, v); } finally { await b.close(); }
const serias = registro.axe.reduce((n, a) => n + a.serias.length, 0);
writeFileSync(join(CAPTURAS, 'recorrido.json'), `${JSON.stringify({ cuando: new Date().toISOString(), segundos: Math.round((Date.now() - t0) / 1000), ...registro }, null, 1)}\n`);
console.log(`▸ ${registro.pasos.length} pasos en ${Math.round((Date.now() - t0) / 1000)} s · peticiones externas ${registro.externas.length} · errores de consola ${registro.errores.length} · axe serias/críticas ${serias}`);
for (const a of registro.axe) if (a.serias.length) console.log(`  axe ${a.vista} · ${a.paso}: ${a.serias.map((s) => `${s.id} (${s.nodos})`).join(', ')}`);
for (const x of registro.errores.slice(0, 8)) console.log(`  consola: ${x}`);
