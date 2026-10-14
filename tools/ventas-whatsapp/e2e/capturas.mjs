#!/usr/bin/env node
/**
 * Evidencia de punta a punta del vendedor en WhatsApp, POR HTTP y con la app YA CONSTRUIDA
 * (`npm run build` antes). Levanta el simulador de Meta (Graph API con tokens por número) y el del
 * procesador de pagos en 127.0.0.1, arranca la app con las pymes ficticias, corre conversaciones
 * reales contra sus rutas (webhook firmado, Flows cifrados, pagos, A2A) y saca capturas con
 * Playwright de la bandeja con traspaso, el tablero de ROAS y el laboratorio, en escritorio y
 * celular.
 *
 *   npm run build && node tools/ventas-whatsapp/e2e/capturas.mjs [carpeta-de-salida]
 *
 * Todo es local y ficticio: nada sale a Meta, a un procesador real ni a un modelo de pago.
 */
import { spawn } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { verifyAgentCardSignature } from '@a2a-js/sdk';
import { creaMetaSimulada, creaProcesadorSimulado, sirveMetaSimulada, sirveProcesador } from '../dist/simulador/index.js';
import { CSV_RESTAURANTE, CSV_TIENDA } from '../dist/laboratorio/index.js';
import { leeCsvCatalogo, PLANTILLAS } from '../dist/index.js';

const herramienta = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const raiz = resolve(herramienta, '../..');
const SALIDA = resolve(process.argv[2] ?? join(raiz, '.datos/capturas-ventas-whatsapp'));
const [PUERTO_APP, PUERTO_META, PUERTO_PAGOS] = [3127, 3128, 3129];
const APP = `http://localhost:${PUERTO_APP}`;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const aleatorio = () => randomBytes(24).toString('base64url');
const informe = { acusesMs: [], pasos: [], capturas: [] };

rmSync(SALIDA, { recursive: true, force: true });
mkdirSync(SALIDA, { recursive: true });

// --- Secretos del laboratorio (aleatorios en cada corrida; no se imprimen) -------------------
const secretoApp = aleatorio();
const SECRETO_PAGOS = aleatorio();
const flowsLlave = generateKeyPairSync('rsa', { modulusLength: 2048 });
const a2aLlave = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const anclaLlave = generateKeyPairSync('ed25519');
const pem64 = (k) => Buffer.from(k.export({ type: 'pkcs8', format: 'pem' })).toString('base64');
const TOKENS = { pn_1: aleatorio(), pn_2: aleatorio() };
const tokensRecurso = { pn_1: TOKENS.pn_1, ds_1: TOKENS.pn_1, pn_2: TOKENS.pn_2, ds_2: TOKENS.pn_2 };
const PANEL = { pyme_restaurante: aleatorio(), pyme_tienda: aleatorio() };
const panelEnv = Object.entries(PANEL).map(([k, v]) => `${k}:${v}`).join(',');
const plataforma = aleatorio();

// --- Meta y el procesador, simulados y servidos por HTTP -------------------------------------
const meta = creaMetaSimulada({
  secretoApp,
  entrega: async (cuerpo, cab) => {
    const t0 = performance.now();
    const r = await fetch(`${APP}/api/ventas-whatsapp/webhook`, { method: 'POST', headers: cab, body: cuerpo });
    informe.acusesMs.push(performance.now() - t0);
    return r.status;
  },
  endpointFlows: async (cuerpo, cab) => {
    const r = await fetch(`${APP}/api/ventas-whatsapp/flows`, { method: 'POST', headers: cab, body: cuerpo });
    return { status: r.status, cuerpo: await r.text() };
  },
});
const procesador = creaProcesadorSimulado({
  secreto: SECRETO_PAGOS,
  entrega: async (cuerpo, cab) => (await fetch(`${APP}/api/ventas-whatsapp/pagos`, { method: 'POST', headers: cab, body: cuerpo })).status,
});
const flows = Object.fromEntries(['entrega', 'reserva', 'lead', 'checkout'].map((t) => [t, JSON.parse(readFileSync(join(herramienta, 'flows', `${t}.json`), 'utf8'))]));
const canales = {};
for (const [n, csv] of [[1, CSV_RESTAURANTE], [2, CSV_TIENDA]]) {
  const canal = { wabaId: `waba_${n}`, phoneNumberId: `pn_${n}`, telefonoVisible: `52229000000${n}`, datasetId: `ds_${n}`, catalogoId: `cat_${n}` };
  const ids = meta.registraNumero({ ...canal, token: TOKENS[`pn_${n}`], llavePublicaFlows: flowsLlave.publicKey, plantillas: PLANTILLAS, flows });
  meta.cargaCatalogo(canal.catalogoId, leeCsvCatalogo(csv).productos);
  canales[n] = { ...canal, flows: ids };
}
const servidores = [await sirveMetaSimulada(meta, PUERTO_META, tokensRecurso), await sirveProcesador(procesador, PUERTO_PAGOS)];

