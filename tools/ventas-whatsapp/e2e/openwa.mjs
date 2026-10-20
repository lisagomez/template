#!/usr/bin/env node
/**
 * La puerta de salida de OpenWA de punta a punta, POR HTTP y con la app YA CONSTRUIDA (`npm run build` antes): el
 * simulador de Meta en 127.0.0.1 (Graph, plantillas, webhooks a la app), la app con la fachada en su ruta, el SDK
 * oficial `@rmyndharis/openwa@0.6.0` sin modificar como cliente, un receptor de webhooks que verifica la firma con el
 * mismo SDK, y capturas con Playwright del panel de migración en escritorio y celular. La guardia de red se precarga
 * en este proceso y en el de la app: ninguna conexión sale de la máquina.
 *
 *   npm run build && node tools/ventas-whatsapp/e2e/openwa.mjs [carpeta-de-salida]
 *
 * Todo es sintético: ningún número real, nada sale a Meta ni a un OpenWA real.
 */
import { spawn } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const herramienta = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const raiz = resolve(herramienta, '../..');
const SALIDA = resolve(process.argv[2] ?? join(raiz, '.datos/capturas-openwa'));
const GUARDIA = join(herramienta, 'e2e', 'guardia-red.mjs');
rmSync(SALIDA, { recursive: true, force: true });
mkdirSync(SALIDA, { recursive: true });
process.env.GUARDIA_RED_LOG = join(SALIDA, 'guardia-red.log');
writeFileSync(process.env.GUARDIA_RED_LOG, '');
await import(GUARDIA);

const { chromium } = await import('playwright');
const { OpenWAClient, OpenWAApiError, verifyWebhookSignature } = await import('@rmyndharis/openwa');
const { creaMetaSimulada, sirveMetaSimulada } = await import('../dist/simulador/index.js');
const { relojManual } = await import('../dist/index.js');

const [PUERTO_APP, PUERTO_META, PUERTO_RECEPTOR] = [3137, 3138, 3139];
const APP = `http://localhost:${PUERTO_APP}`;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const aleatorio = () => randomBytes(24).toString('base64url');
const pasos = [];
const paso = (s) => { pasos.push(s); console.log(`  ${s}`); };

// --- Secretos del laboratorio (aleatorios en cada corrida; no se imprimen) -------------------
const secretoApp = aleatorio();
const LLAVE_OPENWA = aleatorio();
const SECRETO_WEBHOOK = aleatorio();
const plataforma = aleatorio();
const flowsLlave = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem64 = (k) => Buffer.from(k.export({ type: 'pkcs8', format: 'pem' })).toString('base64');
const TOKEN = aleatorio();
const tokensRecurso = { pn_ow: TOKEN, waba_ow: TOKEN };
const NUMERO = { wabaId: 'waba_ow', phoneNumberId: 'pn_ow', telefonoVisible: '+52 228 100 0009' };

// --- Meta simulada (reloj propio: la ventana de 24 h se adelanta sin esperar) ----------------
const reloj = relojManual(Date.now());
const meta = creaMetaSimulada({
  secretoApp, reloj,
  entrega: async (cuerpo, cab) => (await fetch(`${APP}/api/ventas-whatsapp/openwa-webhook`, { method: 'POST', headers: cab, body: cuerpo })).status,
});
meta.registraNumero({ ...NUMERO, datasetId: 'ds_ow', catalogoId: 'cat_ow', token: TOKEN, llavePublicaFlows: flowsLlave.publicKey, plantillas: {} });
const servidorMeta = await sirveMetaSimulada(meta, PUERTO_META, tokensRecurso);

// --- El receptor de webhooks de quien migra (verifica con el SDK) ----------------------------
const recibidas = [];
const receptor = createServer((req, res) => {
  let crudo = '';
  req.setEncoding('utf8');
  req.on('data', (c) => { crudo += c; });
  req.on('end', async () => {
    const valida = await verifyWebhookSignature(crudo, req.headers['x-openwa-signature'], SECRETO_WEBHOOK);
    recibidas.push({ evento: req.headers['x-openwa-event'], valida, cuerpo: JSON.parse(crudo) });
    res.writeHead(valida ? 200 : 401).end();
  });
});
await new Promise((ok) => receptor.listen(PUERTO_RECEPTOR, '127.0.0.1', ok));

