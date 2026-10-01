/**
 * El traspaso a humano en sus cuatro disparadores (queja, monto sobre el umbral, dos fallos de
 * comprensión, presupuesto agotado) más la petición directa, y la convivencia con el dueño:
 * el eco desde su celular calla al agente; la bandeja toma, responde y libera.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HORA } from '../dist/index.js';
import { circuito } from './_ayuda.ts';

async function casos(c: Awaited<ReturnType<typeof circuito>>['c'], tenant: string) {
  return (await c.almacen.de(tenant).lista('casos')).map((x) => x.motivo);
}

test('queja → traspaso antes de llamar al modelo', async () => {
  const { c, restaurante } = await circuito();
  const cl = c.meta.cliente(restaurante.canal.phoneNumberId, '5222900010001', 'Queja');
  cl.escribe('Mi pedido llegó frío, estoy muy molesta');
  await c.asienta();
  assert.deepEqual(await casos(c, restaurante.id), ['queja']);
  assert.match(cl.ultimo()!.resumen, /Doña Chela/);
  assert.equal((await c.almacen.de(restaurante.id).lista('usoIa')).length, 0, 'ni un token gastado');
});

test('monto sobre el umbral → el pedido queda en revisión y pasa al dueño', async () => {
  const { c, restaurante } = await circuito();
  const cl = c.meta.cliente(restaurante.canal.phoneNumberId, '5222900010002', 'Grande');
  cl.pide([{ retailerId: 'huachinango', cantidad: 7 }]);
  await c.asienta();
  assert.deepEqual(await casos(c, restaurante.id), ['monto']);
  const pedidos = await c.almacen.de(restaurante.id).lista('pedidos');
  assert.equal(pedidos[0]!.estado, 'en_revision');
  assert.equal(pedidos[0]!.liga, undefined, 'no se generó cobro sin el dueño');
});

test('dos fallos de comprensión seguidos → traspaso; uno solo no', async () => {
  const { c, tienda } = await circuito();
  const cl = c.meta.cliente(tienda.canal.phoneNumberId, '5222800010003', 'Confusa');
  cl.escribe('asdkjh qwe');
  await c.asienta();
  assert.deepEqual(await casos(c, tienda.id), [], 'uno solo: el agente vuelve a preguntar con botones');
  assert.equal(cl.ultimo()!.mensaje.tipo, 'botones');
  cl.escribe('zzz xxy');
  await c.asienta();
  assert.deepEqual(await casos(c, tienda.id), ['comprension']);
});

test('presupuesto: turnos de la conversación y tokens del mes del inquilino agotados → traspaso, no silencio', async () => {
  const { c, tienda } = await circuito();
  const t = (await c.almacen.inquilino(tienda.id))!;
  await c.almacen.guardaInquilino({ ...t, politicas: { ...t.politicas, maxTurnosConversacion: 2 } });
  const cl = c.meta.cliente(tienda.canal.phoneNumberId, '5222800010004', 'Platicadora');
  for (const m of ['Hola', '¿Horario?', '¿Tienen rebozos?']) { cl.escribe(m); await c.asienta(); }
  assert.deepEqual(await casos(c, tienda.id), ['presupuesto']);
  const { c: c2, restaurante } = await circuito();
  const r = (await c2.almacen.inquilino(restaurante.id))!;
  await c2.almacen.guardaInquilino({ ...r, politicas: { ...r.politicas, presupuestoTokensMensual: 1 } });
  const cl2 = c2.meta.cliente(restaurante.canal.phoneNumberId, '5222900010005', 'Otra');
  cl2.escribe('¿Qué tienen?'); await c2.asienta();
  assert.equal(cl2.ultimo()!.mensaje.tipo, 'carrusel', 'sin presupuesto de IA, lo determinista sigue atendiendo');
  cl2.escribe('¿Me platicas cómo empezó el restaurante?'); await c2.asienta();
  cl2.escribe('¿Y quién cocina los domingos?'); await c2.asienta();
  assert.deepEqual(await casos(c2, restaurante.id), ['inquilino_sin_presupuesto']);
  assert.match(cl2.ultimo()!.resumen, /Doña Chela/, 'lo que necesita modelo, con la IA agotada, lo atiende la dueña: nadie se queda sin respuesta');
});

test('petición directa de una persona → traspaso', async () => {
  const { c, tienda } = await circuito();
  const cl = c.meta.cliente(tienda.canal.phoneNumberId, '5222800010006', 'Directa');
  cl.escribe('Quiero hablar con una persona real');
  await c.asienta();
  assert.deepEqual(await casos(c, tienda.id), ['solicitud']);
});

test('bandeja: el dueño toma el caso, responde por la API, lo libera y el agente vuelve', async () => {
  const { c, tienda } = await circuito();
  const cl = c.meta.cliente(tienda.canal.phoneNumberId, '5222800010007', 'Bandeja');
  cl.escribe('Pésimo servicio, nunca llegó mi pedido');
  await c.asienta();
  const b = await c.vendedor.panel.bandeja(tienda.id);
  assert.equal(b.casos.length, 1);
  const caso = b.casos[0]!;
  cl.escribe('¿Hola?');
  await c.asienta();
  assert.equal(cl.recibidos.length, 1, 'con el caso abierto el agente no contesta encima');
  assert.equal((await c.vendedor.panel.responde(tienda.id, caso.conversacionId, 'Hola, soy Martha')).ok, true, 'con el caso abierto la conversación ya es del dueño');
  await c.vendedor.panel.tomaCaso(tienda.id, caso.id);
  await c.vendedor.panel.responde(tienda.id, caso.conversacionId, 'Te reenvío hoy mismo, disculpa.');
  await c.asienta();
  assert.match(cl.ultimo()!.resumen, /reenvío/);
  await c.vendedor.panel.liberaCaso(tienda.id, caso.id);
  cl.escribe('¿Tienen huipiles rojos?');
  await c.asienta();
  assert.equal(cl.ultimo()!.mensaje.tipo, 'carrusel', 'liberado, el agente atiende otra vez');
});

test('coexistencia: el eco del dueño calla al agente 2 h en ese chat y no abre ventana', async () => {
  const { c, restaurante } = await circuito();
  const cl = c.meta.cliente(restaurante.canal.phoneNumberId, '5222900010008', 'Eco');
  cl.escribe('Hola');
  await c.asienta();
  c.meta.duenoContesta(restaurante.canal.phoneNumberId, cl.waId, '¡Hola! Aquí Doña Chela, ¿qué se te antoja?');
  await c.asienta();
  cl.escribe('¿Qué tienen?');
  await c.asienta();
  const recibidos = cl.recibidos.map((r) => r.resumen);
  assert.equal(recibidos.filter((r) => !r.startsWith('(dueño')).length, 1, 'el agente no habló encima del dueño');
  const conv = (await c.almacen.de(restaurante.id).lista('conversaciones'))[0]!;
  assert.equal(conv.estado, 'pausada_eco');
  c.reloj.avanza(2 * HORA + 1);
  cl.escribe('¿Qué tienen?');
  await c.asienta();
  assert.equal(cl.ultimo()!.mensaje.tipo, 'carrusel', 'pasadas 2 h, el agente vuelve');
});
