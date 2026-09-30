/**
 * Lo que se endureció al revisar «formas en que esto podría estar mal»: la cola durable (un
 * proceso que se cae después del 200 no pierde el mensaje), la ventana de atribución de 7 días, el
 * límite por remitente (denial-of-wallet) y el «escribiendo…» solo cuando el agente contesta.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { almacenEnMemoria, creaVendedor, firmaMeta, modeloSimulado, idsSecuenciales, DIA } from '../dist/index.js';
import { colaEnArchivo } from '../dist/almacen/archivo.js';
import { restaurante } from '../dist/laboratorio/index.js';
import { circuito } from './_ayuda.ts';

test('cola durable: el proceso se cae después del 200 y el mensaje se procesa al reanudar, una sola vez', async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'cola-vw-'));
  const almacen = almacenEnMemoria();
  await almacen.guardaInquilino(restaurante({ wabaId: 'W', phoneNumberId: 'P', telefonoVisible: '5222900000001', datasetId: 'D', catalogoId: 'C', flows: {} }));
  const enviados: string[] = [];
  const graph = { async enviaMensaje(_: string, c: Record<string, unknown>) { enviados.push(String(c.to)); return { ok: true as const, wamid: `w${enviados.length}` }; }, async marcaLeido() { return true; }, async creaQr() { return { ok: false as const, error: 'x' }; }, async enviaEventos() { return { ok: false as const, codigo: 1, error: 'x' }; } };
  const pagos = { nombre: 'x', async creaLiga() { return { ok: false as const, error: 'x' }; }, leeWebhook: () => ({ ok: false as const, error: 'x' }), async reporte() { return []; } };
  const base = { almacen, graph, pagos, modelo: modeloSimulado(), secretos: { app: 'secreto-app-0123456789', verifyToken: 'v', tokensFlow: 't' }, llavePrivadaFlows: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey, dominiosLiga: [], ids: idsSecuenciales() };
  const cuerpo = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'W', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: 'P', display_phone_number: '1' }, contacts: [{ profile: { name: 'A' }, wa_id: '5222912345678' }], messages: [{ from: '5222912345678', id: 'wamid.CAIDA', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Hola, ¿qué tienen?' } }] } }] }] });
  const primero = creaVendedor({ ...base, colaDurable: colaEnArchivo(carpeta) });
  assert.equal(primero.webhook.recibe(cuerpo, firmaMeta('secreto-app-0123456789', cuerpo)).status, 200);
  // «Se cae» antes de trabajar: no se drena. El lote quedó en disco.
  assert.equal(readdirSync(carpeta).filter((f) => f.endsWith('.json')).length, 1);
  const segundo = creaVendedor({ ...base, colaDurable: colaEnArchivo(carpeta) });
  assert.equal(segundo.reanudados, 1);
  await segundo.webhook.drena();
  assert.equal(enviados.length, 1, 'se contestó al reanudar');
  assert.equal(readdirSync(carpeta).filter((f) => f.endsWith('.json')).length, 0, 'el lote se borró al procesarse');
  // Si el primero también reviviera y lo procesara, la idempotencia por wamid lo frena.
  const tercero = creaVendedor({ ...base, colaDurable: colaEnArchivo(carpeta) });
  tercero.webhook.recibe(cuerpo, firmaMeta('secreto-app-0123456789', cuerpo));
  await tercero.webhook.drena();
  assert.equal(enviados.length, 1);
});

test('atribución: un anuncio atribuye 7 días; después, el pedido nuevo cuenta como directo (y el viejo sigue en su campaña)', async () => {
  const { c, restaurante: r } = await circuito();
  const camp = c.meta.anuncios.creaCampana('Octubre', 20_000);
  await c.vendedor.panel.registraGasto(r.id, camp.id, camp.nombre, camp.gastoCentavos, camp.anuncios);
  const cl = c.meta.cliente(r.canal.phoneNumberId, '5222900080001', 'Vuelve');
  const compra = async () => {
    cl.pide([{ retailerId: 'picadas', cantidad: 1 }]); await c.asienta();
    await cl.llenaFlow({ ENTREGA: { zona: 'Centro', direccion: 'x', horario: 'lo-antes-posible', recoger: false }, RESUMEN: { confirmar: true } }); await c.asienta();
    await c.procesador.paga(c.procesador.ligaDeUrl((cl.ultimo()!.mensaje as { url: string }).url)!.id); await c.asienta();
  };
  cl.llegaPorAnuncio(camp.anuncios[0]!, 'Hola'); await c.asienta();
  await compra();
  c.reloj.avanza(9 * DIA);
  cl.escribe('Hola otra vez'); await c.asienta();
  await compra();
  const t = await c.vendedor.panel.tablero(r.id);
  assert.equal(t.filas.find((f) => f.canal === 'Octubre')!.pedidosPagados, 1);
  assert.equal(t.filas.find((f) => f.canal === 'directo')!.pedidosPagados, 1);
  assert.equal(c.meta.capi.aceptados.filter((e) => e.event_name === 'Purchase').length, 1, 'la segunda compra no se reporta al anuncio');
});

test('límite por remitente: más de 20 mensajes en 10 minutos y el agente deja de gastar modelo (y avisa)', async () => {
  const { c, tienda } = await circuito();
  const cl = c.meta.cliente(tienda.canal.phoneNumberId, '5222800080002', 'Ráfaga');
  for (let k = 0; k < 25; k++) cl.escribe(`¿tienen rebozo ${k}?`);
  await c.asienta();
  const datos = c.almacen.de(tienda.id);
  assert.equal(cl.recibidos.length, 20, 'contestó 20 y se detuvo');
  assert.ok((await datos.lista('bitacora')).filter((b) => b.tipo === 'limite_remitente').length >= 5);
  assert.equal((await datos.lista('alertas')).filter((a) => /rebasó/.test(a.texto)).length, 1, 'una sola alerta, no una por mensaje');
});

test('«escribiendo…» solo cuando el agente va a contestar: no si la conversación la lleva el dueño', async () => {
  const { c, restaurante: r } = await circuito();
  const leidos: string[] = [];
  const original = c.meta.graph.marcaLeido;
  c.meta.graph.marcaLeido = async (pn, wamid) => { leidos.push(wamid); return original(pn, wamid); };
  const cl = c.meta.cliente(r.canal.phoneNumberId, '5222900080003', 'Humano');
  cl.escribe('Quiero hablar con una persona real'); await c.asienta();
  const antes = leidos.length;
  cl.escribe('¿Sigues ahí?'); await c.asienta();
  assert.equal(leidos.length, antes, 'con el caso abierto no se simula que el agente escribe');
});
