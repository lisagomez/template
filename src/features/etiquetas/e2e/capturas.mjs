#!/usr/bin/env node
/**
 * Evidencia de punta a punta de /etiquetas, en escritorio y en celular.
 *
 * Levanta la app YA CONSTRUIDA (`npm run build` antes) con la semilla ficticia, el agente de
 * impresion del CEDIS con dos Zebras simuladas (TCP 9100), un Browser Print simulado con su
 * propia Zebra, y un Chromium con camara FALSA alimentada con un video de la etiqueta. Recorre
 * cada flujo, guarda las capturas y compone una imagen por flujo (escritorio + celular).
 *
 *   npm run build && node src/features/etiquetas/e2e/capturas.mjs [carpeta-de-salida]
 *
 * Todo es local y ficticio. Nada sale a la red (Labelary no se toca).
 */
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import bwipjs from 'bwip-js/node';
import { simulaImpresora } from '../../../../tools/etiquetas-gs1/simuladores/impresora-9100.mjs';
import { simulaBrowserPrint } from '../../../../tools/etiquetas-gs1/simuladores/browser-print.mjs';
import { creaAgente, esquemaConfigAgente } from '../../../../tools/etiquetas-gs1/dist/agente/index.js';
import { completaClave, nuevoEvento } from '../../../../tools/etiquetas-gs1/dist/index.js';
import { generaLlaves } from '../../../../tools/etiquetas-gs1/dist/firma.js';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SALIDA = resolve(process.argv[2] ?? join(raiz, '.datos/capturas'));
const CRUDAS = join(SALIDA, 'crudas');
const PUERTO = Number(process.env.PUERTO_CAPTURAS ?? 3117);
const BASE = `http://localhost:${PUERTO}`;
const TOKEN = randomBytes(24).toString('base64url');
const SECRETO = randomBytes(32).toString('base64url');
const informe = { flujos: [], impresion: [] };
const dia = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const aammdd = (iso) => iso.slice(2).replace(/-/g, '');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(SALIDA, { recursive: true, force: true });
mkdirSync(CRUDAS, { recursive: true });

// --- Zebras simuladas, agente del CEDIS y Browser Print ------------------------------------
const zRampa = simulaImpresora();
const zCajas = simulaImpresora();
const zMostrador = simulaImpresora();
const [pRampa, pCajas, pMostrador] = [await zRampa.escucha(), await zCajas.escucha(), await zMostrador.escucha()];
const configAgente = esquemaConfigAgente.parse({
  sitio: 'CEDIS-NTE', escucha: { host: '127.0.0.1', puerto: 9180 }, origenes: [BASE, `http://127.0.0.1:${PUERTO}`],
  impresoras: [
    { id: 'zebra-cedis-rampa', nombre: 'Rampa', sitio: 'CEDIS-NTE', host: '127.0.0.1', puerto: pRampa },
    { id: 'zebra-cedis-cajas', nombre: 'Cajas', sitio: 'CEDIS-NTE', host: '127.0.0.1', puerto: pCajas },
  ],
  reintentos: { maximo: 5, baseMs: 200, topeMs: 1000 },
});
const agente = await creaAgente(configAgente, SECRETO, (m) => console.log(`  [agente] ${m}`));
await agente.escucha();
const bp = simulaBrowserPrint({ impresora: { host: '127.0.0.1', puerto: pMostrador } });
const puertoBp = await bp.escucha();

// --- La app construida ---------------------------------------------------------------------
const datos = join(SALIDA, 'datos');
// Una llave Ed25519 por sitio, generada aqui y pasada SOLO por el entorno del servidor: no se
// escribe a disco ni se imprime (en una instalacion real cada una vive en el agente de su sitio).
const SITIOS = ['CEDIS-NTE', 'SUC-CENTRO', 'SUC-PONIENTE', 'SUC-ORIENTE'];
const llaves = Object.fromEntries(SITIOS.map((s) => [`ETIQUETAS_LLAVE_${s.replace(/-/g, '_')}`, generaLlaves().privada]));
const app = spawn(process.execPath, [join(raiz, 'node_modules/next/dist/bin/next'), 'start', '-p', String(PUERTO)], {
  cwd: raiz, env: { ...process.env, ...llaves, PORT: String(PUERTO), ETIQUETAS_TOKEN: TOKEN, ETIQUETAS_AGENTE_SECRETO: SECRETO, ETIQUETAS_SEMILLA: 'ficticia', ETIQUETAS_DATOS: datos }, stdio: 'ignore',
});
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${BASE}/etiquetas`)).ok) break; } catch { /* aun arrancando */ }
  await espera(500);
}

// --- Video de la etiqueta para la camara falsa ---------------------------------------------
const camara = join(CRUDAS, 'etiqueta-camara.y4m');
let hayCamara = true;
try {
  const png = await bwipjs.toBuffer({ bcid: 'gs1-128', text: `(01)19521111000010(17)${aammdd(dia(8))}(10)L4502`, scale: 4, height: 22, includetext: true, textxalign: 'center', paddingwidth: 24, paddingheight: 14, backgroundcolor: 'FFFFFF' });
  writeFileSync(join(CRUDAS, 'etiqueta-camara.png'), png);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', join(CRUDAS, 'etiqueta-camara.png'), '-t', '3', '-r', '10', '-vf', 'scale=1100:-2,pad=1280:720:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p', camara]);
} catch (e) { hayCamara = false; console.log(`  sin ffmpeg o sin video: se salta la camara falsa (${e.message})`); }

const navegador = await chromium.launch();
const conCamara = hayCamara ? await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${camara}`] }) : null;
const VISTAS = {
  escritorio: { viewport: { width: 1440, height: 1000 } },
  celular: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36' },
};

