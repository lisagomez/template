#!/usr/bin/env node
/**
 * Capturas del laboratorio pymes y del estudio del cliente con Playwright, contra el servidor en
 * marcha. Carga el negocio de EJEMPLO (sintético) y fotografía lo que pide la definición de hecho:
 * perfil de marca, brief de 30 días desde CFDI, calendario con pieza, respuestas en borrador y el
 * brief del lunes con una fuente «sin datos». Registra los errores de consola: deben ser cero.
 *
 * Uso: node scripts/laboratorio-pymes/captura.mjs [--url http://localhost:3000] [--salida carpeta]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const URL_BASE = arg('url', 'http://localhost:3000');
const SALIDA = resolve(arg('salida', '.claude/goals/pymes-marketing/capturas'));
mkdirSync(SALIDA, { recursive: true });

const navegador = await chromium.launch();
const pagina = await (await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-MX' })).newPage();
const errores = [];
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
pagina.on('pageerror', (e) => errores.push(String(e)));
const foto = async (loc, nombre) => { await loc.scrollIntoViewIfNeeded(); await loc.screenshot({ path: join(SALIDA, nombre) }); return nombre; };
const hechas = [];

// 1. Laboratorio
await pagina.goto(`${URL_BASE}/laboratorio-pymes`, { waitUntil: 'networkidle' });
await pagina.setViewportSize({ width: 1280, height: 1250 });
await pagina.screenshot({ path: join(SALIDA, '1-laboratorio.png') });
hechas.push('1-laboratorio.png');
hechas.push(await foto(pagina.locator('[data-prueba="caso-resenas-2"]'), '1b-caso-trampa-inyeccion.png'));
await pagina.setViewportSize({ width: 1280, height: 900 });
const estados = await pagina.locator('[data-estado]').evaluateAll((els) => els.map((e) => e.getAttribute('data-estado')));
const aprobadas = await pagina.locator('[data-prueba^="aprobada-"]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-prueba')}=${e.textContent}`));

// 2. Estudio con el negocio de ejemplo
await pagina.goto(`${URL_BASE}/estudio`, { waitUntil: 'networkidle' });
await pagina.locator('[data-prueba="carga-ejemplo"]').click();
await pagina.locator('[data-prueba="brief-lunes"]').waitFor({ timeout: 60_000 });
hechas.push(await foto(pagina.locator('[data-prueba="seccion-marca"]'), '2-marca.png'));
hechas.push(await foto(pagina.locator('[data-prueba="brief-30"]'), '3-brief-30-dias.png'));
hechas.push(await foto(pagina.locator('[data-prueba="dia-calendario"]').first(), '4-calendario-pieza.png'));
hechas.push(await foto(pagina.locator('[data-prueba="analisis-resenas"]'), '5-resenas-borradores.png'));
hechas.push(await foto(pagina.locator('[data-prueba="brief-lunes"]'), '6-brief-lunes.png'));
const lunes = await pagina.locator('[data-prueba^="lunes-"]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-prueba')}=${e.getAttribute('data-estado')}`));
const dias = await pagina.locator('[data-prueba="dia-calendario"]').count();
const piezas = await pagina.locator('[data-prueba="pieza"]').count();
const borradores = await pagina.locator('[data-prueba="borrador-respuesta"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-estado')));

// 3. Un clic de aprobación: la fila queda «lista» y nada sale de la página (sin peticiones de red nuevas).
const peticiones = [];
pagina.on('request', (r) => peticiones.push(r.url()));
await pagina.locator('[data-prueba="borrador-respuesta"][data-estado="borrador"] button:has-text("Aprobar")').first().click();
await pagina.waitForTimeout(300);
const tras = await pagina.locator('[data-prueba="borrador-respuesta"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-estado')));

await navegador.close();
const informe = { url: URL_BASE, cuando: new Date().toISOString(), capturas: hechas, laboratorio: { casos: estados.length, pasa: estados.filter((e) => e === 'pasa').length, noMedido: estados.filter((e) => e === 'no-medido').length, falla: estados.filter((e) => e === 'falla').length, aprobadas },
  estudio: { diasDeCalendario: dias, piezasConImagen: piezas, borradores, lunes, trasAprobar: tras.filter((e) => e === 'aprobada').length, peticionesAlAprobar: peticiones.length }, erroresDeConsola: errores };
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(informe, null, 2));
console.log(JSON.stringify(informe, null, 2));
process.exit(errores.length ? 1 : 0);
