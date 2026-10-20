/**
 * Los webhooks de la fachada con el protocolo de OpenWA: sobre `{event, timestamp, sessionId, idempotencyKey,
 * deliveryId, data}`, cabeceras `X-OpenWA-*`, firma `X-OpenWA-Signature: sha256=<HMAC-SHA256 del cuerpo crudo>`
 * (se omite sin secreto), filtros por condición, reintentos, entregas fallidas y su redrive. El agente de usuario
 * dice quién entrega: esta fachada, no OpenWA.
 */
import { createHmac } from 'node:crypto';
import { ahora, sesionDe, type Contexto, type EstadoOpenWA, type Manejador } from './contexto.js';
import { falla, iso, noEncontrado, pagina, responde, valida } from './respuestas.js';
import type { CondicionFiltro, EntregaWebhook, FallaEntrega, WebhookOW } from './tipos.js';

export const EVENTOS_OPENWA = [
  'message.received', 'message.sent', 'message.ack', 'message.receipt', 'message.failed', 'message.revoked', 'message.reaction', 'message.edited',
  'status.received', 'session.status', 'session.qr', 'session.authenticated', 'session.disconnected', 'session.reconnect_loop', 'session.restriction',
  'presence.update', 'event.response', 'group.join', 'group.leave', 'group.update', 'group.join_request', 'call.received', 'call.accepted',
  'call.rejected', 'call.missed', '*',
] as const;
export const AGENTE_ENTREGA = 'ventas-whatsapp-compat-openwa/0.1.0';

export interface Entregador {
  publica(sessionId: string, event: string, data: Record<string, unknown>): Promise<void>;
  prueba(w: WebhookOW): Promise<{ success: boolean; statusCode?: number; error?: string }>;
  reenvia(f: FallaEntrega): Promise<{ ok: boolean; status: number | null; error?: string }>;
}

const firma = (secreto: string, cuerpo: string) => `sha256=${createHmac('sha256', secreto).update(cuerpo).digest('hex')}`;

function llaveIdempotencia(event: string, sessionId: string, data: Record<string, unknown>, webhookId: string, deliveryId: string): string {
  const mid = String(data.messageId ?? data.id ?? '');
  if (event === 'message.received' || event === 'message.sent') return `msg_${sessionId}_${mid}_${webhookId}`;
  if (event === 'message.ack') return `ack_${sessionId}_${mid}_${String(data.status)}_${webhookId}`;
  if (event === 'message.failed') return `failed_${sessionId}_${mid}_${webhookId}`;
  return `${event}_${sessionId}_${deliveryId}`;
}

// ── filtros (semántica de OpenWA: un campo definido y ausente decide; `isNot` pasa) ──────────────────────────────
const CAMPOS_FILTRO: Record<string, (d: Record<string, unknown>) => unknown> = {
  sender: (d) => d.from, recipient: (d) => d.to, chatId: (d) => d.chatId, body: (d) => d.body, type: (d) => d.type, isGroup: (d) => d.isGroup ?? false,
  kind: (d) => d.kind, fromMe: (d) => d.fromMe ?? false, hasMedia: (d) => d.hasMedia ?? false, mentions: (d) => d.mentionedIds,
};

function cumple(cond: CondicionFiltro, data: Record<string, unknown>): boolean {
  const lector = CAMPOS_FILTRO[cond.field];
  if (!lector) return true;
  const valor = lector(data);
  const norm = (x: unknown) => (cond.caseSensitive ? String(x) : String(x).toLowerCase());
  const esperados = (Array.isArray(cond.value) ? cond.value : [cond.value]).map(norm);
  if (valor === undefined || valor === null) return cond.operator === 'isNot';
  const actuales = (Array.isArray(valor) ? valor : [valor]).map(norm);
  const coincide = cond.operator === 'contains'
    ? actuales.some((a) => esperados.some((e) => a.includes(e)))
    : actuales.some((a) => esperados.includes(a));
  return cond.operator === 'isNot' ? !coincide : coincide;
}

const suscrito = (w: WebhookOW, event: string) => w.active && (w.events.includes(event) || (w.events.includes('*') && event !== 'message.receipt'));

