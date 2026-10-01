/**
 * Del webhook de Meta a eventos internos. Todo lo que entra se valida a mano (el núcleo no tiene
 * dependencias) y se normaliza: el resto del sistema nunca ve la forma de Meta.
 *
 * Formas verificadas el 2026-09-30 contra developers.facebook.com/documentation/business-messaging/
 * whatsapp/webhooks/reference/*:
 *  - `messages` (texto con `referral` de anuncio Click-to-WhatsApp y su `ctwa_clid`; `order` con
 *    `catalog_id` y `product_items[{product_retailer_id, quantity, item_price, currency}]`;
 *    `interactive` `button_reply` / `list_reply` / `nfm_reply`);
 *  - `statuses` con `pricing {billable, pricing_model, type, category}` (el `conversation` solo
 *    viene, desde v24, en ventanas de entrada gratuita);
 *  - coexistencia: `smb_message_echoes` (`message_echoes`), `history` (`metadata.phase`,
 *    `chunk_order`, `progress`; error 2593109 si el dueño no compartió), `account_update` con
 *    `PARTNER_REMOVED` / `ACCOUNT_RECONNECTED`;
 *  - `automatic_events` (`event_name` LeadSubmitted | Purchase, `custom_data.value` EN MILÉSIMAS).
 * Lo que no se reconoce se devuelve como `desconocido`: se registra, no se tira en silencio.
 */
import { esObjeto, normalizaWaId, numero, texto } from '../comun/base.js';

export interface Referencia {
  ctwaClid?: string;
  sourceId?: string;
  sourceType?: string;
  sourceUrl?: string;
  titular?: string;
}

export interface ItemPedidoMeta {
  retailerId: string;
  cantidad: number;
  /** Centavos, desde `item_price` (número con decimales en la moneda). */
  precioCentavos: number;
  moneda: string;
}

export type Interactivo =
  | { tipo: 'boton'; id: string; titulo: string }
  | { tipo: 'lista'; id: string; titulo: string; descripcion?: string }
  | { tipo: 'flow'; respuesta: Record<string, unknown>; nombre?: string };

export interface MensajeEntrante {
  clase: 'mensaje';
  wabaId: string;
  phoneNumberId: string;
  waId: string;
  nombre?: string;
  wamid: string;
  /** Milisegundos. Meta manda segundos en texto. */
  instante: number;
  tipo: string;
  texto?: string;
  interactivo?: Interactivo;
  pedido?: { catalogoId: string; texto?: string; items: ItemPedidoMeta[] };
  referencia?: Referencia;
  respondeA?: string;
}

export interface PrecioMeta {
  billable: boolean;
  modelo: string;
  tipo: string;
  categoria: string;
}

export interface EstadoEntrante {
  clase: 'estado';
  wabaId: string;
  phoneNumberId: string;
  wamid: string;
  estado: 'sent' | 'delivered' | 'read' | 'played' | 'failed';
  instante: number;
  destinatario: string;
  precio?: PrecioMeta;
  errores?: Array<{ codigo?: number; titulo?: string }>;
}

export interface EcoDelDueno {
  clase: 'eco';
  wabaId: string;
  phoneNumberId: string;
  /** El cliente al que contestó el dueño desde su celular. */
  waId: string;
  wamid: string;
  instante: number;
  tipo: string;
  texto?: string;
}

export interface FragmentoHistorial {
  clase: 'historial';
  wabaId: string;
  phoneNumberId: string;
  fase?: number;
  orden?: number;
  progreso?: number;
  hilos: Array<{ waId: string; mensajes: Array<{ de: string; para?: string; wamid: string; instante: number; tipo: string; texto?: string }> }>;
  /** 2593109: el dueño no compartió el historial. */
  errorCodigo?: number;
}

export interface CambioDeCuenta {
  clase: 'cuenta';
  wabaId: string;
  evento: string;
  telefono?: string;
  iniciadoPor?: string;
}

export interface EventoAutomatico {
  clase: 'evento_automatico';
  wabaId: string;
  phoneNumberId: string;
  wamid: string;
  nombre: string;
  instante: number;
  ctwaClid?: string;
  moneda?: string;
  /** Centavos, convertidos desde las milésimas que manda Meta. */
  valorCentavos?: number;
}

export interface Desconocido {
  clase: 'desconocido';
  wabaId: string;
  campo: string;
}

export type EventoCanal = MensajeEntrante | EstadoEntrante | EcoDelDueno | FragmentoHistorial | CambioDeCuenta | EventoAutomatico | Desconocido;

