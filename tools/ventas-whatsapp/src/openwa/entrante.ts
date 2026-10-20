/**
 * Lo que llega de Meta (webhook firmado con el secreto de la app) convertido en los eventos de OpenWA:
 * `message.received` (con deduplicación por wamid, como OpenWA), `message.reaction`, `message.ack` /
 * `message.failed`, `message.sent` para lo que el dueño contesta desde la app (coexistencia) y
 * `session.disconnected` cuando la pyme quita al socio. Una sesión detenida guarda pero no entrega.
 */
import { esObjeto, normalizaWaId, numero, texto } from '../comun/base.js';
import { verificaFirmaMeta } from '../meta/firma.js';
import { llaveContacto, publicoDe, type Puertos, type EstadoOpenWA } from './contexto.js';
import { datosDeMensaje } from './envios.js';
import { chatCrudo, chatDe, iso } from './respuestas.js';
import type { MensajeOW, Sesion } from './tipos.js';

type Base = { p: Puertos; estado: EstadoOpenWA };
type Valor = Record<string, unknown>;
const lista = (v: unknown) => (Array.isArray(v) ? v.filter(esObjeto) : []);
const ACK: Record<string, number> = { sent: 1, delivered: 2, read: 3, played: 4, failed: -1 };
const MEDIOS = new Set(['image', 'video', 'audio', 'document', 'sticker']);

async function sesionDelNumero(b: Base, phoneNumberId: string): Promise<Sesion | undefined> {
  for (const s of b.estado.sesiones.values()) {
    if (s.numero?.phoneNumberId === phoneNumberId) return s;
    if (s.iniciada && !s.numero && (await b.p.sincroniza(s)).numero?.phoneNumberId === phoneNumberId) return s;
  }
  return undefined;
}

const publica = (b: Base, s: Sesion, event: string, data: Record<string, unknown>) => (s.detenida ? Promise.resolve() : b.p.entregador.publica(s.id, event, data));

/** Tipo y cuerpo de OpenWA para un mensaje de Meta. */
function leeContenido(m: Valor): { type: string; body: string; hasMedia: boolean; mimetype?: string } {
  const t = texto(m.type) ?? 'unknown';
  const detalle = esObjeto(m[t]) ? (m[t] as Valor) : {};
  if (t === 'text') return { type: 'text', body: texto(detalle.body) ?? '', hasMedia: false };
  if (MEDIOS.has(t)) return { type: t === 'audio' && detalle.voice === true ? 'voice' : t, body: texto(detalle.caption) ?? '', hasMedia: true, ...(texto(detalle.mime_type) ? { mimetype: texto(detalle.mime_type) } : {}) };
  if (t === 'location') return { type: 'location', body: texto(detalle.name) ?? '', hasMedia: false };
  if (t === 'contacts') return { type: 'contact', body: '', hasMedia: false };
  if (t === 'button') return { type: 'text', body: texto(detalle.text) ?? '', hasMedia: false };
  if (t === 'interactive') {
    const r = (esObjeto(detalle.button_reply) ? detalle.button_reply : esObjeto(detalle.list_reply) ? detalle.list_reply : {}) as Valor;
    return { type: 'text', body: texto(r.title) ?? '', hasMedia: false };
  }
  if (t === 'order') return { type: 'order', body: '', hasMedia: false };
  return { type: 'unknown', body: '', hasMedia: false };
}

async function reaccionEntrante(b: Base, s: Sesion, waId: string, m: Valor) {
  const r = esObjeto(m.reaction) ? m.reaction : {};
  const messageId = texto(r.message_id) ?? '';
  const emoji = texto(r.emoji) ?? '';
  const senderId = publicoDe(b.estado, s.id, chatDe(waId));
  const objetivo = b.estado.mensajes.find((x) => x.sessionId === s.id && x.waMessageId === messageId);
  if (objetivo) {
    objetivo.reacciones = objetivo.reacciones.filter((x) => x.senderId !== senderId);
    if (emoji) objetivo.reacciones.push({ senderId, emoji, timestamp: numero(m.timestamp) ?? Math.floor(b.p.reloj() / 1000) });
  }
  const instantanea = objetivo ? { reactions: Object.fromEntries(objetivo.reacciones.map((x) => [x.senderId, x.emoji])) } : {};
  await publica(b, s, 'message.reaction', { messageId, chatId: senderId, reaction: emoji, senderId, ...instantanea });
}

