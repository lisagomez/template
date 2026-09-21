#!/usr/bin/env node
/**
 * Evidencia de /ajustes con Playwright sobre la build de produccion: capturas a 1280 y 390 px
 * de todas las secciones, el catalogo con las cifras de esta maquina, un cambio guardado, un
 * valor invalido rechazado, «sin proveedor» en gris y el tema oscuro; el cambio EN CALIENTE con
 * `dictar --entrada` corriendo (pegado y sonidos tomados sin reiniciar; aviso honesto al cambiar
 * el motor); y las medidas: carga de la pagina, la ruta de lectura, y leer los ajustes al arrancar.
 *
 *   node scripts/laboratorio-voz/captura-ajustes.mjs [--salida capturas-laboratorio]
 *
 * Levanta su propio servidor en :3012 sobre una COPIA de los datos (DICTADO_DATOS temporal): nada
 * de lo que se guarda aqui toca los ajustes reales. El token se lee de .env.local y no se imprime.
 */
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const SALIDA = resolve(arg('salida', 'capturas-laboratorio'));
mkdirSync(SALIDA, { recursive: true });
const raiz = process.cwd();
const token = /^DICTADO_MOVIL_TOKEN=(.+)$/m.exec(readFileSync(join(raiz, '.env.local'), 'utf8'))?.[1]?.trim();
if (!token) throw new Error('falta DICTADO_MOVIL_TOKEN en .env.local');
console.log(`token: presente (largo ${token.length})`);
const banco = join(raiz, 'tools/dictado/medicion/banco');
const datosReales = process.env.DICTADO_DATOS ?? join(banco, 'datos');
const resultados = { cuando: new Date().toISOString(), consola: [], errores: [], medidas: {}, vistas: {} };
const cabeceras = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const percentil = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

// ---------- medida: leer los ajustes al arrancar (lo que paga cada `dictar`), en proceso ----------
{
  const { leeArchivoAjustes } = await import(pathToFileURL(join(raiz, 'tools/dictado/dist/node/ajustes-archivo.js')).href);
  const { resuelve } = await import(pathToFileURL(join(raiz, 'tools/dictado/dist/ajustes.js')).href);
  const tiempos = [];
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    resuelve({ argumentos: {}, entorno: process.env, archivo: leeArchivoAjustes(datosReales).valores, contexto: { motoresInstalados: ['parakeet'] } });
    tiempos.push(performance.now() - t0);
  }
  resultados.medidas.leerAjustesMs = { p50: Math.round(percentil(tiempos, 0.5) * 100) / 100, max: Math.round(percentil(tiempos, 1) * 100) / 100 };
  console.log(`leer + resolver los ajustes al arrancar: p50 ${resultados.medidas.leerAjustesMs.p50} ms · max ${resultados.medidas.leerAjustesMs.max} ms (20 corridas)`);
}

// ---------- servidor propio sobre una copia de los datos ----------
const copia = mkdtempSync(join(tmpdir(), 'ajustes-copia-'));
if (existsSync(datosReales)) cpSync(datosReales, copia, { recursive: true });
const PUERTO = 3012;
// Grupo de procesos propio: `npx` lanza `next-server` como hijo, y matar solo a npx dejaba el
// servidor huerfano en :3012 (vivido el 2026-09-21). Se mata el grupo entero, tambien por senal.
const servidor = spawn('npx', ['next', 'start', '-p', String(PUERTO)], { cwd: raiz, env: { ...process.env, DICTADO_DATOS: copia }, stdio: 'ignore', detached: true });
const URL = `http://localhost:${PUERTO}`;
const apaga = () => { try { process.kill(-servidor.pid, 'SIGTERM'); } catch { /* ya */ } };
process.on('exit', apaga);
for (const senal of ['SIGINT', 'SIGTERM']) process.on(senal, () => { apaga(); process.exit(1); });
process.on('uncaughtException', (e) => { apaga(); console.error(e); process.exit(1); });
let arranco = false;
for (let i = 0; i < 60 && !arranco; i++) {
  await new Promise((r) => setTimeout(r, 500));
  arranco = await fetch(`${URL}/api/laboratorio/estado`).then((r) => r.ok).catch(() => false);
}
if (!arranco) throw new Error(`el servidor no respondio en :${PUERTO}`);

