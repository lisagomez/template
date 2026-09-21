#!/usr/bin/env node
/**
 * Evidencia de /historial con Playwright sobre la build de produccion: capturas a 1280 y 390 px
 * de la lista por dia, la busqueda resaltada sin acento, la correccion con candidatos, «copiado»,
 * el borrado con confirmacion, las cifras, la exportacion (tamano y primeras lineas) y el tema
 * oscuro; y las medidas: carga de la pagina, busqueda por la ruta, y «dictado nuevo → aparece».
 *
 *   node scripts/laboratorio-voz/captura-historial.mjs [--url http://localhost:3000] [--salida capturas-laboratorio]
 *
 * Trabaja sobre una COPIA del historial (DICTADO_DATOS temporal): corregir y borrar no tocan el real.
 * El token se lee de .env.local y no se imprime.
 */
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const URL_BASE = arg('url', 'http://localhost:3000');
const SALIDA = resolve(arg('salida', 'capturas-laboratorio'));
mkdirSync(SALIDA, { recursive: true });
const raiz = process.cwd();
const token = /^DICTADO_MOVIL_TOKEN=(.+)$/m.exec(readFileSync(join(raiz, '.env.local'), 'utf8'))?.[1]?.trim();
if (!token) throw new Error('falta DICTADO_MOVIL_TOKEN en .env.local');
console.log(`token: presente (largo ${token.length})`);
const banco = join(raiz, 'tools/dictado/medicion/banco');
const datosReales = process.env.DICTADO_DATOS ?? join(banco, 'datos');
const resultados = { url: URL_BASE, cuando: new Date().toISOString(), consola: [], errores: [], medidas: {}, vistas: {} };
const cabeceras = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const percentil = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

// ---------- medida: busqueda por la ruta (sobre el historial real, solo lectura) ----------
{
  const tiempos = [];
  for (let i = 0; i < 7; i++) {
    const t0 = performance.now();
    const r = await fetch(`${URL_BASE}/api/historial?consulta=cotizacion`, { headers: cabeceras });
    const j = await r.json();
    tiempos.push(performance.now() - t0);
    if (i === 0) resultados.medidas.busquedaReal = { coinciden: j.coinciden, total: j.total };
  }
  resultados.medidas.busquedaReal.p50Ms = Math.round(percentil(tiempos, 0.5));
  console.log(`busqueda por la ruta (real, ${resultados.medidas.busquedaReal.total} dictados): p50 ${resultados.medidas.busquedaReal.p50Ms} ms · ${resultados.medidas.busquedaReal.coinciden} coinciden con «cotizacion»`);
}

// ---------- el navegador, con una copia del historial para corregir y borrar sin miedo ----------
const navegador = await chromium.launch();
const nuevoContexto = async (opciones = {}) => {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-MX', permissions: ['clipboard-read', 'clipboard-write'], ...opciones });
  await contexto.addInitScript((t) => localStorage.setItem('dictado.token', t), token);
  const pagina = await contexto.newPage();
  pagina.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') resultados.consola.push(`${m.type()}: ${m.text()}`); });
  pagina.on('pageerror', (e) => resultados.errores.push(String(e)));
  return { contexto, pagina };
};
const captura = async (pagina, nombre, selector) => {
  const ruta = join(SALIDA, `${nombre}.png`);
  if (selector) await pagina.locator(selector).screenshot({ path: ruta });
  else await pagina.screenshot({ path: ruta, fullPage: false });
  console.log(`  captura: ${ruta}`);
};
const abre = async (pagina) => {
  const t0 = performance.now();
  await pagina.goto(`${URL_BASE}/historial`, { waitUntil: 'networkidle' });
  await pagina.locator('[data-prueba="lista"] [data-prueba="dictado"]').first().waitFor({ timeout: 30_000 });
  return Math.round(performance.now() - t0);
};