// --- La app construida ------------------------------------------------------------------------
const app = spawn(process.execPath, [join(raiz, 'node_modules/next/dist/bin/next'), 'start', '-p', String(PUERTO_APP)], {
  cwd: raiz, stdio: 'ignore', detached: true,
  env: {
    ...process.env, PORT: String(PUERTO_APP), VENTAS_WA_DATOS: join(SALIDA, 'datos'), VENTAS_WA_LABORATORIO: '1',
    VENTAS_WA_APP_SECRET: secretoApp, VENTAS_WA_VERIFY_TOKEN: aleatorio(), VENTAS_WA_FLOW_SECRET: aleatorio(), VENTAS_WA_FLOWS_LLAVE: pem64(flowsLlave.privateKey),
    VENTAS_WA_GRAPH_URL: `http://127.0.0.1:${PUERTO_META}`, VENTAS_WA_TOKENS: JSON.stringify(tokensRecurso),
    VENTAS_WA_PAGOS_URL: `http://127.0.0.1:${PUERTO_PAGOS}`, VENTAS_WA_PAGOS_SECRETO: SECRETO_PAGOS,
    VENTAS_WA_PANEL_TOKENS: panelEnv, VENTAS_WA_PLATAFORMA_TOKEN: plataforma,
    VENTAS_WA_A2A_LLAVE: pem64(a2aLlave.privateKey), VENTAS_WA_A2A_SECRETO: aleatorio(),
    VENTAS_WA_TRAZA_LLAVE: aleatorio(), VENTAS_WA_ANCLA_LLAVE: pem64(anclaLlave.privateKey),
  },
});
const apaga = () => { try { process.kill(-app.pid, 'SIGKILL'); } catch { /* ya salió */ } for (const s of servidores) s.close(); };
process.on('exit', apaga);
for (let i = 0; i < 80; i++) {
  try { if ((await fetch(`${APP}/ventas-whatsapp`)).ok) break; } catch { /* arrancando */ }
  await espera(500);
}

const plat = async (cuerpo) => {
  const r = await fetch(`${APP}/api/ventas-whatsapp/plataforma`, { method: cuerpo ? 'POST' : 'GET', headers: { authorization: `Bearer ${plataforma}`, 'content-type': 'application/json' }, ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}) });
  return { status: r.status, cuerpo: await r.json() };
};
const panel = async (pyme, cuerpo) => {
  const r = await fetch(`${APP}/api/ventas-whatsapp/panel`, { method: cuerpo ? 'POST' : 'GET', headers: { authorization: `Bearer ${PANEL[pyme]}`, 'content-type': 'application/json' }, ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}) });
  return { status: r.status, cuerpo: await r.json() };
};
/** Espera a que la app termine de contestar: el webhook se acusa al instante y el trabajo va en cola. */
async function asienta() {
  let quietas = 0;
  for (let i = 0; i < 100 && quietas < 4; i++) {
    const antes = meta.registro.length;
    await meta.drena();
    await espera(120);
    quietas = meta.pendientes() === 0 && meta.registro.length === antes ? quietas + 1 : 0;
  }
}

// --- Alta de las pymes ficticias y sus campañas ----------------------------------------------
for (const [pyme, n, clave] of [['pyme_restaurante', 1, 'restaurante'], ['pyme_tienda', 2, 'tienda']]) {
  const r = await panel(pyme, { accion: 'semilla', pyme: clave, canal: canales[n] });
  informe.pasos.push(`semilla ${clave}: ${r.status}`);
}
const campR = meta.anuncios.creaCampana('Tacos de octubre', 80_000);
const campT = meta.anuncios.creaCampana('Huipiles bordados', 150_000);
await panel('pyme_restaurante', { accion: 'gasto', campanaId: campR.id, nombre: campR.nombre, gastoCentavos: campR.gastoCentavos, anuncios: campR.anuncios });
await panel('pyme_tienda', { accion: 'gasto', campanaId: campT.id, nombre: campT.nombre, gastoCentavos: campT.gastoCentavos, anuncios: campT.anuncios });
await panel('pyme_restaurante', { accion: 'qr', etiqueta: 'QR-MESA', mensaje: 'Quiero pedir' });

