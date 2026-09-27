/**
 * Flujos 37 a 44 de las capturas: ESCANEAR por zona y rol en Sucursal Centro, con los codigos de
 * dispositivo de supervisor (operacion), recibo y almacenista, y la MEDICION de agilidad (antes y
 * despues, en celular). La ronda del dia se genera del estado; cada tarea se cierra con su escaneo.
 * Pieza suelta con camara FALSA (la fecha de la pieza en video) y el motor local si esta instalado.
 * Sin señal: `context.setOffline` y la cola en IndexedDB. Todo ficticio.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { completaClave } from '../../../../tools/etiquetas-gs1/dist/index.js';
import { cuentaEnConteo, escaneaEnZona, esFalta, medidor, mideAgilidad, sinDestello, tablaAgilidad } from './agilidad.mjs';
import { cuadroDeCaja } from './cuadros.mjs';

const S = 'SUC-CENTRO';
const GLN = completaClave('952123490002');
const EAN_CHO = completaClave('952111100006');
const ddmmaa = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

const textoEnPantalla = (p) => p.locator('[data-prueba="destello"], [data-prueba="ultimo-escaneo"]').first().textContent().catch(() => '');

/** Los ayudantes de estos flujos sobre los del guion: API del supervisor, etiquetas de zona y de lote, paginas y capturas. */
async function ayudantes(h0) {
  const { navegador, contexto, BASE, TOKEN, CRUDAS, aammdd } = h0;
  const api = async (cuerpo, token = TOKEN) => (await fetch(`${BASE}/api/etiquetas`, { method: cuerpo ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}`, 'x-operador': 'Supervisor Centro', ...(cuerpo ? { 'content-type': 'application/json' } : {}) }, ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}) })).json();
  const inicial = await api();
  const art = (sku) => inicial.articulos.find((a) => a.sku === sku);
  return {
    ...h0, api,
    cajaDe: (sku) => art(sku).gtinCaja,
    unidadDe: (sku) => art(sku).gtinUnidad?.replace(/^0/, ''),
    zona: (u) => `(414)${GLN}(254)${u}`,
    caja: (gtin, caducidad, lote) => `(01)${gtin}(17)${aammdd(caducidad)}(10)${lote}`,
    /** La etiqueta de un lote QUE YA ESTA en el sitio, con su GTIN y caducidad guardados (el catalogo puede haber cambiado de GTIN desde la semilla). */
    cajaLote: async (sku, lote) => {
      const x = (await api()).existencias.find((e) => e.sitio === S && e.sku === sku && e.lote === lote && e.cantidad > 0);
      if (!x) throw new Error(`no hay ${sku} ${lote} en ${S}`);
      return `(01)${x.gtin}(17)${aammdd(x.caducidad)}(10)${x.lote}`;
    },
    pagina: async (vista, operador, token, nav = navegador) => { const c = await contexto(nav, vista, operador, token); return { c, p: await c.newPage() }; },
    /** La pantalla tal cual la ve la persona (el destello es a pantalla completa, no un elemento). */
    pantalla: async (p, nombre) => { const r = join(CRUDAS, `${nombre}.png`); await p.screenshot({ path: r }); return r; },
    tareas: async () => (await api({ accion: 'ronda', sitio: S })).tareas.map((t) => `${t.orden}. ${t.tipo} ${t.ubicacion}${t.lote ? ` ${t.lote.lote}` : ''}: ${t.estado}${t.motivo ? ` (${t.motivo})` : ''}`),
  };
}

/** Escanea la etiqueta de la zona y deja la pagina lista para el siguiente escaneo. */
async function enZona(h, vista, operador, token, u, nav) {
  const r = await h.pagina(vista, operador, token, nav);
  await h.abre(r.p, '/etiquetas/escanear');
  await escaneaEnZona(r.p, h.zona(u));
  await sinDestello(r.p);
  return r;
}

/** 40 · el avance de la ronda: el supervisor en su tablero (escritorio) y el almacenista en piso (celular). */
async function ronda40(h, momento) {
  const s = await h.pagina('escritorio', 'Supervisor Centro', h.TOKEN);
  await h.abre(s.p, '/etiquetas/dia');
  await s.p.selectOption('[data-prueba="sitio-dia"]', S);
  await s.p.waitForSelector(`[data-prueba="dia"][data-sitio="${S}"]`);
  await s.p.click('[data-prueba="avance"] summary');
  const escritorio = await h.foto(s.p, '[data-prueba="avance"]', `ronda-${momento}-escritorio`);
  await s.c.close();
  const { c, p } = await enZona(h, 'celular', 'Almacenista Centro', h.TOKEN_ALMACEN, 'PISO');
  await p.waitForSelector('[data-prueba="ronda"]');
  const celular = await h.foto(p, '[data-prueba="ronda"]', `ronda-${momento}-celular`);
  await c.close();
  return { escritorio, celular };
}

/** 37 · recibo: con (17)(10) recibe con UN escaneo (celular, medicion); con el EAN del proveedor, la foto ahi mismo (escritorio). */
async function recibo37(h, med) {
  const { c, p } = await enZona(h, 'escritorio', 'Recibo Centro', h.TOKEN_RECIBO, 'RECIBO');
  if (await escaneaEnZona(p, `]E0${h.unidadDe('REF-007') ?? completaClave('952111100004')}`) !== 'recibir-con-foto') throw new Error(`el EAN del proveedor debía pedir la foto: ${await textoEnPantalla(p)}`);
  await sinDestello(p);
  await p.waitForSelector('[data-prueba="embebido"][data-tipo="recepcion"] [data-prueba="identificado"]');
  const esc = await h.foto(p, 'main', 'zona-recibo-foto-escritorio');
  await c.close();
  await h.compone('37', 'Escanear en zona de recibo: con (17)(10) se recibe con un escaneo; con el EAN del proveedor, la foto ahi mismo', [['celular · un escaneo: recibido', med.capturas.recibido], ['celular · la tarjeta que queda', med.capturas.recibidoTarjeta], ['escritorio · EAN del proveedor → recepcion con foto sin cambiar de pantalla', esc]]);
}

/** 38 · almacen: lote, semaforo, rack y «baja primero ese», sin cantidades (almacenista). */
async function almacen38(h) {
  const fefo = {};
  for (const [vista, rack, sku, lote] of [['celular', 'A-01-2', 'YOG-001', 'L4471'], ['escritorio', 'B-02-2', 'REF-007', 'R570']]) {
    const { c, p } = await enZona(h, vista, 'Almacenista Centro', h.TOKEN_ALMACEN, `ALMACEN-${rack}`);
    await escaneaEnZona(p, await h.cajaLote(sku, lote));
    await p.waitForSelector('[data-prueba="destello"] [data-prueba="fefo-escaneo"]');
    fefo[vista] = await h.pantalla(p, `zona-almacen-${vista}`);
    const texto = await p.locator('[data-prueba="destello"]').textContent();
    if (/\b\d+ caja/.test(texto)) throw new Error(`el almacenista vio una cantidad: ${texto}`);
    await c.close();
  }
  await h.compone('38', 'Almacen: lote, semaforo, rack y «baja primero ese» (almacenista, sin cantidades)', [['celular · rack A-01-2', fefo.celular], ['escritorio · rack B-02-2', fefo.escritorio]]);
}

/** 39 · piso: un rojo retirado con un escaneo (celular, medicion) y un vencido a merma, con «deshacer» (escritorio). */
async function piso39(h, med) {
  const { c, p } = await enZona(h, 'escritorio', 'Almacenista Centro', h.TOKEN_ALMACEN, 'PISO');
  const vencido = await h.cajaLote('REF-007', 'R540');
  if (await escaneaEnZona(p, vencido) !== 'retirado') throw new Error(`el vencido no se retiró: ${await textoEnPantalla(p)}`);
  const retiro = await h.pantalla(p, 'zona-vencido-escritorio');
  await sinDestello(p);
  await p.click('[data-prueba="deshacer"]');
  await p.waitForFunction(() => document.querySelector('[data-prueba="titulo-escaneo"]')?.textContent === 'Deshecho');
  await sinDestello(p);
  const deshecho = await h.foto(p, '[data-prueba="ultimo-escaneo"]', 'zona-deshecho-escritorio');
  await escaneaEnZona(p, vencido);
  await sinDestello(p);
  await c.close();
  await h.compone('39', 'Piso: retirar ES el escaneo (rojo a almacen, vencido a merma) y deshacer como correccion', [['celular · rojo retirado con un escaneo', med.capturas.retirado], ['escritorio · vencido a merma', retiro], ['escritorio · deshacer = CORRECCION en la cadena', deshecho]]);
}

/** 41 · otro almacenista recuenta SOLO lo que salio de la tolerancia (y encuentra el mismo faltante). */
async function reconteo41(h, cic) {
  const { c, p } = await h.pagina('celular', 'Almacenista Dos', h.TOKEN_ALMACEN);
  await h.abre(p, '/etiquetas/conteo');
  await p.waitForSelector('[data-prueba="recontar"]');
  const recuenta = await h.foto(p, '[data-prueba="conteo-activo"]', 'ciclico-reconteo-celular');
  const sinMedir = medidor(h.abre);
  for (const [u, lotes] of cic.mapa) for (const x of lotes.filter((y) => esFalta(cic.falta, u, y))) { await cuentaEnConteo(p, sinMedir, h.zona(u), 1); await cuentaEnConteo(p, sinMedir, h.caja(x.gtin, x.caducidad, x.lote), x.cantidad - 1); }
  await p.click('[data-prueba="terminar-ronda"]');
  await p.waitForSelector('[data-prueba="conteo-terminado"]');
  await c.close();
  return recuenta;
}

/** 41 · el supervisor concilia: autorizar con quien conto se rechaza; con quien no conto, se aplica como CONTEO. */
async function ciclico41(h, med) {
  const recuenta = await reconteo41(h, med.capturas.ciclico);
  const { c, p } = await h.pagina('escritorio', 'Supervisor Centro', h.TOKEN);
  await h.abre(p, '/etiquetas/conteo');
  await p.waitForSelector('[data-prueba="conciliacion"]');
  await p.fill('[data-prueba="autoriza-conteo"]', 'Almacenista Centro');
  await p.click('[data-prueba="aplicar-conteo"]');
  await p.waitForSelector('[data-prueba="conciliacion"] [role="alert"]');
  const negado = await h.foto(p, '[data-prueba="conteo-activo"]', 'ciclico-autoriza-quien-conto');
  h.informe.zona.autorizaQuienConto = await p.locator('[data-prueba="conciliacion"] [role="alert"]').textContent();
  await p.fill('[data-prueba="autoriza-conteo"]', 'Gerente Centro');
  await p.click('[data-prueba="aplicar-conteo"]');
  await p.waitForSelector('[data-prueba="aplicado"]');
  const aplicado = await h.foto(p, '[data-prueba="conteo-activo"]', 'ciclico-aplicado-escritorio');
  await c.close();
  await h.compone('41', 'Conteo ciclico por riesgo: el almacenista cuenta a ciegas, otro recuenta y autoriza quien no conto', [['celular · almacenista contando (ciego, solo sus ubicaciones)', med.capturas.contando], ['celular · reconteo de otra persona', recuenta], ['escritorio · autorizar con quien conto: rechazado', negado], ['escritorio · autorizado y aplicado como CONTEO', aplicado]]);
}

/** 42 · el tablero del dia del supervisor. */
async function tablero42(h) {
  const t = {};
  for (const vista of ['escritorio', 'celular']) {
    const { c, p } = await h.pagina(vista, 'Supervisor Centro', h.TOKEN);
    await h.abre(p, '/etiquetas/dia');
    await p.selectOption('[data-prueba="sitio-dia"]', S);
    await p.waitForSelector(`[data-prueba="dia"][data-sitio="${S}"]`);
    t[vista] = await h.foto(p, '[data-prueba="dia"]', `dia-${vista}`);
    await c.close();
  }
  await h.compone('42', 'El dia del supervisor en una pantalla: avisos, avance, pendientes, rojos de hoy, conteos, hallazgos y recomendaciones', [['escritorio', t.escritorio], ['celular', t.celular]]);
}

export async function flujosZona(h0) {
  const h = await ayudantes(h0);
  h.informe.zona = { rondaAntes: await h.tareas() };
  const antes40 = await ronda40(h, 'antes');
  // Medicion de agilidad (celular); de paso deja las capturas del recibo, el retiro y el conteo ciclico.
  const med = await mideAgilidad(h);
  h.informe.zona.agilidad = med.filas;
  h.informe.zona.tablaAgilidad = tablaAgilidad(med.filas);
  await recibo37(h, med);
  await almacen38(h);
  await piso39(h, med);
  await ciclico41(h, med);
  await piezaSuelta(h);
  await sinSenal(h);
  await tablero42(h);
  const despues40 = await ronda40(h, 'despues');
  h.informe.zona.rondaDespues = await h.tareas();
  await h.compone('40', 'La ronda del dia cerrandose por escaneos: antes y despues', [['escritorio · supervisor, antes', antes40.escritorio], ['escritorio · supervisor, despues', despues40.escritorio], ['celular · almacenista en piso, antes', antes40.celular], ['celular · almacenista en piso, despues', despues40.celular]]);
}

/** Un Chromium con camara FALSA que muestra la cara de una pieza con esas lineas impresas. */
async function camaraConPieza(h, nombre, lineas) {
  const png = join(h.CRUDAS, `${nombre}.png`);
  const y4m = join(h.CRUDAS, `${nombre}.y4m`);
  writeFileSync(png, await cuadroDeCaja(lineas, { solida: true }));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', png, '-t', '3', '-r', '10', '-vf', 'format=yuv420p', y4m]);
  return h.chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`] });
}