async function contexto(nav, vista, operador = 'Captura Playwright') {
  const c = await nav.newContext({ ...VISTAS[vista], permissions: ['camera', 'clipboard-read', 'clipboard-write'] });
  await c.addInitScript(([t, o]) => { localStorage.setItem('etiquetas-token', t); localStorage.setItem('etiquetas-operador', o); }, [TOKEN, operador]);
  return c;
}

async function abre(p, ruta) {
  await p.goto(`${BASE}${ruta}`);
  await p.waitForSelector('main h1');
  await p.waitForFunction(() => !document.body.innerText.includes('Cargando…'));
  // En las capturas por elemento la barra fija se colaria encima del contenido.
  await p.addStyleTag({ content: 'nav{position:static!important} div.fixed.right-4.top-4{display:none!important}' });
}

async function foto(p, selector, nombre) {
  const ruta = join(CRUDAS, `${nombre}.png`);
  await p.locator(selector).first().screenshot({ path: ruta });
  return ruta;
}

async function compone(numero, titulo, piezas) {
  const p = await (await navegador.newContext({ viewport: { width: 1800, height: 900 } })).newPage();
  const img = (r) => `data:image/png;base64,${readFileSync(r).toString('base64')}`;
  await p.setContent(`<html><body style="margin:0;font-family:system-ui;background:#e5e7eb"><h1 style="margin:12px 16px;font-size:22px">${numero} · ${titulo}</h1><div style="display:flex;gap:16px;align-items:flex-start;padding:0 16px 16px;flex-wrap:wrap">${piezas.map(([rotulo, r]) => `<figure style="margin:0;background:#fff;padding:8px;border-radius:8px;max-width:${rotulo.startsWith('celular') ? 420 : 1100}px"><figcaption style="font-size:13px;color:#374151;margin-bottom:6px">${rotulo}</figcaption><img src="${img(r)}" style="max-width:100%;display:block"></figure>`).join('')}</div></body></html>`);
  const salida = join(SALIDA, `${numero}-${titulo.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`);
  await p.screenshot({ path: salida, fullPage: true });
  await p.close();
  informe.flujos.push({ numero, titulo, archivo: salida });
  console.log(`✓ ${numero} ${titulo}`);
}

// --- Flujos --------------------------------------------------------------------------------
const COL_DERECHA = 'form[data-prueba="formulario"] ~ div';
const REVISION = 'section[aria-labelledby="t-revision"]';

async function porVista(fn) {
  const r = {};
  for (const vista of ['escritorio', 'celular']) {
    const c = await contexto(navegador, vista);
    const p = await c.newPage();
    r[vista] = await fn(p, vista);
    await c.close();
  }
  return r;
}

const caja = await porVista(async (p, v) => {
  await abre(p, '/etiquetas');
  await p.selectOption('[data-prueba="impresora"]', 'zebra-cedis-cajas');
  await p.waitForSelector('[data-prueba="svg-etiqueta"] svg');
  return foto(p, COL_DERECHA, `caja-${v}`);
});
await compone('01', 'Etiqueta de caja (01)(17)(10)', [['escritorio', caja.escritorio], ['celular', caja.celular]]);

const tarima = await porVista(async (p, v) => {
  await abre(p, '/etiquetas');
  await p.click('[data-prueba="tipo-tarima"]');
  await p.selectOption('[data-prueba="impresora"]', 'zebra-cedis-rampa');
  await p.click('[data-prueba="asigna-sscc"]');
  await p.waitForFunction(() => /^\d{18}$/.test(document.querySelector('[data-prueba="sscc"]')?.value ?? ''));
  await p.waitForSelector('[data-prueba="svg-etiqueta"] svg');
  return foto(p, COL_DERECHA, `tarima-${v}`);
});
await compone('02', 'Etiqueta de tarima de CEDIS (02)(37)(17)(10) + SSCC (00)', [['escritorio', tarima.escritorio], ['celular', tarima.celular]]);

