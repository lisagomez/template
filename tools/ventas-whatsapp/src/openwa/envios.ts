/**
 * Envíos por la Cloud API con la forma de OpenWA. Lo que cambia por la vía oficial se contesta, no se simula:
 *  - fuera de la ventana de 24 h, Meta rechaza (131047) y la fachada contesta 422 FUERA_DE_VENTANA con las
 *    plantillas aprobadas de la sesión;
 *  - los medios van por `url` https (Meta baja la liga); `base64` contesta 422 SOLO_URL;
 *  - las menciones son de grupos y la vista previa propia no existe: 422 con la alternativa.
 * También: `Idempotency-Key` con los códigos de OpenWA, la frontera de salida (contactos nuevos por hora, 429
 * SEND_PACING_LIMITED) y el registro de lo enviado, que alimenta `GET /messages`, los chats y `message.sent`.
 */
import { createHash } from 'node:crypto';
import { HORA, normalizaWaId } from '../comun/base.js';
import { aCuerpoGraph, resumeMensaje, validaMensaje, type MensajeSaliente } from '../meta/mensajes.js';
import { alcanzaChat, llaveContacto, sesionLista, type Contexto } from './contexto.js';
import { chatCrudo, chatDe, destino, falla, iso, responde, segundos } from './respuestas.js';
import type { MensajeOW, NumeroDeSesion, Respuesta, Sesion } from './tipos.js';

const VIDA_IDEMPOTENCIA = 24 * HORA;

/** OpenWA: 2xx se repite igual; un 4xx o 501 libera la llave; si no se supo qué pasó, 409 OUTCOME_UNKNOWN. */
export async function conIdempotencia(c: Contexto, ejecuta: () => Promise<Respuesta>): Promise<Respuesta> {
  const k = c.peticion.cabeceras['idempotency-key'];
  if (k === undefined) return ejecuta();
  if (!/^[\x21-\x7E]{1,255}$/.test(k)) return falla(400, 'Idempotency-Key: de 1 a 255 caracteres ASCII visibles', { code: 'IDEMPOTENCY_KEY_INVALID' });
  const llave = `${c.params.sessionId}|${c.peticion.ruta}|${k}`;
  const huella = createHash('sha256').update(JSON.stringify(c.peticion.cuerpo ?? null)).digest('hex');
  for (const [x, r] of c.estado.idempotencia) if (r.vence <= c.p.reloj()) c.estado.idempotencia.delete(x);
  const previo = c.estado.idempotencia.get(llave);
  if (previo) {
    if (previo.huella !== huella) return falla(422, 'La Idempotency-Key ya se usó con otra petición', { code: 'IDEMPOTENCY_KEY_REUSED' });
    if (previo.estado === 'en_curso') return falla(409, 'La petición con esta Idempotency-Key sigue en curso', { code: 'IDEMPOTENCY_KEY_IN_PROGRESS' });
    if (previo.estado === 'desconocido') return falla(409, 'No se sabe si la petición original salió: revisa GET /messages antes de repetir', { code: 'IDEMPOTENCY_OUTCOME_UNKNOWN' });
    return { ...previo.respuesta!, cabeceras: { ...previo.respuesta!.cabeceras, 'idempotent-replayed': 'true' } };
  }
  c.estado.idempotencia.set(llave, { huella, estado: 'en_curso', vence: c.p.reloj() + VIDA_IDEMPOTENCIA });
  try {
    const r = await ejecuta();
    if (r.status >= 400 && r.status < 500 || r.status === 501) c.estado.idempotencia.delete(llave);
    else c.estado.idempotencia.set(llave, { huella, estado: r.status < 300 ? 'hecho' : 'desconocido', respuesta: r, vence: c.p.reloj() + VIDA_IDEMPOTENCIA });
    return r;
  } catch (e) {
    c.estado.idempotencia.set(llave, { huella, estado: 'desconocido', vence: c.p.reloj() + VIDA_IDEMPOTENCIA });
    throw e;
  }
}

