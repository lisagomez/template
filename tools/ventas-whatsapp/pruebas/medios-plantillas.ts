/**
 * Lo que el canal de una clínica necesita de Meta y no usaba el vendedor: plantillas con botones de respuesta
 * rápida (el payload va y vuelve), plantillas pausadas o con parámetros que no cuadran, notas de voz y fotos (el
 * mensaje solo trae el id del medio; los bytes se bajan aparte, y solo los del propio número) y el número sin
 * WhatsApp, que Meta acepta y hace fallar DESPUÉS por webhook (131026).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { aCuerpoGraph, desdeCuerpoGraph, leeWebhook, relojManual, validaMensaje, verificaFirmaMeta, type EventoCanal } from '../dist/index.js';
import { creaMetaSimulada } from '../dist/simulador/index.js';

const SECRETO = 'secreto-de-prueba';
const PNID = '1090000000001';

function arma(o: { sinWhatsApp?: (w: string) => boolean } = {}) {
  const reloj = relojManual(Date.parse('2026-10-20T15:00:00Z'));
  const eventos: EventoCanal[] = [];
  const meta = creaMetaSimulada({
    secretoApp: SECRETO, reloj, ...o,
    entrega: async (cuerpo, cab) => {
      assert.ok(verificaFirmaMeta(SECRETO, cuerpo, cab['x-hub-signature-256']), 'todo webhook llega firmado');
      const l = leeWebhook(JSON.parse(cuerpo));
      if (l.ok) eventos.push(...l.eventos);
      return 200;
    },
  });
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  meta.registraNumero({
    wabaId: 'waba-1', phoneNumberId: PNID, telefonoVisible: '525500000001', datasetId: 'ds-1', catalogoId: 'cat-1', token: 'tok', llavePublicaFlows: publicKey,
    plantillas: {
      recordatorio: { categoria: 'utility', idioma: 'es_MX', cuerpo: 'Hola {{1}}, tu cita en {{2}} es {{3}}.', botones: ['Confirmo', 'Cambiar cita'] },
      vieja: 'utility',
    },
  });
  return { meta, eventos, reloj };
}

const plantilla = (parametros: string[], payloads: string[] = []) => aCuerpoGraph('5215512345678', { tipo: 'plantilla', nombre: 'recordatorio', idioma: 'es_MX', parametros, botones: payloads.map((payload) => ({ payload })) });

test('plantilla con botones: el cuerpo de Graph lleva los quick_reply con su índice, y vuelve igual', () => {
  const c = plantilla(['Ana', 'Dental Maguey', 'el martes a las 10:00'], ['ok|cit_1', 'cambia|cit_1']);
  const comps = (c.template as { components: Array<Record<string, unknown>> }).components;
  assert.deepEqual(comps.filter((x) => x.type === 'button').map((x) => [x.sub_type, x.index]), [['quick_reply', '0'], ['quick_reply', '1']]);
  const vuelta = desdeCuerpoGraph(c);
  assert.ok(vuelta.ok && vuelta.mensaje.tipo === 'plantilla');
  assert.deepEqual(vuelta.ok && vuelta.mensaje.tipo === 'plantilla' ? vuelta.mensaje.botones : null, [{ payload: 'ok|cit_1' }, { payload: 'cambia|cit_1' }]);
  assert.deepEqual(validaMensaje({ tipo: 'plantilla', nombre: 'x', idioma: 'es_MX', parametros: [], botones: [{ payload: '' }] }).length, 1, 'payload vacío se rechaza');
});

test('la persona ve la plantilla con su texto, toca un botón y el payload vuelve por webhook', async () => {
  const { meta, eventos } = arma();
  const cl = meta.cliente(PNID, '5215512345678', 'Ana');
  const r = await meta.graph.enviaMensaje(PNID, plantilla(['Ana', 'Dental Maguey', 'el martes a las 10:00'], ['ok|cit_1', 'cambia|cit_1']));
  assert.ok(r.ok);
  assert.equal(cl.ultimo()?.plantilla?.texto, 'Hola Ana, tu cita en Dental Maguey es el martes a las 10:00.');
  cl.tocaBotonPlantilla('Cambiar cita');
  await meta.drena();
  const m = eventos.find((e) => e.clase === 'mensaje');
  assert.ok(m && m.clase === 'mensaje');
  assert.deepEqual(m.boton, { payload: 'cambia|cit_1', texto: 'Cambiar cita' });
  assert.equal(m.respondeA, r.ok ? r.wamid : '', 'el botón responde a la plantilla (context.id)');
  assert.equal(m.waId, '525512345678', 'el 521 de los celulares de México se normaliza');
});

test('plantilla pausada (132015), desactivada (132016) o con parámetros de menos (132000): Meta la rechaza al enviar', async () => {
  const { meta } = arma();
  const faltan = await meta.graph.enviaMensaje(PNID, plantilla(['Ana', 'Dental Maguey']));
  assert.ok(!faltan.ok && faltan.codigo === 132000);
  meta.cambiaPlantilla(PNID, 'recordatorio', 'PAUSED');
  const pausada = await meta.graph.enviaMensaje(PNID, plantilla(['Ana', 'X', 'Y']));
  assert.ok(!pausada.ok && pausada.codigo === 132015);
  meta.cambiaPlantilla(PNID, 'recordatorio', 'DISABLED');
  const desactivada = await meta.graph.enviaMensaje(PNID, plantilla(['Ana', 'X', 'Y']));
  assert.ok(!desactivada.ok && desactivada.codigo === 132016);
  const vieja = await meta.graph.enviaMensaje(PNID, aCuerpoGraph('525512345678', { tipo: 'plantilla', nombre: 'vieja', idioma: 'es_MX', parametros: ['cualquiera'] }));
  assert.ok(vieja.ok, 'la forma de antes (solo categoría) sigue valiendo');
});

test('nota de voz y foto: el webhook trae el id del medio; los bytes se bajan aparte y solo desde su número', async () => {
  const { meta, eventos } = arma();
  const cl = meta.cliente(PNID, '525512345678', 'Ana');
  const audio = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 1, 2, 3]);
  cl.mandaAudio(audio);
  cl.mandaImagen(new Uint8Array([0xff, 0xd8, 0xff]), 'mira mi muela');
  await meta.drena();
  const [voz, foto] = eventos.filter((e) => e.clase === 'mensaje');
  assert.ok(voz?.clase === 'mensaje' && voz.medio?.clase === 'audio' && voz.medio.voz === true);
  assert.ok(foto?.clase === 'mensaje' && foto.medio?.clase === 'image' && foto.medio.caption === 'mira mi muela');
  const bajado = await meta.graph.descargaMedio!(PNID, voz.medio.id);
  assert.ok(bajado.ok);
  assert.deepEqual(bajado.ok ? [...bajado.bytes] : [], [...audio]);
  const ajeno = await meta.graph.descargaMedio!('otro-numero', voz.medio.id);
  assert.ok(!ajeno.ok, 'otro número no baja el medio');
  assert.deepEqual(cl.enviados.map((e) => e.tipo), ['audio', 'imagen']);
});

test('número sin WhatsApp: el envío se acepta y el fallo (131026) llega después, por webhook', async () => {
  const { meta, eventos } = arma({ sinWhatsApp: (w) => w === '525599999999' });
  const r = await meta.graph.enviaMensaje(PNID, aCuerpoGraph('525599999999', { tipo: 'plantilla', nombre: 'vieja', idioma: 'es_MX', parametros: [] }));
  assert.ok(r.ok, 'Meta no sabe al enviar si el número tiene WhatsApp');
  await meta.drena();
  const estados = eventos.filter((e) => e.clase === 'estado');
  assert.deepEqual(estados.map((e) => (e.clase === 'estado' ? [e.estado, e.errores?.[0]?.codigo] : null)), [['failed', 131026]]);
});

test('nombre de usuario (2026): un mensaje con solo BSUID se lee, no se tira; y los cambios de plantilla llegan tipados', () => {
  const cuerpo = (valor: Record<string, unknown>, field = 'messages') => ({ object: 'whatsapp_business_account', entry: [{ id: 'waba-1', changes: [{ field, value: { messaging_product: 'whatsapp', metadata: { phone_number_id: PNID }, ...valor } }] }] });
  const l = leeWebhook(cuerpo({ messages: [{ from_user_id: 'MX.1234567890abcdef', id: 'wamid.X1', timestamp: '1760972400', type: 'text', text: { body: 'hola' } }] }));
  assert.ok(l.ok);
  const m = l.ok ? l.eventos[0] : undefined;
  assert.ok(m?.clase === 'mensaje' && m.waId === '' && m.usuarioId === 'MX.1234567890abcdef' && m.texto === 'hola');
  const p = leeWebhook(cuerpo({ message_template_name: 'recordatorio', event: 'PAUSED' }, 'message_template_status_update'));
  assert.deepEqual(p.ok ? p.eventos[0] : null, { clase: 'plantilla', wabaId: 'waba-1', nombre: 'recordatorio', estado: 'PAUSED' });
  const c = leeWebhook(cuerpo({ message_template_name: 'recordatorio', new_category: 'MARKETING' }, 'template_category_update'));
  assert.deepEqual(c.ok ? c.eventos[0] : null, { clase: 'plantilla', wabaId: 'waba-1', nombre: 'recordatorio', categoria: 'MARKETING' });
});