const digito = await porVista(async (p, v) => {
  await abre(p, '/etiquetas');
  await p.fill('[data-prueba="gtin"]', '19521111000011');
  const antes = await foto(p, REVISION, `digito-antes-${v}`);
  await p.click('[data-prueba="arreglo-corrige-digito"]');
  await p.waitForFunction(() => document.querySelector('[data-prueba="gtin"]')?.value === '19521111000010');
  return [antes, await foto(p, REVISION, `digito-despues-${v}`)];
});
await compone('03', 'GTIN con digito malo y el mismo tras «Corregir digito»', [['escritorio · antes', digito.escritorio[0]], ['escritorio · después', digito.escritorio[1]], ['celular · antes', digito.celular[0]], ['celular · después', digito.celular[1]]]);

const LECTURAS = [
  ['vigente', `(01)19521111000010(17)${aammdd(dia(40))}(10)L5001`],
  ['alerta', `]C10119521111000010` + `17${aammdd(dia(8))}10L4502`],
  ['promocion', `(01)19521111000010(17)${aammdd(dia(5))}(10)L4990`],
  ['retiro', `]C10219521111000010` + `3712<GS>17${aammdd(dia(2))}10L0921`],
  ['vencido', `0119521111000010|17${aammdd(dia(-3))}|10L0899`],
];
const semaforo = await porVista(async (p, v) => {
  await abre(p, '/etiquetas/leer');
  const fotos = [];
  for (const [estado, texto] of LECTURAS) {
    await p.fill('[data-prueba="pistola"]', texto);
    await p.press('[data-prueba="pistola"]', 'Enter');
    await p.waitForSelector(`[data-prueba="semaforo-lectura"][data-estado="${estado}"]`);
    fotos.push([`${v} · ${estado}`, await foto(p, '[data-prueba="resultado"]', `semaforo-${estado}-${v}`)]);
  }
  return fotos;
});
await compone('04', 'Semaforo en sus cinco estados (lecturas de pistola: HRI, ]C1, GS sustituido)', [...semaforo.escritorio, ...semaforo.celular]);

async function revisionDe(nombre, prepara) {
  return porVista(async (p, v) => { await abre(p, '/etiquetas'); await prepara(p); await espera(150); return foto(p, REVISION, `${nombre}-${v}`); });
}
const cad = aammdd(dia(35));
const loteMedio = await revisionDe('lote-medio', async (p) => { await p.click('[data-prueba="modo-manual"]'); await p.fill('[data-prueba="manual"]', `(01)19521111000010(10)L4471(17)${cad}`); });
await compone('05', 'Lote mal colocado (en medio): aviso y «Mover lote al final»', [['escritorio', loteMedio.escritorio], ['celular', loteMedio.celular]]);
const loteMalo = await revisionDe('lote-prohibido', async (p) => { await p.fill('[data-prueba="lote"]', 'LOTE Ñ1'); });
await compone('06', 'Lote con caracteres fuera de CSET 82 (espacio y Ñ)', [['escritorio', loteMalo.escritorio], ['celular', loteMalo.celular]]);
const largo = await revisionDe('mas-de-48', async (p) => { await p.click('[data-prueba="modo-manual"]'); await p.fill('[data-prueba="manual"]', `(00)095212340000000013(02)19521111000010(37)50(17)${cad}(10)L4471`); });
await compone('07', 'Codigo de mas de 48 caracteres (tarima en un solo codigo)', [['escritorio', largo.escritorio], ['celular', largo.celular]]);
const noCabe = await revisionDe('no-cabe', async (p) => { await p.selectOption('[data-prueba="grosor"]', '6'); });
await compone('08', 'Codigo que no cabe con su zona en blanco (grosor 6 puntos en 4 pulgadas)', [['escritorio', noCabe.escritorio], ['celular', noCabe.celular]]);
const grosorAuto = await revisionDe('grosor-automatico', async (p) => { await p.selectOption('[data-prueba="lector"]', 'automatico'); });
const grosorPistola = await revisionDe('grosor-pistola', async (p) => { await p.selectOption('[data-prueba="lector"]', 'pistola'); });
await compone('09', 'Grosor de barra en mm contra GS1: escaner automatico vs pistola', [['escritorio · automático', grosorAuto.escritorio], ['escritorio · pistola', grosorPistola.escritorio], ['celular · automático', grosorAuto.celular], ['celular · pistola', grosorPistola.celular]]);

