/**
 * Los avisos por WhatsApp de punta a punta: idempotentes (despachar dos veces o recibir dos veces el mismo estado no
 * duplica nada; un resultado desconocido no se reintenta a ciegas), estados fuera de orden que solo AVANZAN, las
 * fallas de Meta (numero sin WhatsApp, plantilla pausada, numero de la clinica desconectado) con RESPALDO por correo,
 * el gate del transporte real por canal, y cero PII (tampoco el numero) en el libro. Y el contrato v2 lee un libro v1.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firmaMeta } from '../../ventas-whatsapp/dist/index.js';
import { creaLibro, libroEnMemoria, transporteWhatsAppReal, GateCerrado, type GraphWa } from '../dist/servidor.js';
import { instante, sembrados } from './_banco.ts';
import { bancoWa, NUMEROS, paciente, SECRETO_APP, vinculado, vistos, waIdDe, type BancoWa } from './_banco-wa.ts';

async function conCitaWa(w: BancoWa, id = 'adulto-convenio', canales: ('correo' | 'whatsapp')[] = ['whatsapp']) {
  const v = await vinculado(w, id);
  const r = await w.portal.reserva({ clinica: v.p.clinica, usuario: v.usuario, servicio: 'limpieza', inicio: instante(4, '10:00'), canales, newsletter: false, clave: `av-${id}` });
  assert.ok(r.ok);
  return { ...v, cita: r.cita };
}

const avisosWa = async (w: BancoWa) => (await w.almacen.avisos('maguey')).filter((a) => a.canal === 'whatsapp');

test('despachar dos veces A LA VEZ no manda dos; el mismo estado dos veces no entrega dos; leído antes que entregado se ordena', async () => {
  const w = await bancoWa();
  const { cl } = await conCitaWa(w);
  await Promise.all([w.portal.despacha(), w.portal.despacha(), w.portal.despacha()]);
  await w.asienta();
  assert.equal(cl.recibidos.filter((x) => /quedó confirmada/.test(x.resumen)).length, 1);
  const conf = (await avisosWa(w)).find((a) => a.clase === 'confirmacion')!;
  assert.equal(conf.estado, 'leido', 'el simulador manda sent, delivered y read');
  const estado = (st: string, wamid: string) => JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'waba-maguey', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: NUMEROS[0]!.phoneNumberId }, statuses: [{ id: wamid, status: st, timestamp: '1760900000', recipient_id: '5215500001001', pricing: { billable: false, pricing_model: 'PMP', type: 'free_customer_service', category: 'service' } }] } }] }] });
  for (const st of ['delivered', 'read', 'failed']) {
    const c = estado(st, conf.wamid!);
    await w.receptor.recibe(c, firmaMeta(SECRETO_APP, c));
  }
  await w.asienta();
  const ev = (await w.libro.eventos('maguey')).filter((e) => 'aviso' in e && e.aviso === conf.id);
  assert.deepEqual(ev.map((e) => e.tipo), ['aviso_programado', 'aviso_enviado', 'aviso_entregado', 'aviso_leido'], 'repetidos y un failed tardío no cambian nada');
  assert.equal((await avisosWa(w)).find((a) => a.id === conf.id)!.estado, 'leido');
});

test('resultado DESCONOCIDO (el transporte se cae a media llamada): el aviso queda «incierto» y NO se reintenta solo', async () => {
  let cae = false;
  const w = await bancoWa({ envuelve: (g: GraphWa) => ({ ...g, enviaMensaje: async (id, cuerpo) => { if (cae && (cuerpo as { type?: string }).type !== 'text') throw new Error('ECONNRESET'); return g.enviaMensaje(id, cuerpo); } }) });
  await vinculado(w, 'adulto-convenio');
  cae = true;
  const v = await w.almacen.paciente('maguey', 'usr-adulto-convenio');
  await w.portal.reserva({ clinica: 'maguey', usuario: v!.usuario, servicio: 'limpieza', inicio: instante(4, '10:00'), canales: ['whatsapp'], newsletter: false, clave: 'inc' });
  await w.portal.despacha();
  await w.portal.despacha();
  const conf = (await avisosWa(w)).find((a) => a.clase === 'confirmacion')!;
  assert.equal(conf.estado, 'incierto');
  assert.equal(conf.intentos, 1, 'un solo intento: mandar dos veces es peor que avisar que no se sabe');
});

test('número SIN WhatsApp: Meta acepta y el 131026 llega después; el aviso falla y sale por CORREO de respaldo', async () => {
  const w = await bancoWa({ sinWhatsApp: (waId) => waId === waIdDe(paciente('adulto-convenio')) });
  const p = paciente('adulto-convenio');
  const { alta } = await import('./_banco.ts');
  await alta(w, p);
  // Lo vincula con un número que sí escribió (p. ej. desde WhatsApp Web) y después lo desinstaló: el caso real del 131026.
  const { codigo } = await w.portal.whatsapp.codigo('maguey', `usr-${p.id}`);
  w.cliente('maguey', waIdDe(p, true), 'Ameyalli').escribe(codigo);
  await w.asienta();
  await w.portal.whatsapp.confirma('maguey', `usr-${p.id}`);
  await w.portal.reserva({ clinica: 'maguey', usuario: `usr-${p.id}`, servicio: 'limpieza', inicio: instante(4, '10:00'), canales: ['whatsapp'], newsletter: false, clave: 'sinwa' });
  await w.asienta();
  const conf = (await avisosWa(w)).find((a) => a.clase === 'confirmacion')!;
  assert.deepEqual([conf.estado, conf.motivo], ['fallido', 'no_whatsapp']);
  const respaldo = (await w.almacen.avisos('maguey')).find((a) => a.canal === 'correo' && a.clase === 'confirmacion');
  assert.equal(respaldo?.estado, 'entregado', 'la confirmación llegó por correo');
  assert.ok(w.buzon.enviados.some((e) => /confirmada/.test(e.asunto)));
});

test('plantilla PAUSADA por Meta (132015) o número de la clínica DESCONECTADO: falla, alerta y respaldo por correo', async () => {
  const w = await bancoWa();
  const { cl } = await conCitaWa(w);
  await w.asienta();
  w.meta.cambiaPlantilla(NUMEROS[0]!.phoneNumberId, 'recordatorio_cita_24h_v1', 'PAUSED');
  await w.asienta();
  assert.ok(w.receptor.alertas.some((a) => /recordatorio_cita_24h_v1 está PAUSED/.test(a.texto)));
  w.reloj.avanza(3 * 24 * 3_600_000 + 3 * 3_600_000);
  await w.asienta();
  const r24 = (await avisosWa(w)).find((a) => a.clase === 'recordatorio_24h')!;
  assert.deepEqual([r24.estado, r24.motivo], ['fallido', 'plantilla']);
  assert.ok(w.buzon.enviados.some((e) => /Mañana es tu cita/.test(e.asunto)), 'el recordatorio salió por correo');
  w.meta.desconecta(NUMEROS[0]!.phoneNumberId);
  await w.asienta();
  assert.ok(w.receptor.alertas.some((a) => /desconectó el número/.test(a.texto)));
  w.reloj.avanza(22 * 3_600_000);
  await w.asienta();
  const r2 = (await avisosWa(w)).find((a) => a.clase === 'recordatorio_2h')!;
  assert.deepEqual([r2.estado, r2.motivo], ['fallido', 'canal_desconectado']);
  assert.ok(w.buzon.enviados.some((e) => /es en 2 horas/.test(e.asunto)));
  assert.equal(vistos(cl).filter((x) => /recordatorio|es hoy/.test(x)).length, 0);
});

test('Meta pasa una plantilla de utility a MARKETING: alerta grave (cuesta más y pide otro consentimiento)', async () => {
  const w = await bancoWa();
  w.meta.recategoriza(NUMEROS[0]!.phoneNumberId, 'cita_confirmada_v1', 'marketing');
  await w.asienta();
  assert.ok(w.receptor.alertas.some((a) => a.nivel === 'grave' && /cita_confirmada_v1 a MARKETING/.test(a.texto)));
});

test('GATE por canal: el transporte REAL de WhatsApp no se construye sin SU revisión firmada; la de otro canal o la variable vieja no lo abren', async () => {
  const red = (async () => { throw new Error('salió a la red'); }) as typeof fetch;
  assert.throws(() => transporteWhatsAppReal({ env: {}, token: 't', fetch: red }), GateCerrado);
  assert.throws(() => transporteWhatsAppReal({ env: { CLINICA_C3_C4_FIRMADOS: '1' }, token: 't', fetch: red }), GateCerrado);
  const soloTelegram = { correo: null, telegram: 'rev-tg-1', whatsapp: null } as const;
  assert.throws(() => transporteWhatsAppReal({ env: { CLINICA_GATE_TELEGRAM: 'rev-tg-1', CLINICA_GATE_WHATSAPP: 'rev-tg-1' }, token: 't', fetch: red, revisiones: soloTelegram }), GateCerrado, 'firmar Telegram no abre WhatsApp');
  const conWa = { correo: null, telegram: null, whatsapp: 'rev-wa-1' } as const;
  assert.throws(() => transporteWhatsAppReal({ env: { CLINICA_GATE_WHATSAPP: 'otra' }, token: 't', fetch: red, revisiones: conWa }), GateCerrado, 'el id del entorno tiene que ser el de la revisión');
  const pedidos: string[] = [];
  const falso = (async (url: string) => { pedidos.push(url); return new Response(JSON.stringify({ messages: [{ id: 'wamid.REAL' }] }), { status: 200 }); }) as unknown as typeof fetch;
  const g = transporteWhatsAppReal({ env: { CLINICA_GATE_WHATSAPP: 'rev-wa-1' }, token: 't', fetch: falso, revisiones: conWa });
  assert.deepEqual(await g.enviaMensaje('109', { to: '52' }), { ok: true, wamid: 'wamid.REAL' });
  assert.deepEqual(pedidos, ['https://graph.facebook.com/v24.0/109/messages'], 'contra un fetch falso: no medido contra Meta');
});

test('CERO PII en el libro tras una sesión completa de WhatsApp: ni nombres, ni celulares, ni el wa_id en ninguna de sus formas, ni lo que se escribió', async () => {
  const w = await bancoWa({ transcribe: async () => ['quiero saber cuánto cuesta la limpieza'] });
  const { p, cl } = await conCitaWa(w);
  cl.escribe('Hola, soy Ameyalli Tlatoani, ¿cuánto cuesta la limpieza?');
  cl.mandaAudio(new Uint8Array([1, 2, 3, 4, 5]));
  cl.mandaImagen(new Uint8Array([0xff, 0xd8]), 'mira mi muela Ameyalli');
  cl.escribe('Quiero hablar con una persona');
  await w.asienta();
  const libro = JSON.stringify(await w.libro.eventos('maguey'));
  const prohibidos = [...sembrados(), waIdDe(p), waIdDe(p, true), waIdDe(p).slice(2), 'Tlatoani', 'mira mi muela', 'cuánto cuesta'];
  const fugas = prohibidos.filter((x) => libro.includes(x));
  assert.deepEqual(fugas, []);
  assert.ok(libro.includes('whatsapp_entrante') && libro.includes('whatsapp_cobro'), 'control: el libro SÍ registró la sesión');
  assert.ok(JSON.stringify(w.almacen.exporta()).includes(waIdDe(p)), 'control: el número SÍ está en el expediente del portal, así que la búsqueda busca');
});

test('el contrato v2 sigue leyendo un libro v1: un evento escrito con v=1 se verifica igual', async () => {
  const almacen = libroEnMemoria();
  const libro = creaLibro({ almacen, reloj: () => Date.parse('2026-10-16T12:00:00Z') });
  await libro.registra({ clinica: 'maguey', tipo: 'telegram_vinculado', sujeto: `pac_${'c'.repeat(20)}` }, 'k1');
  const [e] = await almacen.eslabones('maguey');
  const comoV1 = { ...e!, evento: { ...e!.evento, v: 1 as const } };
  const { hashDeEslabon, verificaLibro } = await import('../dist/servidor.js');
  const { hash: _h, ...sinHash } = comoV1;
  void _h;
  const v1 = { ...comoV1, hash: hashDeEslabon(sinHash) };
  assert.deepEqual(verificaLibro([v1]).ok, true);
});
