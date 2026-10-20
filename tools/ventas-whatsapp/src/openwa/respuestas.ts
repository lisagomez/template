/**
 * Las respuestas de la fachada en la forma de OpenWA: cuerpos crudos (sin sobre), errores con el sobre de Nest
 * (`{statusCode, message, error?, code?}`) y, en lo que la vía oficial no hace, `alternativa`. También la validación
 * de cuerpos (OpenWA rechaza campos que no declara) y la lectura de los `chatId`.
 */
import { normalizaWaId } from '../comun/base.js';
import type { Respuesta } from './tipos.js';

const FRASES: Record<number, string> = {
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 413: 'Payload Too Large',
  422: 'Unprocessable Entity', 429: 'Too Many Requests', 500: 'Internal Server Error', 501: 'Not Implemented', 503: 'Service Unavailable',
};

export interface ExtraError { code?: string; alternativa?: string; retryAfterSeconds?: number; [k: string]: unknown }

export const responde = (status: number, cuerpo?: unknown): Respuesta => (cuerpo === undefined ? { status } : { status, cuerpo });

export function falla(status: number, message: string | string[], extra: ExtraError = {}): Respuesta {
  const cabeceras: Record<string, string> = extra.retryAfterSeconds ? { 'retry-after': String(extra.retryAfterSeconds) } : {};
  return { status, cuerpo: { statusCode: status, message, error: FRASES[status] ?? 'Error', ...extra }, cabeceras };
}

export const noEncontrado = (que: string) => falla(404, `${que} no encontrado`);

// ── validación ─────────────────────────────────────────────────────────────────────────────────────────────────
export type Campo =
  | { tipo: 'texto'; requerido?: boolean; min?: number; max?: number; enumeracion?: readonly string[]; nulo?: boolean }
  | { tipo: 'numero'; requerido?: boolean; min?: number; max?: number }
  | { tipo: 'booleano'; requerido?: boolean }
  | { tipo: 'textos'; requerido?: boolean; min?: number; max?: number; enumeracion?: readonly string[] }
  | { tipo: 'objeto'; requerido?: boolean; nulo?: boolean }
  | { tipo: 'objetos'; requerido?: boolean; min?: number; max?: number };

function revisaCampo(k: string, v: unknown, c: Campo): string | null {
  if (v === null && 'nulo' in c && c.nulo) return null;
  if (c.tipo === 'texto') {
    if (typeof v !== 'string') return `${k} must be a string`;
    if (c.min !== undefined && v.length < c.min) return `${k} must be longer than or equal to ${c.min} characters`;
    if (c.max !== undefined && v.length > c.max) return `${k} must be shorter than or equal to ${c.max} characters`;
    if (c.enumeracion && !c.enumeracion.includes(v)) return `${k} must be one of the following values: ${c.enumeracion.join(', ')}`;
    return null;
  }
  if (c.tipo === 'numero') {
    if (typeof v !== 'number' || !Number.isFinite(v)) return `${k} must be a number`;
    if (c.min !== undefined && v < c.min) return `${k} must not be less than ${c.min}`;
    if (c.max !== undefined && v > c.max) return `${k} must not be greater than ${c.max}`;
    return null;
  }
  if (c.tipo === 'booleano') return typeof v === 'boolean' ? null : `${k} must be a boolean value`;
  if (c.tipo === 'objeto') return typeof v === 'object' && v !== null && !Array.isArray(v) ? null : `${k} must be an object`;
  if (c.tipo === 'objetos') {
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'object' || x === null || Array.isArray(x))) return `${k} must be an array of objects`;
    if (c.min !== undefined && v.length < c.min) return `${k} must contain at least ${c.min} elements`;
    return c.max !== undefined && v.length > c.max ? `${k} must contain no more than ${c.max} elements` : null;
  }
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) return `${k} must be an array of strings`;
  if (c.min !== undefined && v.length < c.min) return `${k} must contain at least ${c.min} elements`;
  if (c.max !== undefined && v.length > c.max) return `${k} must contain no more than ${c.max} elements`;
  if (c.enumeracion && v.some((x) => !c.enumeracion!.includes(x as string))) return `each value in ${k} must be one of the following values: ${c.enumeracion.join(', ')}`;
  return null;
}

