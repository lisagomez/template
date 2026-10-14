/**
 * Fase 0 — el canal: firma, verificación, idempotencia bajo reintentos y ráfagas, acuse rápido,
 * lectura de cada tipo de webhook y normalización del `wa_id` mexicano.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firmaMeta, leeWebhook, normalizaWaId, respondeVerificacion, verificaFirmaMeta } from '../dist/index.js';
import { circuito } from './_ayuda.ts';

test('firma: HMAC-SHA256 del cuerpo crudo; alterada, ausente o de otro secreto se rechaza', () => {
  const cuerpo = '{"object":"whatsapp_business_account","entry":[]}';
  const firma = firmaMeta('secreto', cuerpo);
  assert.match(firma, /^sha256=[0-9a-f]{64}$/);
  assert.equal(verificaFirmaMeta('secreto', cuerpo, firma), true);
  assert.equal(verificaFirmaMeta('secreto', `${cuerpo} `, firma), false, 'un byte de más rompe la firma');
  assert.equal(verificaFirmaMeta('otro', cuerpo, firma), false);
  assert.equal(verificaFirmaMeta('secreto', cuerpo, null), false);
  assert.equal(verificaFirmaMeta('secreto', cuerpo, 'sha1=abc'), false);
});

test('verificación GET: devuelve el challenge solo con el token correcto', () => {
  const ok = respondeVerificacion(new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'tok', 'hub.challenge': '1158201444' }), 'tok');
  assert.deepEqual(ok, { status: 200, cuerpo: '1158201444' });
  assert.equal(respondeVerificacion({ 'hub.mode': 'subscribe', 'hub.verify_token': 'malo', 'hub.challenge': '1' }, 'tok').status, 403);
  assert.equal(respondeVerificacion({ 'hub.mode': 'unsubscribe', 'hub.verify_token': 'tok', 'hub.challenge': '1' }, 'tok').status, 403);
});

test('webhook con firma inválida: 401, no se encola ni se procesa', async () => {
  const { c } = await circuito();
  const cuerpo = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
  assert.equal(c.vendedor.webhook.recibe(cuerpo, 'sha256=' + '0'.repeat(64)).status, 401);
  assert.equal(c.vendedor.webhook.recibe(cuerpo, undefined).status, 401);
  assert.equal(c.vendedor.metricas.firmasRechazadas, 2);
  assert.equal(c.vendedor.webhook.pendientes(), 0);
});

test('reintentos: cada webhook entregado dos veces y en desorden → cero duplicados persistidos', async () => {
  const { c, restaurante } = await circuito({ duplicaSi: () => true, desordena: true });
  const clientes = Array.from({ length: 12 }, (_, k) => c.meta.cliente(restaurante.canal.phoneNumberId, `52229100${String(k).padStart(4, '0')}`, `Cliente ${k}`));
  for (const cl of clientes) cl.escribe('Hola, ¿qué tienen?');
  await c.asienta();
  const datos = c.almacen.de(restaurante.id);
  const entrantes = (await datos.lista('mensajes')).filter((m) => m.direccion === 'entrante');
  assert.equal(entrantes.length, 12, '12 mensajes entrantes, cada uno una sola vez');
  assert.equal(new Set(entrantes.map((m) => m.wamid)).size, 12);
  for (const cl of clientes) assert.equal(cl.recibidos.length, 1, `${cl.waId} recibió una sola respuesta`);
  assert.ok(c.vendedor.metricas.duplicadosIgnorados >= 12, `duplicados ignorados: ${c.vendedor.metricas.duplicadosIgnorados}`);
  const salientes = (await datos.lista('mensajes')).filter((m) => m.direccion === 'saliente');
  assert.ok(salientes.every((m) => m.estado === 'read' && m.precio), 'cada saliente con su estado y su pricing guardados');
});

test('ráfaga de 300 webhooks: acuse < 1 s en cada uno (medido) y 100 % persistidos', async () => {
  const { c, tienda } = await circuito();
  const clientes = Array.from({ length: 100 }, (_, k) => c.meta.cliente(tienda.canal.phoneNumberId, `52228200${String(k).padStart(4, '0')}`, `R${k}`));
  for (const cl of clientes) { cl.escribe('Hola'); cl.escribe('¿Horario?'); cl.escribe('Gracias'); }
  await c.asienta();
  const acuses = c.vendedor.metricas.acusesMs;
  const maximo = Math.max(...acuses);
  const p95 = [...acuses].sort((a, b) => a - b)[Math.floor(acuses.length * 0.95)]!;
  console.log(`# acuses: ${acuses.length} · p95 ${p95.toFixed(3)} ms · máximo ${maximo.toFixed(3)} ms`);
  assert.ok(maximo < 1000, `acuse máximo ${maximo} ms`);
  const entrantes = (await c.almacen.de(tienda.id).lista('mensajes')).filter((m) => m.direccion === 'entrante');
  assert.equal(entrantes.length, 300);
});

test('lectura de webhooks: referral CTWA, order, interactivos, nfm_reply, ecos, historial, cuenta, automatic_events y campo desconocido', () => {
  const envuelve = (campo: string, valor: Record<string, unknown>) => ({ object: 'whatsapp_business_account', entry: [{ id: 'W', changes: [{ field: campo, value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '1', phone_number_id: 'P' }, ...valor } }] }] });
  const l1 = leeWebhook(envuelve('messages', {
    contacts: [{ profile: { name: 'Ana' }, wa_id: '5212291112233' }],
    messages: [
      { from: '5212291112233', id: 'w1', timestamp: '1790000000', type: 'text', text: { body: 'hola' }, referral: { source_id: 'ad1', source_type: 'ad', ctwa_clid: 'CLID', headline: 'x' } },
      { from: '5212291112233', id: 'w2', timestamp: '1790000001', type: 'order', order: { catalog_id: 'C', product_items: [{ product_retailer_id: 'p', quantity: 2, item_price: 95.5, currency: 'MXN' }] } },
      { from: '5212291112233', id: 'w3', timestamp: '1790000002', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'menu', title: 'Ver menú' } } },
      { from: '5212291112233', id: 'w4', timestamp: '1790000003', type: 'interactive', interactive: { type: 'nfm_reply', nfm_reply: { response_json: '{"flow_token":"t","zona":"Centro"}', body: 'Sent', name: 'flow' } } },
    ],
  }));
  assert.ok(l1.ok);
  type Ev = { waId: string; nombre?: string; instante: number; referencia: { ctwaClid?: string }; pedido: { items: unknown }; interactivo: { respuesta?: unknown } };
  const [texto, orden, boton, flow] = l1.eventos as unknown as Ev[];
  assert.equal(texto!.waId, '522291112233', '521 + 10 dígitos → 52 + 10 dígitos');
  assert.equal(texto!.nombre, 'Ana');
  assert.equal(texto!.referencia.ctwaClid, 'CLID');
  assert.equal(texto!.instante, 1_790_000_000_000);
  assert.deepEqual(orden!.pedido.items, [{ retailerId: 'p', cantidad: 2, precioCentavos: 9550, moneda: 'MXN' }]);
  assert.deepEqual(boton!.interactivo, { tipo: 'boton', id: 'menu', titulo: 'Ver menú' });
  assert.deepEqual(flow!.interactivo.respuesta, { flow_token: 't', zona: 'Centro' });
  const eco = leeWebhook(envuelve('smb_message_echoes', { message_echoes: [{ from: '1', to: '5212291112233', id: 'e1', timestamp: '1790000000', type: 'text', text: { body: 'yo te atiendo' } }] }));
  assert.ok(eco.ok && eco.eventos[0]!.clase === 'eco' && eco.eventos[0]!.waId === '522291112233');
  const hist = leeWebhook(envuelve('history', { errors: [{ code: 2593109, title: 'History sync is turned off' }] }));
  assert.ok(hist.ok && hist.eventos[0]!.clase === 'historial' && hist.eventos[0]!.errorCodigo === 2593109);
  const cuenta = leeWebhook(envuelve('account_update', { event: 'PARTNER_REMOVED', disconnection_info: { initiated_by: 'USER' } }));
  assert.ok(cuenta.ok && cuenta.eventos[0]!.clase === 'cuenta' && cuenta.eventos[0]!.evento === 'PARTNER_REMOVED');
  const auto = leeWebhook(envuelve('automatic_events', { automatic_events: [{ id: 'a1', event_name: 'Purchase', timestamp: 1790000000, ctwa_clid: 'CLID', custom_data: { currency: 'MXN', value: 225000 } }] }));
  assert.ok(auto.ok && auto.eventos[0]!.clase === 'evento_automatico');
  assert.equal((auto.eventos[0] as { valorCentavos: number }).valorCentavos, 22500, 'Meta manda milésimas: 225000 → $225.00');
  const raro = leeWebhook(envuelve('phone_number_quality_update', {}));
  assert.ok(raro.ok && raro.eventos[0]!.clase === 'desconocido', 'lo desconocido se reporta, no se tira');
  assert.equal(leeWebhook({ object: 'page', entry: [] }).ok, false);
  assert.equal(normalizaWaId('+52 1 229 111 2233'), '522291112233');
});
