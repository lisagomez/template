/**
 * Lotes (`send-bulk`): cada destinatario pasa por el mismo camino que un envío suelto —su ventana de 24 h, la
 * frontera de contactos nuevos y los errores de Meta—, con la pausa entre mensajes que pide el lote. El estado y la
 * cancelación son los de OpenWA. El trabajo corre de fondo y `asienta()` de la fachada lo espera en las pruebas.
 */
import type { MensajeSaliente } from '../meta/mensajes.js';
import { sesionDe, sesionLista, type Contexto, type Manejador } from './contexto.js';
import { envia } from './envios.js';
import { falla, iso, noEncontrado, responde, valida } from './respuestas.js';
import type { LoteOW, NumeroDeSesion, Respuesta, ResultadoLote, Sesion } from './tipos.js';

type Item = { chatId?: unknown; type?: unknown; content?: Record<string, unknown>; variables?: Record<string, unknown> };
type Opciones = { delayBetweenMessages?: number; randomizeDelay?: boolean; stopOnError?: boolean };
const TIPOS: Record<string, 'imagen' | 'video' | 'audio' | 'documento'> = { image: 'imagen', video: 'video', audio: 'audio', document: 'documento' };

export function progreso(l: LoteOW) {
  const cuenta = (e: ResultadoLote['status']) => l.results.filter((r) => r.status === e).length;
  return { total: l.results.length, sent: cuenta('sent'), failed: cuenta('failed'), pending: cuenta('pending'), cancelled: cuenta('cancelled') };
}

const sustituye = (t: string, vars: Record<string, unknown> | undefined) => t.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (todo, k: string) => (vars?.[k] === undefined ? todo : String(vars[k])));

/** Un renglón del lote → mensaje de la Cloud API, o el error de OpenWA (`{code, message}`) que lo deja en `failed`. */
function armaItem(it: Item): MensajeSaliente | { code: string; message: string } {
  const contenido = it.content ?? {};
  if (it.type === 'text') {
    const texto = typeof contenido.text === 'string' ? sustituye(contenido.text, it.variables) : '';
    return texto.trim() ? { tipo: 'texto', texto } : { code: 'CONTENIDO_INVALIDO', message: 'content.text should not be empty' };
  }
  const tipo = TIPOS[String(it.type)];
  if (!tipo) return { code: 'CONTENIDO_INVALIDO', message: `type ${String(it.type)} no admitido` };
  const medio = contenido[String(it.type)] as { url?: unknown; base64?: unknown } | undefined;
  if (medio?.base64 !== undefined) return { code: 'SOLO_URL', message: 'La Cloud API recibe los medios por liga https, no base64' };
  if (typeof medio?.url !== 'string') return { code: 'CONTENIDO_INVALIDO', message: `content.${String(it.type)}.url should not be empty` };
  const pie = typeof contenido.caption === 'string' && tipo !== 'audio' ? sustituye(contenido.caption, it.variables) : undefined;
  return { tipo, enlace: medio.url, ...(pie ? { pie } : {}) };
}

function codigoDe(r: Respuesta): { code: string; message: string } {
  const c = (r.cuerpo ?? {}) as { code?: unknown; message?: unknown };
  return { code: typeof c.code === 'string' ? c.code : `HTTP_${r.status}`, message: Array.isArray(c.message) ? c.message.join('; ') : String(c.message ?? 'rechazado') };
}

