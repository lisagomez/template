/**
 * El SDK oficial de OpenWA (`@rmyndharis/openwa@0.6.0`, SIN modificar: se comprueba la huella de los 114 archivos
 * instalados) recorre los flujos del spec contra la fachada servida por HTTP en 127.0.0.1 y el simulador de Meta. Los
 * webhooks llegan por HTTP a un receptor que los verifica con `verifyWebhookSignature` del mismo SDK, como lo haría
 * quien hoy recibe de OpenWA. Una guardia de red cuenta cada `fetch`: ninguno sale de 127.0.0.1.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenWAClient, OpenWAApiError, verifyWebhookSignature } from '@rmyndharis/openwa';
import type { FachadaOpenWA } from '../dist/openwa/index.js';
import { bancoOpenWA, MAESTRA, WA } from './_openwa.ts';

const HUELLA_SDK = 'sha256:3e42cc3961597cef32c45785886fc23e9604b9e82f79fd9e9108f96337550c37';
const PREFIJO = '/api/ventas-whatsapp/openwa';
const SECRETO = 'secreto-de-webhook-sintetico';

function huellaDelSdk(): { archivos: number; huella: string } {
  let raiz = dirname(fileURLToPath(import.meta.resolve('@rmyndharis/openwa')));
  while (!existsSync(join(raiz, 'package.json')) || JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')).name !== '@rmyndharis/openwa') raiz = dirname(raiz);
  const filas: string[] = [];
  const anda = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, e.name);
      if (e.isDirectory()) anda(p); else filas.push(`${relative(raiz, p)} ${createHash('sha256').update(readFileSync(p)).digest('hex')}`);
    }
  };
  anda(raiz);
  return { archivos: filas.length, huella: `sha256:${createHash('sha256').update(filas.join('\n')).digest('hex')}` };
}

const lee = (req: IncomingMessage) => new Promise<string>((ok) => { let t = ''; req.setEncoding('utf8'); req.on('data', (c: string) => { t += c; }); req.on('end', () => ok(t)); });
const escucha = (s: Server) => new Promise<number>((ok) => s.listen(0, '127.0.0.1', () => ok((s.address() as AddressInfo).port)));

/** La fachada por HTTP, con el prefijo con el que la sirve la app. */
function sirve(f: () => FachadaOpenWA): Server {
  return createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', 'http://127.0.0.1');
    const crudo = await lee(req);
    const cabeceras = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v]));
    const r = await f().atiende({ metodo: req.method ?? 'GET', ruta: u.pathname.slice(PREFIJO.length), consulta: u.searchParams, cabeceras, cuerpo: crudo ? JSON.parse(crudo) : undefined, ip: req.socket.remoteAddress ?? '' });
    res.writeHead(r.status, { 'content-type': 'application/json', ...r.cabeceras });
    res.end(r.cuerpo === undefined ? undefined : JSON.stringify(r.cuerpo));
  });
}

