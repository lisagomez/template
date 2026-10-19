/**
 * El canal de Telegram: el SIMULADOR de la Bot API, el PUERTO por el que sale el aviso y el transporte REAL
 * (api.telegram.org), que se niega sin gate.
 *
 * Lo que el simulador reproduce de la Bot API (https://core.telegram.org/bots/api), porque es lo que cambia el
 * diseño del portal:
 *  - **Un bot no puede escribirle primero a nadie**: `sendMessage` a quien no pulso «Iniciar» devuelve
 *    `403 Forbidden: bot can't initiate conversation with a user`. Por eso la vinculacion va por deep link
 *    (`t.me/<bot>?start=<payload>`, payload de 1 a 64 caracteres `A-Za-z0-9_-`), que llega al bot como
 *    `/start <payload>`.
 *  - Bloqueado por el usuario: `403 Forbidden: bot was blocked by the user`.
 *  - Limite por chat (~1 mensaje por segundo): `429 Too Many Requests: retry after N` con `parameters.retry_after`.
 *  - `sendVideo` por multipart hasta 50 MB; el `file_id` que devuelve se puede reenviar sin volver a subir.
 *  - Respuestas `{ ok: true, result }` / `{ ok: false, error_code, description }`.
 *
 * Lo que NO reproduce esta en el README (divergencias): la Bot API no tiene clave de idempotencia; aqui el
 * aviso no se reintenta si el resultado es desconocido (queda «incierto»), para no mandar dos veces.
 */
import { exigeGate, type CanalReal, type Entorno } from './gate.js';

export type RespuestaBot<T = unknown> =
  | { ok: true; result: T }
  | { ok: false; error_code: number; description: string; parameters?: { retry_after?: number } };

export interface VideoSubido { nombre: string; tipo: string; bytes: Uint8Array }
export type Transporte = (metodo: string, params: Record<string, unknown>) => Promise<RespuestaBot>;

export const rePayload = /^[A-Za-z0-9_-]{1,64}$/;
export const enlaceProfundo = (bot: string, payload: string): string => {
  if (!rePayload.test(payload)) throw new Error('el payload del deep link lleva de 1 a 64 caracteres A-Z, a-z, 0-9, _ o -');
  return `https://t.me/${bot}?start=${payload}`;
};

export interface MensajeSimulado {
  message_id: number;
  chat: { id: number; type: 'private' };
  from: { id: number; is_bot: boolean; first_name: string };
  date: number;
  text?: string;
  caption?: string;
  video?: { file_id: string; file_unique_id: string; mime_type: string; file_size: number };
}
export interface ActualizacionBot { update_id: number; message: MensajeSimulado }

interface Bot { token: string; usuario: string; id: number }
const MAX_VIDEO = 50 * 1024 * 1024;
const falla = (error_code: number, description: string, retry?: number): RespuestaBot => ({ ok: false, error_code, description, ...(retry ? { parameters: { retry_after: retry } } : {}) });

/** La Bot API en proceso: varios bots (uno por clinica), sus chats privados y su historial. */
export class TelegramSimulado {
  private readonly bots: Bot[];
  private readonly reloj: () => number;
  private readonly iniciados = new Map<string, Set<number>>();
  private readonly bloqueados = new Map<string, Set<number>>();
  private readonly ultimoEnvio = new Map<string, number>();
  private readonly archivos = new Map<string, { bytes: number; tipo: string }>();
  readonly historial: { bot: string; chat: number; direccion: 'entrante' | 'saliente'; mensaje: MensajeSimulado }[] = [];
  private updates: ActualizacionBot[] = [];
  private secuencia = 1;
  alActualizar: ((bot: string, u: ActualizacionBot) => void | Promise<void>) | undefined;

  constructor(op: { bots: { token: string; usuario: string }[]; reloj?: () => number }) {
    this.bots = op.bots.map((b, i) => ({ ...b, id: 7_000_000_000 + i }));
    this.reloj = op.reloj ?? Date.now;
  }

  private bot(token: string): Bot | undefined {
    return this.bots.find((b) => b.token === token);
  }