async function compra(pn, waId, nombre, entrada, items, pantalla, datos, { anuncio, duplica } = {}) {
  const cl = meta.cliente(pn, waId, nombre);
  if (anuncio) cl.llegaPorAnuncio(anuncio, entrada); else cl.escribe(entrada);
  await asienta();
  cl.pide(items);
  await asienta();
  await cl.llenaFlow({ [pantalla]: datos, RESUMEN: { confirmar: true } });
  await asienta();
  const u = cl.ultimo();
  if (u?.mensaje.tipo === 'cta_url') { await procesador.paga(procesador.ligaDeUrl(u.mensaje.url).id, { duplicaWebhook: !!duplica }); await asienta(); }
  informe.pasos.push(`${nombre}: ${cl.recibidos.map((r) => r.mensaje.tipo).join(' → ')}`);
  return cl;
}

// --- Conversaciones por HTTP -----------------------------------------------------------------
await compra('pn_1', '5212291234567', 'Ana', 'Hola, vi su anuncio. ¿Qué tienen de comer?', [{ retailerId: 'tacos-pastor', cantidad: 2 }, { retailerId: 'cafe-lechero', cantidad: 1 }], 'ENTREGA', { zona: 'Boca del Río', direccion: 'Calle Ficticia 12', horario: '19:00-20:00', recoger: false }, { anuncio: campR.anuncios[0], duplica: true });
await compra('pn_1', '5222912340002', 'Mesa 4', 'Quiero pedir [QR-MESA]', [{ retailerId: 'picadas', cantidad: 2 }], 'ENTREGA', { zona: '', direccion: '', horario: 'lo-antes-posible', recoger: true });
await compra('pn_2', '5212281234567', 'Luisa', 'Hola, ¿tienen huipiles rojos?', [{ retailerId: 'huipil-rojo-m', cantidad: 1 }], 'ENVIO', { zona: 'Veracruz', direccion: 'Av. Ficticia 34', rfc: 'XAXX010101000', razon_social: 'Público en general', recoger: false }, { anuncio: campT.anuncios[0] });
const reserva = meta.cliente('pn_1', '5222912340003', 'Luis');
reserva.escribe('Quiero reservar mesa para hoy');
await asienta();
await reserva.llenaFlow({ DIA: (d) => ({ servicio: 'mesa-4', dia: d.dias[0].id }), HORA: (d) => ({ inicio: d.horarios[0].id, servicio: d.servicio }) });
await asienta();
informe.pasos.push(`Luis: ${reserva.ultimo()?.resumen}`);
const molesta = meta.cliente('pn_1', '5222912340004', 'Carmen');
molesta.escribe('Mi pedido de ayer llegó frío, estoy muy molesta');
await asienta();
const grande = meta.cliente('pn_2', '5222812340005', 'Evento');
grande.pide([{ retailerId: 'guayabera-lino-m', cantidad: 5 }]);
await asienta();
const ajena = meta.cliente('pn_2', '5222812340006', 'Curioso');
ajena.escribe('¿Quién ganó las elecciones para presidente?');
await asienta();
informe.pasos.push(`fuera de dominio: ${ajena.ultimo()?.resumen}`);

// --- Lista de bloqueo: el dueño bloquea desde la bandeja a quien insulta ----------------------
const grosero = meta.cliente('pn_2', '5222812340007', 'Grosero');
grosero.escribe('Pésimo servicio, son unos inútiles');
await asienta();
const casoGrosero = (await panel('pyme_tienda')).cuerpo.bandeja.casos.find((c) => c.waId === '5222812340007');
const bloqueo = await panel('pyme_tienda', { accion: 'bloquear', conversacionId: casoGrosero.conversacionId, motivo: 'insultos' });
const antesDelBloqueo = grosero.recibidos.length;
grosero.escribe('¿Me contestan o qué?');
await asienta();
informe.pasos.push(`bloqueo: HTTP ${bloqueo.status}; respuestas después del bloqueo: ${grosero.recibidos.length - antesDelBloqueo}`);