const calibra = await porVista(async (p, v) => {
  await abre(p, '/etiquetas/impresoras');
  await p.getByRole('button', { name: /ZT411 Cajas/ }).click();
  await p.waitForSelector('[data-prueba="calibracion-despues"] [data-prueba="png-motor"]');
  const antes = await foto(p, 'main', `calibracion-antes-${v}`);
  const src0 = await p.locator('[data-prueba="calibracion-despues"] img').getAttribute('src');
  await p.fill('[data-prueba="campo-origenX"]', '40');
  await p.fill('[data-prueba="campo-corrimientoSup"]', '24');
  await p.waitForFunction((s0) => { const s1 = document.querySelector('[data-prueba="calibracion-despues"] img')?.getAttribute('src'); return Boolean(s1) && s1 !== s0; }, src0, { timeout: 20_000 });
  await espera(300);
  return [antes, await foto(p, 'main', `calibracion-despues-${v}`)];
});
await compone('10', 'Configuracion de impresora antes y despues de mover ^LH y ^LT', [['escritorio · antes', calibra.escritorio[0]], ['escritorio · después (^LH 40,0 · ^LT 24)', calibra.escritorio[1]], ['celular · antes', calibra.celular[0]], ['celular · después', calibra.celular[1]]]);

if (conCamara) {
  const cam = {};
  for (const vista of ['escritorio', 'celular']) {
    const c = await contexto(conCamara, vista);
    const p = await c.newPage();
    await abre(p, '/etiquetas/leer');
    await p.click('[data-prueba="camara"]');
    await p.waitForSelector('[data-prueba="semaforo-lectura"]', { timeout: 30_000 });
    await espera(400);
    cam[vista] = await foto(p, 'main', `camara-${vista}`);
    await c.close();
  }
  await compone('11', 'Escaneo con la camara falsa de Chromium (video de la etiqueta)', [['escritorio', cam.escritorio], ['celular', cam.celular]]);
}

// Impresion de punta a punta: navegador → servidor (ticket) → agente → Zebra simulada; y Browser Print.
const impresion = await porVista(async (p, v) => {
  await abre(p, '/etiquetas');
  await p.selectOption('[data-prueba="impresora"]', 'zebra-cedis-cajas');
  await p.click('[data-prueba="pestana-zpl"]');
  const zpl = await p.locator('[data-prueba="zpl"]').textContent();
  const antes = zCajas.recibidos.length;
  await p.click('[data-prueba="imprime-agente"]');
  await p.waitForFunction(() => /Impreso/.test(document.querySelector('[data-prueba="estado-impresion"]')?.textContent ?? ''), null, { timeout: 20_000 });
  const agenteFoto = await foto(p, '[data-prueba="imprimir"]', `imprime-agente-${v}`);
  const bytes = zCajas.recibidos[antes];
  informe.impresion.push({ vista: v, via: 'agente', bytesZpl: Buffer.byteLength(zpl), bytesRecibidos: bytes?.length, iguales: Boolean(bytes && Buffer.from(zpl).equals(bytes)) });
  const antesBp = zMostrador.recibidos.length;
  await p.fill('[data-prueba="base-bp"]', `http://127.0.0.1:${puertoBp}`);
  await p.click('[data-prueba="busca-bp"]');
  await p.waitForSelector('select[aria-label="Impresora de Browser Print"]');
  await p.click('[data-prueba="imprime-bp"]');
  await p.waitForFunction(() => /Browser Print/.test(document.querySelector('[data-prueba="estado-impresion"]')?.textContent ?? '') && /Enviado/.test(document.querySelector('[data-prueba="estado-impresion"]')?.textContent ?? ''), null, { timeout: 20_000 });
  const bpFoto = await foto(p, '[data-prueba="imprimir"]', `imprime-bp-${v}`);
  for (let i = 0; i < 20 && zMostrador.recibidos.length === antesBp; i++) await espera(100);
  const b2 = zMostrador.recibidos[antesBp];
  informe.impresion.push({ vista: v, via: 'browser-print', bytesZpl: Buffer.byteLength(zpl), bytesRecibidos: b2?.length, iguales: Boolean(b2 && Buffer.from(zpl).equals(b2)) });
  return [agenteFoto, bpFoto];
});
await compone('12', 'Impresion de punta a punta: agente del CEDIS y Browser Print (Zebras simuladas)', [['escritorio · agente', impresion.escritorio[0]], ['escritorio · Browser Print', impresion.escritorio[1]], ['celular · agente', impresion.celular[0]], ['celular · Browser Print', impresion.celular[1]]]);

