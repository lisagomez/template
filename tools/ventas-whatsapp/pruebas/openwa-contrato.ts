/**
 * La suite de CONTRATO de la puerta de salida: cada operación que la matriz declara compatible (`igual` o
 * `diferencia`) se llama por la fachada con una petición que cumple el esquema del openapi pineado, y su respuesta se
 * valida con ajv contra el esquema de ese status. El conjunto cerrado es el de la matriz: se cuentan n/n.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encuentra, MATRIZ_OPENWA } from '../dist/openwa/index.js';
import { revisaPeticion, revisaRespuesta } from './_contrato.ts';
import { bancoOpenWA, WA, WA2 } from './_openwa.ts';

const DECLARADAS = MATRIZ_OPENWA.filter((f) => f.estado === 'igual' || f.estado === 'diferencia').map((f) => f.operacion).sort();

test('contrato: petición y respuesta de cada operación compatible cumplen el openapi pineado (n/n)', async () => {
  const b = bancoOpenWA();
  const cumplidas = new Map<string, string>();
  const fallas: string[] = [];
  async function llama(op: string, metodo: string, ruta: string, cuerpo?: unknown, cabeceras: Record<string, string> = {}, llave?: string) {
    const e = encuentra(metodo, ruta.split('?')[0]!);
    if (e?.f.operacion !== op) fallas.push(`${metodo} ${ruta} enruta a ${e?.f.operacion ?? 'nada'}, no a ${op}`);
    const pet = revisaPeticion(op, cuerpo);
    const r = await (llave === undefined ? b.pide(metodo, ruta, cuerpo, cabeceras) : b.pide(metodo, ruta, cuerpo, cabeceras, llave));
    const res = r.status >= 300 ? `${op}: status ${r.status} ${JSON.stringify(r.cuerpo)}` : revisaRespuesta(op, r.status, r.cuerpo);
    for (const x of [pet, res]) if (x) fallas.push(x);
    if (!pet && !res) cumplidas.set(op, `${metodo} ${r.status}`);
    return r.cuerpo as Record<string, never>;
  }

  // salud y llaves
  await llama('HealthController_check', 'GET', '/api/health');
  await llama('HealthController_liveness', 'GET', '/api/health/live');
  await llama('HealthController_readiness', 'GET', '/api/health/ready');
  const llave = await llama('AuthController_create', 'POST', '/api/auth/api-keys', { name: 'integracion-crm', role: 'operator', allowedChats: [] });
  await llama('AuthController_findAll', 'GET', '/api/auth/api-keys');
  await llama('AuthController_findOne', 'GET', `/api/auth/api-keys/${llave.id}`);
  await llama('AuthController_update', 'PUT', `/api/auth/api-keys/${llave.id}`, { name: 'integracion-crm-2', expiresAt: null });
  await llama('AuthValidateController_validate', 'POST', '/api/auth/validate', undefined, {}, llave.apiKey);
  await llama('AuthController_revoke', 'POST', `/api/auth/api-keys/${llave.id}/revoke`);
  await llama('AuthController_delete', 'DELETE', `/api/auth/api-keys/${llave.id}`);

  // sesiones
  const s = await llama('SessionController_create', 'POST', '/api/sessions', { name: 'tienda-principal' });
  const S = `/api/sessions/${s.id}`;
  await llama('SessionController_start', 'POST', `${S}/start`);
  await b.completaAlta(s.id);
  await llama('SessionController_findAll', 'GET', '/api/sessions');
  await llama('SessionController_findOne', 'GET', S);
  const otra = await llama('SessionController_create', 'POST', '/api/sessions', { name: 'sesion-desechable' });
  await llama('SessionController_stop', 'POST', `/api/sessions/${otra.id}/stop`);
  await llama('SessionController_logout', 'POST', `/api/sessions/${otra.id}/logout`);
  await llama('SessionController_delete', 'DELETE', `/api/sessions/${otra.id}`);

  // webhooks (uno que falla, para tener entregas fallidas y redrive)
  const w = await llama('WebhookController_create', 'POST', `${S}/webhooks`, { url: 'https://receptor.invalid/openwa', events: ['*'], secret: 'secreto-de-webhook-sintetico', retryCount: 1 });
  b.statusDe.set('https://receptor.invalid/caido', 503);
  const caido = await llama('WebhookController_update', 'PUT', `${S}/webhooks/${w.id}`, { url: 'https://receptor.invalid/caido' });
  assert.equal(caido.url, 'https://receptor.invalid/caido');
  await llama('WebhookController_test', 'POST', `${S}/webhooks/${w.id}/test`);
  b.cliente(WA).escribe('Hola, ¿tienen café de olla?');
  b.cliente(WA2, 'Beto Sintético').escribe('Buenas tardes');
  await b.drena();
  await llama('WebhookController_findBySession', 'GET', `${S}/webhooks`);
  await llama('WebhookController_findOne', 'GET', `${S}/webhooks/${w.id}`);
  await llama('WebhooksListController_findAll', 'GET', '/api/webhooks');
  await llama('WebhooksListController_deliveryFailures', 'GET', `/api/webhooks/delivery-failures?sessionId=${s.id}`);
  b.statusDe.set('https://receptor.invalid/caido', 200);
  await llama('WebhooksListController_redriveDeliveryFailures', 'POST', '/api/webhooks/delivery-failures/redrive', { sessionId: s.id, limit: 50 });

  // plantillas (Meta las revisa; la palanca del simulador aprueba)
  const t = await llama('TemplateController_create', 'POST', `${S}/templates`, { name: 'Pedido listo', body: 'Hola {{nombre}}, tu pedido {{pedido}} está listo.', footer: 'Café de olla' });
  b.meta.administracion.revisa('waba_tienda', t.metaName, true);
  await b.drena();
  await llama('TemplateController_findBySession', 'GET', `${S}/templates`);
  await llama('TemplateController_findOne', 'GET', `${S}/templates/${t.id}`);
  const t2 = await llama('TemplateController_create', 'POST', `${S}/templates`, { name: 'Recordatorio', body: 'Te esperamos, {{nombre}}.' });
  await llama('TemplateController_update', 'PUT', `${S}/templates/${t2.id}`, { body: 'Te esperamos mañana, {{nombre}}.' });
  await llama('TemplateController_delete', 'DELETE', `${S}/templates/${t2.id}`);

  // mensajes dentro de la ventana
  const chat = `${WA}@c.us`;
  const texto = await llama('MessageController_sendText', 'POST', `${S}/messages/send-text`, { chatId: chat, text: 'Sí, de olla. ¿Cuántos?', linkPreview: false }, { 'idempotency-key': 'texto-0001' });
  await llama('MessageController_reply', 'POST', `${S}/messages/reply`, { chatId: chat, quotedMessageId: texto.messageId, text: 'Te lo confirmo' });
  const liga = 'https://medios.invalid/archivo';
  await llama('MessageController_sendImage', 'POST', `${S}/messages/send-image`, { chatId: chat, url: `${liga}.jpg`, caption: 'Así se ve' });
  await llama('MessageController_sendVideo', 'POST', `${S}/messages/send-video`, { chatId: chat, url: `${liga}.mp4` });
  await llama('MessageController_sendAudio', 'POST', `${S}/messages/send-audio`, { chatId: chat, url: `${liga}.ogg` });
  await llama('MessageController_sendDocument', 'POST', `${S}/messages/send-document`, { chatId: chat, url: `${liga}.pdf`, filename: 'menu.pdf', caption: 'Menú' });
  await llama('MessageController_sendSticker', 'POST', `${S}/messages/send-sticker`, { chatId: chat, url: `${liga}.webp` });
  await llama('MessageController_sendLocation', 'POST', `${S}/messages/send-location`, { chatId: chat, latitude: 19.53, longitude: -96.91, address: 'Centro, Xalapa' });
  await llama('MessageController_sendContact', 'POST', `${S}/messages/send-contact`, { chatId: chat, contactName: 'Mostrador', contactNumber: '+52 228 100 0003' });
  await llama('CatalogController_sendProduct', 'POST', `${S}/messages/send-product`, { chatId: chat, productId: 'sku_cafe', body: 'El de siempre' });
  b.reloj.avanza(25 * 3_600_000);
  await llama('MessageController_sendTemplate', 'POST', `${S}/messages/send-template`, { chatId: chat, templateId: t.id, vars: { nombre: 'Ana', pedido: 'A-17' } });
  b.cliente(WA).escribe('Gracias, voy para allá');
  await b.drena();
  await llama('MessageController_react', 'POST', `${S}/messages/react`, { chatId: chat, messageId: texto.messageId, emoji: '👍' });
  b.cliente(WA).reacciona(texto.messageId, '❤️');
  await b.drena();
  await llama('MessageController_getReactions', 'GET', `${S}/messages/${encodeURIComponent(chat)}/${texto.messageId}/reactions`);
  await llama('MessageController_getMessages', 'GET', `${S}/messages?chatId=${encodeURIComponent(chat)}&limit=20`);

  // lotes: uno que termina y otro que se cancela con la pausa cerrada
  const lote = await llama('MessageController_sendBulk', 'POST', `${S}/messages/send-bulk`, { messages: [{ chatId: chat, type: 'text', content: { text: 'Hola {{nombre}}' }, variables: { nombre: 'Ana' } }, { chatId: `${WA2}@c.us`, type: 'text', content: { text: 'Hola' } }], options: { delayBetweenMessages: 1000 } });
  await b.fachada.asienta();
  await llama('MessageController_getBatchStatus', 'GET', `${S}/messages/batch/${lote.batchId}`);
  b.cierra();
  const lento = await llama('MessageController_sendBulk', 'POST', `${S}/messages/send-bulk`, { batchId: 'lote-lento', messages: [{ chatId: chat, type: 'text', content: { text: 'uno' } }, { chatId: chat, type: 'text', content: { text: 'dos' } }] });
  await llama('MessageController_cancelBatch', 'POST', `${S}/messages/batch/${lento.batchId}/cancel`);
  b.abre();
  await b.fachada.asienta();

  // chats, contactos, perfil
  await llama('SessionController_getChats', 'GET', `${S}/chats`);
  await llama('SessionController_markChatRead', 'POST', `${S}/chats/read`, { chatId: chat });
  await llama('SessionController_sendChatState', 'POST', `${S}/chats/typing`, { chatId: chat, state: 'typing' });
  await llama('ContactController_findAll', 'GET', `${S}/contacts`);
  await llama('ContactController_findOne', 'GET', `${S}/contacts/${encodeURIComponent(chat)}`);
  await llama('ContactController_blockContact', 'POST', `${S}/contacts/${encodeURIComponent(chat)}/block`);
  await llama('ContactController_getBlockedContacts', 'GET', `${S}/contacts/blocked`);
  await llama('ContactController_unblockContact', 'DELETE', `${S}/contacts/${encodeURIComponent(chat)}/block`);
  await llama('ProfileController_setStatus', 'PUT', `${S}/profile/status`, { status: 'Café de olla en Xalapa' });
  await llama('WebhookController_delete', 'DELETE', `${S}/webhooks/${w.id}`);

  assert.deepEqual(fallas, [], fallas.join('\n'));
  const faltan = DECLARADAS.filter((op) => !cumplidas.has(op));
  console.log(`contrato: ${cumplidas.size}/${DECLARADAS.length} operaciones declaradas compatibles cumplen el openapi pineado (petición y respuesta)`);
  assert.deepEqual(faltan, [], `sin probar: ${faltan.join(', ')}`);
  assert.equal(cumplidas.size, DECLARADAS.length);
});

test('control: el validador del contrato rechaza lo que no cumple (no es un validador vacío)', () => {
  const sesion = { id: 's', name: 'tienda', status: 'ready', createdAt: '2026-10-20T16:00:00.000Z', updatedAt: '2026-10-20T16:00:00.000Z', engineLoaded: true };
  assert.equal(revisaRespuesta('SessionController_findOne', 200, sesion), null);
  assert.ok(revisaRespuesta('SessionController_findOne', 200, { ...sesion, status: 'conectada' }), 'status fuera del enum');
  assert.ok(revisaRespuesta('SessionController_findOne', 200, { id: 's' }), 'faltan requeridos');
  assert.ok(revisaRespuesta('SessionController_findOne', 200, { ...sesion, createdAt: 'ayer' }), 'date-time inválido');
  assert.ok(revisaRespuesta('MessageController_sendText', 201, { messageId: 1, timestamp: 'x' }), 'tipos');
  assert.ok(revisaRespuesta('SessionController_findOne', 418, {}), 'status no declarado');
  assert.ok(revisaPeticion('MessageController_sendText', { chatId: 'x' }), 'petición sin text');
});
