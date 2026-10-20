/**
 * Lecturas y acciones sobre chats con la forma de OpenWA. La Cloud API no tiene lista de chats, libreta ni historial
 * vivo: lo que se lee aquí es lo que pasó por la fachada desde la migración. Leído y «escribiendo» van por id de
 * mensaje (el último recibido); el bloqueo, por la Block Users API (solo a quien escribió en 24 h); el «about», por
 * el perfil de negocio.
 */
import { alcanzaChat, llaveContacto, normaliza, publicoDe, sesionDe, sesionLista, type Contexto, type Manejador } from './contexto.js';
import { chatDe, destino, falla, noEncontrado, pagina, responde, valida } from './respuestas.js';
import type { ContactoOW, MensajeOW } from './tipos.js';

const contactosDe = (c: Contexto, sessionId: string) => [...c.estado.contactos.values()].filter((x) => x.sessionId === sessionId && alcanzaChat(c, x.chatId));

const dtoMensaje = (m: MensajeOW) => ({
  id: m.id, sessionId: m.sessionId, waMessageId: m.waMessageId, chatId: m.chatId, chatName: m.chatName, from: m.from, to: m.to, body: m.body,
  type: m.type, direction: m.direction, timestamp: m.timestamp, status: m.status, createdAt: m.createdAt,
});

function filtraMensajes(ms: MensajeOW[], q: URLSearchParams): MensajeOW[] {
  const num = (k: string) => (q.get(k) === null ? undefined : Number(q.get(k)));
  const [desde, hasta] = [num('since'), num('until')];
  const filtrados = ms.filter((m) => (!q.get('chatId') || normaliza(m.chatId) === normaliza(q.get('chatId')!)) && (!q.get('from') || normaliza(m.from) === normaliza(q.get('from')!))
    && (!q.get('direction') || m.direction === q.get('direction')) && (!q.get('type') || m.type === q.get('type'))
    && (!q.get('messageId') || m.waMessageId === q.get('messageId') || m.id === q.get('messageId'))
    && (desde === undefined || m.timestamp >= desde) && (hasta === undefined || m.timestamp <= hasta)
    && (!q.get('after') || m.createdAt > q.get('after')!));
  const orden = q.get('orderBy') === 'timestamp' ? (m: MensajeOW) => m.timestamp : (m: MensajeOW) => Date.parse(m.createdAt);
  return filtrados.sort((a, b) => orden(b) - orden(a));
}

export const listaMensajes: Manejador = async (c) => {
  const d = sesionDe(c);
  if (!d.ok) return d.r;
  const propios = filtraMensajes(c.estado.mensajes.filter((m) => m.sessionId === d.s.id && alcanzaChat(c, m.chatId)), c.peticion.consulta);
  return responde(200, { messages: pagina(propios, c.peticion.consulta, 50).map(dtoMensaje), total: propios.length });
};

export const reacciones: Manejador = async (c) => {
  const d = sesionDe(c);
  if (!d.ok) return d.r;
  const chatId = normaliza(c.params.chatId ?? '');
  if (!alcanzaChat(c, chatId)) return falla(403, 'La llave no alcanza este chat');
  const m = c.estado.mensajes.find((x) => x.sessionId === d.s.id && normaliza(x.chatId) === chatId && x.waMessageId === c.params.messageId);
  if (!m) return noEncontrado('Message');
  const porEmoji = new Map<string, MensajeOW['reacciones']>();
  for (const r of m.reacciones) porEmoji.set(r.emoji, [...(porEmoji.get(r.emoji) ?? []), r]);
  return responde(200, [...porEmoji].map(([emoji, senders]) => ({ emoji, senders })));
};

export const chats: Manejador = async (c) => {
  const d = sesionDe(c);
  if (!d.ok) return d.r;
  const filas = contactosDe(c, d.s.id).sort((a, b) => (b.ultimo?.instante ?? 0) - (a.ultimo?.instante ?? 0)).map((x) => ({
    id: x.chatPublico, name: x.nombre ?? x.waId, isGroup: false, kind: 'individual', unreadCount: x.noLeidos, timestamp: Math.floor((x.ultimo?.instante ?? x.primerContacto) / 1000),
    ...(x.ultimo ? { lastMessage: x.ultimo.texto, lastMessageType: x.ultimo.tipo } : {}), archived: false, pinned: false, muted: false,
  }));
  return responde(200, pagina(filas, c.peticion.consulta));
};

/** El chat de la petición, en el alcance de la llave y ya conocido por la fachada. */
function contactoDe(c: Contexto, sessionId: string, chatId: string): { ok: true; x: ContactoOW } | { ok: false; r: ReturnType<typeof falla> } {
  const d = destino(chatId);
  if (!d.ok) return d;
  if (!alcanzaChat(c, d.chatId)) return { ok: false, r: falla(403, 'La llave no alcanza este chat') };
  const x = c.estado.contactos.get(llaveContacto(sessionId, d.chatId));
  return x ? { ok: true, x } : { ok: false, r: noEncontrado('Chat') };
}