const catalogo = await porVista(async (p, v) => {
  await abre(p, '/etiquetas/catalogo');
  const seccion = 'section:has([data-prueba="archivo"])';
  await p.setInputFiles('[data-prueba="archivo"]', join(raiz, 'tools/etiquetas-gs1/fixtures/catalogo-v1.xlsx'));
  await p.waitForSelector('[data-prueba="diff"]');
  const excel = await foto(p, seccion, `catalogo-excel-${v}`);
  if (v === 'escritorio') {
    await p.click('[data-prueba="aplica"]');
    await p.waitForSelector('[data-prueba="aplicado"]');
  }
  await p.setInputFiles('[data-prueba="archivo"]', join(raiz, 'tools/etiquetas-gs1/fixtures/catalogo-v2.csv'));
  await p.waitForFunction(() => document.querySelectorAll('[data-prueba="diff"] tbody tr').length === 11);
  return [excel, await foto(p, seccion, `catalogo-csv-v2-${v}`)];
});
await compone('13', 'Catalogo: Excel ficticio subido (validados, invalidos, asignados por regla)', [['escritorio · primera subida del Excel', catalogo.escritorio[0]], ['celular · el MISMO Excel otra vez, ya aplicado: todo sin cambio', catalogo.celular[0]]]);
await compone('14', 'Catalogo: reimportacion con cambios (CSV v2) y su diff', [['escritorio', catalogo.escritorio[1]], ['celular', catalogo.celular[1]]]);

const tablero = await porVista(async (p, v) => {
  await abre(p, '/etiquetas/caducidades');
  await p.waitForSelector('[data-prueba="tablero-sitio"][data-sitio="SUC-CENTRO"]');
  return foto(p, 'main', `tablero-${v}`);
});
await compone('15', 'Tablero de caducidades en dos sitios (CEDIS Norte y Sucursal Centro)', [['escritorio', tablero.escritorio], ['celular', tablero.celular]]);

const rollos = await porVista(async (p, v) => {
  await abre(p, '/etiquetas/rollos');
  await p.waitForSelector('[data-prueba="rollos-sitio"][data-sitio="SUC-PONIENTE"] [data-prueba="sin-costo"]');
  await p.waitForSelector('[data-prueba="estimado-mes"]');
  return [await foto(p, 'main > div', `rollos-presupuesto-${v}`)];
});
await compone('16', 'Rollos: presupuesto contra gasto por sitio y estimacion de una dulceria', [['escritorio', rollos.escritorio[0]], ['celular', rollos.celular[0]]]);

// Mover entre zonas: la zona se lee de su etiqueta de ubicacion y luego se leen las cajas.
const estado = await (await fetch(`${BASE}/api/etiquetas`, { headers: { authorization: `Bearer ${TOKEN}`, 'x-operador': 'captura' } })).json();
const cajaDe = (sku) => estado.articulos.find((a) => a.sku === sku).gtinCaja;
const glnCentro = completaClave('952123490002');
const mover = await porVista(async (p, v) => {
  await abre(p, '/etiquetas/mover');
  const lee = async (texto) => {
    const antes = await p.locator('[data-prueba="bitacora-mover"] li').count();
    await p.fill('[data-prueba="pistola"]', texto);
    await p.press('[data-prueba="pistola"]', 'Enter');
    await p.waitForFunction((n) => document.querySelectorAll('[data-prueba="bitacora-mover"] li').length > n, antes);
  };
  const caja = (sku, dias, lote) => `(01)${cajaDe(sku)}(17)${aammdd(dia(dias))}(10)${lote}`;
  // Escritorio: resurtido con aviso FEFO, un rechazo (en retiro no sube a piso) y lo vencido a merma.
  // Celular: otro recorrido sobre lo que dejo el escritorio (lo vencido no puede volver a piso).
  const recorrido = v === 'escritorio'
    ? [`(414)${glnCentro}(254)PISO`, caja('YOG-001', 35, 'L4471'), caja('YOG-001', 8, 'L4502'), caja('SAL-005', 20, 'S0012'), `(414)${glnCentro}(254)MERMA`, caja('QSO-006', -1, 'Q0009')]
    : [`(414)${glnCentro}(254)PISO`, caja('YOG-001', 35, 'L4471'), caja('PAN-004', 4, 'P0078'), `(414)${glnCentro}(254)MERMA`, caja('PAN-004', 1, 'P0077')];
  for (const t of recorrido) await lee(t);
  return [await foto(p, 'main > div', `mover-${v}`), await foto(p, '[data-prueba="etiquetas-ubicacion"]', `ubicaciones-${v}`)];
});
await compone('17', 'Mover entre zonas: recibo, almacen, piso de venta y merma con la etiqueta de la caja', [['escritorio', mover.escritorio[0]], ['celular', mover.celular[0]]]);
await compone('18', 'Etiquetas de ubicacion GS1-128: (414) GLN del sitio + (254) zona', [['escritorio', mover.escritorio[1]], ['celular', mover.celular[1]]]);