// --- Plataforma: números al pool, altas por el BSP propio (Embedded Signup simulado) y factura --
for (const modalidad of ['renta', 'renta', 'venta']) await plat({ accion: 'numeroAlPool', modalidad });
const wabas = {};
let ligaUsada = '';
for (const [id, perfil, numero] of [['pyme_lab_taqueria', 'restaurante', 'renta'], ['pyme_lab_boutique', 'tienda', 'propio'], ['pyme_lab_cafe', 'restaurante', 'abandona'], ['pyme_lab_merceria', 'tienda', 'venta']]) {
  const { liga } = (await plat({ accion: 'liga', inquilinoId: id })).cuerpo;
  const r = await plat({ accion: 'simulaAlta', liga, perfil, numero });
  if (r.cuerpo.wabaId) { wabas[id] = r.cuerpo.wabaId; ligaUsada ||= liga; }
  informe.pasos.push(`alta ${id} (${numero}): ${r.cuerpo.estado ?? r.cuerpo.rechazo}${r.cuerpo.numeroDelPool ? `, número del pool ${r.cuerpo.numeroDelPool}` : ''}`);
}
const reuso = await plat({ accion: 'simulaAlta', liga: ligaUsada, perfil: 'restaurante', numero: 'propio' });
informe.pasos.push(`liga reusada: HTTP ${reuso.status} (${reuso.cuerpo.rechazo})`);
await plat({ accion: 'confirmaPago', wabaId: wabas.pyme_lab_boutique });
const sinToken = await fetch(`${APP}/api/ventas-whatsapp/plataforma`, { headers: { authorization: `Bearer ${PANEL.pyme_restaurante}` } });
informe.pasos.push(`plataforma con el token de una pyme: HTTP ${sinToken.status}`);
const estadoPlataforma = (await plat()).cuerpo;
informe.pasos.push(`plataforma: ${estadoPlataforma.altas.map((a) => `${a.inquilinoId}=${a.estado}`).join(', ')}; números: ${estadoPlataforma.numeros.map((n) => `${n.modalidad}/${n.estado}`).join(', ')}; margen de números del mes: ${estadoPlataforma.numerosMes.margenCentavos} centavos`);

// --- Cadena de hashes: se ancla y el panel reporta la integridad ------------------------------
const ancla = await panel('pyme_restaurante', { accion: 'anclar' });
informe.pasos.push(`ancla del restaurante: eslabones ${ancla.cuerpo.ancla?.desdeSeq}-${ancla.cuerpo.ancla?.hastaSeq}, firma ${ancla.cuerpo.ancla?.firma ? 'Ed25519' : 'ninguna'}`);

// --- Agent Card firmada, por HTTP, verificada con la llave pública ---------------------------
const card = await (await fetch(`${APP}/api/ventas-whatsapp/a2a/pedidos/.well-known/agent-card.json`)).json();
try { await verifyAgentCardSignature(async () => a2aLlave.publicKey)(card); informe.pasos.push(`Agent Card de pedidos: firma verificada (${card.signatures.length} firma)`); }
catch { informe.pasos.push('Agent Card de pedidos: FIRMA INVÁLIDA'); }

