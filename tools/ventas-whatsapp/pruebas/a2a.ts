/**
 * Fase 3 — `pedidos` y `atribucion` como agentes A2A reales (SDK @a2a-js/sdk 1.1.0, JSON-RPC,
 * protocolo 1.0) detrás de la pasarela: Agent Card firmada y verificada, tarjeta falsa o alterada
 * rechazada, `tenant` del token que manda, «no autorizado» = «no existe», `ListTasks` cerrado.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { A2A_VERSION_HEADER } from '@a2a-js/sdk';
import { creaCircuitoA2A, emiteTokenA2A, firmaTarjeta, tarjetaVerificada, BASE_A2A, KID_PLATAFORMA } from '../dist/a2a/index.js';
import { FLOWS } from './_ayuda.ts';

async function preparado() {
  const c = creaCircuitoA2A({ flows: FLOWS });
  const pymes = await c.prepara();
  return { c, ...pymes };
}

const rpc = (metodo: string, params: object) => JSON.stringify({ jsonrpc: '2.0', id: 1, method: metodo, params });

test('el circuito completo corre con pedidos y atribución remotos por A2A', async () => {
  const { c, restaurante } = await preparado();
  const camp = c.meta.anuncios.creaCampana('A2A', 30_000);
  await c.vendedor.panel.registraGasto(restaurante.id, camp.id, camp.nombre, camp.gastoCentavos, camp.anuncios);
  const cl = c.meta.cliente(restaurante.canal.phoneNumberId, '5222900050001', 'Remota');
  cl.llegaPorAnuncio(camp.anuncios[0]!, 'Hola');
  await c.asienta();
  cl.pide([{ retailerId: 'picadas', cantidad: 2 }]);
  await c.asienta();
  await cl.llenaFlow({ ENTREGA: { zona: 'Reforma', direccion: 'x', horario: 'lo-antes-posible', recoger: false }, RESUMEN: { confirmar: true } });
  await c.asienta();
  await c.procesador.paga(c.procesador.ligaDeUrl((cl.ultimo()!.mensaje as { url: string }).url)!.id);
  await c.asienta();
  const [pedido] = await c.almacen.de(restaurante.id).lista('pedidos');
  assert.match(pedido!.id, /^ped_r/, 'lo creó el agente remoto');
  assert.equal(pedido!.estado, 'pagado');
  assert.equal(c.meta.capi.aceptados.filter((e) => e.event_name === 'Purchase').length, 1);
  const trazas = c.pasarela().trazas;
  assert.ok(trazas.length >= 4 && trazas.every((t) => t.tenant === restaurante.id && t.resultado === 'ok'), JSON.stringify(trazas.slice(0, 3)));
  assert.ok(trazas.some((t) => t.dominio === 'pedidos') && trazas.some((t) => t.dominio === 'atribucion'));
});

test('Agent Card: firmada (JWS, ES256) y verificada; la alterada y la de otra llave se rechazan', async () => {
  const { c } = await preparado();
  const pasarela = c.pasarela();
  const enProceso: typeof fetch = async (u, i) => pasarela.atiende(new Request(u, i));
  const url = `${BASE_A2A}/a2a/pedidos/.well-known/agent-card.json`;
  const card = await tarjetaVerificada(url, enProceso, c.verificador);
  assert.equal(card.signatures.length, 1);
  assert.equal(card.supportedInterfaces[0]!.protocolVersion, '1.0');
  const alterada: typeof fetch = async () => new Response(JSON.stringify({ ...card, skills: [...card.skills, { ...card.skills[0]!, id: 'transferir_dinero' }] }));
  await assert.rejects(tarjetaVerificada(url, alterada, c.verificador), /no verifica/);
  const otra = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const falsa = await firmaTarjeta({ ...card, signatures: [] }, otra.privateKey, KID_PLATAFORMA);
  await assert.rejects(tarjetaVerificada(url, async () => new Response(JSON.stringify(falsa)), c.verificador), /no verifica/);
});

test('pasarela: sin token 401; tenant ajeno, dominio no permitido y tarea ajena → el MISMO «no existe»; ListTasks cerrado', async () => {
  const { c, restaurante, tienda } = await preparado();
  const p = c.pasarela();
  const ahora = c.reloj();
  const llama = (dominio: string, cuerpo: string, token?: string) => p.atiende(new Request(`${BASE_A2A}/a2a/${dominio}`, {
    method: 'POST', headers: { 'content-type': 'application/json', [A2A_VERSION_HEADER]: '1.0', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: cuerpo,
  }));
  const tokRest = emiteTokenA2A(c.secretoTokens, { tenant: restaurante.id, dominios: ['pedidos', 'atribucion'], exp: ahora + 60_000 });
  const tokSoloAtrib = emiteTokenA2A(c.secretoTokens, { tenant: tienda.id, dominios: ['atribucion'], exp: ahora + 60_000 });
  const mensaje = (tenant: string) => rpc('SendMessage', { tenant, message: { messageId: 'm1', contextId: 'ctx', role: 'ROLE_USER', parts: [{ data: { skill: 'estado_pedido', datos: { pedidoId: 'x' } } }] } });

  assert.equal((await llama('pedidos', mensaje(restaurante.id))).status, 401);
  const ajeno = await (await llama('pedidos', mensaje(tienda.id), tokRest)).json() as { error: { code: number; message: string } };
  const sinPermiso = await (await llama('pedidos', mensaje(tienda.id), tokSoloAtrib)).json() as { error: { code: number; message: string } };
  const noExiste = await (await llama('pedidos', rpc('GetTask', { tenant: restaurante.id, id: 'task-que-no-existe' }), tokRest)).json() as { error: { code: number; message: string } };
  assert.deepEqual(ajeno.error, sinPermiso.error);
  assert.deepEqual(ajeno.error, noExiste.error, 'no autorizado y no existe son indistinguibles');

  const propio = await (await llama('pedidos', mensaje(restaurante.id), tokRest)).json() as { result?: { task?: { id: string } } };
  const idTarea = propio.result?.task?.id;
  assert.ok(idTarea, JSON.stringify(propio));
  const tokTienda = emiteTokenA2A(c.secretoTokens, { tenant: tienda.id, dominios: ['pedidos'], exp: ahora + 60_000 });
  const robada = await (await llama('pedidos', rpc('GetTask', { tenant: tienda.id, id: idTarea }), tokTienda)).json() as { error: { code: number; message: string } };
  assert.deepEqual(robada.error, noExiste.error, 'la tarea del restaurante no existe para la tienda');
  const lista = await (await llama('pedidos', rpc('ListTasks', { tenant: restaurante.id }), tokRest)).json() as { error: { code: number } };
  assert.equal(lista.error.code, -32601);
  const vencido = emiteTokenA2A(c.secretoTokens, { tenant: restaurante.id, dominios: ['pedidos'], exp: ahora - 1 });
  assert.equal((await llama('pedidos', mensaje(restaurante.id), vencido)).status, 401);
});

test('propósito: el token de una agencia solo puede leer el reporte de ROAS (agregado, sin datos de clientes)', async () => {
  const { c, restaurante } = await preparado();
  const p = c.pasarela();
  const cl = c.meta.cliente(restaurante.canal.phoneNumberId, '5222900050009', 'Cliente de la agencia');
  cl.escribe('Hola'); await c.asienta();
  const agencia = emiteTokenA2A(c.secretoTokens, { tenant: restaurante.id, dominios: ['atribucion'], skills: ['reporte_roas'], proposito: 'agencia de anuncios', exp: c.reloj() + 60_000 });
  const pide = (skill: string) => p.atiende(new Request(`${BASE_A2A}/a2a/atribucion`, {
    method: 'POST', headers: { 'content-type': 'application/json', [A2A_VERSION_HEADER]: '1.0', authorization: `Bearer ${agencia}` },
    body: rpc('SendMessage', { tenant: restaurante.id, message: { messageId: crypto.randomUUID(), contextId: 'ctx_agencia', role: 'ROLE_USER', parts: [{ data: { skill, datos: { nombre: 'Purchase', conversacionId: 'x' } } }] } }),
  }));
  const reporte = await (await pide('reporte_roas')).json() as { result?: { task?: { status?: { state?: string }; artifacts?: Array<{ parts?: Array<{ data?: Record<string, unknown> }> }> } } };
  assert.equal(reporte.result?.task?.status?.state, 'TASK_STATE_COMPLETED');
  const texto = JSON.stringify(reporte.result?.task?.artifacts);
  assert.ok(texto.includes('directo') && !texto.includes('5222900050009'), 'agregado por canal y sin teléfonos');
  const fuera = await (await pide('reportar_conversion')).json() as { error?: { code: number } };
  assert.equal(fuera.error?.code, -32001, 'mandar conversiones no es su propósito: «no existe»');
  assert.ok(p.trazas.some((t) => t.resultado === 'fuera_de_proposito'));
});