// ---------- medida: la ruta de lectura ----------
{
  const tiempos = [];
  let estado;
  for (let i = 0; i < 7; i++) {
    const t0 = performance.now();
    const r = await fetch(`${URL}/api/ajustes`, { headers: cabeceras });
    estado = await r.json();
    tiempos.push(performance.now() - t0);
  }
  resultados.medidas.rutaLeeMs = { p50: Math.round(percentil(tiempos, 0.5)) };
  resultados.vistas.ruta = { campos: estado.esquema.length, grupos: estado.grupos.length, motoresInstalados: estado.motoresInstalados, catalogo: estado.catalogo.map((c) => `${c.nombre}${c.medido ? ` (WER ${(c.wer * 100).toFixed(1)} %, p50 ${Math.round(c.latenciaP50Ms)} ms)` : ' (sin medir)'}`), medicion: estado.medicion?.fecha };
  console.log(`GET /api/ajustes: p50 ${resultados.medidas.rutaLeeMs.p50} ms · ${estado.esquema.length} campos en ${estado.grupos.length} grupos · motores: ${resultados.vistas.ruta.catalogo.join(', ')}`);
  // sin token: 401
  resultados.vistas.sinToken = (await fetch(`${URL}/api/ajustes`)).status;
  // un motor no instalado, por la ruta: 422 con la lista
  const r = await fetch(`${URL}/api/ajustes`, { method: 'POST', headers: cabeceras, body: JSON.stringify({ orden: 'pon', clave: 'motor', valor: 'whisper-turbo' }) });
  resultados.vistas.motorRechazado = { status: r.status, error: (await r.json()).error };
  console.log(`  sin token → ${resultados.vistas.sinToken} · motor no instalado → ${r.status}: ${resultados.vistas.motorRechazado.error}`);
}

// ---------- el navegador ----------
const navegador = await chromium.launch();
const nuevoContexto = async (opciones = {}) => {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-MX', ...opciones });
  await contexto.addInitScript((t) => localStorage.setItem('dictado.token', t), token);
  const pagina = await contexto.newPage();
  pagina.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') resultados.consola.push(`${m.type()}: ${m.text()}`); });
  pagina.on('pageerror', (e) => resultados.errores.push(String(e)));
  return { contexto, pagina };
};
const captura = async (pagina, nombre, selector, fullPage = false) => {
  const ruta = join(SALIDA, `${nombre}.png`);
  if (selector) await pagina.locator(selector).screenshot({ path: ruta });
  else await pagina.screenshot({ path: ruta, fullPage });
  console.log(`  captura: ${ruta}`);
};

const { contexto, pagina } = await nuevoContexto();
console.log('a) todas las secciones y el catalogo (1280 px)');
{
  const t0 = performance.now();
  await pagina.goto(`${URL}/ajustes`, { waitUntil: 'networkidle' });
  await pagina.locator('[data-prueba="grupo"][data-grupo="sin-proveedor"]').waitFor({ timeout: 30_000 });
  resultados.medidas.cargaPaginaMs = Math.round(performance.now() - t0);
  resultados.vistas.grupos = await pagina.$$eval('[data-prueba="grupo"]', (els) => els.map((e) => ({ grupo: e.dataset.grupo, campos: e.querySelectorAll('[data-prueba^="campo-"]').length })));
  resultados.vistas.catalogoEnPagina = await pagina.$$eval('[data-prueba="catalogo"] [data-prueba="motor"]', (els) => els.map((e) => ({ motor: e.dataset.motor, medido: e.dataset.medido, fila: e.innerText.replace(/\s+/g, ' ').trim() })));
  console.log(`  carga ${resultados.medidas.cargaPaginaMs} ms · grupos: ${resultados.vistas.grupos.map((g) => `${g.grupo} (${g.campos})`).join(', ')}`);
  for (const f of resultados.vistas.catalogoEnPagina) console.log(`  catalogo: ${f.fila}`);
  await captura(pagina, '40-ajustes-completo', undefined, true);
  await captura(pagina, '41-ajustes-catalogo', '[data-prueba="grupo"][data-grupo="motor"]');
}

