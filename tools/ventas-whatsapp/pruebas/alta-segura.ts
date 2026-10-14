/**
 * El alta segura del BSP (C3, «alta fraudulenta»): la liga firmada ata la sesión a UNA pyme y sirve
 * una vez; el mensaje solo vale con origen de Meta (más estricto que la muestra de Meta); un código
 * propio con la WABA de otro no deja token guardado; una WABA por pyme; y las altas y el pool de
 * números sobreviven a un reinicio.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { almacenEnMemoria, bovedaEnMemoria, creaBsp, emiteLigaAlta, esOrigenDeMeta, leeLigaAlta, relojManual, DIA } from '../dist/index.js';
import { poolEnArchivo, registroAltasEnArchivo } from '../dist/almacen/archivo.js';
import { creaMetaBspSimulada } from '../dist/simulador/index.js';
import { restaurante, tienda } from '../dist/laboratorio/index.js';

const INICIO = Date.parse('2026-10-05T18:00:00Z');
const SECRETO = 'secreto-de-ligas-del-laboratorio';
const META = 'https://www.facebook.com';

function banco(registro?: Parameters<typeof creaBsp>[0]['registro']) {
  const reloj = relojManual(INICIO);
  const meta = creaMetaBspSimulada({ reloj });
  const almacen = almacenEnMemoria();
  const boveda = bovedaEnMemoria();
  const bsp = creaBsp({ graph: meta.graph, boveda, almacen, reloj, modalidad: 'tech_provider', pin: () => '246801', secretoLigas: SECRETO, ...(registro ? { registro } : {}) });
  return { reloj, meta, almacen, boveda, bsp };
}

test('origen: https y facebook.com o un subdominio; la muestra de Meta (endsWith) dejaba pasar evilfacebook.com', () => {
  for (const o of ['https://www.facebook.com', 'https://web.facebook.com', 'https://business.facebook.com', 'https://facebook.com']) assert.equal(esOrigenDeMeta(o), true, o);
  for (const o of ['https://evilfacebook.com', 'http://www.facebook.com', 'https://www.facebook.com.evil.mx', 'https://www.facebook.com:8443', 'null', '']) assert.equal(esOrigenDeMeta(o), false, o);
  assert.equal('https://evilfacebook.com'.endsWith('facebook.com'), true, 'por eso no se usa endsWith');
});

test('la liga: firmada, vence y no se puede alterar', () => {
  const liga = emiteLigaAlta(SECRETO, 'pyme_tienda', INICIO);
  assert.equal(leeLigaAlta(SECRETO, liga, INICIO)?.inquilinoId, 'pyme_tienda');
  assert.equal(leeLigaAlta('otro-secreto', liga, INICIO), null);
  assert.equal(leeLigaAlta(SECRETO, liga, INICIO + 8 * DIA), null, 'vence a los 7 días');
  const [datos, firma] = liga.split('.');
  const ajena = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(datos!, 'base64url').toString()), i: 'pyme_restaurante' })).toString('base64url');
  assert.equal(leeLigaAlta(SECRETO, `${ajena}.${firma}`, INICIO), null, 'cambiar la pyme rompe la firma');
});

test('recibe: el inquilino sale de la liga; sirve una vez; un abandono deja reintentar; un origen ajeno no pasa', async () => {
  const { meta, bsp, almacen } = banco();
  const liga = bsp.ligaDeAlta('pyme_tienda');
  const ab = meta.signup({ wabaId: 'waba_t', businessId: 'bm_t', abandonaEn: 'BUSINESS_INFO' });
  assert.ok('rechazo' in await bsp.recibe({ liga, code: ab.code, origen: META, mensaje: ab.mensaje, perfil: tienda, telefonoVisible: '' }));
  const falso = meta.signup({ wabaId: 'waba_t', businessId: 'bm_t', phoneNumberId: 'pn_t' });
  const evil = await bsp.recibe({ liga, code: falso.code, origen: 'https://evilfacebook.com', mensaje: falso.mensaje, perfil: tienda, telefonoVisible: '' });
  assert.ok('rechazo' in evil && /no viene de Meta/.test(evil.rechazo));
  const s = meta.signup({ wabaId: 'waba_t', businessId: 'bm_t', phoneNumberId: 'pn_t' });
  const a = await bsp.recibe({ liga, code: s.code, origen: META, mensaje: JSON.stringify(s.mensaje), perfil: tienda, telefonoVisible: '+52 228 100 0002' });
  assert.ok(!('rechazo' in a), 'rechazo' in a ? a.rechazo : '');
  assert.equal(a.inquilinoId, 'pyme_tienda', 'tras un abandono, la misma liga sirvió');
  assert.equal((await almacen.inquilino('pyme_tienda'))?.canal.wabaId, 'waba_t');
  const otra = meta.signup({ wabaId: 'waba_t2', businessId: 'bm_t', phoneNumberId: 'pn_t2' });
  const repetida = await bsp.recibe({ liga, code: otra.code, origen: META, mensaje: otra.mensaje, perfil: tienda, telefonoVisible: '' });
  assert.ok('rechazo' in repetida && /ya se usó/.test(repetida.rechazo));
  assert.deepEqual((await bsp.embudo()).map((e) => e.resultado), ['abandono en BUSINESS_INFO', 'mensaje que no viene de Meta', 'falta_metodo_pago']);
});

test('WABA ajena: un código propio con la WABA de otro no deja token; una WABA dada de alta no se cuelga de otra pyme', async () => {
  const { meta, bsp, boveda } = banco();
  const atacante = meta.signup({ wabaId: 'waba_atacante', businessId: 'bm_a', phoneNumberId: 'pn_a' });
  const forjado = { ...atacante.mensaje, data: { ...(atacante.mensaje.data as Record<string, unknown>), waba_id: 'waba_victima' } };
  const r = await bsp.recibe({ liga: bsp.ligaDeAlta('pyme_x'), code: atacante.code, origen: META, mensaje: forjado, perfil: tienda, telefonoVisible: '' });
  assert.ok(!('rechazo' in r) && r.estado === 'fallida' && r.pasos.at(-1)?.paso === 'suscribir_webhooks');
  assert.equal(boveda.cuantos(), 0, 'ningún token guardado a nombre de la WABA ajena');

  const v = meta.signup({ wabaId: 'waba_victima', businessId: 'bm_v', phoneNumberId: 'pn_v' });
  assert.equal((await bsp.recibe({ liga: bsp.ligaDeAlta('pyme_restaurante'), code: v.code, origen: META, mensaje: v.mensaje, perfil: restaurante, telefonoVisible: '' }) as { estado: string }).estado, 'falta_metodo_pago');
  const v2 = meta.signup({ wabaId: 'waba_victima', businessId: 'bm_v', phoneNumberId: 'pn_v' });
  const colgada = await bsp.recibe({ liga: bsp.ligaDeAlta('pyme_y'), code: v2.code, origen: META, mensaje: v2.mensaje, perfil: tienda, telefonoVisible: '' });
  assert.ok('rechazo' in colgada && /otra pyme/.test(colgada.rechazo));
  const segunda = meta.signup({ wabaId: 'waba_segunda', businessId: 'bm_v', phoneNumberId: 'pn_s' });
  const dos = await bsp.recibe({ liga: bsp.ligaDeAlta('pyme_restaurante'), code: segunda.code, origen: META, mensaje: segunda.mensaje, perfil: restaurante, telefonoVisible: '' });
  assert.ok('rechazo' in dos && /ya tiene una WABA/.test(dos.rechazo));
});

test('las altas, el embudo, los nonces y el pool de números sobreviven a un reinicio', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vw-bsp-'));
  const uno = banco(registroAltasEnArchivo(join(dir, 'altas.json')));
  const liga = uno.bsp.ligaDeAlta('pyme_tienda');
  const s = uno.meta.signup({ wabaId: 'waba_t', businessId: 'bm_t', phoneNumberId: 'pn_t' });
  await uno.bsp.recibe({ liga, code: s.code, origen: META, mensaje: s.mensaje, perfil: tienda, telefonoVisible: '' });
  const dos = banco(registroAltasEnArchivo(join(dir, 'altas.json')));
  assert.equal((await dos.bsp.altas())[0]?.estado, 'falta_metodo_pago');
  const s2 = dos.meta.signup({ wabaId: 'waba_t9', businessId: 'bm_t', phoneNumberId: 'pn_t9' });
  const r = await dos.bsp.recibe({ liga, code: s2.code, origen: META, mensaje: s2.mensaje, perfil: tienda, telefonoVisible: '' });
  assert.ok('rechazo' in r && /ya se usó/.test(r.rechazo), 'el nonce gastado también persiste');

  const pool = poolEnArchivo(join(dir, 'pool.json'));
  await pool.guarda({ e164: '+522291000099', origen: 'virtual', proveedor: 'p', modalidad: 'renta', titular: 'plataforma', costoMensualCentavos: 1, precioMensualCentavos: 2, precioAltaCentavos: 0, estado: 'cuarentena', calidad: 'UNKNOWN', intentosRegistro: [], portable: false, historial: [], cuarentenaHasta: INICIO + 90 * DIA });
  assert.equal((await poolEnArchivo(join(dir, 'pool.json')).lee('+522291000099'))?.estado, 'cuarentena');
});
