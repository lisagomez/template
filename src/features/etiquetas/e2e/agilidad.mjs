/**
 * MEDICION de agilidad en CELULAR (390×844), con Playwright: toques, escaneos y pantallas por
 * tarea ANTES (las pantallas de siempre: /recibir, /caducidades, /mover, /conteo) y DESPUES
 * («Escanear» por zona y el conteo ciclico del dia). Se cuenta lo que la persona HACE:
 *   toque = click, elegir en una lista o escribir un valor; escaneo = una lectura (pistola o
 *   camara); pantalla = cada ruta que abre. Esperar la respuesta no cuenta.
 * Cada DESPUES empieza en un equipo sin zona recordada (cuenta tambien el escaneo de la etiqueta
 * de la zona): es el peor caso, no el de quien ya esta en su zona.
 *
 * Sucursal Centro, datos ficticios de la semilla. Devuelve la tabla y las capturas de paso.
 */
const S = 'SUC-CENTRO';

export function medidor(abre) {
  const m = { toques: 0, escaneos: 0, pantallas: 0 };
  return {
    m,
    ve: async (p, ruta) => { m.pantallas++; await abre(p, ruta); },
    toca: async (p, sel) => { m.toques++; await p.click(sel); },
    escribe: async (p, sel, v) => { m.toques++; await p.fill(sel, String(v)); },
    elige: async (p, sel, v) => { m.toques++; await p.selectOption(sel, v); },
    escanea: async (p, texto) => { m.escaneos++; await p.fill('[data-prueba="pistola"]', texto); await p.press('[data-prueba="pistola"]', 'Enter'); },
  };
}

/** Un escaneo en «Escanear»: espera a que el contador de la sesion suba y devuelve el tipo de respuesta. */
export async function escaneaEnZona(p, texto, med) {
  const n = Number(await p.locator('[data-prueba="contador-sesion"]').textContent());
  if (med) await med.escanea(p, texto);
  else { await p.fill('[data-prueba="pistola"]', texto); await p.press('[data-prueba="pistola"]', 'Enter'); }
  await p.waitForFunction((k) => Number(document.querySelector('[data-prueba="contador-sesion"]')?.textContent) > k, n);
  return p.locator('[data-prueba="destello"]').getAttribute('data-tipo').catch(() => null);
}

export const sinDestello = (p) => p.waitForSelector('[data-prueba="destello"]', { state: 'detached', timeout: 8000 });

async function enBitacora(p, med, texto) {
  const antes = await p.locator('[data-prueba="bitacora-mover"] li').count();
  await med.escanea(p, texto);
  await p.waitForFunction((n) => document.querySelectorAll('[data-prueba="bitacora-mover"] li').length > n, antes);
}

export async function cuentaEnConteo(p, med, texto, veces) {
  if (veces > 1) await med.escribe(p, '[data-prueba="veces-conteo"]', veces);
  else if (Number(await p.inputValue('[data-prueba="veces-conteo"]')) !== 1) await med.escribe(p, '[data-prueba="veces-conteo"]', 1);
  const aviso = await p.locator('[data-prueba="aviso-lectura-conteo"]').textContent().catch(() => '');
  const antes = await p.locator('[data-prueba="lecturas-conteo"] li').count();
  await med.escanea(p, texto);
  if (texto.startsWith('(414)')) await p.waitForFunction((a) => { const t = document.querySelector('[data-prueba="aviso-lectura-conteo"]')?.textContent ?? ''; return t.startsWith('Ubicación') && t !== a; }, aviso);
  else await p.waitForFunction((n) => document.querySelectorAll('[data-prueba="lecturas-conteo"] li').length > n, antes);
}

/** Lo que hay en cada ubicacion de almacen y piso del sitio, segun el supervisor (la «realidad» fisica de la simulacion). */
function porUbicacion(estado, ubicaciones) {
  const m = new Map();
  // Solo lo que se puede leer HOY con el catalogo vigente (una reimportacion puede haber cambiado un GTIN de caja) y sin tarimas.
  const gtins = new Set(estado.articulos.map((a) => a.gtinCaja).filter(Boolean));
  for (const x of estado.existencias.filter((e) => e.sitio === S && e.cantidad > 0 && gtins.has(e.gtin) && !e.sscc && (e.zona === 'almacen' || e.zona === 'piso'))) {
    const u = x.zona === 'piso' ? 'PISO' : x.posicion ? `ALMACEN-${x.posicion}` : 'ALMACEN';
    if (ubicaciones && !ubicaciones.includes(u)) continue;
    m.set(u, [...(m.get(u) ?? []), x]);
  }
  return m;
}

export const esFalta = (falta, u, x) => Boolean(falta && falta.u === u && falta.gtin === x.gtin && falta.lote === x.lote);