/** Valida un cuerpo como lo hace OpenWA (whitelist + forbidNonWhitelisted): un campo no declarado es un 400. */
export function valida<T extends Record<string, unknown>>(cuerpo: unknown, campos: Record<string, Campo>): { ok: true; v: T } | { ok: false; r: Respuesta } {
  const c = cuerpo ?? {};
  if (typeof c !== 'object' || Array.isArray(c)) return { ok: false, r: falla(400, ['el cuerpo debe ser un objeto JSON']) };
  const o = c as Record<string, unknown>;
  const fallas: string[] = Object.keys(o).filter((k) => !(k in campos)).map((k) => `property ${k} should not exist`);
  for (const [k, campo] of Object.entries(campos)) {
    if (o[k] === undefined) { if (campo.requerido) fallas.push(`${k} should not be empty`); continue; }
    const f = revisaCampo(k, o[k], campo);
    if (f) fallas.push(f);
  }
  return fallas.length ? { ok: false, r: falla(400, fallas) } : { ok: true, v: o as T };
}

// ── chats ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** `chatId` es la forma normalizada (llave interna); `publico`, los dígitos tal como llegaron (lo que ve el integrador). */
export type Destino = { ok: true; waId: string; chatId: string; publico: string } | { ok: false; r: Respuesta };

const ALTERNATIVA_DESTINO: Array<[RegExp, string, string]> = [
  [/@g\.us$/, 'grupo', 'Los grupos van por la Groups API de la Cloud API (cuenta oficial, hasta 8 participantes); esta fachada todavía no la expone.'],
  [/@newsletter$/, 'canal', 'Los Canales de WhatsApp no están en la Cloud API: publícalos desde la app.'],
  [/@broadcast$/, 'estado o lista de difusión', 'Ni los Estados ni las listas de difusión están en la Cloud API: manda a cada persona, dentro de su ventana o con plantilla.'],
  [/@lid$/, 'id con alcance de negocio', 'Trabaja con el id que llega en el webhook; el teléfono solo llega si la persona lo comparte.'],
];

/** `5215512345678@c.us` o solo dígitos → wa_id. Lo que no es un chat 1:1 contesta con su alternativa. */
export function destino(chatId: string): Destino {
  for (const [re, que, alternativa] of ALTERNATIVA_DESTINO) {
    if (re.test(chatId)) return { ok: false, r: falla(501, `La Cloud API no envía a un ${que} desde esta fachada`, { code: 'DESTINO_NO_DISPONIBLE', alternativa }) };
  }
  const m = /^\+?(\d{6,15})(@c\.us|@s\.whatsapp\.net)?$/.exec(chatId.trim());
  if (!m?.[1]) return { ok: false, r: falla(400, [`chatId inválido: ${chatId}`]) };
  const waId = normalizaWaId(m[1]);
  return { ok: true, waId, chatId: `${waId}@c.us`, publico: `${m[1]}@c.us` };
}

export const chatDe = (waId: string) => `${normalizaWaId(waId)}@c.us`;
/** Un número como lo ve un chat de WhatsApp: sus dígitos, sin normalizar. */
export const chatCrudo = (numero: string) => `${numero.replace(/\D/g, '')}@c.us`;
export const iso = (ms: number) => new Date(ms).toISOString();
export const segundos = (ms: number) => Math.floor(ms / 1000);

/** Paginación `limit`/`offset` de la consulta (OpenWA: límite 1-1000, por defecto 100). */
export function pagina<T>(xs: readonly T[], q: URLSearchParams, porDefecto = 100): T[] {
  const n = (k: string, d: number) => { const v = Number(q.get(k) ?? d); return Number.isFinite(v) && v >= 0 ? Math.floor(v) : d; };
  const limite = Math.min(Math.max(n('limit', porDefecto), 1), 1000);
  const desde = n('offset', 0);
  return xs.slice(desde, desde + limite);
}