// --- Expediente de lote, agente de riesgo e integridad ---------------------------------------
const api = async (cuerpo) => (await fetch(`${BASE}/api/etiquetas`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'x-operador': 'Captura Playwright', 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })).json();
const G_GOM = cajaDe('GOM-020');
const LOTE_GOM = { gtin: G_GOM, lote: 'SUC03-L4471', caducidad: dia(50) };

const expediente = await porVista(async (p, v) => {
  await abre(p, `/etiquetas/expediente?gtin=${G_GOM}&lote=SUC03-L4471&cad=${dia(50)}`);
  await p.waitForSelector('[data-prueba="veredicto-expediente"][data-ok="true"]');
  return foto(p, '[data-prueba="expediente"]', `expediente-${v}`);
});
await compone('19', 'Expediente del lote SUC03-L4471: cadena de CEDIS y Poniente, raices ancladas y veredicto', [['escritorio', expediente.escritorio], ['celular', expediente.celular]]);

const rechazo = await porVista(async (p, v) => {
  await abre(p, '/etiquetas/leer');
  await p.selectOption('[data-prueba="sitio-lector"]', 'SUC-CENTRO');
  await p.fill('[data-prueba="pistola"]', `(02)${G_GOM}(37)24(17)${aammdd(dia(100))}(10)${v === 'escritorio' ? 'L6001' : 'L6002'}`);
  await p.press('[data-prueba="pistola"]', 'Enter');
  await p.waitForSelector('[data-prueba="recibir"]');
  await p.click('[data-prueba="recibir"]');
  await p.waitForSelector('[data-prueba="rechazo"]');
  return foto(p, '[data-prueba="resultado"]', `rechazo-${v}`);
});
await compone('20', 'Recepcion rechazada por la regla de 2/3 y su devolucion al proveedor con evidencia', [['escritorio', rechazo.escritorio], ['celular', rechazo.celular]]);

const acciones = await porVista(async (p, v) => {
  await abre(p, '/etiquetas/caducidades');
  const sel = '[data-prueba="tablero-sitio"][data-sitio="SUC-CENTRO"] [data-prueba="semaforo-acciones"]';
  await p.waitForSelector(sel);
  return foto(p, sel, `semaforo-acciones-${v}`);
});
await compone('21', 'Semaforo de cinco colores con la accion de cada uno (Sucursal Centro)', [['escritorio', acciones.escritorio], ['celular', acciones.celular]]);

const riesgo = await porVista(async (p, v) => {
  await abre(p, '/etiquetas/riesgo');
  if (v === 'escritorio') {
    await p.click('[data-prueba="correr-agente"]');
    await p.waitForSelector('[data-prueba="recomendacion"][data-estado="pendiente"][data-lote="SUC03-L4471"]');
    await p.waitForSelector('[data-prueba="recomendacion"][data-estado="pendiente"][data-lote="CH0310"]');
    const antes = await foto(p, 'main > div', `riesgo-pendientes-${v}`);
    await p.locator('[data-prueba="recomendacion"][data-lote="SUC03-L4471"] [data-prueba="ejecutar"]').click();
    await p.waitForSelector('[data-prueba="recomendacion"][data-estado="ejecutada"]');
    await p.locator('[data-prueba="recomendacion"][data-lote="CH0310"] [data-prueba="motivo-descarte"]').fill('la cabecera ya está ocupada por la temporada de dulces');
    await p.locator('[data-prueba="recomendacion"][data-lote="CH0310"] [data-prueba="descartar"]').click();
    await p.waitForSelector('[data-prueba="recomendacion"][data-estado="descartada"]');
    return [antes, await foto(p, 'main > div', `riesgo-decididas-${v}`)];
  }
  await p.waitForSelector('[data-prueba="recomendacion"][data-estado="descartada"]');
  return [await foto(p, 'main > div', `riesgo-decididas-${v}`)];
});
await compone('22', 'Agente de riesgo: lote verde en riesgo, una recomendacion ejecutada y otra descartada', [['escritorio · al correr el agente', riesgo.escritorio[0]], ['escritorio · decididas', riesgo.escritorio[1]], ['celular', riesgo.celular[0]]]);