const { contexto, pagina } = await nuevoContexto();
console.log('a) lista por dia y carga');
resultados.medidas.cargaPaginaMs = await abre(pagina);
resultados.vistas.dias = await pagina.$$eval('[data-prueba="dia"]', (els) => els.map((e) => ({ dia: e.dataset.dia, dictados: e.querySelectorAll('[data-prueba="dictado"]').length })));
resultados.vistas.cuenta = await pagina.locator('[data-prueba="cuenta"]').innerText();
console.log(`  carga ${resultados.medidas.cargaPaginaMs} ms · ${resultados.vistas.cuenta} · dias: ${resultados.vistas.dias.map((d) => `${d.dia} (${d.dictados})`).join(', ')}`);
await captura(pagina, '30-historial-lista');

console.log('b) busqueda sin acento, resaltada');
await pagina.locator('[data-prueba="consulta"]').fill('cotizacion');
// Hasta que la cuenta diga «N de M» con N < M y la lista tenga exactamente N dictados: lo filtrado, ya pintado.
await pagina.waitForFunction(() => { const m = /^(\d+) de (\d+)/.exec(document.querySelector('[data-prueba="cuenta"]')?.textContent ?? ''); return Boolean(m) && Number(m[1]) < Number(m[2]) && document.querySelectorAll('[data-prueba="dictado"]').length === Number(m[1]); }, null, { timeout: 20_000, polling: 200 });
resultados.vistas.busqueda = { cuenta: await pagina.locator('[data-prueba="cuenta"]').innerText(), enLista: await pagina.locator('[data-prueba="dictado"]').count(), resaltado: await pagina.locator('[data-prueba="dictado"] mark').first().innerText(), marcas: await pagina.locator('[data-prueba="dictado"] mark').count() };
console.log(`  ${resultados.vistas.busqueda.cuenta} · ${resultados.vistas.busqueda.enLista} en la lista · resaltado «${resultados.vistas.busqueda.resaltado}» · ${resultados.vistas.busqueda.marcas} marcas`);
await captura(pagina, '31-historial-busqueda-sin-acento');
await pagina.locator('[data-prueba="consulta"]').fill('');
await pagina.waitForFunction(() => !document.querySelector('[data-prueba="cuenta"]')?.textContent?.includes(' de '), null, { timeout: 20_000, polling: 200 });

console.log('c) copiar → «Copiado»');
await pagina.locator('[data-prueba="dictado"]').first().locator('[data-prueba="copiar"]').click();
await pagina.locator('[data-prueba="aviso"]').waitFor({ timeout: 5_000 });
resultados.vistas.copiado = await pagina.locator('[data-prueba="aviso"]').innerText();
await captura(pagina, '32-historial-copiado', '[data-prueba="dictado"] >> nth=0');
console.log(`  aviso: ${resultados.vistas.copiado}`);

console.log('d) cifras');
await pagina.locator('[data-prueba="ver-cifras"]').click();
await pagina.locator('[data-prueba="cifras"]').waitFor({ timeout: 20_000 });
resultados.vistas.cifras = await pagina.locator('[data-prueba="cifras"]').innerText();
await captura(pagina, '33-historial-cifras', '[data-prueba="cifras"]');
await pagina.locator('[data-prueba="ver-cifras"]').click();

console.log('e) exportar Markdown y CSV (por la ruta, y lo que la pagina enseña)');
for (const formato of ['md', 'csv']) {
  const r = await fetch(`${URL_BASE}/api/historial`, { method: 'POST', headers: cabeceras, body: JSON.stringify({ orden: 'exporta', filtros: {}, formato, hoy: new Date().toISOString().slice(0, 10) }) });
  const texto = await r.text();
  resultados.vistas[`exporta_${formato}`] = { bytes: texto.length, entradas: r.headers.get('x-entradas'), primerasLineas: texto.split('\n').slice(0, 4).map((l) => l.slice(0, 110)) };
  console.log(`  ${formato}: ${texto.length} bytes, ${r.headers.get('x-entradas')} entradas; primeras lineas:`);
  for (const l of resultados.vistas[`exporta_${formato}`].primerasLineas) console.log(`    ${l}`);
}
await pagina.locator('[data-prueba="exporta-md"]').click();
await pagina.locator('[data-prueba="exportado"]').waitFor({ timeout: 20_000 });
resultados.vistas.exportadoEnPagina = await pagina.locator('[data-prueba="exportado"]').innerText();
await captura(pagina, '34-historial-exportar', '[data-prueba="herramientas"]');
console.log(`  en la pagina: ${resultados.vistas.exportadoEnPagina}`);
await contexto.close();