/** Cuenta ubicacion por ubicacion (etiqueta y luego cada lote); `falta` resta una caja de UN lote en UNA ubicacion (faltante real). */
async function cuentaUbicaciones(p, med, h, mapa, falta) {
  for (const [u, lotes] of mapa) {
    await cuentaEnConteo(p, med, h.zona(u), 1);
    for (const x of lotes) await cuentaEnConteo(p, med, h.caja(x.gtin, x.caducidad, x.lote), x.cantidad - (esFalta(falta, u, x) ? 1 : 0));
  }
}

const cierra = async (...cs) => { for (const c of cs) await c.close(); };
const falla = async (p, que) => { throw new Error(`${que}: ${await p.locator('[data-prueba="destello"], [data-prueba="ultimo-escaneo"]').first().textContent().catch(() => '')}`); };

/** «Escanear» en un equipo SIN zona recordada: abre la pantalla y escanea la etiqueta de la zona (cuenta). */
async function escanearEn(h, med, operador, token, u) {
  const r = await h.pagina('celular', operador, token);
  await med.ve(r.p, '/etiquetas/escanear');
  await escaneaEnZona(r.p, h.zona(u), med);
  await sinDestello(r.p);
  return r;
}

async function recibirAntes(h, a) {
  const { c, p } = await h.pagina('celular', 'Recibo Centro', h.TOKEN_RECIBO);
  await a.ve(p, '/etiquetas/recibir');
  await a.elige(p, '[data-prueba="sitio-recibir"]', S);
  await a.escanea(p, h.caja(h.cajaDe('YOG-001'), h.dia(34), 'ZR101'));
  await a.toca(p, '[data-prueba="recibir-directo"]');
  await p.waitForSelector('[data-prueba="recibido"]');
  await cierra(c);
}

/** Recibo entra DIRECTO a «Escanear» (la portada lo redirige): una pantalla, la etiqueta de la zona y la caja. */
async function recibirDespues(h, d, capturas) {
  const { c, p } = await h.pagina('celular', 'Recibo Centro', h.TOKEN_RECIBO);
  d.m.pantallas++;
  await p.goto(`${h.BASE}/etiquetas`);
  await p.waitForURL('**/etiquetas/escanear');
  await p.waitForSelector('[data-prueba="zona-actual"]');
  await escaneaEnZona(p, h.zona('RECIBO'), d);
  await sinDestello(p);
  if (await escaneaEnZona(p, h.caja(h.cajaDe('YOG-001'), h.dia(34), 'ZR102'), d) !== 'recibido') await falla(p, 'no se recibió en zona de recibo');
  capturas.recibido = await h.pantalla(p, 'zona-recibido-celular');
  await sinDestello(p);
  capturas.recibidoTarjeta = await h.foto(p, 'main', 'zona-recibido-tarjeta-celular');
  await cierra(c);
}

/** Hoy: ver en el tablero que retirar, ir a mover, elegir sitio y destino, decir cuantas cajas y leerla. */
async function retirarAntes(h, a) {
  const { c, p } = await h.pagina('celular', 'Supervisor Centro', h.TOKEN);
  await a.ve(p, '/etiquetas/caducidades');
  await a.ve(p, '/etiquetas/mover');
  await a.elige(p, '[data-prueba="sitio-mover"]', S);
  await a.toca(p, '[data-prueba="zona-almacen"]');
  await a.escribe(p, '[data-prueba="veces"]', 3);
  await enBitacora(p, a, await h.cajaLote('YOG-001', 'L0917'));
  await cierra(c);
}

async function retirarDespues(h, d, capturas) {
  const { c, p } = await escanearEn(h, d, 'Almacenista Centro', h.TOKEN_ALMACEN, 'PISO');
  if (await escaneaEnZona(p, await h.cajaLote('YOG-001', 'L0916'), d) !== 'retirado') await falla(p, 'no se retiró el rojo');
  capturas.retirado = await h.pantalla(p, 'zona-retirado-celular');
  await cierra(c);
}

async function resurtirAntes(h, a) {
  const { c, p } = await h.pagina('celular', 'Supervisor Centro', h.TOKEN);
  await a.ve(p, '/etiquetas/caducidades');
  await a.ve(p, '/etiquetas/mover');
  await a.elige(p, '[data-prueba="sitio-mover"]', S);
  await a.toca(p, '[data-prueba="zona-piso"]');
  await enBitacora(p, a, await h.cajaLote('REF-007', 'R545'));
  await cierra(c);
}

async function resurtirDespues(h, d) {
  const { c, p } = await escanearEn(h, d, 'Almacenista Centro', h.TOKEN_ALMACEN, 'PISO');
  if (await escaneaEnZona(p, await h.cajaLote('REF-007', 'R545'), d) !== 'movido') await falla(p, 'no bajó a piso');
  await cierra(c);
}