  /** La persona abre `t.me/<bot>?start=<payload>` y pulsa «Iniciar». */
  async abreEnlace(usuarioBot: string, payload: string, persona: { id: number; nombre: string }): Promise<void> {
    const b = this.bots.find((x) => x.usuario === usuarioBot);
    if (!b) throw new Error(`no existe el bot ${usuarioBot}`);
    if (!rePayload.test(payload)) throw new Error('payload invalido');
    const set = this.iniciados.get(b.usuario) ?? new Set<number>();
    set.add(persona.id);
    this.iniciados.set(b.usuario, set);
    this.bloqueados.get(b.usuario)?.delete(persona.id);
    const mensaje: MensajeSimulado = { message_id: this.secuencia++, chat: { id: persona.id, type: 'private' }, from: { id: persona.id, is_bot: false, first_name: persona.nombre }, date: Math.floor(this.reloj() / 1000), text: `/start ${payload}` };
    const u = { update_id: this.secuencia++, message: mensaje };
    this.updates.push(u);
    this.historial.push({ bot: b.usuario, chat: persona.id, direccion: 'entrante', mensaje });
    await this.alActualizar?.(b.usuario, u);
  }

  bloquea(usuarioBot: string, personaId: number): void {
    const set = this.bloqueados.get(usuarioBot) ?? new Set<number>();
    set.add(personaId);
    this.bloqueados.set(usuarioBot, set);
  }

  /** El transporte de un bot: lo que el adaptador llama en lugar de api.telegram.org. */
  transporte(token: string): Transporte {
    return (metodo, params) => this.llama(token, metodo, params);
  }

  private compruebaChat(b: Bot, chatId: number): RespuestaBot | null {
    if (this.bloqueados.get(b.usuario)?.has(chatId)) return falla(403, 'Forbidden: bot was blocked by the user');
    if (!this.iniciados.get(b.usuario)?.has(chatId)) return falla(403, "Forbidden: bot can't initiate conversation with a user");
    const clave = `${b.usuario}:${chatId}`;
    const ahora = this.reloj();
    const previo = this.ultimoEnvio.get(clave);
    if (previo !== undefined && ahora - previo < 1000) return falla(429, 'Too Many Requests: retry after 1', 1);
    this.ultimoEnvio.set(clave, ahora);
    return null;
  }

  private saliente(b: Bot, chatId: number, extra: Partial<MensajeSimulado>): RespuestaBot<MensajeSimulado> {
    const mensaje: MensajeSimulado = { message_id: this.secuencia++, chat: { id: chatId, type: 'private' }, from: { id: b.id, is_bot: true, first_name: b.usuario }, date: Math.floor(this.reloj() / 1000), ...extra };
    this.historial.push({ bot: b.usuario, chat: chatId, direccion: 'saliente', mensaje });
    return { ok: true, result: mensaje };
  }

  private video(params: Record<string, unknown>): { file_id: string; tipo: string; tamano: number } | RespuestaBot {
    const v = params['video'];
    if (typeof v === 'string') {
      const previo = this.archivos.get(v);
      return previo ? { file_id: v, tipo: previo.tipo, tamano: previo.bytes } : falla(400, 'Bad Request: wrong file identifier/HTTP URL specified');
    }
    const s = v as VideoSubido | undefined;
    if (!s?.bytes) return falla(400, 'Bad Request: there is no video in the request');
    if (s.bytes.length > MAX_VIDEO) return falla(413, 'Request Entity Too Large');
    if (s.tipo !== 'video/mp4') return falla(400, 'Bad Request: wrong type of the web page content');
    const file_id = `BAAC${Buffer.from(`${s.nombre}:${s.bytes.length}`).toString('base64url')}`;
    this.archivos.set(file_id, { bytes: s.bytes.length, tipo: s.tipo });
    return { file_id, tipo: s.tipo, tamano: s.bytes.length };
  }

