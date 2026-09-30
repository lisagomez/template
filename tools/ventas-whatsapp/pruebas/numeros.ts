/**
 * La línea de números (N-01): alta en Meta con código, registro con PIN y nombre visible; los límites
 * de Meta (portafolio, 10 registros en 72 h, app de consumo, SMS); la cuarentena de lo que se libera
 * (privacidad de los clientes del dueño anterior: no se firma); y el cobro.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creaGestorNumeros, poolEnMemoria, relojManual, DIA, HORA, type NumeroGestionado } from '../dist/index.js';
import { creaRegistroNumerosSimulado } from '../dist/simulador/index.js';

const INICIO = Date.parse('2026-10-05T18:00:00Z');
const PIN = '482913';

function banco(o: { verificado?: boolean } = {}) {
  const reloj = relojManual(INICIO);
  const meta = creaRegistroNumerosSimulado({ reloj, portafolioVerificado: o.verificado });
  const pool = poolEnMemoria();
  const gestor = creaGestorNumeros({ pool, meta: meta.registro, buzon: meta.buzon, reloj, pin: () => PIN });
  return { reloj, meta, pool, gestor };
}

const numero = (e164: string, modalidad: 'venta' | 'renta', extra: Partial<NumeroGestionado> = {}) => ({
  e164, modalidad, origen: 'sim_mx' as const, proveedor: 'operador-ficticio', titular: modalidad === 'venta' ? 'pyme' as const : 'plataforma' as const,
  costoMensualCentavos: 7_000, precioMensualCentavos: modalidad === 'renta' ? 24_900 : 9_900, precioAltaCentavos: modalidad === 'venta' ? 60_000 : 0, portable: false, ...extra,
});

test('alta completa: reserva → código por SMS → verificación → registro con PIN → nombre aprobado; el PIN no queda en ningún lado', async () => {
  const { gestor, pool, meta } = banco();
  assert.equal((await gestor.altaEnPool(numero('+522291000001', 'renta'))).ok, true);
  const r = await gestor.reserva('pyme_restaurante', 'renta');
  assert.ok(r.ok);
  const a = await gestor.activa('+522291000001', 'waba_restaurante', 'La Parroquia de Doña Chela');
  assert.ok(a.ok, a.ok ? '' : a.error);
  assert.equal(a.valor.estado, 'activo');
  assert.equal(a.valor.nombreVisible?.estado, 'APPROVED');
  assert.deepEqual(a.valor.historial.map((h) => h.a), ['reservado', 'verificando', 'registrado', 'activo']);
  const e = meta.lista()[0]!;
  assert.equal(e.status, 'CONNECTED');
  assert.equal(e.verificacion, 'VERIFIED');
  assert.ok(!JSON.stringify(await pool.lista()).includes(PIN), 'el PIN no se guarda en el pool');
  assert.ok(!JSON.stringify(meta.lista()).includes(PIN), 'ni en lo que se lista de Meta');
});

test('reglas de Meta: VENTA a nombre de la pyme, E.164 mexicano, app de consumo, SMS y nombre visible', async () => {
  const { gestor, meta } = banco();
  const aNombreNuestro = await gestor.altaEnPool(numero('+522291000002', 'venta', { titular: 'plataforma' }));
  assert.ok(!aNombreNuestro.ok && /nombre de la pyme/.test(aNombreNuestro.error));
  assert.equal((await gestor.altaEnPool(numero('2291000002', 'renta'))).ok, false);
  await gestor.altaEnPool(numero('+522291000003', 'renta'));
  meta.enAppDeConsumo('+522291000003');
  await gestor.reserva('pyme_tienda', 'renta');
  const enApp = await gestor.activa('+522291000003', 'waba_tienda', 'Huipiles Xalapeños');
  assert.ok(!enApp.ok && /app de consumo/.test(enApp.error));

  const b = banco();
  await b.gestor.altaEnPool(numero('+522291000004', 'renta'));
  b.meta.sinSms('+522291000004');
  await b.gestor.reserva('pyme_tienda', 'renta');
  const porSms = await b.gestor.activa('+522291000004', 'waba_tienda', 'Huipiles Xalapeños', 'SMS');
  assert.ok(!porSms.ok && /VOICE/.test(porSms.error));
  // El número quedó en «verificando»: se vuelve a reservar y se pide por voz.
  const lleno = await b.pool.lee('+522291000004');
  await b.pool.guarda({ ...lleno!, estado: 'reservado' });
  const porVoz = await b.gestor.activa('+522291000004', 'waba_tienda', 'WhatsApp Huipiles', 'VOICE');
  assert.ok(porVoz.ok);
  assert.equal(porVoz.valor.nombreVisible?.estado, 'DECLINED', 'un nombre con «WhatsApp» no pasa la revisión (SUPUESTO del simulador)');
  assert.equal(porVoz.valor.estado, 'registrado', 'registrado pero no activo mientras el nombre no se apruebe');
});

test('tope del portafolio (2 sin verificar, 20 verificado) y 133016 al pasar 10 registros en 72 h', async () => {
  const { gestor, meta } = banco();
  for (const [i, e] of ['+522291000011', '+522291000012', '+522291000013'].entries()) {
    await gestor.altaEnPool(numero(e, 'renta'));
    await gestor.reserva(`pyme_${i}`, 'renta');
  }
  assert.ok((await gestor.activa('+522291000011', 'waba_plataforma', 'Cocina Uno')).ok);
  assert.ok((await gestor.activa('+522291000012', 'waba_plataforma', 'Cocina Dos')).ok);
  const tercero = await gestor.activa('+522291000013', 'waba_plataforma', 'Cocina Tres');
  assert.ok(!tercero.ok && /tope de 2/.test(tercero.error));
  meta.verificaPortafolio();
  assert.ok((await gestor.activa('+522291000013', 'waba_plataforma', 'Cocina Tres')).ok, 'verificado el negocio, sube a 20');

  const b = banco({ verificado: true });
  const alta = await b.meta.registro.agrega('waba_x', '+522291000020');
  assert.ok(alta.ok);
  await b.meta.registro.solicitaCodigo(alta.phoneNumberId, 'SMS');
  await b.meta.registro.verificaCodigo(alta.phoneNumberId, (await b.meta.buzon.ultimoCodigo('+522291000020'))!);
  for (let i = 0; i < 10; i++) assert.equal((await b.meta.registro.registra(alta.phoneNumberId, PIN)).ok, true);
  const once = await b.meta.registro.registra(alta.phoneNumberId, PIN);
  assert.ok(!once.ok && once.codigo === 133016);
  b.reloj.avanza(72 * HORA + 1);
  assert.equal((await b.meta.registro.registra(alta.phoneNumberId, PIN)).ok, true, 'pasadas las 72 h se puede otra vez');

  // El gestor no gasta el intento: si ya lleva 10 en la ventana, ni llama a Meta.
  const c = banco();
  await c.gestor.altaEnPool(numero('+522291000021', 'renta'));
  await c.gestor.reserva('pyme_x', 'renta');
  const n = await c.pool.lee('+522291000021');
  await c.pool.guarda({ ...n!, intentosRegistro: Array.from({ length: 10 }, (_, i) => INICIO - i * HORA) });
  const r = await c.gestor.activa('+522291000021', 'waba_x', 'Cocina');
  assert.ok(!r.ok && /133016/.test(r.error));
  assert.equal(c.meta.lista().length, 0);
});

test('un número liberado entra a CUARENTENA: no se reasigna antes de 90 días (sus clientes le seguirían escribiendo)', async () => {
  const { gestor, reloj } = banco();
  await gestor.altaEnPool(numero('+522291000030', 'renta'));
  await gestor.reserva('pyme_restaurante', 'renta');
  await gestor.activa('+522291000030', 'waba_restaurante', 'La Parroquia');
  const l = await gestor.libera('+522291000030', 'la pyme se fue', false);
  assert.ok(l.ok);
  assert.equal(l.valor.estado, 'cuarentena');
  const antes = await gestor.reserva('pyme_tienda', 'renta');
  assert.ok(!antes.ok && /cuarentena no cuentan/.test(antes.error));
  reloj.avanza(89 * DIA);
  assert.equal((await gestor.reserva('pyme_tienda', 'renta')).ok, false);
  reloj.avanza(DIA);
  const despues = await gestor.reserva('pyme_tienda', 'renta');
  assert.ok(despues.ok);
  assert.equal(despues.valor.inquilinoId, 'pyme_tienda');
  assert.equal(despues.valor.nombreVisible, undefined, 'no arrastra el nombre del dueño anterior');
  assert.deepEqual(despues.valor.historial.map((h) => h.a), ['reservado', 'verificando', 'registrado', 'activo', 'cuarentena', 'disponible', 'reservado']);
});

test('VENTA o renta portable: la pyme se lleva su número; la calidad en ROJO avisa; el cobro cuenta el pool entero', async () => {
  const { gestor, meta } = banco({ verificado: true });
  await gestor.altaEnPool(numero('+522291000040', 'venta'));
  await gestor.altaEnPool(numero('+522291000041', 'renta', { portable: true }));
  await gestor.altaEnPool(numero('+522291000042', 'renta'));
  await gestor.altaEnPool(numero('+522291000043', 'renta'));
  await gestor.reserva('pyme_tienda', 'venta');
  await gestor.activa('+522291000040', 'waba_tienda', 'Huipiles Xalapeños');
  await gestor.reserva('pyme_restaurante', 'renta');
  await gestor.activa('+522291000041', 'waba_restaurante', 'La Parroquia');
  await gestor.reserva('pyme_taqueria', 'renta');
  await gestor.activa('+522291000042', 'waba_taqueria', 'Tacos El Güero');

  const f = await gestor.facturacion();
  assert.equal(f.numeros, 3);
  assert.equal(f.ingresoCentavos, 9_900 + 24_900 + 24_900);
  assert.equal(f.costoCentavos, 3 * 7_000, 'en renta se paga todo el pool, también lo disponible; en venta la línea es de la pyme');
  assert.equal(f.porInquilino.pyme_tienda, 9_900);

  meta.cambiaCalidad('+522291000042', 'RED');
  const c = await gestor.revisaCalidad('+522291000042');
  assert.equal(c.calidad, 'RED');
  assert.match(c.alerta ?? '', /ROJO/);
  assert.equal((await gestor.revisaCalidad('+522291000041')).alerta, null);

  const venta = await gestor.libera('+522291000040', 'cambia de plataforma');
  assert.ok(venta.ok && venta.valor.estado === 'transferido' && venta.valor.titular === 'pyme');
  const portable = await gestor.libera('+522291000041', 'cambia de plataforma');
  assert.ok(portable.ok && portable.valor.estado === 'transferido');
});