/** Hoy: el conteo se abre por ZONA entera (la pantalla no sabe de ubicaciones de riesgo) y se cuenta todo. Se cancela sin tocar la cadena. */
async function contarAntes(h, a, sup) {
  const s = await h.pagina('celular', 'Supervisor Centro', h.TOKEN);
  await a.ve(s.p, '/etiquetas/conteo');
  await a.elige(s.p, '[data-prueba="sitio-conteo"]', S);
  await a.toca(s.p, '[data-prueba="abrir-conteo"]');
  await s.p.waitForSelector('[data-prueba="conteo-activo"][data-estado="contando"]');
  const k = await h.pagina('celular', 'Contador Centro', h.TOKEN_CONTEO);
  await a.ve(k.p, '/etiquetas/conteo');
  await k.p.waitForSelector('[data-prueba="conteo-activo"][data-estado="contando"]');
  await cuentaUbicaciones(k.p, a, h, porUbicacion(sup));
  await a.toca(k.p, '[data-prueba="terminar-ronda"]');
  await k.p.waitForSelector('[data-prueba="conteo-activo"]:not([data-estado="contando"])');
  const folio = (await h.api({ accion: 'conteos' })).conteos.find((x) => x.sitio === S && x.estado !== 'cancelado' && x.estado !== 'aplicado').folio;
  await h.api({ accion: 'conteo-cancela', folio, motivo: 'medición: conteo de la zona entera (antes)' });
  await cierra(k.c, s.c);
}

/** Un faltante REAL (una caja menos de refresco en el anaquel), que recontara otra persona. */
function eligeFalta(mapa) {
  const todos = [...mapa.entries()].flatMap(([u, xs]) => xs.map((x) => ({ u, x })));
  const e = todos.find(({ x }) => x.sku === 'REF-007' && x.cantidad >= 2) ?? todos.find(({ x }) => x.cantidad >= 2);
  return e ? { u: e.u, gtin: e.x.gtin, lote: e.x.lote } : undefined;
}

/** Despues: el supervisor abre el ciclico de hoy con un toque; el almacenista cuenta SOLO esas ubicaciones, a ciegas. */
async function contarDespues(h, d, sup, capturas) {
  const s = await h.pagina('celular', 'Supervisor Centro', h.TOKEN);
  await d.ve(s.p, '/etiquetas/dia');
  await s.p.waitForSelector('[data-prueba="abrir-ciclico"]');
  await d.toca(s.p, '[data-prueba="abrir-ciclico-boton"]');
  await s.p.waitForFunction(() => /Abierto/.test(document.querySelector('[data-prueba="aviso-ciclico"]')?.textContent ?? ''));
  const conteo = (await h.api({ accion: 'conteos' })).conteos.find((x) => x.sitio === S && x.estado === 'contando');
  const k = await h.pagina('celular', 'Almacenista Centro', h.TOKEN_ALMACEN);
  await d.ve(k.p, '/etiquetas/conteo');
  await k.p.waitForSelector('[data-prueba="ubicaciones-ciclico"]');
  const mapa = porUbicacion(sup, conteo.ubicaciones);
  const falta = eligeFalta(mapa);
  await cuentaUbicaciones(k.p, d, h, mapa, falta);
  capturas.contando = await h.foto(k.p, '[data-prueba="conteo-activo"]', 'ciclico-almacenista-celular');
  await d.toca(k.p, '[data-prueba="terminar-ronda"]');
  await k.p.waitForSelector('[data-prueba="conteo-activo"]:not([data-estado="contando"])');
  capturas.ciclico = { folio: conteo.folio, ubicaciones: conteo.ubicaciones, mapa: [...mapa.entries()].map(([u, xs]) => [u, xs.map((x) => ({ gtin: x.gtin, lote: x.lote, caducidad: x.caducidad, cantidad: x.cantidad }))]), falta };
  await cierra(k.c, s.c);
}

export async function mideAgilidad(h) {
  const filas = [];
  const capturas = {};
  const par = async (tarea, antes, despues) => {
    const a = medidor(h.abre); await antes(a);
    const d = medidor(h.abre); await despues(d);
    filas.push({ tarea, antes: a.m, despues: d.m });
  };
  await par('Recibir una caja con (17)(10)', (a) => recibirAntes(h, a), (d) => recibirDespues(h, d, capturas));
  await par('Retirar de piso un lote en rojo', (a) => retirarAntes(h, a), (d) => retirarDespues(h, d, capturas));
  await par('Resurtir en orden FEFO', (a) => resurtirAntes(h, a), (d) => resurtirDespues(h, d));
  // Lo que hay de verdad en cada ubicacion (la simulacion cuenta lo que dice el supervisor), antes de contar.
  const sup = await h.api();
  await par('Contar (inventario ciego)', (a) => contarAntes(h, a, sup), (d) => contarDespues(h, d, sup, capturas));
  return { filas, capturas };
}

export function tablaAgilidad(filas) {
  const t = (x) => `${x.toques} toques · ${x.escaneos} escaneos · ${x.pantallas} pantalla(s)`;
  return ['| Tarea | Antes (pantallas de hoy) | Después («Escanear» por zona) |', '|---|---|---|', ...filas.map((f) => `| ${f.tarea} | ${t(f.antes)} | ${t(f.despues)} |`)].join('\n');
}
