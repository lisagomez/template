/**
 * La seguridad de la puerta de salida: llaves con rol y alcance (sesión, chat, IP, vencimiento, revocación), la
 * firma HMAC de los webhooks salientes y la de Meta en los entrantes, la idempotencia con los códigos de OpenWA, la
 * frontera de contactos nuevos, cero escritura a la consola (ni un teléfono en un log) y cero dependencias no
 * oficiales de WhatsApp en ningún lockfile del repo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENTE_ENTREGA } from '../dist/openwa/index.js';
import { bancoOpenWA, SECRETO_APP, WA, WA2 } from './_openwa.ts';

const raizRepo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const chat = `${WA}@c.us`;

async function conLlave(b: ReturnType<typeof bancoOpenWA>, cuerpo: Record<string, unknown>) {
  return (await b.pide('POST', '/api/auth/api-keys', { name: 'llave-de-prueba', ...cuerpo })).cuerpo as { id: string; apiKey: string };
}

test('llaves: rol, alcance por sesión y por chat, IP, vencimiento y revocación', async () => {
  const b = bancoOpenWA();
  const { id: S } = await b.sesionLista();
  const otra = (await b.pide('POST', '/api/sessions', { name: 'otra-sesion' })).cuerpo as { id: string };
  b.cliente(WA).escribe('hola');
  b.cliente(WA2, 'Beto').escribe('hola');
  await b.drena();
  const lector = await conLlave(b, { role: 'viewer' });
  const operador = await conLlave(b, { role: 'operator', allowedSessions: [S], allowedChats: [chat] });
  const texto = (k: string, a = chat) => b.pide('POST', `/api/sessions/${S}/messages/send-text`, { chatId: a, text: 'x' }, {}, k);
  assert.equal((await b.pide('GET', '/api/sessions/x', undefined, {}, null)).status, 401, 'sin llave');
  assert.equal((await b.pide('GET', '/api/sessions', undefined, {}, 'llave-inventada')).status, 401);
  assert.equal((await b.pide('GET', `/api/sessions/${S}/messages`, undefined, {}, lector.apiKey)).status, 200, 'viewer lee');
  assert.equal((await texto(lector.apiKey)).status, 403, 'viewer no envía');
  assert.equal((await b.pide('POST', '/api/auth/api-keys', { name: 'escala' }, {}, operador.apiKey)).status, 403, 'operator no crea llaves');
  assert.equal((await b.pide('POST', '/api/sessions', { name: 'nueva' }, {}, operador.apiKey)).status, 403, 'una llave con alcance no crea sesiones');
  assert.equal((await b.pide('GET', `/api/sessions/${otra.id}`, undefined, {}, operador.apiKey)).status, 403, 'fuera de su sesión');
  assert.deepEqual(((await b.pide('GET', '/api/sessions', undefined, {}, operador.apiKey)).cuerpo as Array<{ id: string }>).map((x) => x.id), [S]);
  const qrAjeno = (await b.pide('GET', `/api/sessions/${otra.id}/qr`, undefined, {}, operador.apiKey)).cuerpo as { signupUrl?: string; alternativa: string };
  assert.ok(!qrAjeno.signupUrl && !qrAjeno.alternativa.includes('liga='), 'el 501 del QR no entrega la liga de alta de otra sesión');
  assert.equal((await texto(operador.apiKey)).status, 201, 'su chat');
  assert.equal((await texto(operador.apiKey, `${WA2}@c.us`)).status, 403, 'fuera de su chat');
  assert.deepEqual(((await b.pide('GET', `/api/sessions/${S}/chats`, undefined, {}, operador.apiKey)).cuerpo as Array<{ id: string }>).map((x) => x.id), [chat], 'el chat como lo reportó Meta (521…), no normalizado');
  const conIp = await conLlave(b, { role: 'operator', allowedIps: ['10.0.0.9'] });
  assert.equal((await texto(conIp.apiKey)).status, 403, 'IP fuera de la lista');
  const vence = await conLlave(b, { role: 'operator', expiresAt: new Date(b.reloj() + 60_000).toISOString() });
  assert.equal((await texto(vence.apiKey)).status, 201);
  b.reloj.avanza(120_000);
  assert.equal((await texto(vence.apiKey)).status, 401, 'vencida');
  await b.pide('POST', `/api/auth/api-keys/${operador.id}/revoke`);
  assert.equal((await texto(operador.apiKey)).status, 401, 'revocada');
  const listadas = JSON.stringify((await b.pide('GET', '/api/auth/api-keys')).cuerpo);
  assert.ok(!listadas.includes(operador.apiKey) && !listadas.includes('"hash"'), 'la llave en claro solo sale al crearla');
});

test('webhooks: sobre, cabeceras X-OpenWA-* y HMAC-SHA256 del cuerpo crudo; sin secreto no hay firma', async () => {
  const b = bancoOpenWA();
  const { id: S } = await b.sesionLista('tienda', 'secreto-de-webhook-sintetico');
  await b.pide('POST', `/api/sessions/${S}/webhooks`, { url: 'https://receptor.invalid/sin-firma', events: ['message.received'] });
  b.cliente(WA).escribe('Hola');
  await b.drena();
  const [firmada, sinFirma] = ['https://receptor.invalid/openwa', 'https://receptor.invalid/sin-firma'].map((u) => b.entregas.find((e) => e.url === u && e.headers['x-openwa-event'] === 'message.received')!);
  assert.equal(firmada!.headers['x-openwa-signature'], `sha256=${createHmac('sha256', 'secreto-de-webhook-sintetico').update(firmada!.body).digest('hex')}`);
  assert.equal(sinFirma!.headers['x-openwa-signature'], undefined);
  const sobre = JSON.parse(firmada!.body) as Record<string, unknown>;
  assert.deepEqual(Object.keys(sobre).sort(), ['data', 'deliveryId', 'event', 'idempotencyKey', 'sessionId', 'timestamp']);
  assert.equal(firmada!.headers['x-openwa-idempotency-key'], sobre.idempotencyKey);
  assert.match(String(sobre.deliveryId), /^dlv_/);
  assert.match(String(sobre.idempotencyKey), /^msg_/);
  assert.equal(firmada!.headers['user-agent'], AGENTE_ENTREGA, 'dice quién entrega: no se presenta como OpenWA');
  assert.equal((await b.pide('POST', `/api/sessions/${S}/webhooks`, { url: 'http://receptor.invalid/x' })).status, 400, 'http solo a la máquina local');
});

test('Meta → fachada: sin la firma de la app no entra nada', async () => {
  const b = bancoOpenWA();
  await b.sesionLista();
  const cuerpo = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'waba_tienda', changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'pn_tienda' }, messages: [{ from: WA, id: 'wamid.FALSO', timestamp: '1', type: 'text', text: { body: 'inyectado' } }] } }] }] });
  assert.equal((await b.fachada.recibeDeMeta(cuerpo, undefined)).status, 401);
  assert.equal((await b.fachada.recibeDeMeta(cuerpo, `sha256=${createHmac('sha256', 'otro').update(cuerpo).digest('hex')}`)).status, 401);
  assert.equal(b.eventos('message.received').length, 0);
  assert.equal((await b.fachada.recibeDeMeta(cuerpo, `sha256=${createHmac('sha256', SECRETO_APP).update(cuerpo).digest('hex')}`)).status, 200);
  assert.equal(b.eventos('message.received').length, 1);
});

test('idempotencia: misma llave y cuerpo repite sin volver a Meta; otro cuerpo 422; inválida 400; un 4xx la libera', async () => {
  const b = bancoOpenWA();
  const { id: S } = await b.sesionLista();
  b.cliente(WA).escribe('hola');
  await b.drena();
  const ruta = `/api/sessions/${S}/messages/send-text`;
  const graph = () => b.meta.registro.filter((x) => x.tipo === 'graph').length;
  const antes = graph();
  const r1 = await b.pide('POST', ruta, { chatId: chat, text: 'uno' }, { 'idempotency-key': 'k-1' });
  const r2 = await b.pide('POST', ruta, { chatId: chat, text: 'uno' }, { 'idempotency-key': 'k-1' });
  assert.deepEqual(r2.cuerpo, r1.cuerpo);
  assert.equal(r2.cabeceras?.['idempotent-replayed'], 'true');
  assert.equal(graph() - antes, 1, 'Meta recibió uno');
  assert.equal(((await b.pide('POST', ruta, { chatId: chat, text: 'dos' }, { 'idempotency-key': 'k-1' })).cuerpo as { code: string }).code, 'IDEMPOTENCY_KEY_REUSED');
  assert.equal(((await b.pide('POST', ruta, { chatId: chat, text: 'x' }, { 'idempotency-key': 'con espacio' })).cuerpo as { code: string }).code, 'IDEMPOTENCY_KEY_INVALID');
  assert.equal((await b.pide('POST', ruta, { chatId: chat }, { 'idempotency-key': 'k-2' })).status, 400);
  assert.equal((await b.pide('POST', ruta, { chatId: chat, text: 'ya bien' }, { 'idempotency-key': 'k-2' })).status, 201, 'el 400 liberó la llave');
});

test('frontera de salida: más contactos nuevos por hora que el límite → 429 SEND_PACING_LIMITED; los conocidos pasan', async () => {
  const b = bancoOpenWA({ contactosNuevosPorHora: 2 });
  const { id: S } = await b.sesionLista();
  const t = (await b.pide('POST', `/api/sessions/${S}/templates`, { name: 'Aviso', body: 'Tenemos café nuevo.' })).cuerpo as { id: string; metaName: string };
  b.meta.administracion.revisa('waba_tienda', t.metaName, true);
  await b.drena();
  const manda = (n: number) => b.pide('POST', `/api/sessions/${S}/messages/send-template`, { chatId: `52155000001${n.toString().padStart(2, '0')}@c.us`, templateId: t.id });
  assert.equal((await manda(1)).status, 201);
  assert.equal((await manda(2)).status, 201);
  const tercero = await manda(3);
  assert.equal(tercero.status, 429);
  assert.equal((tercero.cuerpo as { code: string }).code, 'SEND_PACING_LIMITED');
  assert.ok(Number(tercero.cabeceras?.['retry-after']) > 0);
  assert.equal((await manda(1)).status, 201, 'a un contacto que ya existe no lo frena');
  b.reloj.avanza(3_600_001);
  assert.equal((await manda(3)).status, 201, 'pasada la hora, entra');
});

test('bloqueo: la Block Users API solo bloquea a quien escribió en 24 h', async () => {
  const b = bancoOpenWA();
  const { id: S } = await b.sesionLista();
  b.cliente(WA).escribe('hola');
  await b.drena();
  const ruta = `/api/sessions/${S}/contacts/${encodeURIComponent(chat)}/block`;
  b.reloj.avanza(25 * 3_600_000);
  const tarde = await b.pide('POST', ruta);
  assert.equal(tarde.status, 422);
  assert.equal((tarde.cuerpo as { code: string }).code, 'FUERA_DE_VENTANA');
  b.cliente(WA).escribe('otra vez');
  await b.drena();
  assert.equal((await b.pide('POST', ruta)).status, 200);
  assert.equal((await b.pide('POST', `/api/sessions/${S}/messages/send-text`, { chatId: chat, text: 'x' })).status, 422, 'a un bloqueado no se le escribe');
});

test('cero escritura a la consola en un recorrido completo (ningún teléfono ni cuerpo en un log)', async () => {
  const escrito: string[] = [];
  const originales = { out: process.stdout.write.bind(process.stdout), err: process.stderr.write.bind(process.stderr), log: console.log, error: console.error, warn: console.warn, info: console.info };
  const atrapa = (x: unknown) => { escrito.push(String(x)); return true; };
  process.stdout.write = atrapa as typeof process.stdout.write;
  process.stderr.write = atrapa as typeof process.stderr.write;
  console.log = console.error = console.warn = console.info = (...a: unknown[]) => { escrito.push(a.join(' ')); };
  try {
    const b = bancoOpenWA();
    const { id: S } = await b.sesionLista();
    b.cliente(WA).escribe('Hola, soy Ana, mi número es el de siempre');
    await b.drena();
    await b.pide('POST', `/api/sessions/${S}/messages/send-text`, { chatId: chat, text: 'Hola Ana' });
    await b.pide('POST', `/api/sessions/${S}/messages/send-image`, { chatId: chat, base64: 'aGVsbG8=' });
    await b.pide('GET', `/api/sessions/${S}/qr`);
    await b.drena();
  } finally {
    Object.assign(console, { log: originales.log, error: originales.error, warn: originales.warn, info: originales.info });
    process.stdout.write = originales.out;
    process.stderr.write = originales.err;
  }
  assert.deepEqual(escrito, []);
});

test('ningún lockfile del repo trae whatsapp-web.js, Baileys, Puppeteer ni otra librería no oficial; el SDK no trae dependencias', () => {
  const NO_OFICIALES = /(^|\/)(whatsapp-web\.js|@whiskeysockets\/baileys|baileys|puppeteer|puppeteer-core|venom-bot|@wppconnect-team\/wppconnect|@open-wa\/wa-automate|whatsapp-web-js)$/;
  const lockfiles = execFileSync('git', ['ls-files', '*package-lock.json'], { cwd: raizRepo, encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.ok(lockfiles.includes('package-lock.json'));
  const encontradas: string[] = [];
  for (const l of lockfiles) {
    const paquetes = (JSON.parse(readFileSync(join(raizRepo, l), 'utf8')) as { packages?: Record<string, unknown> }).packages ?? {};
    for (const ruta of Object.keys(paquetes)) if (NO_OFICIALES.test(ruta.replace(/^.*node_modules\//, ''))) encontradas.push(`${l}: ${ruta}`);
  }
  const sdk = (JSON.parse(readFileSync(join(raizRepo, 'package-lock.json'), 'utf8')) as { packages: Record<string, { dependencies?: object; dev?: boolean }> }).packages['node_modules/@rmyndharis/openwa'];
  console.log(`lockfiles revisados: ${lockfiles.length}; dependencias no oficiales: ${encontradas.length}`);
  assert.deepEqual(encontradas, []);
  assert.equal(sdk?.dev, true, 'el SDK solo es de desarrollo (pruebas)');
  assert.equal(Object.keys(sdk?.dependencies ?? {}).length, 0);
});

test('un receptor colgado no retrasa el 200 a Meta ni la respuesta de un envío: las entregas van de fondo', async () => {
  let suelta = () => {};
  const colgado = new Promise<void>((ok) => { suelta = ok; });
  const b = bancoOpenWA({ entrega: async () => { await colgado; return { status: 200 }; } });
  const { id: S } = await b.sesionLista();
  b.cliente(WA).escribe('hola');
  const acuses: number[] = [];
  const meta = b.meta.drena().then(() => acuses.push(1));
  const envio = b.pide('POST', `/api/sessions/${S}/messages/send-text`, { chatId: chat, text: 'x' });
  await Promise.race([Promise.all([meta, envio]), new Promise((_, mal) => setTimeout(() => mal(new Error('esperó al receptor')), 2000))]);
  assert.equal(acuses.length, 1, 'Meta recibió su acuse con el receptor colgado');
  assert.equal((await envio).status, 201);
  suelta();
  await b.fachada.asienta();
});
