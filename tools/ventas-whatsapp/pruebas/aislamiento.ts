/**
 * Aislamiento entre inquilinos: el restaurante no lee, no gasta y no atribuye lo de la tienda
 * —ni por el almacén, ni por el bus, ni por un Flow, ni por un webhook de pago, ni por la
 * Conversions API—. (Por A2A: `a2a.ts`.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firmaProcesador } from '../dist/index.js';
import { circuito } from './_ayuda.ts';

test('almacén: cada vista ve solo lo suyo y no hay forma de listar lo de todos', async () => {
  const { c, restaurante, tienda } = await circuito();
  const r = c.almacen.de(restaurante.id);
  const t = c.almacen.de(tienda.id);
  const nombres = (xs: Array<{ nombre: string }>) => xs.map((p) => p.nombre).join(' ');
  assert.doesNotMatch(nombres(await r.lista('productos')), /Huipil/);
  assert.doesNotMatch(nombres(await t.lista('productos')), /tacos/);
  assert.throws(() => c.almacen.de('pyme_inventada'), /inquilino desconocido/);
  assert.equal(typeof (c.almacen as unknown as Record<string, unknown>).listaTodo, 'undefined');
});

test('bus: un dominio no puede responder por otro inquilino; el contexto siempre es el del tenant', async () => {
  const { c, restaurante, tienda } = await circuito();
  const t = await c.vendedor.bus.envia('catalogo', { tenant: tienda.id, contextId: 'ctx', skill: 'buscar_producto', datos: { consulta: 'tacos' }, messageId: 'x1' });
  assert.deepEqual((t.artefactos[0]!.datos as { productos: unknown[] }).productos, [], 'la tienda no encuentra los tacos del restaurante');
  await assert.rejects(c.vendedor.bus.envia('catalogo', { tenant: '', contextId: 'ctx', skill: 'listar', datos: {}, messageId: 'x2' }), /sin tenant/);
  const r = await c.vendedor.bus.envia('pedidos', { tenant: tienda.id, contextId: 'ctx', skill: 'estado_pedido', datos: { pedidoId: 'ped_1' }, messageId: 'x3' });
  assert.equal(r.estado, 'TASK_STATE_REJECTED');
  void restaurante;
});

test('pagos: un webhook con la referencia del restaurante no toca pedidos de la tienda (y uno inventado, nada)', async () => {
  const { c, tienda } = await circuito();
  const cuerpo = JSON.stringify({ pago_id: 'p1', liga_id: 'l1', referencia: `pyme_restaurante|ped_1`, monto_centavos: 100, moneda: 'MXN', estado: 'pagado', instante: 0 });
  const r = await c.vendedor.pagos.recibe(cuerpo, firmaProcesador('secreto-procesador-laboratorio', cuerpo));
  assert.equal(r.status, 200);
  assert.equal((await c.almacen.de(tienda.id).lista('pagos')).length, 0);
  const falso = JSON.stringify({ pago_id: 'p2', liga_id: 'l2', referencia: 'pyme_inventada|ped_1', monto_centavos: 100, moneda: 'MXN', estado: 'pagado', instante: 0 });
  assert.equal((await c.vendedor.pagos.recibe(falso, firmaProcesador('secreto-procesador-laboratorio', falso))).status, 404);
  assert.equal((await c.vendedor.pagos.recibe(falso, 'sha256=00')).status, 401);
});

test('Conversions API: un clic del anuncio de un negocio no se atribuye a la WABA del otro', async () => {
  const { c, restaurante, tienda } = await circuito();
  const camp = c.meta.anuncios.creaCampana('Del restaurante', 10_000);
  const cl = c.meta.cliente(restaurante.canal.phoneNumberId, '5222900060001', 'Cruzada');
  const { ctwaClid } = cl.llegaPorAnuncio(camp.anuncios[0]!, 'Hola');
  await c.asienta();
  const r = await c.meta.graph.enviaEventos(tienda.canal.datasetId, [{
    event_name: 'Purchase', event_time: Math.floor(c.reloj() / 1000), event_id: 'x:Purchase', action_source: 'business_messaging', messaging_channel: 'whatsapp',
    user_data: { whatsapp_business_account_id: restaurante.canal.wabaId, ctwa_clid: ctwaClid! }, custom_data: { currency: 'MXN', value: 1 },
  }]);
  assert.equal(r.ok, false, 'la WABA no corresponde al dataset de la tienda');
});

test('presupuesto de IA por inquilino: agotar el del restaurante no afecta a la tienda', async () => {
  const { c, restaurante, tienda } = await circuito();
  const r = (await c.almacen.inquilino(restaurante.id))!;
  await c.almacen.guardaInquilino({ ...r, politicas: { ...r.politicas, presupuestoTokensMensual: 1 } });
  const a = c.meta.cliente(restaurante.canal.phoneNumberId, '5222900060002', 'A');
  a.escribe('¿Me platicas cómo empezó el restaurante?'); await c.asienta();
  a.escribe('¿Y quién cocina los domingos?'); await c.asienta();
  const b = c.meta.cliente(tienda.canal.phoneNumberId, '5222800060003', 'B');
  b.escribe('Hola'); await c.asienta();
  b.escribe('¿Qué venden?'); await c.asienta();
  assert.equal((await c.almacen.de(restaurante.id).lista('casos'))[0]?.motivo, 'inquilino_sin_presupuesto');
  assert.equal((await c.almacen.de(tienda.id).lista('casos')).length, 0);
  assert.equal(b.ultimo()!.mensaje.tipo, 'carrusel');
});