/** En piso: el EAN de la pieza, la foto de su fecha y, si no cuadra con ningun lote, el hallazgo. */
async function fotoDePieza(h, vista, nav) {
  const { c, p } = await enZona(h, vista, 'Almacenista Centro', h.TOKEN_ALMACEN, 'PISO', nav);
  if (await escaneaEnZona(p, `]E0${h.unidadDe('CHO-021') ?? EAN_CHO}`) !== 'pieza-suelta') throw new Error(`la pieza suelta no se reconoció: ${await textoEnPantalla(p)}`);
  await sinDestello(p);
  await p.click('[data-prueba="pieza-suelta"] [data-prueba="camara-foto-encender"]');
  await p.waitForFunction(() => (document.querySelector('[data-prueba="pieza-suelta"] [data-prueba="video-foto"]')?.videoWidth ?? 0) > 0);
  await p.click('[data-prueba="pieza-suelta"] [data-prueba="tomar-foto"]');
  // O la identificacion, o un mensaje que no sea «subiendo/leyendo» (un error se dice, no se espera a ciegas).
  await p.waitForFunction(() => document.querySelector('[data-prueba="identificacion"]') || /^(?!Subiendo|Leyendo)./.test(document.querySelector('[data-prueba="estado-pieza"]')?.textContent ?? ''), null, { timeout: 120_000 })
    .catch(() => undefined);
  if (!(await p.locator('[data-prueba="identificacion"]').count())) throw new Error(`la pieza no se identificó: ${await p.locator('[data-prueba="pieza-suelta"]').textContent()}`);
  const estado = await p.locator('[data-prueba="identificacion"]').getAttribute('data-estado');
  h.informe.zona[`pieza${vista}`] = { estado, mensaje: await p.locator('[data-prueba="identificacion"] p').first().textContent() };
  if (estado === 'no-cuadra' || estado === 'sin-fecha') {
    await p.fill('[data-prueba="pieza-suelta"] input[placeholder]', 'pieza en el exhibidor sin recepción');
    await p.click('[data-prueba="registrar-hallazgo"]');
    await p.waitForSelector('[data-prueba="hallazgo-registrado"]');
  }
  const r = await h.foto(p, '[data-prueba="embebido"]', `pieza-${vista}`);
  await c.close();
  return r;
}