const aMs = (v: unknown): number => (numero(v) ?? 0) * 1000;
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function leeInteractivo(v: unknown): Interactivo | undefined {
  if (!esObjeto(v)) return undefined;
  if (v.type === 'button_reply' && esObjeto(v.button_reply)) {
    return { tipo: 'boton', id: texto(v.button_reply.id) ?? '', titulo: texto(v.button_reply.title) ?? '' };
  }
  if (v.type === 'list_reply' && esObjeto(v.list_reply)) {
    const d = texto(v.list_reply.description);
    return { tipo: 'lista', id: texto(v.list_reply.id) ?? '', titulo: texto(v.list_reply.title) ?? '', ...(d ? { descripcion: d } : {}) };
  }
  if (v.type === 'nfm_reply' && esObjeto(v.nfm_reply)) {
    let respuesta: Record<string, unknown> = {};
    try {
      const crudo = JSON.parse(texto(v.nfm_reply.response_json) ?? '{}') as unknown;
      if (esObjeto(crudo)) respuesta = crudo;
    } catch { /* respuesta ilegible: queda vacía y el dominio la rechaza */ }
    const nombre = texto(v.nfm_reply.name);
    return { tipo: 'flow', respuesta, ...(nombre ? { nombre } : {}) };
  }
  return undefined;
}

function leeMensaje(m: Record<string, unknown>, base: { wabaId: string; phoneNumberId: string }, contactos: unknown[]): MensajeEntrante | null {
  const de = texto(m.from);
  const wamid = texto(m.id);
  if (!de || !wamid) return null;
  const waId = normalizaWaId(de);
  const contacto = contactos.find((c) => esObjeto(c) && normalizaWaId(texto(c.wa_id) ?? '') === waId);
  const nombre = esObjeto(contacto) && esObjeto(contacto.profile) ? texto(contacto.profile.name) : undefined;
  const tipo = texto(m.type) ?? 'unknown';
  const salida: MensajeEntrante = { clase: 'mensaje', ...base, waId, wamid, instante: aMs(m.timestamp), tipo, ...(nombre ? { nombre } : {}) };
  if (esObjeto(m.text)) { const t = texto(m.text.body); if (t !== undefined) salida.texto = t; }
  if (esObjeto(m.button)) { const t = texto(m.button.text); if (t !== undefined) salida.texto = t; }
  const inter = leeInteractivo(m.interactive);
  if (inter) salida.interactivo = inter;
  if (esObjeto(m.order)) {
    const items: ItemPedidoMeta[] = [];
    for (const it of lista(m.order.product_items)) {
      if (!esObjeto(it)) continue;
      const retailerId = texto(it.product_retailer_id);
      const cantidad = numero(it.quantity);
      const precio = numero(it.item_price);
      if (!retailerId || cantidad === undefined || precio === undefined) continue;
      items.push({ retailerId, cantidad, precioCentavos: Math.round(precio * 100), moneda: texto(it.currency) ?? 'MXN' });
    }
    const t = texto(m.order.text);
    salida.pedido = { catalogoId: texto(m.order.catalog_id) ?? '', items, ...(t ? { texto: t } : {}) };
  }
  if (esObjeto(m.referral)) {
    const r = m.referral;
    const ref: Referencia = {};
    const campos: Array<[keyof Referencia, unknown]> = [
      ['ctwaClid', r.ctwa_clid], ['sourceId', r.source_id], ['sourceType', r.source_type], ['sourceUrl', r.source_url], ['titular', r.headline],
    ];
    for (const [k, v] of campos) { const t = texto(v); if (t) ref[k] = t; }
    salida.referencia = ref;
  }
  if (esObjeto(m.context)) { const c = texto(m.context.id); if (c) salida.respondeA = c; }
  return salida;
}

const ESTADOS = new Set(['sent', 'delivered', 'read', 'played', 'failed']);

function leeEstado(s: Record<string, unknown>, base: { wabaId: string; phoneNumberId: string }): EstadoEntrante | null {
  const wamid = texto(s.id);
  const estado = texto(s.status);
  if (!wamid || !estado || !ESTADOS.has(estado)) return null;
  const salida: EstadoEntrante = {
    clase: 'estado', ...base, wamid, estado: estado as EstadoEntrante['estado'], instante: aMs(s.timestamp),
    destinatario: normalizaWaId(texto(s.recipient_id) ?? ''),
  };
  if (esObjeto(s.pricing)) {
    salida.precio = {
      billable: s.pricing.billable === true,
      modelo: texto(s.pricing.pricing_model) ?? '',
      tipo: texto(s.pricing.type) ?? '',
      categoria: texto(s.pricing.category) ?? '',
    };
  }
  const errores = lista(s.errors).filter(esObjeto).map((e) => {
    const codigo = numero(e.code);
    const titulo = texto(e.title);
    return { ...(codigo !== undefined ? { codigo } : {}), ...(titulo ? { titulo } : {}) };
  });
  if (errores.length) salida.errores = errores;
  return salida;
}

