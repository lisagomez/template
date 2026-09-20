#!/usr/bin/env node
/**
 * La pagina del laboratorio como la ve un telefono: iPhone 14 emulado (390×844, tactil) con
 * Chromium sobre el build de produccion. No sustituye al telefono real (el motor no es WebKit):
 * prueba tamano, tacto, emparejamiento por enlace y los flujos; lo que dice el iPhone lo dice el iPhone.
 *
 *   node scripts/laboratorio-voz/captura-movil.mjs [carpeta-de-salida]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, devices } from 'playwright';

const URL_BASE = process.env.URL_BASE ?? 'http://localhost:3000';
const SALIDA = process.argv[2] ?? 'capturas-laboratorio/movil';
mkdirSync(SALIDA, { recursive: true });
const token = /^DICTADO_MOVIL_TOKEN=(.+)$/m.exec(readFileSync('.env.local', 'utf8'))?.[1]?.trim();
if (!token) throw new Error('sin token');

const r = { errores: [], consola: [], pasos: {} };
const navegador = await chromium.launch();
// iPhone 14: 390×844, táctil, UA de Safari móvil (motor Chromium: no es WebKit real).
const contexto = await navegador.newContext({ ...devices['iPhone 14'], locale: 'es-MX', permissions: ['microphone'] });
const pagina = await contexto.newPage();
pagina.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') r.consola.push(`${m.type()}: ${m.text()}`); });
pagina.on('pageerror', (e) => r.errores.push(String(e)));
const captura = (n) => pagina.screenshot({ path: join(SALIDA, `${n}.png`), fullPage: false });
const sinDesborde = async () => pagina.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));

// 1) sin emparejar: la pagina explica y pide el token
await pagina.goto(`${URL_BASE}/laboratorio-voz`, { waitUntil: 'networkidle' });
r.pasos.sinEmparejar = { hayFormulario: await pagina.locator('[data-prueba="emparejar"]').count(), desborde: await sinDesborde() };
await captura('m1-sin-emparejar');

// 2) emparejar por enlace (#t=), como el QR de /dictar: el token se borra de la barra
// Carga FRESCA: cambiar solo el #hash sobre la misma pagina no vuelve a montar el efecto (como en un telefono, el enlace se abre nuevo).
await pagina.goto('about:blank');
const tEmparejar = performance.now();
await pagina.goto(`${URL_BASE}/laboratorio-voz#t=${encodeURIComponent(token)}`, { waitUntil: 'networkidle' });
await pagina.waitForFunction(() => !document.querySelector('[data-prueba="emparejar"]'), null, { timeout: 15_000 });
r.pasos.emparejado = { urlLimpia: !pagina.url().includes('t='), guardado: await pagina.evaluate(() => !!localStorage.getItem('dictado.token')), msEmparejar: Math.round(performance.now() - tEmparejar) };
await captura('m2-emparejado');

// 3) tocar la tarjeta 1 y usar la muestra
await pagina.locator('#caso-1 button').first().tap();
await pagina.locator('[data-prueba="panel-1"]').getByRole('button', { name: 'Usar la muestra' }).tap();
await pagina.locator('[data-prueba="panel-1"] [data-prueba="texto"]').waitFor({ timeout: 180_000 });
r.pasos.notas = { texto: await pagina.locator('[data-prueba="panel-1"] [data-prueba="texto"]').innerText(), desborde: await sinDesborde() };
await pagina.locator('[data-prueba="panel-1"] [data-prueba="texto"]').scrollIntoViewIfNeeded();
await captura('m3-caso1-resultado');

// 4) veredicto desde el telefono
const v = pagina.locator('[data-prueba="veredicto-1"]');
await v.scrollIntoViewIfNeeded();
await v.getByRole('button', { name: 'A medias', exact: true }).tap();
await v.getByPlaceholder('Una nota (qué viste, qué falló)').fill('Probado en emulación de iPhone 14.');
await v.getByRole('button', { name: 'Guardar' }).tap();
await v.getByText('Veredicto guardado en esta computadora.').waitFor({ timeout: 20_000 });
await captura('m4-veredicto');

// 5) call center en pantalla chica
await pagina.goto(`${URL_BASE}/laboratorio-voz?caso=6`, { waitUntil: 'networkidle' });
await pagina.locator('[data-prueba="panel-6"]').getByRole('button', { name: 'Usar la muestra' }).tap();
await pagina.locator('[data-prueba="panel-6"] [data-prueba="resultado-asesor"]').waitFor({ timeout: 600_000 });
r.pasos.callCenter = { desborde: await sinDesborde(), puntaje: await pagina.locator('[data-prueba="panel-6"] [data-prueba="resultado-asesor"]').innerText().then((t) => /(\d+) \/ 100/.exec(t)?.[1]) };
await pagina.locator('[data-prueba="panel-6"] [data-prueba="desglose"]').scrollIntoViewIfNeeded();
await captura('m5-caso6-desglose');

// 6) la tarjeta del celular (caso 18) y /dictar siguen respondiendo
await pagina.goto(`${URL_BASE}/laboratorio-voz?caso=18`, { waitUntil: 'networkidle' });
r.pasos.celular = { direccion: await pagina.locator('[data-prueba="panel-celular"]').innerText().then((t) => /https?:\/\/\S+\/dictar/.exec(t)?.[0]) };
await captura('m6-caso18-celular');

writeFileSync(join(SALIDA, 'resultados-movil.json'), JSON.stringify(r, null, 2));
await navegador.close();
console.log(JSON.stringify(r, null, 1));
