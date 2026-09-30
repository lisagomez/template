/**
 * El transporte hacia Meta, INYECTADO. La app habla con esta interfaz y no sabe si del otro lado
 * está Cloud API, un BSP o el simulador: cambiar de uno a otro es cambiar el adaptador (P-01, la
 * elección de BSP, sigue abierta).
 *
 * Endpoints (fuente §Modelo de datos, verificados el 2026-09-30):
 *  - `POST /{phone_number_id}/messages` → `{ messaging_product, contacts:[{input, wa_id}], messages:[{id}] }`
 *  - `POST /{phone_number_id}/message_qrdls` → `{ code, prefilled_message, deep_link_url, qr_image_url }`
 *  - `POST /{dataset_id}/events` (Conversions API) → `{ events_received, messages, fbtrace_id }`
 * La versión de la Graph API va FIJA en configuración, nunca «la última».
 */
import { esObjeto, numero, texto } from '../comun/base.js';

export const VERSION_GRAPH = 'v24.0';

export type RespuestaEnvio = { ok: true; wamid: string } | { ok: false; codigo: number; error: string };
export type RespuestaQr = { ok: true; codigo: string; ligaCorta: string; urlImagen: string; mensaje: string } | { ok: false; error: string };
export type RespuestaCapi = { ok: true; recibidos: number; traza: string } | { ok: false; codigo: number; error: string };

export interface EventoCapi {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: 'business_messaging';
  messaging_channel: 'whatsapp';
  user_data: { whatsapp_business_account_id: string; ctwa_clid?: string };
  custom_data?: { currency: string; value: number };
}

export interface ClienteGraph {
  enviaMensaje(phoneNumberId: string, cuerpo: Record<string, unknown>): Promise<RespuestaEnvio>;
  /** Acuse de lectura con indicador de escritura (`status: read` + `typing_indicator`). No se cobra. */
  marcaLeido(phoneNumberId: string, wamid: string): Promise<boolean>;
  creaQr(phoneNumberId: string, mensajePrellenado: string, formato: 'SVG' | 'PNG'): Promise<RespuestaQr>;
  enviaEventos(datasetId: string, eventos: EventoCapi[]): Promise<RespuestaCapi>;
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; json(): Promise<unknown> }>;

export interface OpcionesGraphHttp {
  /** `https://graph.facebook.com` en producción; la URL del simulador en el laboratorio. */
  base: string;
  version?: string;
  /** Token de usuario de sistema del inquilino. Nunca se registra ni se imprime. */
  token: string;
  fetch: Fetch;
}

const errorDe = (cuerpo: unknown, status: number): { codigo: number; error: string } => {
  const e = esObjeto(cuerpo) && esObjeto(cuerpo.error) ? cuerpo.error : {};
  return { codigo: numero(e.code) ?? status, error: texto(e.message) ?? `HTTP ${status}` };
};

/** El adaptador HTTP real. En el laboratorio apunta al simulador; con Meta, a graph.facebook.com. */
export function clienteGraphHttp(o: OpcionesGraphHttp): ClienteGraph {
  const version = o.version ?? VERSION_GRAPH;
  const post = async (ruta: string, cuerpo: unknown) => {
    const r = await o.fetch(`${o.base.replace(/\/$/, '')}/${version}/${ruta}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${o.token}` },
      body: JSON.stringify(cuerpo),
    });
    return { status: r.status, cuerpo: await r.json().catch(() => null) };
  };
  return {
    async enviaMensaje(phoneNumberId, cuerpo) {
      const r = await post(`${phoneNumberId}/messages`, cuerpo);
      const mensajes = esObjeto(r.cuerpo) && Array.isArray(r.cuerpo.messages) ? r.cuerpo.messages : [];
      const wamid = esObjeto(mensajes[0]) ? texto(mensajes[0].id) : undefined;
      if (r.status === 200 && wamid) return { ok: true, wamid };
      return { ok: false, ...errorDe(r.cuerpo, r.status) };
    },
    async marcaLeido(phoneNumberId, wamid) {
      const r = await post(`${phoneNumberId}/messages`, { messaging_product: 'whatsapp', status: 'read', message_id: wamid, typing_indicator: { type: 'text' } });
      return r.status === 200;
    },
    async creaQr(phoneNumberId, mensajePrellenado, formato) {
      const r = await post(`${phoneNumberId}/message_qrdls`, { prefilled_message: mensajePrellenado, generate_qr_image: formato });
      const c = esObjeto(r.cuerpo) ? r.cuerpo : {};
      const codigo = texto(c.code);
      if (r.status !== 200 || !codigo) return { ok: false, error: errorDe(r.cuerpo, r.status).error };
      return { ok: true, codigo, ligaCorta: texto(c.deep_link_url) ?? '', urlImagen: texto(c.qr_image_url) ?? '', mensaje: texto(c.prefilled_message) ?? '' };
    },
    async enviaEventos(datasetId, eventos) {
      const r = await post(`${datasetId}/events`, { data: eventos });
      const c = esObjeto(r.cuerpo) ? r.cuerpo : {};
      if (r.status === 200 && numero(c.events_received) !== undefined) return { ok: true, recibidos: numero(c.events_received) ?? 0, traza: texto(c.fbtrace_id) ?? '' };
      return { ok: false, ...errorDe(r.cuerpo, r.status) };
    },
  };
}

/**
 * Varios inquilinos, un transporte: cada llamada usa el token del recurso (número o dataset). Los
 * tokens vienen de un almacén de secretos INYECTADO (P-02, la custodia en vault, sigue abierta):
 * nunca de la configuración del agente ni de un log.
 */
export function clienteGraphMultiInquilino(o: Omit<OpcionesGraphHttp, 'token'> & { token: (idRecurso: string) => string | undefined }): ClienteGraph {
  const para = (id: string) => {
    const token = o.token(id);
    if (!token) throw new Error(`sin token para el recurso ${id}`);
    return clienteGraphHttp({ ...o, token });
  };
  return {
    enviaMensaje: (id, cuerpo) => para(id).enviaMensaje(id, cuerpo),
    marcaLeido: (id, wamid) => para(id).marcaLeido(id, wamid),
    creaQr: (id, mensaje, formato) => para(id).creaQr(id, mensaje, formato),
    enviaEventos: (id, eventos) => para(id).enviaEventos(id, eventos),
  };
}