/** 43 · pieza suelta: la foto de su fecha identifica el lote (celular); si no cuadra, hallazgo (escritorio). */
async function piezaSuelta(h) {
  if (!(await h.api()).motor) { console.log('  sin motor local: se salta la pieza suelta (43)'); return; }
  const r = {};
  for (const [vista, nombre, lineas] of [['celular', 'pieza-ch0310', [`CAD ${ddmmaa(h.dia(12))}`, 'CH0310']], ['escritorio', 'pieza-sin-lote', [`CAD ${ddmmaa(h.dia(150))}`, 'L9999']]]) {
    const nav = await camaraConPieza(h, nombre, lineas);
    r[vista] = await fotoDePieza(h, vista, nav);
    await nav.close();
  }
  await h.compone('43', 'Pieza suelta en piso: la foto de su fecha identifica el lote; si no cuadra, es un hallazgo', [['celular · identificada (CH0310)', r.celular], ['escritorio · no cuadra: hallazgo en la cadena', r.escritorio]]);
}

/** 44 · sin señal: el escaneo se encola en el equipo y se sube solo al volver la señal. */
async function sinSenal(h) {
  const r = {};
  const lotes = { celular: [['CHO-021', 'CH0310']], escritorio: [['REF-007', 'R590'], ['YOG-001', 'L4471']] };
  for (const vista of ['celular', 'escritorio']) {
    const { c, p } = await enZona(h, vista, 'Almacenista Centro', h.TOKEN_ALMACEN, 'PISO');
    const textos = [];
    for (const [sku, lote] of lotes[vista]) textos.push(await h.cajaLote(sku, lote));
    await c.setOffline(true);
    for (const t of textos) { await escaneaEnZona(p, t); await sinDestello(p); }
    await p.waitForSelector('[data-prueba="por-subir"]');
    const fuera = await h.foto(p, 'main', `sin-senal-${vista}`);
    await c.setOffline(false);
    await p.waitForSelector('[data-prueba="sincronizados"]', { timeout: 30_000 });
    const vuelta = await h.foto(p, 'main', `con-senal-${vista}`);
    h.informe.zona[`sincronizados${vista}`] = await p.locator('[data-prueba="sincronizados"] li').allTextContents();
    r[vista] = [fuera, vuelta];
    await c.close();
  }
  await h.compone('44', 'Sin señal: el escaneo se guarda en el equipo y se sube solo, en orden, al volver', [['celular · sin señal', r.celular[0]], ['celular · al volver', r.celular[1]], ['escritorio · sin señal (2)', r.escritorio[0]], ['escritorio · al volver', r.escritorio[1]]]);
}