/** Las plantillas de la sesión que Meta ya aprobó: lo único que sale fuera de la ventana. */
export const aprobadas = (c: Contexto, s: Sesion) => [...c.estado.plantillas.values()].filter((t) => t.sessionId === s.id && t.metaEstado === 'approved').map((t) => ({ id: t.id, name: t.name }));

async function errorDeMeta(c: Contexto, s: Sesion, r: { codigo: number; error: string }): Promise<Respuesta> {
  const ruta = `POST /api/sessions/${s.id}/messages/send-template`;
  switch (r.codigo) {
    case 131047: {
      const plantillas = aprobadas(c, s);
      const cuales = plantillas.length ? `una de: ${plantillas.map((p) => p.name).join(', ')}` : 'una plantilla (crea una y espera la aprobación de Meta)';
      return falla(422, 'Fuera de la ventana de atención de 24 h: la Cloud API solo deja salir una plantilla aprobada', { code: 'FUERA_DE_VENTANA', alternativa: `${ruta} con ${cuales}`, plantillasAprobadas: plantillas });
    }
    case 132000: case 132001: case 132005: case 132007: case 132012:
      return falla(422, `Meta no acepta la plantilla: ${r.error}`, { code: 'PLANTILLA_NO_DISPONIBLE', alternativa: 'Revisa en GET /templates que esté aprobada y que lleve todas sus variables.' });
    case 131026:
      return falla(422, 'El destinatario no puede recibir el mensaje (bloqueado, sin WhatsApp o con una versión vieja)', { code: 'NO_ENTREGABLE', alternativa: 'Comprueba el número; si lo bloqueaste, DELETE /contacts/{id}/block.' });
    case 131000:
      return falla(409, 'El número fue desconectado de la plataforma', { code: 'NUMERO_DESCONECTADO', alternativa: 'Vuelve a conectar el número (coexistencia) o repite el alta.' });
    case 130429: case 131048: case 131056:
      return falla(429, `Meta limitó el envío: ${r.error}`, { code: 'SEND_PACING_LIMITED', retryAfterSeconds: 60 });
    case 100: case 131009:
      return falla(400, [r.error]);
    default:
      return falla(503, `Meta rechazó el envío: ${r.error}`, { code: 'META_RECHAZO' });
  }
}

const TIPOS_OW: Partial<Record<MensajeSaliente['tipo'], string>> = {
  texto: 'text', imagen: 'image', video: 'video', audio: 'audio', documento: 'document', sticker: 'sticker', ubicacion: 'location',
  contactos: 'contact', plantilla: 'text', producto: 'product',
};

export function registraSaliente(c: Contexto, s: Sesion, n: NumeroDeSesion, waId: string, m: MensajeSaliente, wamid: string, guarda = true, publico?: string): MensajeOW {
  const instante = c.p.reloj();
  const chatId = chatDe(waId);
  const contacto = c.estado.contactos.get(llaveContacto(s.id, chatId));
  const visible = contacto?.chatPublico ?? publico ?? chatId;
  const body = m.tipo === 'texto' ? m.texto : resumeMensaje(m);
  const tipo = TIPOS_OW[m.tipo] ?? 'unknown';
  const msg: MensajeOW = {
    id: c.p.ids(), sessionId: s.id, waMessageId: wamid, chatId: visible, chatName: contacto?.nombre ?? null, from: chatCrudo(n.telefono), to: visible,
    body, type: tipo, direction: 'outgoing', timestamp: segundos(instante), status: 'sent', createdAt: iso(instante), reacciones: [],
  };
  if (!guarda) return msg;
  c.estado.mensajes.push(msg);
  const previo = contacto ?? { sessionId: s.id, chatId, chatPublico: visible, waId: normalizaWaId(waId), primerContacto: instante, noLeidos: 0 };
  c.estado.contactos.set(llaveContacto(s.id, chatId), { ...previo, ultimo: { texto: body, tipo, instante } });
  s.lastActive = iso(instante);
  return msg;
}