/** Las entregas corren de fondo (`fondo`): ni el 200 que espera Meta ni la respuesta de un envío esperan al receptor. */
export function creaEntregador(o: { estado: EstadoOpenWA; entrega: EntregaWebhook; reloj: () => number; ids: () => string; espera: (ms: number) => Promise<void>; fondo: (t: Promise<void>) => void }): Entregador {
  async function intenta(w: WebhookOW, cuerpo: string, event: string, idem: string, deliveryId: string, intento: number) {
    const headers: Record<string, string> = {
      ...w.headers, 'content-type': 'application/json', 'user-agent': AGENTE_ENTREGA, 'x-openwa-event': event,
      'x-openwa-idempotency-key': idem, 'x-openwa-delivery-id': deliveryId, 'x-openwa-retry-count': String(intento),
      ...(w.secret ? { 'x-openwa-signature': firma(w.secret, cuerpo) } : {}),
    };
    try {
      const r = await o.entrega(w.url, { method: 'POST', headers, body: cuerpo });
      return { ok: r.status >= 200 && r.status < 300, status: r.status as number | null, error: r.status >= 300 ? `HTTP ${r.status}` : undefined };
    } catch (e) {
      return { ok: false, status: null, error: e instanceof Error ? e.message : 'fallo de red' };
    }
  }

  async function entregaA(w: WebhookOW, event: string, sessionId: string, data: Record<string, unknown>) {
    const deliveryId = `dlv_${o.ids()}`;
    const idem = llaveIdempotencia(event, sessionId, data, w.id, deliveryId);
    const cuerpo = JSON.stringify({ event, timestamp: iso(o.reloj()), sessionId, idempotencyKey: idem, deliveryId, data });
    let ultimo: Awaited<ReturnType<typeof intenta>> = { ok: false, status: null, error: 'sin intento' };
    for (let i = 0; i <= w.retryCount; i++) {
      if (i) await o.espera(1000 * 2 ** (i - 1));
      ultimo = await intenta(w, cuerpo, event, idem, deliveryId, i);
      w.lastTriggeredAt = iso(o.reloj());
      if (ultimo.ok) return;
    }
    o.estado.fallas.unshift({
      id: o.ids(), webhookId: w.id, sessionId, event, url: w.url, idempotencyKey: idem, deliveryId, attempts: w.retryCount + 1,
      lastStatusCode: ultimo.status, lastError: ultimo.error ?? 'sin detalle', createdAt: iso(o.reloj()), replayable: true, cuerpo,
    });
  }

  return {
    async publica(sessionId, event, data) {
      const destinos = [...o.estado.webhooks.values()].filter((w) => w.sessionId === sessionId && suscrito(w, event) && (!w.filters || w.filters.conditions.every((c) => cumple(c, data))));
      if (destinos.length) o.fondo(Promise.all(destinos.map((w) => entregaA(w, event, sessionId, data))).then(() => undefined));
    },
    async prueba(w) {
      const deliveryId = `dlv_${o.ids()}`;
      const idem = `test_${w.sessionId}_${deliveryId}`;
      const cuerpo = JSON.stringify({ event: 'test', timestamp: iso(o.reloj()), sessionId: w.sessionId, idempotencyKey: idem, deliveryId, data: { message: 'Entrega de prueba de la fachada compatible con OpenWA' } });
      const r = await intenta(w, cuerpo, 'test', idem, deliveryId, 0);
      return { success: r.ok, ...(r.status !== null ? { statusCode: r.status } : {}), ...(r.error ? { error: r.error } : {}) };
    },
    async reenvia(f) {
      const w = o.estado.webhooks.get(f.webhookId);
      if (!w) return { ok: false, status: null, error: 'el webhook ya no existe' };
      return intenta(w, f.cuerpo, f.event, f.idempotencyKey ?? '', f.deliveryId ?? `dlv_${o.ids()}`, f.attempts);
    },
  };
}

// ── manejadores ──────────────────────────────────────────────────────────────────────────────────────────────
const CAMPOS = {
  url: { tipo: 'texto', max: 2048 }, events: { tipo: 'textos', min: 1, enumeracion: EVENTOS_OPENWA }, secret: { tipo: 'texto', min: 16, max: 255 },
  headers: { tipo: 'objeto' }, filters: { tipo: 'objeto', nulo: true }, retryCount: { tipo: 'numero', min: 0, max: 5 }, active: { tipo: 'booleano' },
} as const;

