/**
 * Flujos 28 a 36 de las capturas: la recepcion con foto de la caducidad, en escritorio y celular,
 * con CAMARAS FALSAS de Chromium alimentadas con tres videos de la cara de una caja (carton,
 * todo ficticio): impresion solida con el EAN-13 del proveedor, una fecha ambigua (241128) y una
 * fecha en tinta de puntos sobre fondo oscuro (el cero con diagonal que el motor lee como 8).
 * Lee con el motor LOCAL si esta instalado (ETIQUETAS_MOTOR_PYTHON, ver `instala-rapidocr.sh`).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { completaClave } from '../../../../tools/etiquetas-gs1/dist/index.js';
import { cuadroDeCaja } from './cuadros.mjs';

const EAN_REF = '9521111000044';
const EAN_ATU = '9521111000037';
const EAN_GOM = completaClave('952111100005');

/** Una foto de producto «de celular»: JPEG con EXIF y GPS dentro, para probar que se quitan. */
async function fotoDeProducto(titulo, fondo, cuerpo) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><rect width="100%" height="100%" fill="#f1efe8"/>${cuerpo}<text x="450" y="860" text-anchor="middle" font-family="DejaVu Sans" font-size="44" font-weight="bold" fill="${fondo}">${titulo}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).withExifMerge({ IFD0: { Make: 'Telefono', Model: 'Andén' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '25/1 40/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '100/1 18/1 0/1' } }).toBuffer();
}
const PRODUCTOS = {
  'REF-007': ['COLA 600 ml', '#7f1d1d', '<rect x="360" y="90" width="180" height="60" rx="18" fill="#1d4ed8"/><path d="M380 150 h140 q40 120 40 220 v320 q0 60 -60 60 h-100 q-60 0 -60 -60 v-320 q0 -100 40 -220z" fill="#1c1917"/><rect x="340" y="430" width="220" height="130" fill="#b91c1c"/><text x="450" y="510" text-anchor="middle" font-family="DejaVu Sans" font-size="44" font-weight="bold" fill="#fff">COLA</text>'],
  'GOM-020': ['GOMITAS 1 kg', '#9d174d', '<rect x="230" y="140" width="440" height="560" rx="40" fill="#f472b6"/><circle cx="360" cy="360" r="50" fill="#facc15"/><circle cx="520" cy="420" r="55" fill="#22c55e"/><circle cx="420" cy="540" r="50" fill="#f97316"/>'],
  'ATU-003': ['ATÚN 140 g', '#1e3a8a', '<ellipse cx="450" cy="320" rx="260" ry="70" fill="#9ca3af"/><rect x="190" y="320" width="520" height="300" fill="#2563eb"/><ellipse cx="450" cy="620" rx="260" ry="70" fill="#1e40af"/><text x="450" y="500" text-anchor="middle" font-family="DejaVu Sans" font-size="60" font-weight="bold" fill="#fff">ATÚN</text>'],
  'LEC-002': ['LECHE 1 L', '#1e3a8a', '<path d="M300 160 h300 l40 120 v460 h-380 v-460z" fill="#fff" stroke="#93c5fd" stroke-width="8"/><text x="450" y="480" text-anchor="middle" font-family="DejaVu Sans" font-size="64" font-weight="bold" fill="#1d4ed8">LECHE</text>'],
};

function video(CRUDAS, nombre, png) {
  const img = join(CRUDAS, `${nombre}.png`);
  const y4m = join(CRUDAS, `${nombre}.y4m`);
  writeFileSync(img, png);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', img, '-t', '3', '-r', '10', '-vf', 'format=yuv420p', y4m]);
  return y4m;
}

export async function flujosRecibir(h) {
  const { chromium, informe, CRUDAS } = h;
  const camaras = {};
  try {
    const videos = {
      caja: video(CRUDAS, 'caja-solida', await cuadroDeCaja(['CAD 30/05/27', 'L4471'], { ean: EAN_REF, solida: true })),
      ambigua: video(CRUDAS, 'caja-ambigua', await cuadroDeCaja(['CAD 241128', 'L0503'], { solida: true })),
      oscura: video(CRUDAS, 'botella-oscura', await cuadroDeCaja(['CAD 30/05/27', 'L7702'], { fondo: '#2a2622', tinta: '#0e0c0b' })),
    };
    for (const [k, v] of Object.entries(videos)) camaras[k] = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${v}`] });
  } catch (e) { console.log(`  sin ffmpeg: se saltan las capturas de recepción con foto (${e.message})`); return; }
  const dirFotos = join(CRUDAS, 'fotos-productos');
  mkdirSync(dirFotos, { recursive: true });
  for (const [sku, [t, c, cuerpo]] of Object.entries(PRODUCTOS)) writeFileSync(join(dirFotos, `${sku}.jpg`), await fotoDeProducto(t, c, cuerpo));
  const r = { h, camaras, dirFotos, informe };
  await catalogoConFoto(r);
  await escaneaTomaYConfirma(r);
  await vinculaDesconocido(r);
  await lecturaAmbigua(r);
  await correccionDelUsuario(r);
  await pendienteYMover(r);
  await expedienteConFotos(r);
  for (const c of Object.values(camaras)) await c.close();
}

async function pagina(r, nav, vista) {
  const c = await r.h.contexto(nav, vista);
  return { c, p: await c.newPage() };
}

async function pistola(p, texto) {
  await p.fill('[data-prueba="pistola"]', texto);
  await p.press('[data-prueba="pistola"]', 'Enter');
}

/** 28 · La ficha con foto (se sube con EXIF y GPS: se ven quitados), las demas en lote, y la foto en el lector. */
async function catalogoConFoto(r) {
  const { abre, foto, compone, navegador } = r.h;
  const { c, p } = await pagina(r, navegador, 'escritorio');
  await abre(p, '/etiquetas/catalogo');
  await p.setInputFiles('[data-prueba="fotos-lote-archivos"]', ['GOM-020', 'ATU-003', 'LEC-002'].map((s) => join(r.dirFotos, `${s}.jpg`)));
  await p.click('[data-prueba="fotos-lote-subir"]');
  await p.waitForFunction(() => document.body.innerText.includes('foto(s) guardadas'));
  await p.locator('tr', { hasText: 'REF-007' }).locator('[data-prueba="abrir-ficha"]').click();
  await p.waitForSelector('[data-prueba="ficha"]');
  await p.setInputFiles('[data-prueba="subir-principal"]', join(r.dirFotos, 'REF-007.jpg'));
  await p.waitForFunction(() => (document.querySelector('[data-prueba="aviso-ficha"]')?.textContent ?? '').includes('GPS'));
  await p.waitForSelector('[data-prueba="vista-principal"] [data-prueba="foto"]');
  const ficha = await foto(p, '[data-prueba="ficha"]', 'ficha-ref-escritorio');
  const tabla = await foto(p, '[data-prueba="catalogo"]', 'catalogo-fotos-escritorio');
  await c.close();
  const m = await pagina(r, navegador, 'celular');
  await abre(m.p, '/etiquetas/leer');
  await pistola(m.p, EAN_REF);
  await m.p.waitForSelector('[data-prueba="resultado"] [data-prueba="foto"]');
  const lector = await foto(m.p, '[data-prueba="resultado"]', 'lector-foto-celular');
  await m.c.close();
  await compone('28', 'Catalogo con foto: se sube (sin EXIF ni GPS), se ve en la ficha, en la tabla y en el lector', [['escritorio · ficha (subida con GPS: quitado)', ficha], ['escritorio · catálogo con fotos en lote', tabla], ['celular · el lector enseña la foto', lector]]);
}

async function tomaFoto(p) {
  await p.click('[data-prueba="a-foto"]');
  await p.click('[data-prueba="camara-foto-encender"]');
  await p.waitForFunction(() => (document.querySelector('[data-prueba="video-foto"]')?.videoWidth ?? 0) > 0);
  await p.click('[data-prueba="tomar-foto"]');
  await p.waitForSelector('[data-prueba="revision"]', { timeout: 180_000 });
  await p.waitForSelector('[data-prueba="revision"] [data-prueba="foto"]');
}

/** 29, 31 y 35 · EAN-13 por camara → foto del articulo y nivel → foto de la caducidad → propuesta → confirmar → etiqueta. */
async function escaneaTomaYConfirma(r) {
  const { abre, foto, compone, espera } = r.h;
  const f = { escaneo: {}, propuesta: {}, etiqueta: {} };
  for (const [vista, sitio] of [['escritorio', 'CEDIS-NTE'], ['celular', 'SUC-CENTRO']]) {
    const { c, p } = await pagina(r, r.camaras.caja, vista);
    await abre(p, '/etiquetas/recibir');
    await p.selectOption('[data-prueba="sitio-recibir"]', sitio);
    await p.click('[data-prueba="camara"]');
    await p.waitForSelector('[data-prueba="identificado"] [data-prueba="foto"]', { timeout: 30_000 });
    await espera(300);
    f.escaneo[vista] = await foto(p, 'main', `recibir-escaneo-${vista}`);
    await p.fill('[data-prueba="cajas-recibir"]', '20');
    await tomaFoto(p);
    await espera(300);
    f.propuesta[vista] = await foto(p, 'main', `recibir-propuesta-${vista}`);
    r.informe.recepcionFoto = { ...(r.informe.recepcionFoto ?? {}), [vista]: await p.locator('[data-prueba="revision"]').getAttribute('data-estado') };
    await p.click('[data-prueba="confirmar"]');
    await p.waitForSelector('[data-prueba="etiqueta-casa"]', { timeout: 60_000 });
    await espera(400);
    f.etiqueta[vista] = await foto(p, 'main', `recibir-etiqueta-${vista}`);
    await c.close();
  }
  await compone('29', 'EAN-13 del proveedor escaneado con la camara: foto del articulo y nivel leido (la pieza)', [['escritorio', f.escaneo.escritorio], ['celular', f.escaneo.celular]]);
  await compone('31', 'Foto de la caducidad: la propuesta con la zona leida marcada, la fecha dicha y su semaforo', [['escritorio', f.propuesta.escritorio], ['celular', f.propuesta.celular]]);
  await compone('35', 'Tras confirmar: el lote entra y su etiqueta GS1-128 de la casa queda lista para imprimir', [['escritorio', f.etiqueta.escritorio], ['celular', f.etiqueta.celular]]);
}

/** 30 · Un ITF-14 que el catalogo no conoce: se busca el articulo viendo las fotos y se vincula (con traza). */
async function vinculaDesconocido(r) {
  const { abre, foto, compone, navegador, espera } = r.h;
  const f = {};
  for (const [vista, sku, busca, gtin] of [['escritorio', 'LEC-002', 'leche', completaClave('1952111100099')], ['celular', 'ATU-003', 'atún', completaClave('1952111100098')]]) {
    const { c, p } = await pagina(r, navegador, vista);
    await abre(p, '/etiquetas/recibir');
    await pistola(p, `]I1${gtin}`);
    await p.waitForSelector('[data-prueba="vincular"]');
    await p.fill('[data-prueba="buscar-articulo"]', busca);
    await p.locator('[data-prueba="candidato"]').first().click();
    await p.selectOption('[data-prueba="nivel-vincular"]', 'caja');
    await espera(300);
    const antes = await foto(p, '[data-prueba="vincular"]', `vincular-antes-${vista}`);
    await p.click('[data-prueba="vincular-confirmar"]');
    await p.waitForSelector('[data-prueba="identificado"]');
    await espera(300);
    f[vista] = [antes, await foto(p, '[data-prueba="identificado"]', `vincular-despues-${vista}`)];
    r.informe.vinculos = [...(r.informe.vinculos ?? []), { sku, gtin }];
    await c.close();
  }
  await compone('30', 'GTIN desconocido (ITF-14 del corrugado) vinculado a un articulo del catalogo, viendo su foto', [['escritorio · antes', f.escritorio[0]], ['escritorio · después: ya es la caja de LEC-002', f.escritorio[1]], ['celular · antes', f.celular[0]], ['celular · después', f.celular[1]]]);
}

/**
 * 32 · «CAD 241128»: seis cifras sin separador (24/11/28 o 28/11/24). Se ensenan las DOS lecturas y se elige una; esa
 * eleccion fija el formato del articulo, y la SIGUIENTE recepcion del mismo ya sale sin ambiguedad.
 */
async function lecturaAmbigua(r) {
  const { abre, foto, compone, espera } = r.h;
  const f = {};
  for (const [nombre, vista, sitio, ean] of [['escritorio', 'escritorio', 'CEDIS-NTE', EAN_ATU], ['celular', 'celular', 'SUC-CENTRO', completaClave('952111100006')], ['aprendido', 'escritorio', 'CEDIS-NTE', EAN_ATU]]) {
    const { c, p } = await pagina(r, r.camaras.ambigua, vista);
    await abre(p, '/etiquetas/recibir');
    await p.selectOption('[data-prueba="sitio-recibir"]', sitio);
    await pistola(p, ean);
    await p.waitForSelector('[data-prueba="identificado"]');
    await p.fill('[data-prueba="cajas-recibir"]', '8');
    await tomaFoto(p);
    await espera(300);
    f[nombre] = await foto(p, nombre === 'aprendido' ? '[data-prueba="revision"]' : 'main', `ambigua-${nombre}`);
    const opciones = await p.locator('[data-prueba="opcion"]').count();
    r.informe.ambigua = { ...(r.informe.ambigua ?? {}), [nombre]: { estado: await p.locator('[data-prueba="revision"]').getAttribute('data-estado'), opciones } };
    if (opciones) await p.locator('[data-prueba="opcion"]').first().click();
    await p.click('[data-prueba="confirmar"]');
    await p.waitForSelector('[data-prueba="recibido"], [data-prueba="rechazo-recibir"]', { timeout: 60_000 });
    r.informe.ambigua[nombre].resultado = (await p.locator('[data-prueba="recibido"]').count()) ? 'recibido' : 'rechazado';
    await c.close();
  }
  await compone('32', 'Lectura ambigua: «CAD 241128» es 24/11/28 o 28/11/24; se ensenan las dos, se elige, y la siguiente ya sale con el formato aprendido', [['escritorio · atún: dos lecturas', f.escritorio], ['celular · chocolate: dos lecturas', f.celular], ['escritorio · la siguiente recepción de atún: formato aprendido (DDMMAA)', f.aprendido]]);
}

/** 33 · Botella oscura en tinta de puntos: el motor lee «38/05/27», se marca imposible y la persona CORRIGE. */
async function correccionDelUsuario(r) {
  const { abre, foto, compone, espera } = r.h;
  const f = {};
  for (const [vista, sitio] of [['escritorio', 'CEDIS-NTE'], ['celular', 'SUC-CENTRO']]) {
    const { c, p } = await pagina(r, r.camaras.oscura, vista);
    await abre(p, '/etiquetas/recibir');
    await p.selectOption('[data-prueba="sitio-recibir"]', sitio);
    await pistola(p, EAN_REF);
    await p.waitForSelector('[data-prueba="identificado"]');
    await p.fill('[data-prueba="cajas-recibir"]', '6');
    await tomaFoto(p);
    await espera(300);
    const antes = await foto(p, 'main', `correccion-antes-${vista}`);
    if (await p.locator('[data-prueba="opcion"]').count()) await p.locator('[data-prueba="opcion"]').first().click();
    else await p.fill('[data-prueba="fecha-confirmar"]', '2027-05-30');
    await p.fill('[data-prueba="lote-confirmar"]', 'L7702');
    await p.click('[data-prueba="confirmar"]');
    await p.waitForSelector('[data-prueba="recibido"]', { timeout: 60_000 });
    await espera(300);
    f[vista] = [antes, await foto(p, '[data-prueba="recibido"] > p', `correccion-despues-${vista}`)];
    await c.close();
  }
  await compone('33', 'Correccion por la persona: el motor leyo «38/05/27» (cero con diagonal), se eligio 30/05/27 y el lote se tecleo', [['escritorio · antes', f.escritorio[0]], ['escritorio · después', f.escritorio[1]], ['celular · antes', f.celular[0]], ['celular · después', f.celular[1]]]);
}

async function mueve(r, p, sitio, texto) {
  await r.h.abre(p, '/etiquetas/mover');
  await p.selectOption('[data-prueba="sitio-mover"]', sitio);
  await p.click('[data-prueba="zona-piso"]');
  const antes = await p.locator('[data-prueba="bitacora-mover"] li').count();
  await pistola(p, texto);
  await p.waitForFunction((n) => document.querySelectorAll('[data-prueba="bitacora-mover"] li').length > n, antes);
}
/** 34 · Dejar pendiente → mover a piso RECHAZADO por el servidor → confirmar desde la bandeja → mover permitido. */
async function pendienteYMover(r) {
  const { abre, foto, compone, espera } = r.h;
  const f = {};
  for (const [vista, sitio] of [['escritorio', 'CEDIS-NTE'], ['celular', 'SUC-CENTRO']]) {
    const { c, p } = await pagina(r, r.camaras.caja, vista);
    await abre(p, '/etiquetas/recibir');
    await p.selectOption('[data-prueba="sitio-recibir"]', sitio);
    await pistola(p, EAN_GOM);
    await p.waitForSelector('[data-prueba="identificado"]');
    await p.fill('[data-prueba="cajas-recibir"]', '10');
    await tomaFoto(p);
    await p.click('[data-prueba="dejar-pendiente"]');
    await p.waitForSelector('[data-prueba="pendiente"][data-mia="true"]');
    await espera(300);
    const bandeja = await foto(p, '[data-prueba="bandeja"]', `pendiente-bandeja-${vista}`);
    await mueve(r, p, sitio, EAN_GOM);
    const rechazo = await foto(p, '[data-prueba="bitacora-mover"]', `pendiente-mover-rechazado-${vista}`);
    await abre(p, '/etiquetas/recibir');
    await p.locator('[data-prueba="pendiente"][data-mia="true"] [data-prueba="retomar"]').first().click();
    await p.waitForSelector('[data-prueba="revision"]');
    await p.click('[data-prueba="confirmar"]');
    await p.waitForSelector('[data-prueba="recibido"]', { timeout: 60_000 });
    const caja = await (await fetch(`${r.h.BASE}/api/etiquetas`, { headers: { authorization: `Bearer ${r.h.TOKEN}`, 'x-operador': 'Captura Playwright' } })).json();
    const gtinCaja = caja.articulos.find((a) => a.sku === 'GOM-020').gtinCaja;
    await mueve(r, p, sitio, `(01)${gtinCaja}(17)270530(10)L4471`);
    const permitido = await foto(p, '[data-prueba="bitacora-mover"]', `pendiente-mover-permitido-${vista}`);
    f[vista] = [bandeja, rechazo, permitido];
    await c.close();
  }
  await compone('34', 'Pendiente: el servidor rechaza moverlo a piso; confirmado desde la bandeja, se mueve con la etiqueta de la casa', [['escritorio · dejada pendiente', f.escritorio[0]], ['escritorio · mover a piso: RECHAZADO', f.escritorio[1]], ['escritorio · confirmada: mover PERMITIDO', f.escritorio[2]], ['celular · pendiente', f.celular[0]], ['celular · rechazado', f.celular[1]], ['celular · permitido', f.celular[2]]]);
}

/** 36 · El expediente: la revision con sus fotos, lo leido contra lo confirmado y una CORRECCION con foto nueva. */
async function expedienteConFotos(r) {
  const { abre, foto, compone, navegador, espera } = r.h;
  const evidencia = join(r.dirFotos, 'correccion.jpg');
  writeFileSync(evidencia, await sharp(await cuadroDeCaja(['CAD 31/05/27', 'L4471'], { solida: true })).jpeg().toBuffer());
  const estado = await (await fetch(`${r.h.BASE}/api/etiquetas`, { headers: { authorization: `Bearer ${r.h.TOKEN}`, 'x-operador': 'Captura Playwright' } })).json();
  const gtin = estado.articulos.find((a) => a.sku === 'REF-007').gtinCaja;
  const ruta = `/etiquetas/expediente?gtin=${gtin}&lote=L4471&cad=2027-05-30`;
  const { c, p } = await pagina(r, navegador, 'escritorio');
  await abre(p, ruta);
  await p.waitForSelector('[data-prueba="linea-tiempo"]');
  await p.click('[data-prueba="abrir-correccion"]');
  await p.selectOption('[data-prueba="acciones-lote"] select >> nth=0', 'CEDIS-NTE');
  const recibido = await p.locator('[data-prueba="evento-corregido"] option', { hasText: 'Recibido' }).first().getAttribute('value');
  await p.selectOption('[data-prueba="evento-corregido"]', recibido);
  await p.fill('[data-prueba="acciones-lote"] input[type="date"]', '2027-05-31');
  await p.fill('[data-prueba="motivo-correccion"]', 'la caja dice 31/05/27: se confirmó mal (foto nueva de la caja)');
  await p.setInputFiles('[data-prueba="foto-correccion"]', evidencia);
  await p.waitForSelector('[data-prueba="foto-correccion-lista"]');
  await p.click('[data-prueba="registrar-accion"]');
  await p.waitForSelector('[data-prueba="evento"][data-tipo="CORRECCION"] [data-prueba="fotos-evento"]', { timeout: 30_000 });
  await espera(600);
  const esc = await foto(p, '[data-prueba="expediente"]', 'expediente-fotos-escritorio');
  await c.close();
  const m = await pagina(r, navegador, 'celular');
  await abre(m.p, ruta);
  await m.p.waitForSelector('[data-prueba="evento"][data-tipo="CORRECCION"]');
  await espera(600);
  const cel = await foto(m.p, '[data-prueba="linea-tiempo"]', 'expediente-fotos-celular');
  await m.c.close();
  r.informe.expedienteFotos = { eventos: await (async () => { const x = await (await fetch(`${r.h.BASE}/api/etiquetas`, { method: 'POST', headers: { authorization: `Bearer ${r.h.TOKEN}`, 'x-operador': 'Captura Playwright', 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'expediente', gtin, lote: 'L4471', caducidad: '2027-05-30' }) })).json(); return { tipos: x.eventos?.map((e) => e.evento.tipo), ok: x.ok }; })() };
  await compone('36', 'Expediente: la revision con sus fotos, lo leido contra lo confirmado y una CORRECCION con foto nueva (cadena ✓)', [['escritorio', esc], ['celular', cel]]);
}