// Inventario fisico en Sucursal Oriente: conteo ciego, reconteo por otra persona, conciliacion
// contra la cadena, autorizacion de quien no conto y ajuste como evento CONTEO.
const glnOriente = completaClave('952123490004');
const cajaEn = (sku, dias, lote) => `(01)${cajaDe(sku)}(17)${aammdd(dia(dias))}(10)${lote}`;
async function cuentaEn(p, texto, veces) {
  if (veces) await p.fill('[data-prueba="veces-conteo"]', String(veces));
  const antes = await p.locator('[data-prueba="lecturas-conteo"] li').count();
  const aviso = await p.locator('[data-prueba="aviso-lectura-conteo"]').textContent().catch(() => '');
  await p.fill('[data-prueba="pistola"]', texto);
  await p.press('[data-prueba="pistola"]', 'Enter');
  if (texto.startsWith('(414)')) await p.waitForFunction((a) => { const t = document.querySelector('[data-prueba="aviso-lectura-conteo"]')?.textContent ?? ''; return t.startsWith('Ubicación') && t !== a; }, aviso);
  else await p.waitForFunction((n) => document.querySelectorAll('[data-prueba="lecturas-conteo"] li').length > n, antes);
}
async function abreConteoEn(p, zonas) {
  await abre(p, '/etiquetas/conteo');
  await p.selectOption('[data-prueba="sitio-conteo"]', 'SUC-ORIENTE');
  for (const z of ['almacen', 'piso']) if (!zonas.includes(z)) await p.uncheck(`[data-prueba="zona-conteo-${z}"]`);
  await p.click('[data-prueba="abrir-conteo"]');
  await p.waitForSelector('[data-prueba="conteo-activo"][data-estado="contando"]');
}
const conteoEsc = {};
{
  const ca = await contexto(navegador, 'escritorio');
  const a = await ca.newPage();
  await abreConteoEn(a, ['almacen', 'piso']);
  await cuentaEn(a, `(414)${glnOriente}(254)PISO`);
  await cuentaEn(a, cajaEn('ATU-003', 400, 'A2291'), 10);
  await cuentaEn(a, `(414)${glnOriente}(254)ALMACEN-B-01-1`);
  await cuentaEn(a, cajaEn('REF-007', 25, 'R551'), 8);
  await cuentaEn(a, cajaEn('REF-007', 60, 'R600'), 3);
  conteoEsc.ronda1 = await foto(a, '[data-prueba="conteo-activo"]', 'conteo-ronda1-escritorio');
  await a.click('[data-prueba="terminar-ronda"]');
  await a.waitForSelector('[data-prueba="conteo-activo"][data-estado="reconteo"]');
  const cb = await contexto(navegador, 'escritorio', 'Recontador Oriente');
  const b = await cb.newPage();
  await abre(b, '/etiquetas/conteo');
  await b.waitForSelector('[data-prueba="recontar"]');
  await cuentaEn(b, `(414)${glnOriente}(254)PISO`);
  await cuentaEn(b, cajaEn('ATU-003', 400, 'A2291'), 10);
  await cuentaEn(b, `(414)${glnOriente}(254)ALMACEN-B-01-1`);
  await cuentaEn(b, cajaEn('REF-007', 60, 'R600'), 3);
  conteoEsc.reconteo = await foto(b, '[data-prueba="conteo-activo"]', 'conteo-reconteo-escritorio');
  await b.click('[data-prueba="terminar-ronda"]');
  await b.waitForSelector('[data-prueba="conteo-activo"][data-estado="por-aplicar"]');
  await cb.close();
  await abre(a, '/etiquetas/conteo');
  await a.waitForSelector('[data-prueba="conteo-activo"][data-estado="por-aplicar"]');
  conteoEsc.conciliacion = await foto(a, '[data-prueba="conteo-activo"]', 'conteo-conciliacion-escritorio');
  await a.fill('[data-prueba="autoriza-conteo"]', 'Gerente Oriente');
  await a.click('[data-prueba="aplicar-conteo"]');
  await a.waitForSelector('[data-prueba="aplicado"]');
  conteoEsc.aplicado = await foto(a, '[data-prueba="conteo-activo"]', 'conteo-aplicado-escritorio');
  await ca.close();
}
const conteoCel = {};
{
  const cc = await contexto(navegador, 'celular');
  const m = await cc.newPage();
  await abreConteoEn(m, ['piso']);
  await cuentaEn(m, `(414)${glnOriente}(254)PISO`);
  await cuentaEn(m, cajaEn('ATU-003', 400, 'A2291'), 10);
  conteoCel.ronda1 = await foto(m, '[data-prueba="conteo-activo"]', 'conteo-ronda1-celular');
  await m.click('[data-prueba="terminar-ronda"]');
  await m.waitForSelector('[data-prueba="conteo-activo"][data-estado="por-aplicar"]');
  await m.click('[data-prueba="aplicar-conteo"]');
  await m.waitForSelector('[data-prueba="aplicado"]');
  conteoCel.aplicado = await foto(m, '[data-prueba="conteo-activo"]', 'conteo-aplicado-celular');
  await cc.close();
}
await compone('25', 'Inventario fisico: conteo ciego por ubicacion y reconteo por otra persona', [['escritorio · ronda 1, ciega', conteoEsc.ronda1], ['escritorio · reconteo (otra persona, sin ver la ronda 1)', conteoEsc.reconteo], ['celular · conteo ciego', conteoCel.ronda1]]);
await compone('26', 'Inventario fisico: conciliacion contra la cadena, autorizacion y ajustes como eventos CONTEO', [['escritorio · conciliación', conteoEsc.conciliacion], ['escritorio · aplicado con autorización', conteoEsc.aplicado], ['celular · cuadra y se aplica', conteoCel.aplicado]]);
informe.conteo = await api({ accion: 'conteos' }).then((r) => r.conteos.map((c) => ({ folio: c.folio, estado: c.estado, eventos: c.aplicado?.eventos, conciliacion: (c.conciliacion ?? []).map((x) => `${x.lote.lote}@${x.zona}${x.posicion ? ` ${x.posicion}` : ''}: cadena ${x.esperado}, contado ${x.contado}, ${x.clase}`) })));

