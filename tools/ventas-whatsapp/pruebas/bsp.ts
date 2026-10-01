/**
 * El BSP propio (N-02): alta de pymes por Embedded Signup (código de 30 s, token a la bóveda,
 * webhooks, crédito, registro), el número del pool cuando la pyme no trae uno (N-01), la baja, y el
 * cobro: factura por modalidad, conciliación con Meta y el tope de crédito que no corta el servicio.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { almacenEnMemoria, bovedaEnMemoria, concilia, creaBsp, creaGestorNumeros, estadoCredito, facturaMes, leeEventoSignup, poolEnMemoria, relojManual, type ModalidadBsp, type Mensaje } from '../dist/index.js';
import { creaMetaBspSimulada, creaRegistroNumerosSimulado } from '../dist/simulador/index.js';
import { restaurante, tienda } from '../dist/laboratorio/index.js';

const INICIO = Date.parse('2026-10-05T18:00:00Z');

function banco(modalidad: ModalidadBsp, monedaPreferida = 'MXN') {
  const reloj = relojManual(INICIO);
  const meta = creaMetaBspSimulada({ reloj });
  const almacen = almacenEnMemoria();
  const boveda = bovedaEnMemoria();
  const registro = creaRegistroNumerosSimulado({ reloj, portafolioVerificado: true });
  const pool = poolEnMemoria();
  const numeros = creaGestorNumeros({ pool, meta: registro.registro, buzon: registro.buzon, reloj, pin: () => '135790' });
  const bsp = creaBsp({ graph: meta.graph, boveda, almacen, reloj, modalidad, lineaCredito: { id: 'linea_credito_lab', monedaPreferida }, pin: () => '246801', numeros });
  return { reloj, meta, almacen, boveda, bsp, numeros, pool };
}

test('Tech Provider: FINISH → token a la bóveda, webhooks, registro; el canal espera el método de pago de la pyme', async () => {
  const { meta, almacen, boveda, bsp } = banco('tech_provider');
  const s = meta.signup({ wabaId: 'waba_restaurante', businessId: 'bm_1', phoneNumberId: 'pn_restaurante', catalogIds: ['cat_1'], datasetIds: ['ds_1'] });
  const evento = leeEventoSignup(s.mensaje)!;
  assert.equal(evento.tipo, 'fin');
  const a = await bsp.completa({ inquilinoId: 'pyme_restaurante', code: s.code, recibidoEn: s.recibidoEn, evento, perfil: restaurante, telefonoVisible: '+52 229 100 0001' });
  assert.ok(!('rechazo' in a));
  assert.equal(a.estado, 'falta_metodo_pago');
  assert.deepEqual(a.pasos.map((p) => p.paso), ['canjear_codigo', 'suscribir_webhooks', 'registrar', 'inquilino']);
  assert.deepEqual(meta.suscritas(), ['waba_restaurante']);
  assert.equal(meta.registrado('pn_restaurante'), 'waba_restaurante');
  const i = await almacen.inquilino('pyme_restaurante');
  assert.equal(i?.estado, 'pausado');
  assert.equal(i?.canal.catalogoId, 'cat_1');
  assert.equal(boveda.cuantos(), 1);
  const token = await boveda.lee('waba_restaurante');
  assert.ok(token && !JSON.stringify(almacen.volcado()).includes(token), 'el token vive solo en la bóveda');
  assert.ok(!JSON.stringify(bsp.altas()).includes(token) && !JSON.stringify(bsp.altas()).includes('246801'), 'ni el token ni el PIN en el alta');
  assert.equal((await bsp.confirmaMetodoPago('waba_restaurante'))?.estado, 'activa');
  assert.equal((await almacen.inquilino('pyme_restaurante'))?.estado, 'activo');
  const otra = await bsp.completa({ inquilinoId: 'pyme_restaurante', code: s.code, recibidoEn: s.recibidoEn, evento, perfil: restaurante, telefonoVisible: '' });
  assert.ok(!('rechazo' in otra) && otra.estado === 'activa', 'el alta es idempotente por WABA');
});

test('el código vive 30 s y sirve una vez; abandonos y errores quedan en el embudo sin crear nada', async () => {
  const { meta, reloj, bsp, almacen } = banco('tech_provider');
  const s = meta.signup({ wabaId: 'waba_tienda', businessId: 'bm_2', phoneNumberId: 'pn_tienda' });
  reloj.avanza(31_000);
  const tarde = await bsp.completa({ inquilinoId: 'pyme_tienda', code: s.code, recibidoEn: s.recibidoEn, evento: leeEventoSignup(s.mensaje)!, perfil: tienda, telefonoVisible: '' });
  assert.ok('rechazo' in tarde && /30 s/.test(tarde.rechazo));
  const ab = meta.signup({ wabaId: 'waba_x', businessId: 'bm_3', abandonaEn: 'PHONE_NUMBER_VERIFICATION' });
  const r = await bsp.completa({ inquilinoId: 'pyme_x', code: ab.code, recibidoEn: ab.recibidoEn, evento: leeEventoSignup(ab.mensaje)!, perfil: tienda, telefonoVisible: '' });
  assert.ok('rechazo' in r);
  assert.deepEqual(bsp.embudo().map((e) => e.resultado), ['abandono en PHONE_NUMBER_VERIFICATION']);
  assert.equal((await almacen.inquilinos()).length, 0);
  assert.equal(leeEventoSignup({ type: 'OTRA_COSA', data: {} }), null);
  // Un código canjeado no se vuelve a canjear.
  const d = meta.signup({ wabaId: 'waba_d', businessId: 'bm_4', phoneNumberId: 'pn_d' });
  assert.equal((await meta.graph.canjeaCodigo(d.code)).ok, true);
  const dos = await meta.graph.canjeaCodigo(d.code);
  assert.ok(!dos.ok && /ya se canjeó/.test(dos.error));
});

test('Solution Partner: comparte el crédito; MXN no se admite, va en USD y se marca el riesgo cambiario', async () => {
  const { meta, bsp, almacen } = banco('solution_partner', 'MXN');
  const s = meta.signup({ wabaId: 'waba_tienda', businessId: 'bm_2', phoneNumberId: 'pn_tienda' });
  const a = await bsp.completa({ inquilinoId: 'pyme_tienda', code: s.code, recibidoEn: s.recibidoEn, evento: leeEventoSignup(s.mensaje)!, perfil: tienda, telefonoVisible: '+52 228 100 0002' });
  assert.ok(!('rechazo' in a));
  assert.equal(a.estado, 'activa', 'con crédito nuestro no espera método de pago');
  assert.equal(a.monedaCredito, 'USD');
  assert.equal(a.riesgoCambiario, true);
  assert.equal(meta.credito('waba_tienda')?.moneda, 'USD');
  assert.equal((await almacen.inquilino('pyme_tienda'))?.estado, 'activo');
});

test('sin número propio (FINISH_ONLY_WABA) sale uno del pool (N-01); en la baja, el de renta entra a cuarentena', async () => {
  const { meta, bsp, numeros, boveda, almacen } = banco('solution_partner', 'USD');
  await numeros.altaEnPool({ e164: '+522291000050', modalidad: 'renta', origen: 'virtual', proveedor: 'proveedor-ficticio', titular: 'plataforma', costoMensualCentavos: 7_000, precioMensualCentavos: 24_900, precioAltaCentavos: 0, portable: false });
  const s = meta.signup({ wabaId: 'waba_taqueria', businessId: 'bm_5' });
  const evento = leeEventoSignup(s.mensaje)!;
  assert.ok(evento.tipo === 'fin' && !evento.phoneNumberId);
  const a = await bsp.completa({ inquilinoId: 'pyme_taqueria', code: s.code, recibidoEn: s.recibidoEn, evento, perfil: restaurante, telefonoVisible: '', delPool: { modalidad: 'renta', nombreVisible: 'Tacos El Güero' } });
  assert.ok(!('rechazo' in a), 'rechazo' in a ? a.rechazo : '');
  assert.equal(a.numeroDelPool, '+522291000050');
  assert.equal((await almacen.inquilino('pyme_taqueria'))?.canal.telefonoVisible, '+522291000050');
  assert.equal((await numeros.facturacion()).porInquilino.pyme_taqueria, 24_900);

  const b = await bsp.baja('waba_taqueria', 'la pyme se fue');
  assert.equal(b?.estado, 'baja');
  assert.deepEqual(meta.suscritas(), []);
  assert.equal(await boveda.lee('waba_taqueria'), undefined);
  assert.equal(b?.pasos.find((p) => p.paso === 'retirar_credito')?.ok, false, 'retirar el crédito queda manual: no se finge');
  assert.equal(b?.pasos.at(-1)?.detalle, 'cuarentena');
  assert.equal((await almacen.inquilino('pyme_taqueria'))?.estado, 'pausado');
});

test('factura del mes por modalidad, conciliación con Meta y tope de crédito sin cortar el servicio', async () => {
  const { almacen } = banco('solution_partner');
  await almacen.guardaInquilino(restaurante({ wabaId: 'waba_restaurante', phoneNumberId: 'pn_r', telefonoVisible: '', datasetId: '', catalogoId: '', flows: {} }));
  const msj = (n: number, costoMicros: number, instante = INICIO): Mensaje => ({ wamid: `wamid.${n}`, conversacionId: 'c1', waId: '5212290000000', direccion: 'saliente', autor: 'agente', tipo: 'template', resumen: '', instante, costoMicros, categoria: 'utility' });
  const d = almacen.de('pyme_restaurante');
  for (let n = 0; n < 40; n++) await d.guarda('mensajes', `wamid.${n}`, msj(n, 8_000));
  await d.guarda('mensajes', 'gratis', msj(99, 0));
  await d.guarda('mensajes', 'otro-mes', msj(98, 8_000, Date.parse('2026-11-10T18:00:00Z')));

  const sp = await facturaMes(almacen, '2026-10', { modalidad: 'solution_partner', margen: 0.12, tipoDeCambio: 18.5, cuotaMensualCentavos: 149_000 });
  assert.equal(sp[0]!.mensajesCobrados, 40);
  assert.equal(sp[0]!.metaMicros, 320_000);
  assert.equal(sp[0]!.metaCentavos, 592, 'USD 0.32 × 18.5 = $5.92');
  assert.equal(sp[0]!.margenCentavos, 71);
  assert.equal(sp[0]!.totalCentavos, 592 + 71 + 149_000);
  const tp = await facturaMes(almacen, '2026-10', { modalidad: 'tech_provider', margen: 0.12, tipoDeCambio: 18.5, cuotaMensualCentavos: 149_000 });
  assert.equal(tp[0]!.totalCentavos, 149_000, 'Tech Provider: Meta le cobra a la pyme; nosotros solo la cuota');
  assert.equal(tp[0]!.metaMicros, 320_000, 'pero la factura dice cuánto le llegará de Meta');

  assert.deepEqual(concilia(sp, { waba_restaurante: 321_000 }), [], 'dentro del 1 %');
  const fuera = concilia(sp, { waba_restaurante: 400_000, waba_fantasma: 10_000 });
  assert.deepEqual(fuera.map((f) => f.wabaId), ['waba_restaurante', 'waba_fantasma']);

  assert.equal(estadoCredito(700_000, 1_000_000).nivel, 'normal');
  assert.equal(estadoCredito(850_000, 1_000_000).nivel, 'aviso');
  const tope = estadoCredito(1_000_000, 1_000_000);
  assert.deepEqual(tope.permite, { servicio: true, utilidad: true, marketing: false });
  assert.equal(tope.decide, 'humano');
});