console.log('b) un cambio guardado: pegar → teclear');
{
  await pagina.locator('[data-prueba="control-pegar"]').selectOption('teclear');
  await pagina.locator('[data-prueba="aviso"]').waitFor({ timeout: 10_000 });
  await pagina.locator('[data-prueba="campo-pegar"][data-origen="ajustes"]').waitFor({ timeout: 10_000 });
  resultados.vistas.guardado = { origen: await pagina.locator('[data-prueba="origen-pegar"]').innerText(), cuenta: await pagina.locator('[data-prueba="cuenta"]').innerText(), archivo: JSON.parse(readFileSync(join(copia, 'ajustes.json'), 'utf8')) };
  console.log(`  ${resultados.vistas.guardado.origen} · ${resultados.vistas.guardado.cuenta} · archivo: ${JSON.stringify(resultados.vistas.guardado.archivo)}`);
  await captura(pagina, '42-ajustes-guardado', '[data-prueba="grupo"][data-grupo="pegado"]');
}

console.log('c) un valor invalido rechazado: silencioMs = 100');
{
  const caja = pagina.locator('[data-prueba="control-silencioMs"]');
  await caja.fill('100');
  await caja.press('Enter');
  await pagina.locator('[data-prueba="error-silencioMs"]').waitFor({ timeout: 10_000 });
  resultados.vistas.invalido = { error: await pagina.locator('[data-prueba="error-silencioMs"]').innerText(), archivo: JSON.parse(readFileSync(join(copia, 'ajustes.json'), 'utf8')) };
  console.log(`  ${resultados.vistas.invalido.error} · el archivo no cambio: ${JSON.stringify(resultados.vistas.invalido.archivo)}`);
  await captura(pagina, '43-ajustes-invalido', '[data-prueba="campo-silencioMs"]');
}

console.log('d) «sin proveedor» en gris y sin poder encenderse');
{
  resultados.vistas.sinProveedor = await pagina.$$eval('[data-prueba="grupo"][data-grupo="sin-proveedor"] input[type=checkbox]', (els) => els.map((e) => ({ id: e.id, disabled: e.disabled, checked: e.checked })));
  console.log(`  ${JSON.stringify(resultados.vistas.sinProveedor)}`);
  await captura(pagina, '44-ajustes-sin-proveedor', '[data-prueba="grupo"][data-grupo="sin-proveedor"]');
}

