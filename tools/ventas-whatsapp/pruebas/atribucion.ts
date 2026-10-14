/**
 * Fase 3 — atribución y ROI: el `ctwa_clid` del primer mensaje llega a Meta como `Purchase` UNA
 * sola vez; la etiqueta orgánica se atribuye y se quita antes del agente; los anuncios de Estados
 * (sin `ctwa_clid`) se atribuyen por anuncio en el tablero; `automatic_events` se compara con el
 * ledger; y el ROAS del tablero cuadra con el Administrador de anuncios (±10 %).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circuito } from './_ayuda.ts';

type Circ = Awaited<ReturnType<typeof circuito>>;

async function compraDesdeAnuncio(x: Circ, adId: string, waId: string, items: Array<{ retailerId: string; cantidad: number }>, opciones: { conClid?: boolean; texto?: string } = {}) {
  const { c, restaurante } = x;
  const cl = c.meta.cliente(restaurante.canal.phoneNumberId, waId, 'Cliente de anuncio');
  const llegada = cl.llegaPorAnuncio(adId, opciones.texto ?? 'Hola, vi su anuncio', opciones.conClid ?? true);
  await c.asienta();
  cl.pide(items);
  await c.asienta();
  await cl.llenaFlow({ ENTREGA: { zona: 'Centro', direccion: 'Calle 1', horario: 'lo-antes-posible', recoger: false }, RESUMEN: { confirmar: true } });
  await c.asienta();
  const liga = c.procesador.ligaDeUrl((cl.ultimo()!.mensaje as { url: string }).url)!;
  await c.procesador.paga(liga.id, { duplicaWebhook: true });
  await c.asienta();
  return { cl, llegada };
}

test('ctwa_clid → Purchase aceptado por Meta una sola vez (webhook de pago duplicado, reintentos y reenvío)', async () => {
  const x = await circuito();
  const camp = x.c.meta.anuncios.creaCampana('Tacos de octubre', 50_000);
  await x.c.vendedor.panel.registraGasto(x.restaurante.id, camp.id, camp.nombre, camp.gastoCentavos, camp.anuncios);
  const { llegada } = await compraDesdeAnuncio(x, camp.anuncios[0]!, '5222900040001', [{ retailerId: 'tacos-pastor', cantidad: 2 }]);
  await x.c.vendedor.panel.reintentaConversiones(x.restaurante.id);
  const compras = x.c.meta.capi.aceptados.filter((e) => e.event_name === 'Purchase');
  assert.equal(compras.length, 1);
  assert.equal(compras[0]!.user_data.ctwa_clid, llegada.ctwaClid);
  assert.equal(compras[0]!.action_source, 'business_messaging');
  assert.equal(compras[0]!.messaging_channel, 'whatsapp');
  assert.deepEqual(compras[0]!.custom_data, { currency: 'MXN', value: 225 });
  assert.equal(x.c.meta.capi.duplicados, 0, 'Meta nunca recibió el mismo event_id dos veces');
  const [ev] = await x.c.almacen.de(x.restaurante.id).lista('eventos');
  assert.equal(ev!.estado, 'aceptado');
  assert.equal(ev!.eventId, `${ev!.pedidoId}:Purchase`);
});

test('etiqueta orgánica: se atribuye al canal y se quita antes de llegar al agente', async () => {
  const x = await circuito();
  const qr = await x.c.vendedor.panel.creaQr(x.restaurante.id, 'QR-MESA', 'Quiero pedir');
  const q = qr.artefactos[0]!.datos as { ligaCorta: string; mensaje: string };
  assert.match(q.ligaCorta, /^https:\/\/wa\.me\/message\//);
  assert.equal(q.mensaje, 'Quiero pedir [QR-MESA]');
  const cl = x.c.meta.cliente(x.restaurante.canal.phoneNumberId, '5222900040002', 'Mesa 4');
  cl.escribe('Quiero pedir [QR-MESA]');
  await x.c.asienta();
  const datos = x.c.almacen.de(x.restaurante.id);
  const [origen] = await datos.lista('origenes');
  assert.deepEqual([origen!.tipo, origen!.etiqueta], ['organico', 'QR-MESA']);
  const entrante = (await datos.lista('mensajes')).find((m) => m.direccion === 'entrante')!;
  assert.doesNotMatch(entrante.resumen, /QR-MESA/, 'el agente ni el historial ven la etiqueta');
  const t = await x.c.vendedor.panel.tablero(x.restaurante.id);
  assert.ok(t.filas.some((f) => f.canal === 'QR-MESA' && f.tipo === 'organico' && f.gastoCentavos === null));
});

test('anuncio en Estados (sin ctwa_clid): no va a la Conversions API, pero el tablero lo atribuye por anuncio', async () => {
  const x = await circuito();
  const camp = x.c.meta.anuncios.creaCampana('Estados de fin de semana', 20_000);
  await x.c.vendedor.panel.registraGasto(x.restaurante.id, camp.id, camp.nombre, camp.gastoCentavos, camp.anuncios);
  await compraDesdeAnuncio(x, camp.anuncios[0]!, '5222900040003', [{ retailerId: 'picadas', cantidad: 2 }], { conClid: false });
  assert.equal(x.c.meta.capi.aceptados.length, 0);
  const [ev] = await x.c.almacen.de(x.restaurante.id).lista('eventos');
  assert.equal(ev!.estado, 'sin_clid');
  const t = await x.c.vendedor.panel.tablero(x.restaurante.id);
  const fila = t.filas.find((f) => f.canal === 'Estados de fin de semana')!;
  assert.deepEqual([fila.pedidosPagados, fila.ingresosCentavos], [1, 19_500]);
});

test('automatic_events: Meta detecta la compra (valor en milésimas) y coincide con el ledger', async () => {
  const x = await circuito();
  const camp = x.c.meta.anuncios.creaCampana('Arroz a la tumbada', 30_000);
  await x.c.vendedor.panel.registraGasto(x.restaurante.id, camp.id, camp.nombre, camp.gastoCentavos, camp.anuncios);
  const { llegada } = await compraDesdeAnuncio(x, camp.anuncios[0]!, '5222900040004', [{ retailerId: 'arroz-tumbada', cantidad: 1 }]);
  x.c.meta.eventoAutomatico(x.restaurante.canal.phoneNumberId, 'Purchase', llegada.ctwaClid!, 22_000);
  x.c.meta.eventoAutomatico(x.restaurante.canal.phoneNumberId, 'Purchase', 'clid-que-no-conocemos', 5_000);
  await x.c.asienta();
  const t = await x.c.vendedor.bus.envia('atribucion', { tenant: x.restaurante.id, contextId: 'ctx', skill: 'registrar_automatico', datos: { evento: { wamid: 'noop', nombre: 'LeadSubmitted', instante: 0 } }, messageId: 'cmp' });
  const cmp = t.artefactos[0]!.datos as { coinciden: string[]; soloMeta: string[]; valorDistinto: string[] };
  assert.equal(cmp.coinciden.length, 1, '$185 + envío $35 = $220.00 = 220000 milésimas');
  assert.equal(cmp.soloMeta.length, 1, 'la compra que Meta vio y nosotros no, se señala');
  assert.deepEqual(cmp.valorDistinto, []);
});

test('LeadSubmitted desde el Flow de calificación (solo si viene de anuncio y califica)', async () => {
  const x = await circuito();
  const camp = x.c.meta.anuncios.creaCampana('Huipiles', 40_000);
  await x.c.vendedor.panel.registraGasto(x.tienda.id, camp.id, camp.nombre, camp.gastoCentavos, camp.anuncios);
  const cl = x.c.meta.cliente(x.tienda.canal.phoneNumberId, '5222800040005', 'Interesada');
  cl.llegaPorAnuncio(camp.anuncios[0]!, 'Hola, me interesan sus huipiles');
  await x.c.asienta();
  cl.recibe({ wamid: 'x', instante: 0, resumen: '', mensaje: { tipo: 'botones', cuerpo: '', botones: [{ id: 'lead', titulo: 'Recomiéndame' }] } });
  cl.toca('lead');
  await x.c.asienta();
  await cl.llenaFlow({ CALIFICA: { presupuesto: '500_1500', cuando: 'esta_semana', zona: 'Xalapa' } });
  await x.c.asienta();
  const leads = x.c.meta.capi.aceptados.filter((e) => e.event_name === 'LeadSubmitted');
  assert.equal(leads.length, 1);
  assert.equal(leads[0]!.custom_data, undefined, 'un lead no lleva valor');
});

test('ROAS del tablero contra el Administrador de anuncios: dentro de ±10 % por campaña', async () => {
  const x = await circuito();
  const a = x.c.meta.anuncios.creaCampana('Campaña A', 60_000);
  const b = x.c.meta.anuncios.creaCampana('Campaña B', 25_000);
  for (const k of [a, b]) await x.c.vendedor.panel.registraGasto(x.restaurante.id, k.id, k.nombre, k.gastoCentavos, k.anuncios);
  const compras: Array<[string, string, Array<{ retailerId: string; cantidad: number }>]> = [
    [a.anuncios[0]!, '5222900041001', [{ retailerId: 'tacos-pastor', cantidad: 3 }]],
    [a.anuncios[0]!, '5222900041002', [{ retailerId: 'huachinango', cantidad: 1 }]],
    [a.anuncios[0]!, '5222900041003', [{ retailerId: 'cafe-lechero', cantidad: 2 }]],
    [b.anuncios[0]!, '5222900041004', [{ retailerId: 'arroz-tumbada', cantidad: 2 }]],
  ];
  for (const [ad, waId, items] of compras) await compraDesdeAnuncio(x, ad, waId, items);
  const tablero = await x.c.vendedor.panel.tablero(x.restaurante.id);
  const admin = x.c.meta.anuncios.reporte();
  for (const r of admin) {
    const f = tablero.filas.find((y) => y.canal === r.nombre)!;
    const diferencia = Math.abs((f.roas ?? 0) - (r.roas ?? 0)) / (r.roas ?? 1);
    console.log(`# ${r.nombre}: tablero ROAS ${f.roas} · Administrador ${r.roas} · diferencia ${(diferencia * 100).toFixed(1)} %`);
    assert.ok(diferencia <= 0.1);
  }
  assert.equal(x.c.meta.capi.aceptados.filter((e) => e.event_name === 'Purchase').length, 4, '4/4 ventas de anuncio con evento aceptado (≥ 95 %)');
});