// --- La app construida, con la guardia precargada --------------------------------------------
const app = spawn(process.execPath, [join(raiz, 'node_modules/next/dist/bin/next'), 'start', '-p', String(PUERTO_APP)], {
  cwd: raiz, stdio: 'ignore', detached: true,
  env: {
    ...process.env, NODE_OPTIONS: `--import=${GUARDIA}`, NEXT_TELEMETRY_DISABLED: '1', PORT: String(PUERTO_APP), VENTAS_WA_DATOS: join(SALIDA, 'datos'), VENTAS_WA_LABORATORIO: '1',
    VENTAS_WA_APP_SECRET: secretoApp, VENTAS_WA_VERIFY_TOKEN: aleatorio(), VENTAS_WA_FLOW_SECRET: aleatorio(), VENTAS_WA_FLOWS_LLAVE: pem64(flowsLlave.privateKey),
    VENTAS_WA_GRAPH_URL: `http://127.0.0.1:${PUERTO_META}`, VENTAS_WA_TOKENS: JSON.stringify(tokensRecurso),
    VENTAS_WA_PAGOS_URL: 'http://127.0.0.1:3140', VENTAS_WA_PAGOS_SECRETO: aleatorio(), VENTAS_WA_PANEL_TOKENS: `pyme_x:${aleatorio()}`,
    VENTAS_WA_PLATAFORMA_TOKEN: plataforma, VENTAS_WA_OPENWA_LLAVE: LLAVE_OPENWA,
  },
});
const apaga = () => { try { process.kill(-app.pid, 'SIGKILL'); } catch { /* ya salió */ } servidorMeta.close(); receptor.close(); };
process.on('exit', apaga);
for (let i = 0; i < 80; i++) {
  try { if ((await fetch(`${APP}/migracion-openwa`)).ok) break; } catch { /* arrancando */ }
  await espera(500);
}
const plat = async (cuerpo) => (await fetch(`${APP}/api/ventas-whatsapp/plataforma`, { method: 'POST', headers: { authorization: `Bearer ${plataforma}`, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })).json();
async function asienta() { for (let i = 0; i < 5; i++) { await meta.drena(); await espera(100); } }
const falla = (e) => (e instanceof OpenWAApiError ? `${e.status} ${e.code ?? ''}` : String(e));

// --- El SDK sin modificar contra la app ------------------------------------------------------
console.log('SDK @rmyndharis/openwa 0.6.0 contra la app construida:');
const cliente = new OpenWAClient({ baseUrl: `${APP}/api/ventas-whatsapp/openwa`, apiKey: LLAVE_OPENWA });
const quien = await cliente.auth();
paso(`auth() → valid=${quien.valid} engineType=${quien.engineType}`);
const s = await cliente.sessions.create({ name: 'tienda-principal' });
const iniciada = await cliente.sessions.start(s.id);
paso(`sessions.start → ${iniciada.status}; signupUrl → ${new URL(iniciada.signupUrl).pathname}?liga=…`);
paso(`sessions.getQrCode → ${await cliente.sessions.getQrCode(s.id).then(() => 'sin error', falla)}`);
const liga = new URL(iniciada.signupUrl).searchParams.get('liga');
const alta = await plat({ accion: 'simulaAlta', liga, perfil: 'tienda', numero: 'propio', simulado: NUMERO });
await plat({ accion: 'confirmaPago', wabaId: NUMERO.wabaId });
paso(`alta por Embedded Signup (simulada) → ${alta.estado}; método de pago → sessions.get → ${(await cliente.sessions.get(s.id)).status}`);
await cliente.webhooks.create(s.id, { url: `http://127.0.0.1:${PUERTO_RECEPTOR}/openwa`, events: ['*'], secret: SECRETO_WEBHOOK });
const ana = meta.cliente(NUMERO.phoneNumberId, '5215500000001', 'Ana Sintética');
ana.escribe('Hola, ¿tienen café de olla?');
await asienta();
const entrante = recibidas.find((r) => r.evento === 'message.received');
paso(`webhook message.received «${entrante?.cuerpo.data.body}» → verifyWebhookSignature = ${entrante?.valida}`);
const chat = entrante.cuerpo.data.chatId;
paso(`sendText en ventana → ${(await cliente.messages.sendText(s.id, { chatId: chat, text: 'Sí, de olla' })).messageId.slice(0, 14)}…`);
paso(`sendImage por url → ${(await cliente.messages.sendImage(s.id, { chatId: chat, url: 'https://medios.invalid/cafe.jpg' })).messageId.slice(0, 14)}…; con base64 → ${await cliente.messages.sendImage(s.id, { chatId: chat, base64: 'aGVsbG8=', mimetype: 'image/png' }).then(() => 'sin error', falla)}`);
const tpl = await cliente.templates.create(s.id, { name: 'Pedido listo', body: 'Hola {{nombre}}, tu pedido está listo.' });
meta.administracion.revisa(NUMERO.wabaId, tpl.metaName, true);
await asienta();
reloj.avanza(25 * 3_600_000);
paso(`25 h después: sendText → ${await cliente.messages.sendText(s.id, { chatId: chat, text: '¿Sigues ahí?' }).then(() => 'sin error', falla)}; sendTemplate → ${(await cliente.messages.sendTemplate(s.id, { chatId: chat, templateId: tpl.id, vars: { nombre: 'Ana' } })).messageId.slice(0, 14)}…`);
await asienta();
paso(`webhooks recibidos: ${recibidas.length}, con firma válida: ${recibidas.filter((r) => r.valida).length} (${[...new Set(recibidas.map((r) => r.evento))].join(', ')})`);
paso(`lo que Ana recibió en su celular: ${ana.recibidos.map((r) => r.mensaje.tipo).join(' → ')}`);

// --- Capturas del panel de migración ---------------------------------------------------------
const navegador = await chromium.launch();
const ajenasNavegador = [];
const capturas = [];
for (const [nombre, viewport] of [['escritorio', { width: 1366, height: 900 }], ['celular', { width: 390, height: 844 }]]) {
  const pagina = await navegador.newPage({ viewport, deviceScaleFactor: nombre === 'celular' ? 2 : 1 });
  pagina.on('request', (r) => { const h = new URL(r.url()).hostname; if (!['localhost', '127.0.0.1'].includes(h) && !r.url().startsWith('data:')) ajenasNavegador.push(r.url()); });
  const errores = [];
  pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  await pagina.goto(`${APP}/migracion-openwa`, { waitUntil: 'networkidle' });
  await pagina.screenshot({ path: join(SALIDA, `${nombre}-1-panel.png`) });
  await pagina.click('[data-prueba="revisa"]');
  await pagina.waitForSelector('[data-prueba="resultado"]');
  await pagina.locator('[data-prueba="informe"]').screenshot({ path: join(SALIDA, `${nombre}-2-informe.png`) });
  await pagina.click('[data-prueba="filtro-imposible"]');
  await pagina.locator('[data-prueba="matriz"] h2').scrollIntoViewIfNeeded();
  await pagina.screenshot({ path: join(SALIDA, `${nombre}-3-imposibles.png`) });
  const anchoDesborda = await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  capturas.push(...['1-panel', '2-informe', '3-imposibles'].map((c) => `${nombre}-${c}.png`));
  paso(`panel en ${nombre} (${viewport.width}px): errores de consola ${errores.length}, desborde horizontal ${anchoDesborda}`);
  await pagina.close();
}
await navegador.close();

// --- La guardia --------------------------------------------------------------------------------
const lineas = readFileSync(process.env.GUARDIA_RED_LOG, 'utf8').split('\n').filter(Boolean);
const ajenas = lineas.filter((l) => l.startsWith('AJENA'));
paso(`guardia de red: ${lineas.length} conexiones TCP salientes (app y guion), ${ajenas.length} fuera de la máquina; navegador: ${ajenasNavegador.length} fuera`);
writeFileSync(join(SALIDA, 'informe.json'), JSON.stringify({ pasos, capturas, ajenas, ajenasNavegador }, null, 2));
console.log(`capturas en ${SALIDA}: ${capturas.join(', ')}`);
apaga();
process.exit(ajenas.length || ajenasNavegador.length || recibidas.some((r) => !r.valida) ? 1 : 0);