/** Un cambio (`entry[].changes[]`) a sus eventos. */
function leeCambio(wabaId: string, campo: string, valor: Record<string, unknown>): EventoCanal[] {
  const metadata = esObjeto(valor.metadata) ? valor.metadata : {};
  const base = { wabaId, phoneNumberId: texto(metadata.phone_number_id) ?? '' };
  const salida: EventoCanal[] = [];
  if (campo === 'messages') {
    const contactos = lista(valor.contacts);
    for (const m of lista(valor.messages)) if (esObjeto(m)) { const e = leeMensaje(m, base, contactos); if (e) salida.push(e); }
    for (const s of lista(valor.statuses)) if (esObjeto(s)) { const e = leeEstado(s, base); if (e) salida.push(e); }
    return salida;
  }
  if (campo === 'smb_message_echoes') {
    for (const e of lista(valor.message_echoes)) {
      if (!esObjeto(e)) continue;
      const wamid = texto(e.id);
      const para = texto(e.to);
      if (!wamid || !para) continue;
      const tipo = texto(e.type) ?? 'text';
      const cuerpo = esObjeto(e[tipo]) ? texto((e[tipo] as Record<string, unknown>).body) : undefined;
      salida.push({ clase: 'eco', ...base, waId: normalizaWaId(para), wamid, instante: aMs(e.timestamp), tipo, ...(cuerpo !== undefined ? { texto: cuerpo } : {}) });
    }
    return salida;
  }
  if (campo === 'history') {
    const errores = lista(valor.errors).filter(esObjeto);
    for (const h of lista(valor.history)) {
      if (!esObjeto(h)) continue;
      const md = esObjeto(h.metadata) ? h.metadata : {};
      const hilos = lista(h.threads).filter(esObjeto).map((t) => ({
        waId: normalizaWaId(texto(t.id) ?? ''),
        mensajes: lista(t.messages).filter(esObjeto).map((m) => {
          const tipo = texto(m.type) ?? 'text';
          const cuerpo = esObjeto(m[tipo]) ? texto((m[tipo] as Record<string, unknown>).body) : undefined;
          const para = texto(m.to);
          return {
            de: normalizaWaId(texto(m.from) ?? ''), ...(para ? { para: normalizaWaId(para) } : {}),
            wamid: texto(m.id) ?? '', instante: aMs(m.timestamp), tipo, ...(cuerpo !== undefined ? { texto: cuerpo } : {}),
          };
        }),
      }));
      const fase = numero(md.phase);
      const orden = numero(md.chunk_order);
      const progreso = numero(md.progress);
      salida.push({
        clase: 'historial', ...base, hilos,
        ...(fase !== undefined ? { fase } : {}), ...(orden !== undefined ? { orden } : {}), ...(progreso !== undefined ? { progreso } : {}),
      });
    }
    for (const e of errores) {
      const codigo = numero(e.code);
      salida.push({ clase: 'historial', ...base, hilos: [], ...(codigo !== undefined ? { errorCodigo: codigo } : {}) });
    }
    return salida;
  }
  if (campo === 'account_update') {
    const evento = texto(valor.event) ?? '';
    const info = esObjeto(valor.disconnection_info) ? valor.disconnection_info : {};
    const telefono = texto(valor.phone_number);
    const por = texto(info.initiated_by);
    salida.push({ clase: 'cuenta', wabaId, evento, ...(telefono ? { telefono: normalizaWaId(telefono) } : {}), ...(por ? { iniciadoPor: por } : {}) });
    return salida;
  }
  if (campo === 'automatic_events') {
    for (const a of lista(valor.automatic_events)) {
      if (!esObjeto(a)) continue;
      const cd = esObjeto(a.custom_data) ? a.custom_data : null;
      const milesimas = cd ? numero(cd.value) : undefined;
      const moneda = cd ? texto(cd.currency) : undefined;
      const clid = texto(a.ctwa_clid);
      salida.push({
        clase: 'evento_automatico', ...base, wamid: texto(a.id) ?? '', nombre: texto(a.event_name) ?? '', instante: aMs(a.timestamp),
        ...(clid ? { ctwaClid: clid } : {}), ...(moneda ? { moneda } : {}),
        ...(milesimas !== undefined ? { valorCentavos: Math.round(milesimas / 10) } : {}),
      });
    }
    return salida;
  }
  return [{ clase: 'desconocido', wabaId, campo }];
}

export type LecturaWebhook = { ok: true; eventos: EventoCanal[] } | { ok: false; error: string };

/** El cuerpo ya verificado (firma) y parseado. */
export function leeWebhook(cuerpo: unknown): LecturaWebhook {
  if (!esObjeto(cuerpo) || cuerpo.object !== 'whatsapp_business_account' || !Array.isArray(cuerpo.entry)) {
    return { ok: false, error: 'no es un webhook de WhatsApp Business Account' };
  }
  const eventos: EventoCanal[] = [];
  for (const entrada of cuerpo.entry) {
    if (!esObjeto(entrada)) continue;
    const wabaId = texto(entrada.id) ?? '';
    for (const cambio of lista(entrada.changes)) {
      if (!esObjeto(cambio) || !esObjeto(cambio.value)) continue;
      eventos.push(...leeCambio(wabaId, texto(cambio.field) ?? '', cambio.value));
    }
  }
  return { ok: true, eventos };
}