  async llama(token: string, metodo: string, params: Record<string, unknown>): Promise<RespuestaBot> {
    const b = this.bot(token);
    if (!b) return falla(401, 'Unauthorized');
    if (metodo === 'getMe') return { ok: true, result: { id: b.id, is_bot: true, first_name: b.usuario, username: b.usuario } };
    if (metodo === 'getUpdates') {
      const desde = Number(params['offset'] ?? 0);
      this.updates = this.updates.filter((u) => u.update_id >= desde);
      return { ok: true, result: this.updates };
    }
    if (metodo !== 'sendMessage' && metodo !== 'sendVideo') return falla(404, 'Not Found: method not found');
    const chatId = Number(params['chat_id']);
    if (!Number.isInteger(chatId)) return falla(400, 'Bad Request: chat not found');
    const error = this.compruebaChat(b, chatId);
    if (error) return error;
    if (metodo === 'sendMessage') {
      const text = String(params['text'] ?? '');
      if (text.length === 0 || text.length > 4096) return falla(400, 'Bad Request: message text is empty or too long');
      return this.saliente(b, chatId, { text });
    }
    const v = this.video(params);
    if ('ok' in v) return v;
    return this.saliente(b, chatId, { caption: String(params['caption'] ?? '').slice(0, 1024), video: { file_id: v.file_id, file_unique_id: v.file_id.slice(-12), mime_type: v.tipo, file_size: v.tamano } });
  }

  conversacion(usuarioBot: string, chatId: number) {
    return this.historial.filter((h) => h.bot === usuarioBot && h.chat === chatId);
  }
}

/** El transporte REAL contra api.telegram.org: se niega sin el gate. No medido contra Telegram. */
export function transporteTelegramReal(op: { env: Entorno; token: string; fetch: typeof globalThis.fetch; revisiones?: Readonly<Record<CanalReal, string | null>> }): Transporte {
  exigeGate('telegram', op.env, op.revisiones);
  return async (metodo, params) => {
    const url = `https://api.telegram.org/bot${op.token}/${metodo}`;
    const v = params['video'] as VideoSubido | undefined;
    let cuerpo: BodyInit;
    let cabeceras: Record<string, string> = {};
    if (v && typeof v === 'object' && 'bytes' in v) {
      const f = new FormData();
      for (const [k, x] of Object.entries(params)) if (k !== 'video') f.append(k, String(x));
      f.append('video', new Blob([new Uint8Array(v.bytes)], { type: v.tipo }), v.nombre);
      cuerpo = f;
    } else {
      cuerpo = JSON.stringify(params);
      cabeceras = { 'content-type': 'application/json' };
    }
    const r = await op.fetch(url, { method: 'POST', headers: cabeceras, body: cuerpo });
    return (await r.json()) as RespuestaBot;
  };
}

export type ResultadoTelegram =
  | { ok: true; mensajeId: number; fileId?: string }
  | { ok: false; motivo: 'bot_no_iniciado' | 'limite' | 'otro'; definitivo: boolean; reintentaEnS?: number; detalle: string };

/** El PUERTO del portal: texto o video con pie. Traduce los errores de la Bot API a motivos del portal. */
export function creaCanalTelegram(transporte: Transporte) {
  const traduce = (r: RespuestaBot): ResultadoTelegram => {
    if (r.ok) {
      const m = r.result as MensajeSimulado;
      return { ok: true, mensajeId: m.message_id, ...(m.video ? { fileId: m.video.file_id } : {}) };
    }
    if (r.error_code === 403) return { ok: false, motivo: 'bot_no_iniciado', definitivo: true, detalle: r.description };
    if (r.error_code === 429) return { ok: false, motivo: 'limite', definitivo: false, reintentaEnS: r.parameters?.retry_after ?? 1, detalle: r.description };
    return { ok: false, motivo: 'otro', definitivo: r.error_code < 500, detalle: r.description };
  };
  return {
    texto: async (chatId: number, texto: string) => traduce(await transporte('sendMessage', { chat_id: chatId, text: texto })),
    video: async (chatId: number, video: VideoSubido | string, pie: string) => traduce(await transporte('sendVideo', { chat_id: chatId, video, caption: pie, supports_streaming: true })),
  };
}

export type CanalTelegram = ReturnType<typeof creaCanalTelegram>;
