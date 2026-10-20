/**
 * El `chatId` que ve quien migra es el que ya tenía: el número como lo reporta WhatsApp (México: `521…`), no la forma
 * normalizada que usa el núcleo por dentro (`52…`). Un CRM que guardó `5215…@c.us` de OpenWA sigue encontrando sus
 * chats; y escribir con cualquiera de las dos formas llega al mismo chat.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bancoOpenWA, WA } from './_openwa.ts';

test('chatId de México: entra 521…, sale 521… en eventos, mensajes, chats y contactos; 52… llega al mismo chat', async () => {
  const b = bancoOpenWA();
  const { id: S } = await b.sesionLista();
  const comoOpenWA = `${WA}@c.us`;
  b.cliente(WA).escribe('hola');
  await b.drena();
  assert.equal(b.eventos('message.received')[0]?.data.chatId, comoOpenWA);
  assert.equal((await b.pide('POST', `/api/sessions/${S}/messages/send-text`, { chatId: comoOpenWA, text: 'uno' })).status, 201);
  assert.equal((await b.pide('POST', `/api/sessions/${S}/messages/send-text`, { chatId: '525500000001@c.us', text: 'dos' })).status, 201);
  await b.drena();
  assert.deepEqual([...new Set(b.eventos('message.sent').map((e) => e.data.chatId))], [comoOpenWA]);
  assert.deepEqual([...new Set(b.eventos('message.ack').map((e) => e.data.chatId))], [comoOpenWA]);
  const lista = (await b.pide('GET', `/api/sessions/${S}/messages?chatId=${encodeURIComponent(comoOpenWA)}`)).cuerpo as { total: number; messages: Array<{ chatId: string }> };
  assert.equal(lista.total, 3);
  assert.ok(lista.messages.every((m) => m.chatId === comoOpenWA));
  assert.deepEqual(((await b.pide('GET', `/api/sessions/${S}/chats`)).cuerpo as Array<{ id: string }>).map((x) => x.id), [comoOpenWA]);
  assert.equal(((await b.pide('GET', `/api/sessions/${S}/contacts/${encodeURIComponent('525500000001@c.us')}`)).cuerpo as { id: string }).id, comoOpenWA);
});