type CuerpoWebhook = { url?: string; events?: string[]; secret?: string; headers?: Record<string, unknown>; filters?: { conditions?: unknown } | null; retryCount?: number; active?: boolean };

/** https a cualquier host; http solo a la máquina local (laboratorio). */
export function destinoPermitido(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname));
  } catch { return false; }
}

function leeFiltros(f: CuerpoWebhook['filters']): WebhookOW['filters'] | string {
  if (f === undefined || f === null) return null;
  const cs = f.conditions;
  if (!Array.isArray(cs) || cs.length > 20) return 'filters.conditions must be an array of at most 20 conditions';
  const ok = cs.every((c) => typeof c === 'object' && c !== null && typeof (c as CondicionFiltro).field === 'string' && ['is', 'isNot', 'contains', 'equals'].includes((c as CondicionFiltro).operator));
  return ok ? { conditions: cs as CondicionFiltro[] } : 'filters.conditions: cada condición lleva field y operator (is, isNot, contains, equals)';
}

const cabecerasTexto = (h: Record<string, unknown> | undefined) => Object.fromEntries(Object.entries(h ?? {}).filter(([k]) => !/^x-openwa-/i.test(k)).map(([k, v]) => [k.toLowerCase(), String(v)]));

/** El secreto es de solo escritura y las cabeceras propias no se devuelven. */
export const dtoWebhook = (w: WebhookOW) => ({
  id: w.id, sessionId: w.sessionId, url: w.url, events: w.events, filters: w.filters, active: w.active, retryCount: w.retryCount,
  lastTriggeredAt: w.lastTriggeredAt ?? null, createdAt: w.createdAt, updatedAt: w.updatedAt,
});

const webhookDe = (c: Contexto) => {
  const w = c.estado.webhooks.get(c.params.id ?? '');
  return w && w.sessionId === c.params.sessionId ? w : undefined;
};

export const creaWebhook: Manejador = async (c) => {
  const d = sesionDe(c);
  if (!d.ok) return d.r;
  const v = valida<CuerpoWebhook>(c.peticion.cuerpo, { ...CAMPOS, url: { ...CAMPOS.url, requerido: true } });
  if (!v.ok) return v.r;
  if (!destinoPermitido(v.v.url!)) return falla(400, ['url must be an https URL (http only to localhost)']);
  const filtros = leeFiltros(v.v.filters);
  if (typeof filtros === 'string') return falla(400, [filtros]);
  const w: WebhookOW = {
    id: c.p.ids(), sessionId: d.s.id, url: v.v.url!, events: v.v.events ?? ['message.received'], headers: cabecerasTexto(v.v.headers), filters: filtros,
    active: true, retryCount: v.v.retryCount ?? 3, createdAt: ahora(c), updatedAt: ahora(c), ...(v.v.secret ? { secret: v.v.secret } : {}),
  };
  c.estado.webhooks.set(w.id, w);
  return responde(201, dtoWebhook(w));
};

export const webhooksDeSesion: Manejador = async (c) => {
  const d = sesionDe(c);
  return d.ok ? responde(200, [...c.estado.webhooks.values()].filter((w) => w.sessionId === d.s.id).map(dtoWebhook)) : d.r;
};

export const unWebhook: Manejador = async (c) => {
  const d = sesionDe(c);
  if (!d.ok) return d.r;
  const w = webhookDe(c);
  return w ? responde(200, dtoWebhook(w)) : noEncontrado('Webhook');
};

