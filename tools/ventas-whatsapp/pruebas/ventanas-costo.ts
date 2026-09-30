/**
 * Ventanas de 24 h y 72 h y el precio por mensaje: la regla de Meta (lo que decide el simulador)
 * y lo que la app estima y registra desde el `pricing` de cada estado.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidePrecio, registraEntrante, registraSaliente, TARJETA_LABORATORIO, HORA, DIA } from '../dist/index.js';
import { circuito } from './_ayuda.ts';

const T = TARJETA_LABORATORIO;
const ANTES = Date.parse('2026-09-20T18:00:00Z');
const DESPUES = Date.parse('2026-10-05T18:00:00Z');
const precio = (categoria: 'service' | 'utility' | 'marketing', v: object, ahora: number, servicioEnElMes = 0) => decidePrecio({ categoria, ventanas: v, ahora, pais: 'MX', servicioEnElMes, tarjeta: T });

test('ventana de atención: 24 h desde el último mensaje del cliente; fuera, 131047 para texto libre', () => {
  const v = registraEntrante({}, DESPUES, false);
  assert.equal(precio('service', v, DESPUES + 23 * HORA).permitido, true);
  const fuera = precio('service', v, DESPUES + 24 * HORA);
  assert.equal(fuera.permitido, false);
  assert.equal(fuera.errorMeta?.codigo, 131047);
  assert.equal(precio('utility', v, DESPUES + 30 * HORA).permitido, true, 'una plantilla sí sale fuera de la ventana');
});

test('entrada gratis (CTWA): responder antes de 24 h abre 72 h en las que TODO es gratis', () => {
  let v = registraEntrante({}, DESPUES, true);
  const primera = precio('service', v, DESPUES + HORA);
  assert.equal(primera.tipo, 'free_entry_point');
  v = registraSaliente(v, DESPUES + HORA);
  assert.ok(v.fep && v.fep.venceEn === DESPUES + HORA + 72 * HORA);
  const marketing = precio('marketing', v, DESPUES + 60 * HORA);
  assert.deepEqual([marketing.billable, marketing.tipo], [false, 'free_entry_point'], 'hasta marketing es gratis en la FEP');
  const libreEnFep = precio('service', v, DESPUES + 60 * HORA);
  assert.equal(libreEnFep.permitido, true, 'dentro de la FEP el texto libre sale aunque la CSW haya cerrado');
  assert.equal(precio('marketing', v, DESPUES + HORA + 73 * HORA).billable, true, 'vencida la FEP, se cobra');
});

test('anuncio respondido después de 24 h: no abre FEP', () => {
  let v = registraEntrante({}, DESPUES, true);
  v = registraSaliente(v, DESPUES + 25 * HORA);
  assert.equal(v.fep, undefined);
});

test('desde el 1/oct/2026: servicio gratis hasta el cupo mensual (1,000, NO verificado) y luego a tarifa de utilidad', () => {
  const v = registraEntrante({}, DESPUES, false);
  assert.equal(precio('service', v, ANTES).billable, false, 'antes del 1/oct el servicio era gratis');
  const enCupo = precio('service', v, DESPUES, 999);
  assert.deepEqual([enCupo.billable, enCupo.usaCupo], [false, true]);
  const fueraDeCupo = precio('service', v, DESPUES, 1000);
  assert.deepEqual([fueraDeCupo.billable, fueraDeCupo.costoMicros], [true, T.paises.MX!.utility]);
  assert.equal(T.cupoServicioMensual.verificado, false, 'el cupo está marcado como no verificado contra Meta');
});

test('utilidad dentro de la ventana: gratis antes del 1/oct/2026, cobrada después', () => {
  const vAntes = registraEntrante({}, ANTES, false);
  assert.equal(precio('utility', vAntes, ANTES + HORA).billable, false);
  const vDespues = registraEntrante({}, DESPUES, false);
  const d = precio('utility', vDespues, DESPUES + HORA);
  assert.deepEqual([d.billable, d.tipo, d.costoMicros], [true, 'regular', T.paises.MX!.utility]);
});

test('el cobro llega en el `pricing` de los estados y el tablero lo suma por conversación', async () => {
  const { c, tienda } = await circuito();
  const cl = c.meta.cliente(tienda.canal.phoneNumberId, '5222812345678', 'Luisa');
  cl.escribe('Hola, ¿horario?');
  await c.asienta();
  // Otro día, fuera de la ventana: el aviso de pago sale como plantilla de utilidad cobrada.
  const datos = c.almacen.de(tienda.id);
  const salientes = (await datos.lista('mensajes')).filter((m) => m.direccion === 'saliente');
  assert.equal(salientes.length, 1);
  assert.equal(salientes[0]!.precio?.categoria, 'service');
  assert.equal(salientes[0]!.precio?.tipo, 'free_customer_service', 'dentro del cupo del mes');
  c.reloj.avanza(2 * DIA);
  cl.escribe('¿Tienen huipiles?');
  await c.asienta();
  const t = await c.vendedor.panel.tablero(tienda.id);
  assert.equal(t.tarjeta.verificada, false);
  assert.equal(t.porConversacion.conversaciones, 1);
  assert.ok(t.porConversacion.mensajesSalientes >= 2);
});