export const marcaLeido: Manejador = async (c) => {
  const l = await sesionLista(c);
  if (!l.ok) return l.r;
  const v = valida<{ chatId: string; messageIds?: string[] }>(c.peticion.cuerpo, { chatId: { tipo: 'texto', requerido: true, max: 255 }, messageIds: { tipo: 'textos', min: 1, max: 100 } });
  if (!v.ok) return v.r;
  const k = contactoDe(c, l.s.id, v.v.chatId);
  if (!k.ok) return k.r;
  const ids = v.v.messageIds ?? (k.x.ultimoEntrante ? [k.x.ultimoEntrante.id] : []);
  for (const id of ids) await c.p.graph.marcaLeido(l.n.phoneNumberId, id);
  k.x.noLeidos = 0;
  return responde(200, { success: true });
};

export const escribiendo: Manejador = async (c) => {
  const l = await sesionLista(c);
  if (!l.ok) return l.r;
  const v = valida<{ chatId: string; state: string }>(c.peticion.cuerpo, { chatId: { tipo: 'texto', requerido: true, max: 255 }, state: { tipo: 'texto', requerido: true, enumeracion: ['typing', 'recording', 'paused'] } });
  if (!v.ok) return v.r;
  if (v.v.state !== 'typing') return falla(422, `La Cloud API solo tiene el indicador «escribiendo»; «${v.v.state}» no existe`, { code: 'ESTADO_NO_DISPONIBLE', alternativa: 'Usa state: typing (se apaga solo a los 25 s o al responder).' });
  const k = contactoDe(c, l.s.id, v.v.chatId);
  if (!k.ok) return k.r;
  if (!k.x.ultimoEntrante) return falla(422, 'El indicador va sobre un mensaje recibido y este chat no tiene ninguno', { code: 'SIN_MENSAJE_RECIBIDO', alternativa: 'Espera a que la persona escriba.' });
  await c.p.graph.marcaLeido(l.n.phoneNumberId, k.x.ultimoEntrante.id);
  k.x.noLeidos = 0;
  return responde(200, { success: true });
};

const dtoContacto = (x: ContactoOW, bloqueados: string[]) => ({ id: x.chatPublico, ...(x.nombre ? { name: x.nombre, pushName: x.nombre } : {}), number: x.chatPublico.split('@')[0] ?? x.waId, isMyContact: false, isBlocked: bloqueados.includes(x.waId) });

async function bloqueadosDe(c: Contexto, sessionId: string): Promise<string[]> {
  const n = await c.p.altas.numero(sessionId);
  return n ? c.p.administracion.bloqueados(n.phoneNumberId) : [];
}

export const contactos: Manejador = async (c) => {
  const d = sesionDe(c);
  if (!d.ok) return d.r;
  const b = await bloqueadosDe(c, d.s.id);
  return responde(200, pagina(contactosDe(c, d.s.id), c.peticion.consulta).map((x) => dtoContacto(x, b)));
};

export const unContacto: Manejador = async (c) => {
  const d = sesionDe(c);
  if (!d.ok) return d.r;
  const k = contactoDe(c, d.s.id, c.params.contactId ?? '');
  return k.ok ? responde(200, dtoContacto(k.x, await bloqueadosDe(c, d.s.id))) : k.r;
};

const bloqueo = (bloquear: boolean): Manejador => async (c) => {
  const l = await sesionLista(c);
  if (!l.ok) return l.r;
  const d = destino(c.params.contactId ?? '');
  if (!d.ok) return d.r;
  if (!alcanzaChat(c, d.chatId)) return falla(403, 'La llave no alcanza este chat');
  const r = await c.p.administracion.bloquea(l.n.phoneNumberId, [d.waId], bloquear);
  if (r.ok) return responde(200, { success: true, message: bloquear ? 'Contact blocked' : 'Contact unblocked' });
  if (r.codigo === 131047) return falla(422, 'La Block Users API solo bloquea a quien escribió al número en las últimas 24 h', { code: 'FUERA_DE_VENTANA', alternativa: 'Bloquéalo cuando vuelva a escribir, o desde la app de WhatsApp Business.' });
  return falla(r.codigo === 139101 ? 422 : 400, `Meta no aplicó el bloqueo: ${r.error}`);
};
export const bloquea = bloqueo(true);
export const desbloquea = bloqueo(false);

export const bloqueados: Manejador = async (c) => {
  const d = sesionDe(c);
  if (!d.ok) return d.r;
  return responde(200, (await bloqueadosDe(c, d.s.id)).map((w) => publicoDe(c.estado, d.s.id, chatDe(w))).filter((id) => alcanzaChat(c, id)));
};

export const acercaDe: Manejador = async (c) => {
  const l = await sesionLista(c);
  if (!l.ok) return l.r;
  const v = valida<{ status: string }>(c.peticion.cuerpo, { status: { tipo: 'texto', requerido: true, max: 139 } });
  if (!v.ok) return v.r;
  const r = await c.p.administracion.actualizaPerfil(l.n.phoneNumberId, { about: v.v.status });
  return r.ok ? responde(200, { success: true, message: 'About actualizado en el perfil de negocio' }) : falla(400, `Meta no actualizó el perfil: ${r.error}`);
};
