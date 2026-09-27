#!/usr/bin/env node
/**
 * Capturas de la generación de contenido con Playwright, contra el servidor en marcha: la galería
 * visual del laboratorio, y en el estudio (negocio de EJEMPLO, sintético) el carrusel, un PNG
 * descargado de verdad, la promo en su primer y último cuadro, el MP4 generado en el servidor local y
 * la aprobación en vista de celular con su huella. Cuenta errores de consola y peticiones al aprobar.
 * Uso: node scripts/laboratorio-pymes/captura-contenido.mjs [--url http://localhost:3000]
 */
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const URL_BASE = arg('url', 'http://localhost:3000');
const SALIDA = resolve(arg('salida', '.claude/goals/contenido-pymes/capturas'));
mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-MX', acceptDownloads: true });
const pagina = await contexto.newPage();
const errores = [];
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
pagina.on('pageerror', (e) => errores.push(String(e)));
const foto = async (loc, nombre) => { await loc.scrollIntoViewIfNeeded(); await loc.screenshot({ path: join(SALIDA, nombre) }); return nombre; };
const hechas = [];

// 1. Galería visual del laboratorio
await pagina.goto(`${URL_BASE}/laboratorio-pymes`, { waitUntil: 'networkidle' });
await pagina.getByRole('button', { name: 'Piezas y carruseles' }).first().click();
await pagina.waitForFunction(() => [...document.querySelectorAll('[data-prueba="compara-visual"]')].every((e) => e.getAttribute('data-diferencia') !== ''), null, { timeout: 30_000 });
const diferencias = await pagina.locator('[data-prueba="compara-visual"]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-diferencia'))));
hechas.push(await foto(pagina.locator('[data-prueba="caso-piezas-3"]'), '1-galeria-carrusel.png'));
await pagina.getByRole('button', { name: 'Video por código' }).first().click();
hechas.push(await foto(pagina.locator('[data-prueba="caso-video-7"]'), '2-galeria-video.png'));
const estados = await pagina.locator('[data-estado]').evaluateAll((els) => els.map((e) => e.getAttribute('data-estado')));

// 2. Estudio con el negocio de ejemplo
await pagina.goto(`${URL_BASE}/estudio`, { waitUntil: 'networkidle' });
await pagina.locator('[data-prueba="carga-ejemplo"]').click();
await pagina.locator('[data-prueba="carrusel"]').first().waitFor({ timeout: 60_000 });
hechas.push(await foto(pagina.locator('[data-prueba="carrusel"]').first(), '3-carrusel.png'));
const [descarga] = await Promise.all([pagina.waitForEvent('download'), pagina.locator('[data-prueba="descarga-png"]').first().click()]);
const rutaPng = join(SALIDA, '4-pieza-exportada.png');
await descarga.saveAs(rutaPng);
hechas.push('4-pieza-exportada.png');
const control = pagina.locator('[data-prueba="control-instante"]');
await control.fill('0'); await pagina.waitForTimeout(200);
hechas.push(await foto(pagina.locator('[data-prueba="preview-video"]'), '5-video-cuadro-inicial.png'));
await control.fill(await control.getAttribute('max')); await pagina.waitForTimeout(200);
hechas.push(await foto(pagina.locator('[data-prueba="preview-video"]'), '6-video-cuadro-final.png'));
await pagina.locator('[data-prueba="genera-mp4"]').click();
await pagina.locator('[data-prueba="mp4-listo"]').waitFor({ timeout: 120_000 });
hechas.push(await foto(pagina.locator('#video'), '7-video-mp4.png'));
const huellaMp4 = await pagina.locator('[data-prueba="mp4-listo"] p').textContent();

// 3. Aprobación en el celular (navegación dentro de la app: la sesión se conserva)
await pagina.setViewportSize({ width: 390, height: 844 });
await pagina.locator('[data-prueba="ir-a-aprobar"] a').click();
await pagina.locator('[data-prueba="item-aprobar"]').first().waitFor();
const peticiones = [];
pagina.on('request', (r) => peticiones.push(r.url()));
for (const i of [0, 1, 2]) await pagina.locator('[data-prueba="item-aprobar"]').nth(i).getByRole('button', { name: 'Aprobar' }).click();
await pagina.locator('[data-prueba="item-aprobar"]').nth(3).getByRole('button', { name: 'Pedir cambio' }).click();
await pagina.locator('[data-prueba="item-aprobar"]').nth(3).getByPlaceholder('¿Qué cambio?').fill('el precio más grande');
await pagina.locator('[data-prueba="item-aprobar"]').nth(3).getByRole('button', { name: 'Enviar' }).click();
await pagina.waitForTimeout(500);
const tras = await pagina.locator('[data-prueba="item-aprobar"]').evaluateAll((els) => els.slice(0, 4).map((e) => e.getAttribute('data-estado')));
await pagina.evaluate(() => window.scrollTo(0, 0));
await pagina.screenshot({ path: join(SALIDA, '8-aprobar-celular.png') });
hechas.push('8-aprobar-celular.png');
hechas.push(await foto(pagina.locator('[data-prueba="item-aprobar"]').nth(1), '9-aprobar-huella.png'));
const resumen = await pagina.locator('[data-prueba="resumen-aprobacion"]').textContent();
await navegador.close();

const informe = { url: URL_BASE, cuando: new Date().toISOString(), capturas: hechas,
  laboratorio: { casos: estados.length, pasa: estados.filter((e) => e === 'pasa').length, noMedido: estados.filter((e) => e === 'no-medido').length, falla: estados.filter((e) => e === 'falla').length, diferenciasVisuales: diferencias },
  estudio: { pngDescargado: statSync(rutaPng).size, mp4: huellaMp4, aprobacion: tras, resumen, peticionesAlAprobar: {
    salidasPorAprobar: peticiones.filter((u) => !u.startsWith('blob:') && !u.startsWith('data:') && !u.endsWith('/api/dictado')),
    memoriaLocal: peticiones.filter((u) => u.startsWith('blob:') || u.startsWith('data:')).length,
    sondeoDelBotonDeDictado: peticiones.filter((u) => u.endsWith('/api/dictado')).length,
  } }, erroresDeConsola: errores };
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(informe, null, 2));
console.log(JSON.stringify(informe, null, 2));
process.exit(errores.length || informe.estudio.peticionesAlAprobar.salidasPorAprobar.length ? 1 : 0);
