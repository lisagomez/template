/**
 * El cronómetro de ventanas: cuánto queda de las 24 h y de las 72 h, el plazo para contestar un
 * anuncio, qué costaría el siguiente mensaje, y el aviso al dueño (una vez por ventana) cuando una
 * conversación que lleva él está por cerrar.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cronometro, formatoRestante, registraEntrante, registraSaliente, HORA } from '../dist/index.js';
import { circuito } from './_ayuda.ts';

const INICIO = Date.parse('2026-10-05T18:00:00Z');

test('cronómetro: 24 h, anuncio por responder, 72 h gratis y el costo del siguiente mensaje', () => {
  let v = registraEntrante({}, INICIO, false);
  let c = cronometro(v, INICIO + 23 * HORA);
  assert.equal(c.atencion.abierta, true);
  assert.equal(formatoRestante(c.atencion.restanteMs), '1 h 0 min');
  assert.equal(c.siguiente, 'cupo_o_utilidad');
  assert.match(c.aviso ?? '', /24 h cierra en 1 h 0 min/);
  assert.equal(cronometro(v, INICIO + 25 * HORA).siguiente, 'solo_plantilla');
  v = registraEntrante({}, INICIO, true);
  c = cronometro(v, INICIO + 23 * HORA);
  assert.equal(c.siguiente, 'gratis_anuncio');
  assert.match(c.aviso ?? '', /abre 72 h gratis/);
  v = registraSaliente(v, INICIO + HORA);
  c = cronometro(v, INICIO + 72 * HORA);
  assert.equal(c.entradaGratis.abierta, true);
  assert.equal(formatoRestante(c.entradaGratis.restanteMs), '1 h 0 min');
  assert.equal(c.siguiente, 'gratis_anuncio', 'dentro de la FEP todo es gratis aunque la CSW cerró');
});

test('aviso al dueño: la conversación que lleva él y cierra en < 2 h, una sola vez por ventana; la bandeja trae el cronómetro', async () => {
  const { c, restaurante } = await circuito();
  const cl = c.meta.cliente(restaurante.canal.phoneNumberId, '5222900090001', 'Esperando');
  cl.escribe('Quiero hablar con una persona real');
  await c.asienta();
  c.reloj.avanza(22 * HORA + 30 * 60_000);
  const avisos = await c.vendedor.panel.revisaVentanas(restaurante.id);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0]!, /cierra en 1 h 30 min/);
  assert.equal((await c.vendedor.panel.revisaVentanas(restaurante.id)).length, 0, 'no se repite');
  const b = await c.vendedor.panel.bandeja(restaurante.id);
  assert.equal(b.casos[0]!.ventana?.siguiente, 'cupo_o_utilidad');
  assert.ok(b.alertas.some((a) => /cierra en/.test(a.texto)));
  const libre = c.meta.cliente(restaurante.canal.phoneNumberId, '5222900090002', 'Con el agente');
  libre.escribe('Hola');
  await c.asienta();
  c.reloj.avanza(23 * HORA);
  assert.equal((await c.vendedor.panel.revisaVentanas(restaurante.id)).filter((a) => a.includes('5222900090002')).length, 0, 'lo que atiende el agente no molesta al dueño');
});