// ---------- corregir y borrar: sobre una COPIA, con un servidor propio en otro puerto ----------
console.log('f) corregir con candidatos y borrar con confirmacion (sobre una copia del historial)');
const copia = mkdtempSync(join(tmpdir(), 'historial-copia-'));
cpSync(datosReales, copia, { recursive: true });
const PUERTO = 3011;
const servidor = spawn('npx', ['next', 'start', '-p', String(PUERTO)], { cwd: raiz, env: { ...process.env, DICTADO_DATOS: copia }, stdio: 'ignore' });
const URL_COPIA = `http://localhost:${PUERTO}`;
let arranco = false;
for (let i = 0; i < 60 && !arranco; i++) {
  await new Promise((r) => setTimeout(r, 500));
  arranco = await fetch(`${URL_COPIA}/api/laboratorio/estado`).then((r) => r.ok).catch(() => false);
}
if (!arranco) { servidor.kill('SIGTERM'); throw new Error(`el servidor de la copia no respondio en :${PUERTO} (¿quedo uno vivo de otra corrida?)`); }
// Pase lo que pase, el servidor de la copia se apaga al salir.
const apaga = () => { try { servidor.kill('SIGTERM'); } catch { /* ya */ } };
process.on('exit', apaga);
process.on('uncaughtException', (e) => { apaga(); console.error(e); process.exit(1); });
{
  const { contexto: c2, pagina: p2 } = await nuevoContexto();
  await p2.goto(`${URL_COPIA}/historial`, { waitUntil: 'networkidle' });
  const primero = p2.locator('[data-prueba="dictado"]').first();
  await primero.waitFor({ timeout: 30_000 });
  const antes = await primero.locator('[data-prueba="texto"]').innerText();
  await primero.locator('[data-prueba="corregir"]').click();
  await primero.locator('[data-prueba="editor"]').fill(`${antes} Zorrilla Quintanar`);
  await primero.getByRole('button', { name: 'Guardar corrección' }).click();
  await p2.locator('[data-prueba="candidatos"]').first().waitFor({ timeout: 20_000 });
  resultados.vistas.correccion = { antes, candidatos: await p2.locator('[data-prueba="candidatos"]').first().innerText(), crudo: (await p2.locator('[data-prueba="crudo"]').count()) ? await p2.locator('[data-prueba="crudo"]').first().innerText() : '(sin texto crudo)' };
  console.log(`  candidatos: ${resultados.vistas.correccion.candidatos.replace(/\n/g, ' ')} · ${resultados.vistas.correccion.crudo}`);
  await captura(p2, '35-historial-correccion-candidatos', '[data-prueba="dictado"] >> nth=0');
  const cuentaAntes = await p2.locator('[data-prueba="cuenta"]').innerText();
  const segundo = p2.locator('[data-prueba="dictado"]').nth(1);
  await segundo.locator('[data-prueba="borrar"]').click();
  await segundo.locator('[data-prueba="confirmar-borrado"]').waitFor({ timeout: 5_000 });
  await captura(p2, '36-historial-borrar-confirmacion', '[data-prueba="dictado"] >> nth=1');
  await segundo.locator('[data-prueba="borrar-si"]').click();
  await p2.locator('[data-prueba="aviso"]').waitFor({ timeout: 5_000 });
  await p2.waitForFunction((c) => document.querySelector('[data-prueba="cuenta"]')?.textContent !== c, cuentaAntes, { timeout: 10_000, polling: 200 });
  resultados.vistas.borrado = { antes: cuentaAntes, despues: await p2.locator('[data-prueba="cuenta"]').innerText() };
  console.log(`  borrado: ${resultados.vistas.borrado.antes} → ${resultados.vistas.borrado.despues}`);

  console.log('g) vivo: un dictado nuevo aparece sin recargar (dictar --entrada como microfono, sobre la copia)');
  const wav = join(raiz, 'tools/dictado/medicion/corpus-propio/sintetico/limpio-01.wav');
  const totalAntes = Number(/^(\d+)/.exec(resultados.vistas.borrado.despues)?.[1] ?? 0);
  const t0 = performance.now();
  const hijo = spawn(process.execPath, [join(raiz, 'tools/dictado/dist/node/cli.js'), 'dictar', '--entrada', wav, '--pegar', 'ninguno', '--modo', 'manos-libres', '--sin-trayectoria', '--silencio-ms', '700', '--motor', 'remoto'], { cwd: join(raiz, 'tools/dictado'), env: { ...process.env, DICTADO_MODELOS: join(banco, 'modelos'), DICTADO_RUNTIME: banco, DICTADO_DATOS: copia, DICTADO_REMOTO_URL: `http://127.0.0.1:${process.env.DICTADO_DEMONIO_PUERTO ?? 47125}`, DICTADO_REMOTO_TOKEN: token }, stdio: 'ignore' });
  await p2.waitForFunction((n) => Number(/^(\d+)/.exec(document.querySelector('[data-prueba="cuenta"]')?.textContent ?? '')?.[1] ?? 0) > n, totalAntes, { timeout: 60_000, polling: 100 });
  resultados.medidas.vivoMs = Math.round(performance.now() - t0);
  resultados.vistas.nuevos = (await p2.locator('[data-prueba="nuevos"]').count()) ? await p2.locator('[data-prueba="nuevos"]').innerText() : '(sin etiqueta)';
  console.log(`  aparecio a los ${resultados.medidas.vivoMs} ms desde que arranco dictar (incluye leer el audio a tiempo real y transcribir) · etiqueta: ${resultados.vistas.nuevos}`);
  await captura(p2, '37-historial-vivo-nuevo', '[data-prueba="lista"] >> nth=0');
  hijo.kill('SIGINT');
  await c2.close();

  console.log('h) 390 px y tema oscuro');
  const { contexto: c3, pagina: p3 } = await nuevoContexto({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  // El tema oscuro de esta app va por la clase `dark` en <html> (tailwind darkMode: class), no por el sistema.
  await p3.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('dark')));
  await p3.goto(`${URL_COPIA}/historial`, { waitUntil: 'networkidle' });
  await p3.evaluate(() => document.documentElement.classList.add('dark'));
  await p3.locator('[data-prueba="dictado"]').first().waitFor({ timeout: 30_000 });
  resultados.vistas.movil = await p3.evaluate(() => ({ desborde: document.documentElement.scrollWidth > window.innerWidth + 1, ancho: document.documentElement.scrollWidth }));
  await captura(p3, '38-historial-movil-oscuro');
  console.log(`  390 px oscuro: desborde horizontal ${resultados.vistas.movil.desborde ? 'SI' : 'no'} (ancho ${resultados.vistas.movil.ancho})`);
  await c3.close();
}
servidor.kill('SIGTERM');
await navegador.close();
writeFileSync(join(SALIDA, 'historial.json'), JSON.stringify(resultados, null, 1));
console.log(`listo: errores de pagina ${resultados.errores.length} · consola ${resultados.consola.length} · ${join(SALIDA, 'historial.json')}`);
if (resultados.errores.length) console.log(resultados.errores.join('\n'));
if (resultados.consola.length) console.log(resultados.consola.slice(0, 5).join('\n'));