// --- Capturas ---------------------------------------------------------------------------------
const navegador = await chromium.launch();
const VISTAS = {
  escritorio: { viewport: { width: 1440, height: 1000 } },
  celular: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
async function pagina(vista, pyme) {
  const ctx = await navegador.newContext(VISTAS[vista]);
  await ctx.addInitScript((t) => { localStorage.setItem('ventas-wa-token', t); }, PANEL[pyme]);
  return ctx.newPage();
}
const foto = async (p, nombre, selector) => {
  const ruta = join(SALIDA, `${nombre}.png`);
  if (selector) await p.locator(selector).first().screenshot({ path: ruta }); else await p.screenshot({ path: ruta, fullPage: true });
  informe.capturas.push(ruta);
};

// Escritorio: el restaurante toma, contesta y devuelve la queja de Carmen.
{
  const p = await pagina('escritorio', 'pyme_restaurante');
  await p.goto(`${APP}/ventas-whatsapp`);
  await p.waitForSelector('[data-prueba="caso-abierto"]');
  await foto(p, 'escritorio-1-bandeja-traspaso');
  await p.click('[data-prueba="tomar"]');
  await p.waitForSelector('[data-prueba="respuesta"]');
  await p.fill('[data-prueba="respuesta"]', 'Hola Carmen, soy Doña Chela. Te mando otro pedido sin costo en 30 minutos.');
  await p.click('[data-prueba="enviar"]');
  await p.waitForTimeout(800);
  await asienta();
  await p.reload();
  await p.waitForSelector('[data-prueba="caso-tomado"]');
  await foto(p, 'escritorio-2-bandeja-tomada-y-respondida');
  informe.pasos.push(`Carmen recibió: ${molesta.ultimo()?.resumen}`);
  await p.click('[data-prueba="liberar"]');
  await p.waitForTimeout(800);
  await p.reload();
  await p.waitForSelector('[data-prueba="bandeja"]');
  await foto(p, 'escritorio-3-bandeja-liberada');
  molesta.escribe('Gracias, ¿qué más tienen?');
  await asienta();
  informe.pasos.push(`Carmen, ya con el agente: ${molesta.ultimo()?.mensaje.tipo}`);
  await p.reload();
  await p.waitForSelector('[data-prueba="tablero"]');
  await foto(p, 'escritorio-4-tablero-restaurante', '[data-prueba="tablero"]');
  const t = await pagina('escritorio', 'pyme_tienda');
  await t.goto(`${APP}/ventas-whatsapp`);
  await t.waitForSelector('[data-prueba="caso-abierto"]');
  await foto(t, 'escritorio-5-tienda-bandeja-y-tablero');
}
// Celular: la tienda ve su caso de monto alto y su tablero; el restaurante, su tablero.
{
  const t = await pagina('celular', 'pyme_tienda');
  await t.goto(`${APP}/ventas-whatsapp`);
  await t.waitForSelector('[data-prueba="caso-abierto"]');
  await foto(t, 'celular-1-bandeja-traspaso-monto');
  await t.click('text=Tablero');
  await foto(t, 'celular-2-tablero-tienda');
  const r = await pagina('celular', 'pyme_restaurante');
  await r.goto(`${APP}/ventas-whatsapp`);
  await r.waitForSelector('[data-prueba="negocio"]');
  await r.click('text=Tablero');
  await foto(r, 'celular-3-tablero-restaurante');
}
for (const vista of ['escritorio', 'celular']) {
  const lab = await (await navegador.newContext(VISTAS[vista])).newPage();
  await lab.goto(`${APP}/laboratorio-ventas-whatsapp`, { timeout: 120_000 });
  await lab.waitForSelector('[data-prueba="tabla-compuertas"]');
  await foto(lab, `${vista}-6-laboratorio`);
  if (vista === 'escritorio') await foto(lab, 'escritorio-7-lineas-de-negocio', '[data-prueba="lineas-de-negocio"]');
}
for (const vista of ['escritorio', 'celular']) {
  const ctx = await navegador.newContext(VISTAS[vista]);
  await ctx.addInitScript((t) => { localStorage.setItem('ventas-wa-plataforma', t); }, plataforma);
  const pl = await ctx.newPage();
  await pl.goto(`${APP}/plataforma-ventas-whatsapp`);
  await pl.waitForSelector('[data-prueba="tabla-altas"]');
  await foto(pl, `${vista}-8-plataforma`);
}
{
  const t = await pagina('escritorio', 'pyme_tienda');
  await t.goto(`${APP}/ventas-whatsapp`);
  await t.waitForSelector('[data-prueba="bloqueado"]');
  await foto(t, 'escritorio-9-contacto-bloqueado', '[data-prueba="bandeja"]');
}
await navegador.close();

const tablero = await panel('pyme_restaurante');
informe.pasos.push(`integridad del restaurante: ${JSON.stringify(tablero.cuerpo.integridad)}`);
const acuses = [...informe.acusesMs].sort((a, b) => a - b);
const resumen = {
  ...informe,
  acusesMs: undefined,
  acusesHttp: { webhooks: acuses.length, p95ms: +acuses[Math.floor(acuses.length * 0.95)].toFixed(1), maximoMs: +acuses[acuses.length - 1].toFixed(1) },
  capi: meta.capi.aceptados.map((e) => `${e.event_name} ${e.event_id} ${e.custom_data ? e.custom_data.value : ''}`),
  capiDuplicados: meta.capi.duplicados,
  roasRestaurante: tablero.cuerpo.tablero.filas.map((f) => `${f.canal}: ${f.pedidosPagados} pagados · ROAS ${f.roas}`),
  administrador: meta.anuncios.reporte().map((r) => `${r.nombre}: ROAS ${r.roas}`),
};
writeFileSync(join(SALIDA, 'informe.json'), JSON.stringify(resumen, null, 2));
console.log(JSON.stringify(resumen, null, 2));
apaga();
process.exit(0);
