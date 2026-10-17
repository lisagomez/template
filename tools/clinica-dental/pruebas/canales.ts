/**
 * Canales (lazo l-canales, referencia: RFC 8058 y la regla de canales de chat de AGENTS.md): todo va contra
 * simuladores por defecto; el adaptador real se NIEGA sin el gate; el recordatorio es idempotente; tras la
 * baja de un clic, cero newsletters; el .ics cumple RFC 5545; Telegram exige que el paciente inicie el chat.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BuzonSimulado, CorreoGmail, GateCerrado, TelegramSimulado, construyeIcs, creaCanalTelegram, cumpleRfc8058, enlaceProfundo, leeEml, leeIcs,
  pliega, transporteTelegramReal,
} from '../dist/servidor.js';
import { alta, banco, instante, PACIENTES, type PacienteSintetico } from './_banco.ts';

const sintetico = (id: string): PacienteSintetico => PACIENTES.pacientes.find((p) => p.id === id)!;
const HORA = 3_600_000;

async function conCita(id: string, canales: ('correo' | 'telegram')[] = ['correo'], newsletter = false) {
  const b = banco();
  const p = sintetico(id);
  await alta(b, p);
  const r = await b.portal.reserva({ clinica: p.clinica, usuario: `usr-${p.id}`, servicio: p.cita.servicio, inicio: instante(p.cita.diasAdelante, p.cita.hora), canales, newsletter, clave: 'c1' });
  assert.ok(r.ok, JSON.stringify(r));
  return { b, p, cita: r.cita };
}

test('el adaptador REAL de Gmail y el de Telegram se niegan a construirse sin CLINICA_C3_C4_FIRMADOS=1', () => {
  const fetchQueNoDebeLlamarse = (async () => { throw new Error('salió a la red'); }) as typeof fetch;
  assert.throws(() => new CorreoGmail({ env: {}, token: async () => 'x', fetch: fetchQueNoDebeLlamarse }), GateCerrado);
  assert.throws(() => new CorreoGmail({ env: { CLINICA_C3_C4_FIRMADOS: '0' }, token: async () => 'x', fetch: fetchQueNoDebeLlamarse }), /C3 y C4 firmados/);
  assert.throws(() => transporteTelegramReal({ env: { CLINICA_C3_C4_FIRMADOS: 'true' }, token: 'x', fetch: fetchQueNoDebeLlamarse }), GateCerrado);
});

test('con el gate, el adaptador de Gmail arma la llamada correcta (contra un fetch falso: no medido contra Google)', async () => {
  let pedido: { url: string; cuerpo: { raw: string } } | null = null;
  const falso = (async (url: string, init: RequestInit) => {
    pedido = { url, cuerpo: JSON.parse(String(init.body)) as { raw: string } };
    return new Response(JSON.stringify({ id: 'gm-1' }), { status: 200 });
  }) as unknown as typeof fetch;
  const g = new CorreoGmail({ env: { CLINICA_C3_C4_FIRMADOS: '1' }, token: async () => 'tok', fetch: falso });
  const r = await g.envia({ idMensaje: 'avi_1@x.example', de: { nombre: 'Clínica', direccion: 'a@x.example' }, para: 'p@pacientes.example', asunto: 'Hola', texto: 't', html: '<p>t</p>', fecha: new Date(0) });
  assert.ok(r.ok);
  assert.equal(pedido!.url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  assert.match(Buffer.from(pedido!.cuerpo.raw, 'base64url').toString('utf8'), /Message-ID: <avi_1@x\.example>/);
});

test('al confirmar: correo de confirmación con .ics (RFC 5545) y recordatorios de 24 h y 2 h programados', async () => {
  const { b, cita } = await conCita('adulto-convenio');
  const avisos = await b.almacen.avisos('maguey');
  assert.deepEqual(avisos.map((a) => a.clase).sort(), ['confirmacion', 'newsletter', 'recordatorio_24h', 'recordatorio_2h']);
  assert.equal(avisos.find((a) => a.clase === 'recordatorio_24h')!.para, cita.inicio - 24 * HORA);
  await b.portal.despacha();
  const conf = b.buzon.enviados.find((e) => e.asunto.includes('confirmada'))!;
  const eml = leeEml(conf.eml);
  const ics = eml.partes.find((p) => p.nombre === 'cita.ics')!;
  const props = leeIcs(ics.contenido);
  assert.equal(props['METHOD'], 'PUBLISH');
  assert.equal(props['UID'], `${cita.id}@maguey.clinica.example`);
  assert.match(props['DTSTART'] ?? '', /^\d{8}T\d{6}Z$/);
  assert.match(props['DTSTAMP'] ?? '', /Z$/);
  assert.ok(ics.contenido.includes('BEGIN:VALARM') && ics.contenido.includes('TRIGGER:-PT2H'));
  assert.ok(ics.contenido.split('\r\n').every((l) => Buffer.byteLength(l, 'utf8') <= 75), 'líneas plegadas a 75 octetos');
});

test('pliegue UTF-8 a 75 octetos sin partir un carácter, y escape de comas y punto y coma', () => {
  const larga = `SUMMARY:${'Ñandú; acentuación, '.repeat(8)}`;
  const plegada = pliega(larga);
  assert.ok(plegada.split('\r\n').every((l) => Buffer.byteLength(l, 'utf8') <= 75));
  assert.equal(plegada.replace(/\r\n /g, ''), larga);
  const ics = construyeIcs({ uid: 'u@x.example', inicio: new Date(0), fin: new Date(1), resumen: 'A, B; C', lugar: 'Calle 1, Col. 2', descripcion: 'x', sello: new Date(0) });
  assert.match(ics, /SUMMARY:A\\, B\\; C/);
});

test('recordatorio IDEMPOTENTE: despachar tres veces (y dos a la vez) manda cada aviso una sola vez', async () => {
  const { b, cita } = await conCita('adulto-convenio');
  await Promise.all([b.portal.despacha(), b.portal.despacha()]);
  await b.portal.despacha();
  b.reloj.fija(new Date(cita.inicio - 23 * HORA).toISOString());
  await Promise.all([b.portal.despacha(), b.portal.despacha(), b.portal.despacha()]);
  const asuntos = b.buzon.enviados.map((e) => e.asunto);
  assert.equal(asuntos.filter((a) => a.startsWith('Tu cita en')).length, 1, 'una confirmación');
  assert.equal(asuntos.filter((a) => a.startsWith('Mañana es tu cita')).length, 1, 'un recordatorio de 24 h');
  assert.equal((await b.libro.eventos('maguey')).filter((e) => e.tipo === 'aviso_enviado').length, 3, 'confirmación + newsletter + 24 h');
});

test('un 429 del proveedor se reintenta con espera y sin duplicar', async () => {
  const { b } = await conCita('menor-con-tutor');
  b.buzon.limita(1);
  const r1 = await b.portal.despacha();
  assert.equal(r1.reintentos, 1);
  assert.equal(b.buzon.enviados.length, 0);
  b.reloj.avanza(61_000);
  const r2 = await b.portal.despacha();
  assert.equal(r2.entregados, 1);
  assert.equal(b.buzon.enviados.length, 1);
});

test('newsletter APARTE del recordatorio, con List-Unsubscribe + List-Unsubscribe-Post de un clic (RFC 8058)', async () => {
  const { b } = await conCita('baja-newsletter', ['correo'], true);
  await b.portal.despacha();
  const n = b.buzon.enviados.find((e) => e.masivo)!;
  const cab = leeEml(n.eml).cabeceras;
  assert.ok(cumpleRfc8058(cab), JSON.stringify(cab));
  assert.match(cab['List-Unsubscribe'] ?? '', /^<https:\/\/colibri\.clinica\.example\/api\/clinica-dental\/baja\/tok_[0-9a-f]{20}>, <mailto:/);
  assert.equal(cab['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  const recordatorio = b.buzon.enviados.find((e) => !e.masivo)!;
  assert.equal(leeEml(recordatorio.eml).cabeceras['List-Unsubscribe'], undefined, 'el transaccional no lleva la baja masiva');
  assert.match(leeEml(n.eml).partes.find((p) => p.tipo === 'text/html')!.contenido, /Darme de baja del newsletter/);
});

test('el simulador rechaza un envío masivo SIN baja de un clic (como Gmail desde 2024)', async () => {
  const buzon = new BuzonSimulado();
  const r = await buzon.envia({ idMensaje: 'm@x.example', de: { nombre: 'C', direccion: 'c@x.example' }, para: 'p@x.example', asunto: 'Promo', texto: 't', html: 'h', fecha: new Date(0), masivo: true, cabeceras: { 'List-Unsubscribe': '<http://inseguro.example/baja>' } });
  assert.ok(!r.ok && r.motivo === 'politica');
});

test('BAJA de un clic: el token basta (sin sesión); después, CERO newsletters, aunque se mande otra edición', async () => {
  const { b, p } = await conCita('baja-newsletter', ['correo'], true);
  await b.portal.despacha();
  const n = b.buzon.enviados.filter((e) => e.masivo);
  assert.equal(n.length, 1);
  const token = /baja\/(tok_[0-9a-f]{20})>/.exec(leeEml(n[0]!.eml).cabeceras['List-Unsubscribe'] ?? '')![1]!;
  assert.deepEqual(await b.portal.baja(token, 'un_clic'), { ok: true, clinica: 'colibri' });
  assert.deepEqual(await b.portal.baja(token, 'un_clic'), { ok: true, clinica: 'colibri' }, 'idempotente');
  assert.equal(await b.portal.enviaNewsletter('colibri', 'newsletter-2026-11'), 0);
  b.reloj.avanza(30 * 86_400_000);
  await b.portal.despacha();
  assert.equal(b.buzon.enviados.filter((e) => e.masivo).length, 1, 'cero newsletters después de la baja');
  const ev = await b.libro.eventos('colibri');
  assert.equal(ev.filter((e) => e.tipo === 'newsletter_baja').length, 1);
  assert.deepEqual(await b.portal.consentimientos('colibri', `usr-${p.id}`).then((c) => c.newsletter), false);
  assert.deepEqual(await b.portal.baja('tok_00000000000000000000', 'un_clic'), { ok: false });
});

test('una edición programada ANTES de la baja se cancela al despachar, no se manda', async () => {
  const { b, p } = await conCita('baja-newsletter', ['correo'], true);
  await b.portal.cambiaConsentimiento('colibri', `usr-${p.id}`, 'newsletter', false);
  await b.portal.despacha();
  assert.equal(b.buzon.enviados.filter((e) => e.masivo).length, 0);
});

test('correo que rebota: el aviso queda fallido y la vista le pide revisar su correo', async () => {
  const { b, p } = await conCita('correo-que-rebota');
  await b.portal.despacha();
  const v = await b.portal.proximas('maguey', `usr-${p.id}`);
  const conf = v.citas[0]!.avisos.find((a) => a.clase === 'confirmacion')!;
  assert.equal(conf.estado, 'fallido');
  assert.equal(conf.accion, 'revisar_correo');
});

test('Telegram: el bot NO puede escribir primero (403); el deep link de un solo uso vincula y manda el reel', async () => {
  const sim = new TelegramSimulado({ bots: [{ token: 't', usuario: 'PruebaLabbot' }] });
  const canal = creaCanalTelegram(sim.transporte('t'));
  const r = await canal.texto(4242, 'hola');
  assert.deepEqual(r, { ok: false, motivo: 'bot_no_iniciado', definitivo: true, detalle: "Forbidden: bot can't initiate conversation with a user" });
  assert.throws(() => enlaceProfundo('PruebaLabbot', 'con espacios'), /1 a 64/);
  assert.throws(() => enlaceProfundo('PruebaLabbot', 'x'.repeat(65)), /1 a 64/);

  const { b, p, cita } = await conCita('sin-consentimiento-salud', ['correo', 'telegram']);
  const usuario = `usr-${p.id}`;
  assert.equal((await b.almacen.avisos('colibri')).find((a) => a.canal === 'telegram')!.estado, 'esperando_vinculo');
  const { enlace } = await b.portal.enlaceTelegram('colibri', usuario);
  assert.match(enlace, /^https:\/\/t\.me\/DentalColibriLabbot\?start=tok_[0-9a-f]{20}$/);
  const token = enlace.split('start=')[1]!;
  await b.telegram.abreEnlace('DentalColibriLabbot', token, { id: 900001003, nombre: 'Tonatiuh' });
  // El bot acaba de contestar «¡Listo!» en ese chat: el video en el mismo segundo choca con el límite por chat
  // (429, retry_after 1) y el despachador lo deja para después, sin duplicar.
  const primero = await b.portal.despacha();
  assert.ok(primero.reintentos >= 1, JSON.stringify(primero));
  b.reloj.avanza(2_000);
  await b.portal.despacha();
  const chat = b.telegram.conversacion('DentalColibriLabbot', 900001003);
  assert.equal(chat.filter((m) => m.mensaje.video).length, 1, 'un solo video tras el reintento');
  const video = chat.find((m) => m.mensaje.video);
  assert.ok(video, 'la confirmación sale con el reel (sendVideo)');
  assert.match(video.mensaje.caption ?? '', /tu cita quedó confirmada/);
  assert.equal(video.mensaje.video!.mime_type, 'video/mp4');
  // El mismo enlace por segunda vez (otra persona que lo recibió reenviado) no vincula.
  await b.telegram.abreEnlace('DentalColibriLabbot', token, { id: 777, nombre: 'Intruso' });
  const intruso = b.telegram.conversacion('DentalColibriLabbot', 777).map((m) => m.mensaje.text ?? '');
  assert.ok(intruso.some((t) => /ya se usó/.test(t)));
  assert.equal((await b.almacen.pacientePorSeudonimo('colibri', cita.paciente))!.telegram.chatId, 900001003);
});

test('el orden real de la app: despachar ANTES de vincular no pierde la confirmación con el reel', async () => {
  const { b, p } = await conCita('sin-consentimiento-salud', ['correo', 'telegram']);
  await b.portal.despacha();
  const conf = () => b.almacen.avisos('colibri').then((x) => x.find((a) => a.canal === 'telegram' && a.clase === 'confirmacion')!);
  assert.equal((await conf()).estado, 'esperando_vinculo', 'sigue esperando: el paciente aún no abre el enlace');
  const { enlace } = await b.portal.enlaceTelegram('colibri', `usr-${p.id}`);
  await b.telegram.abreEnlace('DentalColibriLabbot', enlace.split('start=')[1]!, { id: 900001003, nombre: 'Tonatiuh' });
  b.reloj.avanza(2_000);
  await b.portal.despacha();
  assert.equal((await conf()).estado, 'entregado');
  assert.equal(b.telegram.conversacion('DentalColibriLabbot', 900001003).filter((m) => m.mensaje.video).length, 1, 'el reel salió al vincular');
});

test('Telegram sin vincular: el aviso no sale y queda «sin vincular»; la vista ofrece vincular', async () => {
  const { b, p, cita } = await conCita('telegram-sin-vincular', ['telegram']);
  b.reloj.fija(new Date(cita.inicio - HORA).toISOString());
  await b.portal.despacha();
  const v = await b.portal.proximas('maguey', `usr-${p.id}`);
  const avisos = v.citas[0]!.avisos;
  assert.ok(avisos.every((a) => a.accion === 'vincular_telegram'), JSON.stringify(avisos));
  assert.ok(avisos.some((a) => a.estado === 'fallido' && a.motivo === 'sin_vincular'));
  assert.equal(b.telegram.historial.length, 0, 'ningún mensaje salió');
});

test('Telegram: el límite por chat (429 con retry_after) se reintenta sin duplicar', async () => {
  const sim = new TelegramSimulado({ bots: [{ token: 't', usuario: 'PruebaLabbot' }], reloj: () => 1_000 });
  await sim.abreEnlace('PruebaLabbot', 'abc', { id: 5, nombre: 'X' });
  const canal = creaCanalTelegram(sim.transporte('t'));
  assert.ok((await canal.texto(5, 'uno')).ok);
  const r = await canal.texto(5, 'dos');
  assert.ok(!r.ok && r.motivo === 'limite' && r.reintentaEnS === 1);
});

test('cancelar la cita cancela sus avisos pendientes y avisa la cancelación por correo', async () => {
  const { b, p, cita } = await conCita('adulto-convenio');
  await b.portal.despacha();
  await b.portal.cancela('maguey', `usr-${p.id}`, cita.id);
  const avisos = await b.almacen.avisos('maguey');
  assert.ok(avisos.filter((a) => a.clase.startsWith('recordatorio')).every((a) => a.estado === 'cancelado' && a.motivo === 'cita_cancelada'));
  await b.portal.despacha();
  const cancel = b.buzon.enviados.find((e) => e.asunto.startsWith('Cancelamos'))!;
  assert.equal(leeIcs(leeEml(cancel.eml).partes.find((x) => x.nombre === 'cita.ics')!.contenido)['STATUS'], 'CANCELLED');
});
