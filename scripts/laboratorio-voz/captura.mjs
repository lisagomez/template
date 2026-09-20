#!/usr/bin/env node
/**
 * Evidencia del laboratorio de voz con Playwright: abre la pagina en produccion, ejercita los
 * casos que la definicion de hecho exige y deja capturas + un JSON con lo que se vio.
 *
 *   node scripts/laboratorio-voz/captura.mjs [--url http://localhost:3000] [--salida carpeta]
 *
 * El token de emparejamiento se lee de .env.local y se inyecta en localStorage: NUNCA se imprime.
 * El microfono se falsea con un WAV generado por la voz sintetica de la maquina (Chromium
 * `--use-file-for-fake-audio-capture`), asi «grabar con el microfono» tambien se demuestra.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porDefecto : process.argv[i + 1];
};
const URL_BASE = arg('url', 'http://localhost:3000');
const SALIDA = resolve(arg('salida', 'capturas-laboratorio'));
const PASOS = arg('pasos', 'a,b,c,d,e,f,g').split(',');
const paso = (letra) => PASOS.includes(letra);
mkdirSync(SALIDA, { recursive: true });

const raiz = process.cwd();
const env = readFileSync(join(raiz, '.env.local'), 'utf8');
const token = /^DICTADO_MOVIL_TOKEN=(.+)$/m.exec(env)?.[1]?.trim();
if (!token) throw new Error('falta DICTADO_MOVIL_TOKEN en .env.local');
console.log(`token: presente (largo ${token.length})`);

// Un WAV real para el microfono falso: la voz sintetica lee una frase; Chromium lo reproduce como si fuera el mic.
const banco = join(raiz, 'tools/dictado/medicion/banco');
const micWav = join(SALIDA, 'microfono-falso.wav');
if (!existsSync(micWav)) {
  const crudo = join(SALIDA, 'microfono-crudo.wav');
  execFileSync(process.execPath, [join(raiz, 'tools/dictado/dist/node/cli.js'), 'di', 'Probando el micrófono del laboratorio con casco puesto. Tres cajas en el pasillo cuatro, urgente.', '--guarda', crudo, '--sin-sonido'], {
    env: { ...process.env, DICTADO_MODELOS: join(banco, 'modelos'), DICTADO_RUNTIME: banco, DICTADO_DATOS: join(banco, 'datos') },
    cwd: join(raiz, 'tools/dictado'),
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', crudo, '-ar', '48000', '-ac', '1', '-sample_fmt', 's16', micWav]);
}

const previo = existsSync(join(SALIDA, 'resultados.json')) ? JSON.parse(readFileSync(join(SALIDA, 'resultados.json'), 'utf8')) : {};
const resultados = { ...previo, url: URL_BASE, cuando: new Date().toISOString(), consola: [], errores: [], casos: { ...(previo.casos ?? {}) } };
const navegador = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${micWav}`] });
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-MX', permissions: ['microphone'] });
await contexto.addInitScript((t) => localStorage.setItem('dictado.token', t), token);
const pagina = await contexto.newPage();
pagina.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') resultados.consola.push(`${m.type()}: ${m.text()}`); });
pagina.on('pageerror', (e) => resultados.errores.push(String(e)));

const abre = async (caso) => {
  await pagina.goto(caso ? `${URL_BASE}/laboratorio-voz?caso=${caso}` : `${URL_BASE}/laboratorio-voz`, { waitUntil: 'networkidle' });
  await pagina.waitForSelector('[data-prueba="resumen"]');
  await pagina.waitForFunction(() => document.querySelectorAll('[data-estado]').length === 20);
};
const captura = async (nombre, selector) => {
  const ruta = join(SALIDA, `${nombre}.png`);
  if (selector) await pagina.locator(selector).screenshot({ path: ruta });
  else await pagina.screenshot({ path: ruta, fullPage: false });
  console.log(`  captura: ${ruta}`);
};
const panel = (n) => pagina.locator(`[data-prueba="panel-${n}"]`);

// (a) el mapa con el semaforo
if (paso('a')) {
console.log('a) mapa de salas');
await abre();
resultados.semaforo = await pagina.$$eval('[data-estado]', (els) => els.map((e) => ({ caso: e.id, estado: e.dataset.estado })));
resultados.resumen = await pagina.locator('[data-prueba="resumen"]').innerText();
await captura('01-mapa-salas');
await pagina.screenshot({ path: join(SALIDA, '01b-mapa-completo.png'), fullPage: true });

// (b) notas de voz a texto: antes (audio de muestra) / despues (texto + latencia)
}

if (paso('b')) {
console.log('b) caso 1: notas de voz a texto');
await abre(1);
await panel(1).getByRole('button', { name: 'Usar la muestra' }).click();
await panel(1).locator('[data-prueba="texto"]').waitFor({ timeout: 180_000 });
resultados.casos.notas = { texto: await panel(1).locator('[data-prueba="texto"]').innerText(), metricas: await panel(1).locator('[data-prueba="resultado"]').innerText() };
await captura('02-notas-antes-despues', '#caso-1');

// (c) locucion: audio generado y duracion
}

if (paso('c')) {
console.log('c) caso 14: locucion');
await abre(14);
await panel(14).getByRole('button', { name: 'Generar la voz' }).click();
await panel(14).locator('[data-prueba="metricas-locucion"]').waitFor({ timeout: 180_000 });
resultados.casos.locucion = await panel(14).locator('[data-prueba="metricas-locucion"]').innerText();
await captura('03-locucion', '#caso-14');

// (d) call center: llamada a dos canales → turnos → insights con evidencia y score
}

if (paso('d')) {
console.log('d) caso 6: call center');
await abre(6);
await panel(6).getByRole('button', { name: 'Usar la muestra' }).click();
await panel(6).locator('[data-prueba="resultado-asesor"]').waitFor({ timeout: 600_000 });
resultados.casos.callCenter = {
  turnos: await panel(6).locator('[data-prueba="segmentos"]').innerText(),
  insights: await panel(6).locator('[data-prueba="insights"]').innerText(),
  desglose: await panel(6).locator('[data-prueba="desglose"]').innerText(),
  huecos: (await panel(6).locator('[data-prueba="huecos"]').count()) ? await panel(6).locator('[data-prueba="huecos"]').innerText() : '(sin huecos)',
};
await captura('04-call-center', '#caso-6');

// (e) puerta humana con razon, y la vista previa sin ejecutar
}

if (paso('e')) {
console.log('e) casos 11 y 4: puerta humana y vista previa');
await abre(11);
resultados.casos.puerta = await panel(11).innerText();
await captura('05-puerta-humana', '#caso-11');
await abre(4);
resultados.casos.vistaPrevia = await panel(4).locator('[data-prueba="vista-previa"]').innerText();
await captura('06-vista-previa-sin-ejecutar', '#caso-4');

// (f) veredicto guardado y el informe exportado
}

if (paso('f')) {
console.log('f) veredicto e informe');
await abre(1);
const veredicto = pagina.locator('[data-prueba="veredicto-1"]');
await veredicto.getByRole('button', { name: 'Funcionó', exact: true }).click();
await veredicto.getByPlaceholder('Una nota (qué viste, qué falló)').fill('Muestra sintética transcrita completa; latencia bajo un segundo.');
await veredicto.getByRole('button', { name: 'Guardar' }).click();
await veredicto.getByText('Veredicto guardado en esta computadora.').waitFor({ timeout: 20_000 });
await captura('07-veredicto-guardado', '#caso-1 [data-prueba="veredicto-1"]');
const informe = await contexto.request.get(`${URL_BASE}/api/laboratorio/veredictos?formato=md`, { headers: { authorization: `Bearer ${token}` } });
writeFileSync(join(SALIDA, 'informe.md'), await informe.text(), 'utf8');
await abre();
await captura('08-cabecera-informe');
resultados.casos.informe = { estado: informe.status(), bytes: (await informe.body()).length };

// (g) extra: el microfono (falso, con audio real de la voz sintetica) en manos libres
}

if (paso('g')) {
console.log('g) caso 17: microfono');
try {
  await abre(17);
  await panel(17).getByRole('button', { name: 'Grabar con el micrófono' }).click();
  await pagina.waitForTimeout(7_000);
  await panel(17).getByRole('button', { name: 'Terminar grabación' }).click();
  await panel(17).locator('[data-prueba="texto"]').waitFor({ timeout: 180_000 });
  resultados.casos.microfono = await panel(17).locator('[data-prueba="texto"]').innerText();
  await captura('09-microfono-manos-libres', '#caso-17');
} catch (e) {
  resultados.casos.microfono = `no se pudo: ${String(e).slice(0, 200)}`;
}
}

writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(resultados, null, 2), 'utf8');
await navegador.close();
console.log(`listo: ${SALIDA}/resultados.json · errores de pagina: ${resultados.errores.length} · avisos de consola: ${resultados.consola.length}`);
