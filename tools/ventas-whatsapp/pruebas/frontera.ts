/**
 * La frontera del número (brecha del C3): una granja de contactos nuevos no quema modelo ni entierra
 * la bandeja, los clientes que ya existían siguen atendidos, una ráfaga de mensajes deja al agente
 * sin modelo pero con respuestas fijas y traspasos, y la lista de bloqueo del dueño.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HORA, LIMITE_POR_NUMERO, CORTESIA_RAFAGA } from '../dist/index.js';
import { circuito } from './_ayuda.ts';

const PREGUNTA_CON_MODELO = '¿Me platicas cómo empezó el restaurante?';

test('granja: los primeros 40 contactos nuevos de la hora pasan; los demás, una cortesía y nada más', async () => {
  const { c, restaurante } = await circuito();
  const datos = c.almacen.de(restaurante.id);
  const conocido = c.meta.cliente(restaurante.canal.phoneNumberId, '5222900099999', 'Cliente de siempre');
  conocido.escribe('Hola'); await c.asienta();
  c.reloj.avanza(2 * HORA);
  const granja = Array.from({ length: 60 }, (_, n) => c.meta.cliente(restaurante.canal.phoneNumberId, `52229${String(800000 + n).padStart(7, '0')}`, `Granja ${n}`));
  for (const g of granja) { g.escribe(PREGUNTA_CON_MODELO); await c.asienta(); c.reloj.avanza(20_000); }
  const llamadas = (await datos.lista('usoIa')).length;
  assert.equal(llamadas, LIMITE_POR_NUMERO.contactosNuevos, 'solo los primeros 40 llegan al modelo');
  for (const g of granja.slice(LIMITE_POR_NUMERO.contactosNuevos)) {
    assert.equal(g.recibidos.length, 1);
    assert.equal(g.ultimo()!.resumen, CORTESIA_RAFAGA(restaurante.nombre));
  }
  // Un contenido que insiste no recibe otra cortesía ni gasta modelo.
  const insistente = granja.at(-1)!;
  insistente.escribe('¿Hola? ¿Me atienden?'); await c.asienta();
  assert.equal(insistente.recibidos.length, 1);
  assert.equal((await datos.lista('usoIa')).length, llamadas);
  // El cliente que ya existía sigue atendido en plena ráfaga.
  const antes = conocido.recibidos.length;
  conocido.escribe('¿Qué tienen?'); await c.asienta();
  assert.ok(conocido.recibidos.length > antes, 'un cliente de antes nunca cae en contención');
  const graves = (await datos.lista('alertas')).filter((a) => a.texto.startsWith('Ráfaga de contactos nuevos'));
  assert.equal(graves.length, 1, 'un solo aviso por ventana');
  assert.equal((await datos.lista('casos')).length, 0, 'la granja no llega a la bandeja');
});

test('pasada la ventana, un contacto que quedó contenido vuelve a ser atendido', async () => {
  const { c, tienda } = await circuito();
  const limites = { contactosNuevos: 2, mensajes: 1_000, ventanaMs: HORA };
  await c.vendedor.panel.alta({ ...tienda, politicas: { ...tienda.politicas, frontera: limites } });
  const [a, b, tercero] = [1, 2, 3].map((n) => c.meta.cliente(tienda.canal.phoneNumberId, `522281000${n}00`, `C${n}`));
  for (const x of [a, b, tercero]) { x!.escribe('Hola'); await c.asienta(); }
  assert.equal(tercero!.ultimo()!.resumen, CORTESIA_RAFAGA(tienda.nombre));
  c.reloj.avanza(HORA + 1);
  tercero!.escribe('¿Qué tienen?'); await c.asienta();
  assert.notEqual(tercero!.ultimo()!.resumen, CORTESIA_RAFAGA(tienda.nombre));
  assert.ok(tercero!.recibidos.length >= 2);
});

test('ráfaga de mensajes en el número: sin modelo, pero con respuestas fijas y traspasos', async () => {
  const { c, restaurante } = await circuito();
  await c.vendedor.panel.alta({ ...restaurante, politicas: { ...restaurante.politicas, frontera: { contactosNuevos: 1_000, mensajes: 5, ventanaMs: HORA } } });
  const datos = c.almacen.de(restaurante.id);
  const cl = c.meta.cliente(restaurante.canal.phoneNumberId, '5222900077777', 'Ráfaga');
  for (let i = 0; i < 6; i++) { cl.escribe('Hola'); await c.asienta(); }
  const antes = (await datos.lista('usoIa')).length;
  cl.escribe(PREGUNTA_CON_MODELO); await c.asienta();
  assert.equal((await datos.lista('usoIa')).length, antes, 'en la ráfaga no se gasta modelo');
  assert.match(cl.ultimo()!.resumen, /muchos mensajes/);
  cl.escribe('¿Cuál es su horario?'); await c.asienta();
  assert.match(cl.ultimo()!.resumen, /8:00 a 22:00/, 'lo determinista sigue respondiendo');
  cl.escribe('Pésimo servicio, nunca llegó mi pedido'); await c.asienta();
  assert.deepEqual((await datos.lista('casos')).map((x) => x.motivo), ['queja'], 'una queja sigue llegando al dueño');
  assert.equal((await datos.lista('alertas')).filter((a) => a.texto.startsWith('Ráfaga de mensajes')).length, 1);
});

test('lista de bloqueo: el dueño bloquea desde la bandeja; se guarda, no se responde, queda en la cadena', async () => {
  const { c, tienda, restaurante } = await circuito();
  const datos = c.almacen.de(tienda.id);
  const cl = c.meta.cliente(tienda.canal.phoneNumberId, '5222810055555', 'Molesto');
  cl.escribe('Hola'); await c.asienta();
  const conv = (await datos.lista('conversaciones'))[0]!;
  const bloqueado = await c.vendedor.panel.bloquea(tienda.id, conv.id, 'mensajes ofensivos');
  assert.equal(bloqueado?.bloqueado?.motivo, 'mensajes ofensivos');
  const recibidos = cl.recibidos.length;
  cl.escribe('¿Qué tienen?'); await c.asienta();
  assert.equal(cl.recibidos.length, recibidos, 'bloqueado: no se le responde');
  const entrantes = (await datos.lista('mensajes')).filter((m) => m.direccion === 'entrante').sort((x, y) => x.instante - y.instante);
  assert.equal(entrantes.length, 2, 'pero su mensaje se guarda');
  const leidos = c.meta.registro.filter((r) => r.tipo === 'leido').map((r) => r.detalle);
  assert.ok(leidos.some((l) => l.endsWith(entrantes[0]!.wamid)), 'el primero, que se atendió, sí se marcó como leído');
  assert.ok(!leidos.some((l) => l.endsWith(entrantes[1]!.wamid)), 'el del bloqueado no se marca como leído');
  assert.equal(await c.vendedor.panel.bloquea(restaurante.id, conv.id, 'x'), null, 'otro inquilino no ve la conversación');
  await assert.rejects(c.vendedor.panel.bloquea('inquilino_inexistente', conv.id, 'x'), /inquilino desconocido/);
  await c.vendedor.panel.bloquea(tienda.id, conv.id, null);
  cl.escribe('¿Qué tienen?'); await c.asienta();
  assert.ok(cl.recibidos.length > recibidos, 'desbloqueado, se le vuelve a atender');
  await c.vendedor.trazabilidad?.drena();
  const acciones = (await datos.lista('cadena')).filter((e) => e.tipo === 'ACCION_DUENO').map((e) => e.datos.accion);
  assert.deepEqual(acciones, ['bloquear', 'desbloquear']);
});