console.log('e) en caliente: dictar --entrada corriendo mientras se cambian sonidos, pegado y motor');
{
  const wav = join(raiz, 'tools/dictado/medicion/corpus-propio/pildora-sesion.wav');
  const log = join(SALIDA, 'ajustes-caliente.log');
  const fd = openSync(log, 'w');
  const hijo = spawn(process.execPath, [join(raiz, 'tools/dictado/dist/node/cli.js'), 'dictar', '--entrada', wav, '--pegar', 'ninguno', '--modo', 'manos-libres', '--sin-trayectoria', '--silencio-ms', '700', '--respaldo', 'ninguno', '--mic-en-espera', 'abierto'], { cwd: join(raiz, 'tools/dictado'), env: { ...process.env, DICTADO_MODELOS: join(banco, 'modelos'), DICTADO_RUNTIME: banco, DICTADO_DATOS: copia }, stdio: ['ignore', fd, fd] });
  const espera = async (patron, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (patron.test(readFileSync(log, 'utf8'))) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };
  const listo = await espera(/motor .* listo/, 30_000);
  console.log(`  dictar arranco: ${listo}`);
  // sonidos al terminar: en caliente (la pagina)
  await pagina.locator('[data-prueba="control-sonidoAlTerminar"]').check();
  await pagina.locator('[data-prueba="campo-sonidoAlTerminar"][data-origen="ajustes"]').waitFor({ timeout: 10_000 });
  const s1 = await espera(/sonidoAlTerminar false → true: aplicado en caliente/, 5_000);
  // comandos: en caliente
  await pagina.locator('[data-prueba="control-comandos"]').uncheck();
  await pagina.locator('[data-prueba="campo-comandos"][data-origen="ajustes"]').waitFor({ timeout: 10_000 });
  const s2 = await espera(/comandos true → false: aplicado en caliente/, 5_000);
  // motor: no es en caliente → aviso honesto (se elige el otro instalado)
  const otroMotor = resultados.vistas.ruta.motoresInstalados.find((m) => m !== 'parakeet' && m !== 'remoto');
  let s3 = 'sin otro motor instalado';
  if (otroMotor) {
    await pagina.locator('[data-prueba="control-motor"]').selectOption(otroMotor);
    await pagina.locator('[data-prueba="campo-motor"][data-origen="ajustes"]').waitFor({ timeout: 10_000 });
    s3 = await espera(new RegExp(`motor parakeet → ${otroMotor.replace(/[.:]/g, '\\$&')}: se aplica en la siguiente sesion`), 5_000);
  }
  // silencioMs lo fija --silencio-ms 700 en esta sesion: el archivo cambia, pero se dice que no manda
  await pagina.locator('[data-prueba="control-silencioMs"]').fill('900');
  await pagina.locator('[data-prueba="control-silencioMs"]').press('Enter');
  await pagina.locator('[data-prueba="campo-silencioMs"][data-origen="ajustes"]').waitFor({ timeout: 10_000 });
  const s4 = await espera(/silencioMs cambio en el archivo, pero en esta sesion lo fija --silencio-ms/, 5_000);
  const capaPegar = await pagina.locator('[data-prueba="campo-pegar"]').getAttribute('data-origen');
  await espera(/la entrada por archivo termino|cerrando/, 40_000);
  hijo.kill('SIGINT');
  await new Promise((r) => setTimeout(r, 1_500));
  const lineas = readFileSync(log, 'utf8').replace(/\x1b\[[0-9;]*m/g, '').split('\n').filter((l) => /ajustes|motor .* listo|latencia|✓|pegado/.test(l));
  resultados.vistas.caliente = { sonidoAplicado: s1, comandosAplicado: s2, motorAvisaSiguienteSesion: s3, silencioAvisaBandera: s4, origenPegarEnPagina: capaPegar, lineas };
  console.log(`  sonidoAlTerminar en caliente: ${s1} · comandos en caliente: ${s2} · motor avisa «siguiente sesion»: ${s3} · silencioMs avisa que manda la bandera: ${s4} · pegar en la pagina: origen ${capaPegar}`);
  for (const l of lineas) console.log(`    ${l.trim()}`);
  await captura(pagina, '45-ajustes-caliente', '[data-prueba="grupo"][data-grupo="sonidos"]');
}
await contexto.close();

console.log('f) 390 px y tema oscuro');
{
  const { contexto: c3, pagina: p3 } = await nuevoContexto({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  await p3.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('dark')));
  await p3.goto(`${URL}/ajustes`, { waitUntil: 'networkidle' });
  await p3.evaluate(() => document.documentElement.classList.add('dark'));
  await p3.locator('[data-prueba="grupo"][data-grupo="sin-proveedor"]').waitFor({ timeout: 30_000 });
  resultados.vistas.movil = await p3.evaluate(() => ({ desborde: document.documentElement.scrollWidth > window.innerWidth + 1, ancho: document.documentElement.scrollWidth }));
  await captura(p3, '46-ajustes-movil-oscuro');
  await captura(p3, '47-ajustes-movil-oscuro-completo', undefined, true);
  console.log(`  390 px oscuro: desborde horizontal ${resultados.vistas.movil.desborde ? 'SI' : 'no'} (ancho ${resultados.vistas.movil.ancho})`);
  await c3.close();
}

apaga();
await navegador.close();
writeFileSync(join(SALIDA, 'ajustes.json'), JSON.stringify(resultados, null, 1));
console.log(`listo: errores de pagina ${resultados.errores.length} · consola ${resultados.consola.length} · ${join(SALIDA, 'ajustes.json')}`);
if (resultados.errores.length) console.log(resultados.errores.join('\n'));
if (resultados.consola.length) console.log(resultados.consola.slice(0, 5).join('\n'));
