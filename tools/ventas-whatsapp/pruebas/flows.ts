/**
 * El endpoint de datos de los Flows: cifrado de ida y vuelta, ping, notificación de error, y los
 * rechazos (421 sin poder descifrar, 427 con token inválido o de otro inquilino, 432 sin firma).
 * La reserva de mesa corre completa por el Flow dinámico.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { cifraPeticionComoMeta, cifraRespuesta, descifraPeticion, descifraRespuestaComoMeta, firmaMeta, firmaTokenFlow, HORA } from '../dist/index.js';
import { circuito } from './_ayuda.ts';

test('cifrado: RSA-OAEP-SHA256 + AES-128-GCM de ida, IV invertido de vuelta', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const { peticion, llaveAes, iv } = cifraPeticionComoMeta({ version: '3.0', action: 'ping' }, publicKey);
  const claro = descifraPeticion(peticion, privateKey);
  assert.deepEqual(claro.datos, { version: '3.0', action: 'ping' });
  assert.equal(claro.llaveAes.length, 16);
  const vuelta = cifraRespuesta({ data: { status: 'active' } }, claro.llaveAes, claro.iv);
  assert.deepEqual(descifraRespuestaComoMeta(vuelta, llaveAes, iv), { data: { status: 'active' } });
  const alterada = { ...peticion, encrypted_flow_data: Buffer.from('basura').toString('base64') };
  assert.throws(() => descifraPeticion(alterada, privateKey), 'GCM detecta la alteración');
});

test('endpoint: ping, notificación de error, 432 sin firma, 421 sin poder descifrar; reserva completa por el Flow dinámico', async () => {
  const { c, restaurante } = await circuito();
  const llama = async (datos: object) => {
    const { peticion, llaveAes, iv } = cifraPeticionComoMeta(datos, c.llavePublicaFlows);
    const cuerpo = JSON.stringify(peticion);
    const r = await c.vendedor.flows.endpoint(cuerpo, firmaMeta(c.secretos.app, cuerpo));
    return { status: r.status, datos: r.status === 200 ? descifraRespuestaComoMeta(r.cuerpo, llaveAes, iv) : null };
  };
  assert.deepEqual(await llama({ version: '3.0', action: 'ping' }), { status: 200, datos: { data: { status: 'active' } } });
  assert.deepEqual(await llama({ version: '3.0', action: 'data_exchange', flow_token: 'x', data: { error: 'INVALID_SCREEN', error_message: 'x' } }), { status: 200, datos: { data: { acknowledged: true } } });
  const cuerpo = JSON.stringify({ encrypted_flow_data: 'x', encrypted_aes_key: 'y', initial_vector: 'z' });
  assert.equal((await c.vendedor.flows.endpoint(cuerpo, 'sha256=00')).status, 432);
  assert.equal((await c.vendedor.flows.endpoint(cuerpo, firmaMeta(c.secretos.app, cuerpo))).status, 421);

  const cl = c.meta.cliente(restaurante.canal.phoneNumberId, '5222900030001', 'Flows');
  cl.escribe('Quiero reservar mesa');
  await c.asienta();
  assert.equal(cl.ultimo()!.mensaje.tipo, 'flow');
  const reserva = await cl.llenaFlow({
    DIA: (d) => ({ servicio: 'mesa-6', dia: (d.dias as Array<{ id: string }>)[0]!.id }),
    HORA: (d) => ({ inicio: (d.horarios as Array<{ id: string }>)[0]!.id, servicio: d.servicio }),
  });
  assert.deepEqual(reserva.errores, []);
  assert.deepEqual(reserva.pantallas, ['DIA', 'HORA']);
  assert.match(String(reserva.cierre?.resumen), /Mesa para 6/);
  await c.asienta();
  assert.match(cl.ultimo()!.resumen, /Reservación confirmada: Mesa para 6/);
  const [cita] = await c.almacen.de(restaurante.id).lista('citas');
  assert.equal(cita!.estado, 'confirmada');
  // La mesa para 6 es una sola: su horario apartado ya no se ofrece a otro cliente.
  const otro = c.meta.cliente(restaurante.canal.phoneNumberId, '5222900030009', 'Segundo');
  otro.escribe('Quiero reservar mesa');
  await c.asienta();
  let ofrecidos: string[] = [];
  await otro.llenaFlow({
    DIA: (d) => ({ servicio: 'mesa-6', dia: (d.dias as Array<{ id: string }>)[0]!.id }),
    HORA: (d) => { ofrecidos = (d.horarios as Array<{ id: string }>).map((h) => h.id); return { inicio: ofrecidos[0], servicio: d.servicio }; },
  });
  assert.ok(!ofrecidos.includes(String(cita!.inicio)), 'el horario apartado ya no aparece');
});

test('endpoint: un flow_token vencido o de otro inquilino no da datos (427)', async () => {
  const { c, restaurante, tienda } = await circuito();
  const cl = c.meta.cliente(restaurante.canal.phoneNumberId, '5222900030002', 'Token');
  cl.escribe('Quiero reservar mesa');
  await c.asienta();
  // Un token firmado con OTRO secreto (lo que tendría quien intenta adivinar uno).
  const falso = firmaTokenFlow('otro-secreto', { t: restaurante.id, c: 'conv_x', w: 'x', f: 'reserva', e: Date.now() + HORA });
  const flow = cl.recibidos.find((r) => r.mensaje.tipo === 'flow')!.mensaje as { flowToken: string };
  (flow as { flowToken: string }).flowToken = falso;
  const r = await cl.llenaFlow({ DIA: { servicio: 'mesa-2', dia: '2026-10-06' } });
  assert.deepEqual(r.errores, ['HTTP 427']);
  // El token del restaurante presentado en una conversación de la tienda se rechaza en el orquestador.
  const bueno = firmaTokenFlow(c.secretos.tokensFlow, { t: restaurante.id, c: 'conv_5222800030003', w: '5222800030003', f: 'lead', e: c.reloj() + HORA });
  const cliTienda = c.meta.cliente(tienda.canal.phoneNumberId, '5222800030003', 'Ajena');
  cliTienda.escribe('Hola');
  await c.asienta();
  cliTienda.recibe({ wamid: 'x', instante: c.reloj(), resumen: '', mensaje: { tipo: 'flow', cuerpo: '', cta: '', flowId: tienda.canal.flows.lead!, flowToken: bueno, pantalla: 'CALIFICA' } });
  await cliTienda.llenaFlow({ CALIFICA: { presupuesto: 'mas_1500', cuando: 'hoy', zona: 'Xalapa' } });
  await c.asienta();
  assert.match(cliTienda.ultimo()!.resumen, /venció/);
  const bit = await c.almacen.de(tienda.id).lista('bitacora');
  assert.ok(bit.some((b) => b.tipo === 'flow_rechazado'));
  assert.equal((await c.almacen.de(tienda.id).lista('leads')).length, 0, 'no se calificó un lead con un token ajeno');
});