export const datosDeMensaje = (m: MensajeOW) => ({
  id: m.waMessageId, messageId: m.waMessageId, from: m.from, to: m.to, chatId: m.chatId, body: m.body, type: m.type, timestamp: m.timestamp,
  fromMe: m.direction === 'outgoing', isGroup: false, kind: 'individual', hasMedia: ['image', 'video', 'audio', 'document', 'sticker'].includes(m.type),
});

/** La frontera de salida: cuántos contactos nuevos lleva la sesión en la última hora. */
function frontera(c: Contexto, s: Sesion, chatId: string): Respuesta | null {
  if (c.estado.contactos.has(llaveContacto(s.id, chatId))) return null;
  const ahora = c.p.reloj();
  const recientes = (c.estado.nuevos.get(s.id) ?? []).filter((t) => ahora - t < HORA);
  c.estado.nuevos.set(s.id, recientes);
  if (recientes.length < c.p.contactosNuevosPorHora) return null;
  const espera = Math.ceil((recientes[0]! + HORA - ahora) / 1000);
  return falla(429, `La sesión ya escribió a ${recientes.length} contactos nuevos en la última hora`, { code: 'SEND_PACING_LIMITED', retryAfterSeconds: espera });
}

export type Enviado = { ok: true; msg: MensajeOW } | { ok: false; r: Respuesta };

/** El camino de todo envío: alcance, frontera, límites de Meta, Graph, registro y `message.sent` (una reacción no se registra). */
export async function envia(c: Contexto, s: Sesion, n: NumeroDeSesion, chatId: string, m: MensajeSaliente, responde?: string, registra = true): Promise<Enviado> {
  const d = destino(chatId);
  if (!d.ok) return d;
  if (!alcanzaChat(c, d.chatId)) return { ok: false, r: falla(403, 'La llave no alcanza este chat') };
  const limite = frontera(c, s, d.chatId);
  if (limite) return { ok: false, r: limite };
  const fallas = validaMensaje(m);
  if (fallas.length) return { ok: false, r: falla(400, fallas) };
  const nuevo = !c.estado.contactos.has(llaveContacto(s.id, d.chatId));
  const r = await c.p.graph.enviaMensaje(n.phoneNumberId, aCuerpoGraph(d.waId, m, responde));
  if (!r.ok) return { ok: false, r: await errorDeMeta(c, s, r) };
  if (nuevo) c.estado.nuevos.set(s.id, [...(c.estado.nuevos.get(s.id) ?? []), c.p.reloj()]);
  const msg = registraSaliente(c, s, n, d.waId, m, r.wamid, registra, d.publico);
  if (registra) await c.p.entregador.publica(s.id, 'message.sent', datosDeMensaje(msg));
  return { ok: true, msg };
}

/** Un manejador de envío: sesión lista, cuerpo validado, el mensaje armado y la idempotencia de OpenWA. */
export function manejadorDeEnvio<T extends { chatId: string; quotedMessageId?: string }>(
  lee: (c: Contexto, s: Sesion, n: NumeroDeSesion) => Promise<{ ok: true; v: T; m: MensajeSaliente } | { ok: false; r: Respuesta }>,
  forma: (msg: MensajeOW) => { status: number; cuerpo: unknown } = (msg) => ({ status: 201, cuerpo: { messageId: msg.waMessageId, timestamp: msg.timestamp } }),
) {
  return (c: Contexto) => conIdempotencia(c, async () => {
    const l = await sesionLista(c);
    if (!l.ok) return l.r;
    const v = await lee(c, l.s, l.n);
    if (!v.ok) return v.r;
    const e = await envia(c, l.s, l.n, v.v.chatId, v.m, v.v.quotedMessageId);
    if (!e.ok) return e.r;
    const f = forma(e.msg);
    return responde(f.status, f.cuerpo);
  });
}
