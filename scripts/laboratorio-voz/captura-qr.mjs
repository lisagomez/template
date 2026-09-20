#!/usr/bin/env node
/**
 * Prueba de punta a punta del emparejamiento por QR: un navegador emparejado dibuja el QR en
 * /laboratorio-voz y en /dictar; se LEE el QR (zxing-wasm, local) y un navegador limpio abre el
 * enlace leido y queda emparejado. Solo imprime booleanos: el token nunca sale por stdout.
 *
 *   URL_BASE=http://localhost:3000 node scripts/laboratorio-voz/captura-qr.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';

const URL_BASE = process.env.URL_BASE ?? 'http://localhost:3000';
const token = /^DICTADO_MOVIL_TOKEN=(.+)$/m.exec(readFileSync('.env.local', 'utf8'))?.[1]?.trim();
if (!token) throw new Error('sin token');

// El .wasm se inyecta desde node_modules: zxing-wasm iria a un CDN si no (regla del extractor).
const wasm = readFileSync(fileURLToPath(import.meta.resolve('zxing-wasm/reader/zxing_reader.wasm')));
prepareZXingModule({ overrides: { wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) }, fireImmediately: true });

const navegador = await chromium.launch();
const resultado = {};

async function pruebaRuta(ruta, textoBoton) {
  const emparejado = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-MX' });
  await emparejado.addInitScript((t) => localStorage.setItem('dictado.token', t), token);
  const pagina = await emparejado.newPage();
  await pagina.goto(`${URL_BASE}${ruta}`, { waitUntil: 'networkidle' });
  await pagina.getByRole('button', { name: textoBoton }).click();
  const svg = pagina.locator('[data-prueba="qr-svg"]');
  await svg.waitFor({ timeout: 10_000 });
  const png = await svg.screenshot();
  const lecturas = await readBarcodes(new Blob([png]), { formats: ['QRCode'], tryHarder: true });
  const leido = lecturas[0]?.text ?? '';
  const esperado = `${URL_BASE}${ruta}#t=${encodeURIComponent(token)}`;
  await emparejado.close();

  // Un telefono nuevo: navegador limpio, abre lo que decia el QR.
  const limpio = await navegador.newContext({ ...devices['iPhone 14'], locale: 'es-MX' });
  const telefono = await limpio.newPage();
  const antes = await telefono.goto(`${URL_BASE}${ruta}`, { waitUntil: 'networkidle' }).then(() => telefono.evaluate(() => !!localStorage.getItem('dictado.token')));
  await telefono.goto('about:blank');
  await telefono.goto(leido || `${URL_BASE}${ruta}`, { waitUntil: 'networkidle' });
  await telefono.waitForFunction(() => !!localStorage.getItem('dictado.token'), null, { timeout: 15_000 }).catch(() => undefined);
  const despues = await telefono.evaluate(() => ({ guardado: !!localStorage.getItem('dictado.token'), urlLimpia: !location.href.includes('t='), path: location.pathname }));
  const formulario = ruta === '/dictar' ? await telefono.getByRole('heading', { name: 'Emparejar dictado' }).count() : await telefono.locator('[data-prueba="emparejar"]').count();
  await limpio.close();

  return { qrLeido: leido.length > 0, qrCoincide: leido === esperado, telefonoAntes: antes, telefonoDespues: despues, formularioVisible: formulario > 0 };
}

resultado.laboratorio = await pruebaRuta('/laboratorio-voz', 'emparejar otro dispositivo (QR)');
resultado.dictar = await pruebaRuta('/dictar', 'emparejar otro dispositivo (QR)');
await navegador.close();
console.log(JSON.stringify(resultado, null, 1));