async function mensajeEntrante(b: Base, s: Sesion, telefono: string, nombres: Map<string, string>, m: Valor) {
  const waId = normalizaWaId(texto(m.from) ?? '');
  const wamid = texto(m.id) ?? '';
  if (m.type === 'reaction') return reaccionEntrante(b, s, waId, m);
  if (!wamid || b.estado.mensajes.some((x) => x.sessionId === s.id && x.waMessageId === wamid)) return;
  const contenido = leeContenido(m);
  const instante = (numero(m.timestamp) ?? Math.floor(b.p.reloj() / 1000)) * 1000;
  const chatId = chatDe(waId);
  const llave = llaveContacto(s.id, chatId);
  // Hacia afuera, el número como lo reportó Meta (México: `521…`), que es como lo guardó quien venía de OpenWA.
  const visible = b.estado.contactos.get(llave)?.chatPublico ?? chatCrudo(texto(m.from) ?? '');
  const nombre = nombres.get(waId);
  const msg: MensajeOW = {
    id: b.p.ids(), sessionId: s.id, waMessageId: wamid, chatId: visible, chatName: nombre ?? null, from: visible, to: chatCrudo(telefono), body: contenido.body,
    type: contenido.type, direction: 'incoming', timestamp: Math.floor(instante / 1000), status: 'delivered', createdAt: iso(b.p.reloj()), reacciones: [],
  };
  b.estado.mensajes.push(msg);
  const previo = b.estado.contactos.get(llave) ?? { sessionId: s.id, chatId, chatPublico: visible, waId, primerContacto: instante, noLeidos: 0 };
  b.estado.contactos.set(llave, { ...previo, ...(nombre ? { nombre } : {}), ultimoEntrante: { id: wamid, instante }, noLeidos: previo.noLeidos + 1, ultimo: { texto: contenido.body, tipo: contenido.type, instante } });
  s.lastActive = iso(b.p.reloj());
  const cita = esObjeto(m.context) && texto(m.context.id) ? { quotedMessage: { id: texto(m.context.id) } } : {};
  const media = contenido.hasMedia ? { media: { mimetype: contenido.mimetype ?? 'application/octet-stream', omitted: true } } : {};
  await publica(b, s, 'message.received', { ...datosDeMensaje(msg), contact: nombre ? { name: nombre, pushName: nombre } : {}, ...cita, ...media });
}

async function estadoEntrante(b: Base, s: Sesion, st: Valor) {
  const wamid = texto(st.id) ?? '';
  const status = texto(st.status) ?? '';
  const ack = ACK[status];
  if (ack === undefined) return;
  const chatId = publicoDe(b.estado, s.id, chatDe(texto(st.recipient_id) ?? ''));
  const msg = b.estado.mensajes.find((x) => x.sessionId === s.id && x.waMessageId === wamid);
  if (msg) msg.status = status === 'played' ? 'read' : (status as MensajeOW['status']);
  const canonico = status === 'played' ? 'read' : status;
  await publica(b, s, 'message.ack', { id: wamid, messageId: wamid, status: canonico, ack, chatId });
  if (status === 'failed') await publica(b, s, 'message.failed', { id: wamid, messageId: wamid, status: 'failed', ack: -1, chatId });
}

async function ecoDelDueno(b: Base, s: Sesion, telefono: string, e: Valor) {
  const wamid = texto(e.id) ?? '';
  if (!wamid || b.estado.mensajes.some((x) => x.waMessageId === wamid)) return;
  const chatId = publicoDe(b.estado, s.id, chatDe(texto(e.to) ?? ''));
  const contenido = leeContenido(e);
  const msg: MensajeOW = {
    id: b.p.ids(), sessionId: s.id, waMessageId: wamid, chatId, chatName: null, from: chatCrudo(telefono), to: chatId, body: contenido.body, type: contenido.type,
    direction: 'outgoing', timestamp: numero(e.timestamp) ?? Math.floor(b.p.reloj() / 1000), status: 'sent', createdAt: iso(b.p.reloj()), reacciones: [],
  };
  b.estado.mensajes.push(msg);
  await publica(b, s, 'message.sent', datosDeMensaje(msg));
}

async function cambio(b: Base, campo: string, v: Valor) {
  if (campo === 'message_template_status_update') {
    const estado = texto(v.event) === 'APPROVED' ? 'approved' : texto(v.event) === 'REJECTED' ? 'rejected' : undefined;
    for (const t of b.estado.plantillas.values()) if (estado && t.metaNombre === texto(v.message_template_name)) t.metaEstado = estado;
    return;
  }
  if (campo === 'account_update') {
    if (texto(v.event) !== 'PARTNER_REMOVED') return;
    const tel = normalizaWaId(texto(v.phone_number) ?? '');
    for (const s of b.estado.sesiones.values()) if (s.numero && normalizaWaId(s.numero.telefono) === tel) await publica(b, s, 'session.disconnected', { sessionId: s.id, reason: 'La pyme quitó al socio en WhatsApp Manager' });
    return;
  }
  const meta = esObjeto(v.metadata) ? v.metadata : {};
  const s = await sesionDelNumero(b, texto(meta.phone_number_id) ?? '');
  if (!s) return;
  const telefono = texto(meta.display_phone_number) ?? s.numero?.telefono ?? '';
  const nombres = new Map(lista(v.contacts).map((k) => [normalizaWaId(texto(k.wa_id) ?? ''), esObjeto(k.profile) ? texto(k.profile.name) ?? '' : '']));
  for (const m of lista(v.messages)) await mensajeEntrante(b, s, telefono, nombres, m);
  for (const st of lista(v.statuses)) await estadoEntrante(b, s, st);
  for (const e of lista(v.message_echoes)) await ecoDelDueno(b, s, telefono, e);
}

/** El endpoint de webhooks de Meta de la fachada. 401 sin firma válida; 200 a todo lo demás (Meta reintenta lo que no). */
export async function recibeDeMeta(b: Base, secretoApp: string, crudo: string, firma: string | undefined): Promise<{ status: number }> {
  if (!verificaFirmaMeta(secretoApp, crudo, firma)) return { status: 401 };
  let cuerpo: unknown;
  try { cuerpo = JSON.parse(crudo); } catch { return { status: 400 }; }
  if (!esObjeto(cuerpo) || cuerpo.object !== 'whatsapp_business_account') return { status: 400 };
  for (const entrada of lista(cuerpo.entry)) {
    for (const c of lista(entrada.changes)) if (esObjeto(c.value)) await cambio(b, texto(c.field) ?? '', c.value);
  }
  return { status: 200 };
}