async function procesa(c: Contexto, s: Sesion, n: NumeroDeSesion, l: LoteOW, items: Item[], o: Opciones): Promise<void> {
  l.status = 'processing';
  l.startedAt = iso(c.p.reloj());
  const cancelado = () => (l.status as LoteOW['status']) === 'cancelled';
  for (const [i, it] of items.entries()) {
    if (cancelado()) return;
    if (i) await c.p.espera((o.delayBetweenMessages ?? 3000) + (o.randomizeDelay === false ? 0 : Math.floor(Math.random() * 2000)));
    if (cancelado()) return;
    const r = l.results[i]!;
    const m = armaItem(it);
    const e = 'tipo' in m ? await envia(c, s, n, String(it.chatId), m) : { ok: false as const, error: m };
    if (e.ok) Object.assign(r, { status: 'sent', messageId: e.msg.waMessageId, sentAt: iso(c.p.reloj()) });
    else Object.assign(r, { status: 'failed', error: 'error' in e ? e.error : codigoDe(e.r) });
    if (r.status === 'failed' && o.stopOnError) {
      for (const x of l.results) if (x.status === 'pending') x.status = 'cancelled';
      Object.assign(l, { status: 'failed', completedAt: iso(c.p.reloj()) });
      return;
    }
  }
  Object.assign(l, { status: 'completed', completedAt: iso(c.p.reloj()) });
}

export const enviaLote: Manejador = async (c) => {
  const lista = await sesionLista(c);
  if (!lista.ok) return lista.r;
  const v = valida<{ batchId?: string; messages: Item[]; options?: Opciones }>(c.peticion.cuerpo, { batchId: { tipo: 'texto', max: 255 }, messages: { tipo: 'objetos', requerido: true, max: 100 }, options: { tipo: 'objeto' } });
  if (!v.ok) return v.r;
  const pausa = v.v.options?.delayBetweenMessages;
  if (pausa !== undefined && (typeof pausa !== 'number' || pausa < 1000 || pausa > 60000)) return falla(400, ['options.delayBetweenMessages must be between 1000 and 60000']);
  const sinChat = v.v.messages.findIndex((m) => typeof m.chatId !== 'string' || !m.type || typeof m.content !== 'object');
  if (sinChat >= 0) return falla(400, [`messages.${sinChat}: chatId, type y content son obligatorios`]);
  const batchId = v.v.batchId ?? c.p.ids();
  if (c.estado.lotes.has(`${lista.s.id}|${batchId}`)) return falla(409, `El lote ${batchId} ya existe`);
  const l: LoteOW = { batchId, sessionId: lista.s.id, status: 'pending', results: v.v.messages.map((m) => ({ chatId: String(m.chatId), status: 'pending' })), startedAt: null, completedAt: null };
  c.estado.lotes.set(`${lista.s.id}|${batchId}`, l);
  c.p.fondo(procesa(c, lista.s, lista.n, l, v.v.messages, v.v.options ?? {}));
  const estimado = iso(c.p.reloj() + Math.max(0, v.v.messages.length - 1) * (pausa ?? 3000));
  return responde(202, { batchId, status: l.status, totalMessages: l.results.length, estimatedCompletionTime: estimado, statusUrl: `/api/sessions/${lista.s.id}/messages/batch/${batchId}` });
};

const loteDe = (c: Contexto, s: Sesion) => c.estado.lotes.get(`${s.id}|${c.params.batchId ?? ''}`);

export const estadoDeLote: Manejador = async (c) => {
  const d = sesionDe(c);
  if (!d.ok) return d.r;
  const l = loteDe(c, d.s);
  return l ? responde(200, { batchId: l.batchId, status: l.status, progress: progreso(l), results: l.results, startedAt: l.startedAt, completedAt: l.completedAt }) : noEncontrado('Batch');
};

export const cancelaLote: Manejador = async (c) => {
  const d = sesionDe(c);
  if (!d.ok) return d.r;
  const l = loteDe(c, d.s);
  if (!l) return noEncontrado('Batch');
  if (l.status !== 'pending' && l.status !== 'processing') return falla(409, `El lote ya terminó (${l.status})`);
  for (const r of l.results) if (r.status === 'pending') r.status = 'cancelled';
  Object.assign(l, { status: 'cancelled', completedAt: iso(c.p.reloj()) });
  return responde(200, { batchId: l.batchId, status: l.status, progress: progreso(l) });
};
