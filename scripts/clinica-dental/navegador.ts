/**
 * El navegador de los recorridos: Chromium del repo (Playwright 1.63), contextos de escritorio y de celular,
 * micrófono falso cuando hace falta voz (el de la medición del centro de mando), capturas sin el indicador de
 * desarrollo, axe-core (WCAG 2.2 AA) y una GUARDIA DE RED: toda petición del navegador a algo que no sea la app
 * se ABORTA y se anota (ningún hit a Google, Telegram ni nadie).
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { instalaMicrofonoFalso } from '../centro-de-mando/microfono-falso.ts';
import { BASE } from './servidor.ts';

/** `CLINICA_CAPTURAS`: la carpeta de capturas de la corrida (la del goal de WhatsApp tiene la suya). */
export const CAPTURAS = join(process.cwd(), process.env['CLINICA_CAPTURAS'] ?? 'docs/goals/clinica-dental-capturas');
mkdirSync(CAPTURAS, { recursive: true });

export type Vista = 'escritorio' | 'celular';
export const VISTAS: Record<Vista, { viewport: { width: number; height: number }; isMobile: boolean; hasTouch: boolean }> = {
  escritorio: { viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false },
  celular: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};

export interface Registro { externas: string[]; errores: string[]; axe: { pagina: string; vista: Vista; serias: { id: string; impacto: string; nodos: number; ayuda: string }[] }[] }
export const registro: Registro = { externas: [], errores: [], axe: [] };

let navegador: Browser | undefined;
export async function abre(): Promise<Browser> {
  navegador ??= await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'] });
  return navegador;
}
export async function cierra(): Promise<void> {
  await navegador?.close();
  navegador = undefined;
}

export async function contexto(vista: Vista, op: { voz?: boolean } = {}): Promise<BrowserContext> {
  const b = await abre();
  const ctx = await b.newContext({ ...VISTAS[vista], locale: 'es-MX', timezoneId: 'America/Mexico_City', permissions: op.voz ? ['microphone'] : [] });
  // Solo donde hay mediaDevices: en about:blank (antes de navegar) no existe y el script de la casa lanzaba un error.
  if (op.voz) await ctx.addInitScript({ content: `if (navigator.mediaDevices) (${instalaMicrofonoFalso.toString()})();` });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.origin === BASE || u.protocol === 'data:' || u.protocol === 'blob:') return r.continue();
    registro.externas.push(u.origin + u.pathname);
    return r.abort();
  });
  ctx.on('page', (p) => vigila(p));
  return ctx;
}

function vigila(p: Page): void {
  p.on('pageerror', (e) => registro.errores.push(`${p.url()} · ${String(e).slice(0, 200)}`));
  p.on('console', (m) => {
    if (m.type() === 'error' && !/hmr|webpack-hmr|_next\/webpack|Download the React DevTools/i.test(m.text())) registro.errores.push(`${p.url()} · ${m.text().slice(0, 200)}`);
  });
}

const OCULTA_DEV = 'nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; }';

export async function captura(p: Page, vista: Vista, nombre: string, completa = false): Promise<string> {
  await p.addStyleTag({ content: OCULTA_DEV }).catch(() => undefined);
  await p.waitForTimeout(250);
  const ruta = join(CAPTURAS, `${vista}-${nombre}.png`);
  await p.screenshot({ path: ruta, fullPage: completa });
  return ruta;
}

/** axe-core sobre la página como está: solo cuenta lo serio y lo crítico (el lazo l-a11y). */
export async function auditaA11y(p: Page, vista: Vista, nombre: string): Promise<void> {
  await p.addScriptTag({ path: join(process.cwd(), 'node_modules/axe-core/axe.min.js') });
  const r = await p.evaluate(async () => {
    const axe = (window as unknown as { axe: { run(c: unknown, o: unknown): Promise<{ violations: { id: string; impact: string | null; nodes: unknown[]; help: string }[] }> } }).axe;
    return axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
  });
  const serias = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => ({ id: v.id, impacto: v.impact ?? '', nodos: v.nodes.length, ayuda: v.help }));
  registro.axe.push({ pagina: nombre, vista, serias });
}

export async function eligeCookies(p: Page, aceptar: boolean): Promise<void> {
  const b = p.getByRole('region', { name: 'Preferencias de analítica' }).getByRole('button', { name: aceptar ? 'Aceptar analítica' : 'Rechazar' });
  if (await b.isVisible().catch(() => false)) await b.click();
}

export const dataLayer = (p: Page): Promise<unknown[]> => p.evaluate(() => (window.dataLayer ?? []).map((x) => (x && typeof x === 'object' && 'length' in (x as object) && !Array.isArray(x) ? Array.from(x as ArrayLike<unknown>) : x)));