// Anclar lo de hoy (como haria el agente del sitio por la noche) y ver todo en verde.
await api({ accion: 'ancla' });
const integridadAntes = await porVista(async (p, v) => {
  await abre(p, '/etiquetas/integridad');
  await p.waitForSelector('[data-prueba="integridad-sitio"][data-sitio="SUC-PONIENTE"][data-ok="true"]');
  return foto(p, 'main > div', `integridad-antes-${v}`);
});

/**
 * La manipulacion: quien tiene escritura sobre el almacen de Poniente le alarga la caducidad al
 * lote SUC03-L4471 (en eventos y existencias) y RECALCULA toda su cadena para que cuadre.
 */
function reescribeSucursal(ruta, sitio, lote, nueva) {
  const e = JSON.parse(readFileSync(ruta, 'utf8'));
  const original = e.eventos[sitio];
  const propios = new Set(original.map((x) => x.hash));
  const cambia = (l) => (l.gtin === lote.gtin && l.lote === lote.lote && l.caducidad === lote.caducidad ? { ...l, caducidad: nueva } : l);
  const reescrita = [];
  for (const ev of original) {
    const externo = ev.anteriorLote && !propios.has(ev.anteriorLote) ? ev.anteriorLote : undefined;
    reescrita.push(nuevoEvento(sitio, reescrita, { tipo: ev.tipo, lote: cambia(ev.lote), datos: ev.datos, operador: ev.operador, fecha: ev.fecha }, externo));
  }
  e.eventos[sitio] = reescrita;
  e.existencias = e.existencias.map((x) => (x.sitio === sitio ? { ...x, caducidad: cambia(x).caducidad } : x));
  writeFileSync(ruta, JSON.stringify(e));
  return { eventos: reescrita.length };
}
informe.manipulacion = reescribeSucursal(join(datos, 'estado.json'), 'SUC-PONIENTE', LOTE_GOM, dia(140));
informe.agenteTrasManipulacion = await api({ accion: 'agente' });
const integridadDespues = await porVista(async (p, v) => {
  await abre(p, '/etiquetas/integridad');
  await p.waitForSelector('[data-prueba="integridad-sitio"][data-sitio="SUC-PONIENTE"][data-ok="false"]');
  return foto(p, 'main > div', `integridad-despues-${v}`);
});
await compone('23', 'Integridad por sucursal: todas verifican contra sus anclas (antes de manipular)', [['escritorio', integridadAntes.escritorio], ['celular', integridadAntes.celular]]);
await compone('24', 'Integridad tras reescribir Poniente: su cadena cuadra localmente pero el ancla la delata', [['escritorio', integridadDespues.escritorio], ['celular', integridadDespues.celular]]);

writeFileSync(join(SALIDA, 'informe.json'), JSON.stringify(informe, null, 2));
console.log(JSON.stringify({ impresion: informe.impresion, conteo: informe.conteo, manipulacion: informe.manipulacion, agenteTrasManipulacion: informe.agenteTrasManipulacion }, null, 1));
await navegador.close();
await conCamara?.close();
app.kill('SIGTERM');
await agente.detiene();
await bp.cierra();
await Promise.all([zRampa.cierra(), zCajas.cierra(), zMostrador.cierra()]);
console.log(`capturas en ${SALIDA}`);
