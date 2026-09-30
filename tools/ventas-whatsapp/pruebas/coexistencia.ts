/**
 * Coexistencia (app de WhatsApp Business + API en el mismo número): historial por fases, el dueño
 * que no comparte (2593109), la desconexión desde la app (PARTNER_REMOVED) que pausa al inquilino
 * y avisa, y la reconexión.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIA } from '../dist/index.js';
import { circuito } from './_ayuda.ts';

test('historial: llega en fases y fragmentos y se guarda sin duplicar', async () => {
  const { c, restaurante } = await circuito();
  c.meta.enviaHistorial(restaurante.canal.phoneNumberId, [
    { waId: '522290007001', mensajes: [{ de: '522290007001', texto: 'Hola, ¿tienen picadas?', hace: 0.5 * DIA }, { de: restaurante.canal.telefonoVisible, texto: 'Sí, a $80', hace: 0.4 * DIA }, { de: '522290007001', texto: 'Gracias por el pedido de mayo', hace: 120 * DIA }] },
  ]);
  await c.asienta();
  const [h] = await c.almacen.de(restaurante.id).lista('historial');
  assert.equal(h!.mensajes.length, 3);
  assert.deepEqual(h!.fases.sort(), [0, 2], 'fase 0 (día 0–1) y fase 2 (90–180 días)');
});

test('el dueño no compartió el historial: aviso, y el agente empieza sin él', async () => {
  const { c, tienda } = await circuito();
  c.meta.enviaHistorial(tienda.canal.phoneNumberId, [], false);
  await c.asienta();
  const alertas = await c.almacen.de(tienda.id).lista('alertas');
  assert.ok(alertas.some((a) => /2593109/.test(a.texto)));
});

test('PARTNER_REMOVED: el inquilino se pausa, nada sale, el dueño recibe alerta; ACCOUNT_RECONNECTED lo reactiva', async () => {
  const { c, restaurante } = await circuito();
  c.meta.desconecta(restaurante.canal.phoneNumberId);
  await c.asienta();
  assert.equal((await c.almacen.inquilino(restaurante.id))!.estado, 'pausado');
  const cl = c.meta.cliente(restaurante.canal.phoneNumberId, '5222900070002', 'Durante la pausa');
  cl.escribe('¿Qué tienen?');
  await c.asienta();
  assert.equal(cl.recibidos.length, 0, 'con el canal desconectado no se envía nada');
  const alertas = await c.almacen.de(restaurante.id).lista('alertas');
  assert.ok(alertas.some((a) => a.nivel === 'grave' && /PARTNER_REMOVED/.test(a.texto)));
  assert.ok(alertas.some((a) => /sin responder/.test(a.texto)));
  c.meta.reconecta(restaurante.canal.phoneNumberId);
  await c.asienta();
  assert.equal((await c.almacen.inquilino(restaurante.id))!.estado, 'activo');
  cl.escribe('¿Siguen abiertos?');
  await c.asienta();
  assert.equal(cl.recibidos.length, 1);
});