export const actualizaWebhook: Manejador = async (c) => {
  const d = sesionDe(c);
  if (!d.ok) return d.r;
  const w = webhookDe(c);
  if (!w) return noEncontrado('Webhook');
  const v = valida<CuerpoWebhook>(c.peticion.cuerpo, { ...CAMPOS, secret: { tipo: 'texto', max: 255 } });
  if (!v.ok) return v.r;
  if (v.v.url !== undefined && !destinoPermitido(v.v.url)) return falla(400, ['url must be an https URL (http only to localhost)']);
  const filtros = v.v.filters === undefined ? w.filters : leeFiltros(v.v.filters);
  if (typeof filtros === 'string') return falla(400, [filtros]);
  Object.assign(w, {
    ...(v.v.url !== undefined ? { url: v.v.url } : {}), ...(v.v.events ? { events: v.v.events } : {}), ...(v.v.headers ? { headers: cabecerasTexto(v.v.headers) } : {}),
    ...(v.v.retryCount !== undefined ? { retryCount: v.v.retryCount } : {}), ...(v.v.active !== undefined ? { active: v.v.active } : {}), filters: filtros, updatedAt: ahora(c),
  });
  if (v.v.secret === '') delete w.secret;
  else if (v.v.secret !== undefined) w.secret = v.v.secret;
  return responde(200, dtoWebhook(w));
};

export const borraWebhook: Manejador = async (c) => {
  const d = sesionDe(c);
  if (!d.ok) return d.r;
  const w = webhookDe(c);
  if (!w) return noEncontrado('Webhook');
  c.estado.webhooks.delete(w.id);
  return responde(204);
};

/** La llave con alcance solo ve sus sesiones. */
const visibles = (c: Contexto, sessionId: string) => !c.llave.allowedSessions.length || c.llave.allowedSessions.includes(sessionId);

export const todosLosWebhooks: Manejador = async (c) => responde(200, pagina([...c.estado.webhooks.values()].filter((w) => visibles(c, w.sessionId)).map(dtoWebhook), c.peticion.consulta));

export const fallasDeEntrega: Manejador = async (c) => {
  const sesion = c.peticion.consulta.get('sessionId');
  const filas = c.estado.fallas.filter((f) => visibles(c, f.sessionId) && (!sesion || f.sessionId === sesion));
  return responde(200, pagina(filas, c.peticion.consulta).map((f) => ({
    id: f.id, webhookId: f.webhookId, sessionId: f.sessionId, event: f.event, url: f.url, idempotencyKey: f.idempotencyKey, deliveryId: f.deliveryId,
    attempts: f.attempts, lastStatusCode: f.lastStatusCode, lastError: f.lastError, createdAt: f.createdAt, replayable: f.replayable,
  })));
};

export const pruebaWebhook: Manejador = async (c) => {
  const d = sesionDe(c);
  if (!d.ok) return d.r;
  const w = webhookDe(c);
  return w ? responde(200, await c.p.entregador.prueba(w)) : noEncontrado('Webhook');
};

type CuerpoRedrive = { sessionId?: string; webhookId?: string; ids?: string[]; limit?: number };

/** Reintenta las entregas fallidas que la llave alcanza; las entregadas salen de la lista. */
export const redrive: Manejador = async (c) => {
  const v = valida<CuerpoRedrive>(c.peticion.cuerpo, { sessionId: { tipo: 'texto' }, webhookId: { tipo: 'texto' }, ids: { tipo: 'textos', max: 500 }, limit: { tipo: 'numero', min: 1, max: 500 } });
  if (!v.ok) return v.r;
  const candidatas = c.estado.fallas.filter((f) => visibles(c, f.sessionId) && (!v.v.sessionId || f.sessionId === v.v.sessionId)
    && (!v.v.webhookId || f.webhookId === v.v.webhookId) && (!v.v.ids || v.v.ids.includes(f.id)));
  const lote = candidatas.slice(0, v.v.limit ?? 100);
  const r = { redriven: 0, delivered: 0, enqueued: 0, failed: 0, skipped: 0, remaining: 0 };
  for (const f of lote) {
    if (!f.replayable) { r.skipped++; continue; }
    r.redriven++;
    const e = await c.p.entregador.reenvia(f);
    if (e.ok) { r.delivered++; c.estado.fallas.splice(c.estado.fallas.indexOf(f), 1); continue; }
    r.failed++;
    Object.assign(f, { attempts: f.attempts + 1, lastStatusCode: e.status, lastError: e.error ?? 'sin detalle' });
  }
  r.remaining = candidatas.length - r.delivered;
  return responde(200, r);
};