test('el SDK 0.6.0 sin modificar recorre los flujos del spec contra la fachada y el simulador', async (t) => {
  const sdk = huellaDelSdk();
  assert.equal(sdk.huella, HUELLA_SDK, 'el SDK instalado no es el 0.6.0 publicado');
  const salida: string[] = [`SDK @rmyndharis/openwa 0.6.0 sin modificar (${sdk.archivos} archivos, huella ${sdk.huella.slice(0, 19)}…)`];
  const paso = (s: string) => { salida.push(s); };

  const red: string[] = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
    red.push(entrada instanceof Request ? entrada.url : String(entrada));
    return fetchOriginal(entrada, init);
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = fetchOriginal; });

  const recibidas: Array<{ evento: string; firmaValida: boolean; cuerpo: { event: string; data: Record<string, unknown> } }> = [];
  const receptor = createServer(async (req, res) => {
    const crudo = await lee(req);
    const firmaValida = await verifyWebhookSignature(crudo, req.headers['x-openwa-signature'] as string | undefined, SECRETO);
    recibidas.push({ evento: String(req.headers['x-openwa-event']), firmaValida, cuerpo: JSON.parse(crudo) });
    res.writeHead(firmaValida ? 200 : 401).end();
  });
  const pReceptor = await escucha(receptor);
  const b = bancoOpenWA({ entrega: async (url, init) => ({ status: (await fetch(url, init)).status }) });
  const servidor = sirve(() => b.fachada);
  const puerto = await escucha(servidor);
  t.after(() => { servidor.close(); receptor.close(); });

  const cliente = new OpenWAClient({ baseUrl: `http://127.0.0.1:${puerto}${PREFIJO}`, apiKey: MAESTRA });
  const quien = await cliente.auth();
  paso(`auth() → valid=${quien.valid} role=${quien.role} engineType=${quien.engineType}`);

  const s = await cliente.sessions.create({ name: 'tienda-principal' });
  const lista = await cliente.sessions.list();
  paso(`sessions.create → ${s.status}; sessions.list → ${lista.length} sesión`);
  const iniciada = await cliente.sessions.start(s.id) as typeof s & { signupUrl?: string };
  assert.equal(iniciada.status, 'action_required');
  assert.match(iniciada.signupUrl ?? '', /^https:\/\/.*liga=/);
  paso(`sessions.start → ${iniciada.status}, signupUrl (liga de alta de Embedded Signup) en vez de QR`);
  const qr = await cliente.sessions.getQrCode(s.id).catch((e: unknown) => e);
  assert.ok(qr instanceof OpenWAApiError && qr.status === 501);
  const cuerpoQr = qr.body as { code: string; alternativa: string; signupUrl: string };
  assert.equal(cuerpoQr.signupUrl, iniciada.signupUrl);
  paso(`sessions.getQrCode → ${qr.status} ${cuerpoQr.code}; alternativa: «${cuerpoQr.alternativa.slice(0, 60)}…»`);

  await b.completaAlta(s.id);
  const lista2 = await cliente.sessions.get(s.id);
  assert.equal(lista2.status, 'ready');
  paso(`la pyme termina el alta → sessions.get → ${lista2.status} (${lista2.phone})`);

  const w = await cliente.webhooks.create(s.id, { url: `http://127.0.0.1:${pReceptor}/openwa`, events: ['*'], secret: SECRETO });
  paso(`webhooks.create → ${w.events.join(',')} (el secreto no vuelve en la respuesta: ${!('secret' in w)})`);

  b.cliente(WA).escribe('Hola, ¿tienen café de olla?');
  await b.drena();
  const entrante = recibidas.find((r) => r.evento === 'message.received');
  assert.ok(entrante?.firmaValida, 'el receptor verifica la firma con el SDK');
  paso(`webhook message.received «${String(entrante.cuerpo.data.body)}» → verifyWebhookSignature = ${entrante.firmaValida}`);

  const chat = String(entrante.cuerpo.data.chatId);
  const enVentana = await cliente.messages.sendText(s.id, { chatId: chat, text: 'Sí, de olla. ¿Cuántos?' }, 'idem-0001');
  paso(`messages.sendText dentro de la ventana → ${enVentana.messageId.slice(0, 18)}…`);
  const imagen = await cliente.messages.sendImage(s.id, { chatId: chat, url: 'https://medios.invalid/cafe.jpg', caption: 'Así se ve' });
  const doc = await cliente.messages.sendDocument(s.id, { chatId: chat, url: 'https://medios.invalid/menu.pdf', filename: 'menu.pdf' });
  paso(`messages.sendImage + sendDocument por url → ${[imagen, doc].map((x) => x.messageId.slice(0, 12)).join(', ')}`);
  const b64 = await cliente.messages.sendImage(s.id, { chatId: chat, base64: 'aGVsbG8=', mimetype: 'image/png' }).catch((e: unknown) => e);
  assert.ok(b64 instanceof OpenWAApiError && b64.status === 422 && b64.code === 'SOLO_URL');
  paso(`messages.sendImage con base64 → ${b64.status} ${b64.code}`);

  const creada = await cliente.templates.create(s.id, { name: 'Pedido listo', body: 'Hola {{nombre}}, tu pedido {{pedido}} está listo.' });
  const tpl = creada as typeof creada & { metaName: string; metaStatus: string };
  paso(`templates.create → metaStatus=${tpl.metaStatus} (Meta la revisa)`);
  b.meta.administracion.revisa('waba_tienda', tpl.metaName, true);
  await b.drena();

  b.reloj.avanza(25 * 3_600_000);
  const fuera = await cliente.messages.sendText(s.id, { chatId: chat, text: '¿Sigues ahí?' }).catch((e: unknown) => e);
  assert.ok(fuera instanceof OpenWAApiError && fuera.status === 422 && fuera.code === 'FUERA_DE_VENTANA');
  const cuerpoFuera = fuera.body as { alternativa: string; plantillasAprobadas: Array<{ name: string }> };
  assert.deepEqual(cuerpoFuera.plantillasAprobadas.map((p) => p.name), ['Pedido listo']);
  paso(`25 h después, messages.sendText → ${fuera.status} ${fuera.code}; sugiere: ${cuerpoFuera.plantillasAprobadas.map((p) => p.name).join(', ')}`);
  const plantilla = await cliente.messages.sendTemplate(s.id, { chatId: chat, templateId: tpl.id, vars: { nombre: 'Ana', pedido: 'A-17' } });
  paso(`messages.sendTemplate fuera de la ventana → ${plantilla.messageId.slice(0, 18)}…`);

  await b.drena();
  const acks = recibidas.filter((r) => r.evento === 'message.ack');
  assert.ok(acks.length >= 3 && recibidas.every((r) => r.firmaValida));
  paso(`webhooks recibidos: ${recibidas.length} (${[...new Set(recibidas.map((r) => r.evento))].join(', ')}), todos con firma válida`);

  const ajenas = red.filter((u) => new URL(u).hostname !== '127.0.0.1');
  paso(`guardia de red: ${red.length} peticiones, ${ajenas.length} fuera de 127.0.0.1 (0 a Meta, 0 a un OpenWA real)`);
  assert.deepEqual(ajenas, []);
  console.log(salida.map((l) => `  ${l}`).join('\n'));
});
