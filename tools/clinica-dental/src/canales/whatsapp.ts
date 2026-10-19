/**
 * El canal de WhatsApp, del lado de la RED: el PUERTO del portal armado sobre un transporte de Graph (el simulador
 * de `@tu-scope/ventas-whatsapp` en el laboratorio, o la Cloud API) y el TRANSPORTE REAL contra
 * graph.facebook.com, que se niega sin su gate (`gate.ts`: revision firmada de C3 + AISIA para WhatsApp, declarada
 * en el codigo, y `CLINICA_GATE_WHATSAPP` con su id). Hoy no hay revision firmada: el transporte real no se puede
 * construir. Escrito y probado contra un `fetch` falso; **no medido contra Meta**.
 *
 * La forma de los mensajes de Graph NO se reescribe aqui: `aCuerpo` es el `aCuerpoGraph` de ventas-whatsapp (los
 * limites de Meta viven en un solo lugar).
 */
import { exigeGate, type CanalReal, type Entorno } from './gate.js';
import type { FlujoWa, MensajeWa, NumeroClinica, PuertoWhatsApp } from '../whatsapp/tipos.js';

/** La version de la Graph API va FIJA, nunca «la ultima» (la misma que ventas-whatsapp). */
export const VERSION_GRAPH_WA = 'v24.0';

export type RespuestaGraph = { ok: true; wamid: string } | { ok: false; codigo: number; error: string };
export type RespuestaMedioGraph = { ok: true; bytes: Uint8Array; mime: string } | { ok: false; codigo: number; error: string };

/** Lo que el puerto necesita de un transporte de Graph (subconjunto estructural del `ClienteGraph` de ventas-whatsapp). */
export interface GraphWa {
  enviaMensaje(phoneNumberId: string, cuerpo: Record<string, unknown>): Promise<RespuestaGraph>;
  descargaMedio?(phoneNumberId: string, mediaId: string): Promise<RespuestaMedioGraph>;
}

/** El mensaje como lo entiende `aCuerpoGraph`: igual a `MensajeWa`, con el Flow por su id publicado. */
export type MensajeGraph = Exclude<MensajeWa, { tipo: 'flow' }> | (Omit<Extract<MensajeWa, { tipo: 'flow' }>, 'flujo'> & { flowId: string });

export interface OpcionesPuertoWa {
  graph: GraphWa;
  numeros: readonly NumeroClinica[];
  /** El id con que Meta publico cada Flow en el numero de esa clinica. */
  flowId(clinica: string, flujo: FlujoWa): string;
  aCuerpo(para: string, m: MensajeGraph): Record<string, unknown>;
}

export function creaPuertoWhatsApp(o: OpcionesPuertoWa): PuertoWhatsApp {
  const numero = (clinica: string) => {
    const n = o.numeros.find((x) => x.clinica === clinica);
    if (!n) throw new Error(`la clínica ${clinica} no tiene número de WhatsApp`);
    return n;
  };
  return {
    async envia(clinica, waId, m) {
      const n = numero(clinica);
      const graph: MensajeGraph = m.tipo === 'flow' ? (({ flujo, ...resto }) => ({ ...resto, flowId: o.flowId(clinica, flujo) }))(m) : m;
      const r = await o.graph.enviaMensaje(n.phoneNumberId, o.aCuerpo(waId, graph));
      return r.ok ? r : { ok: false, codigo: r.codigo, detalle: r.error };
    },
    async descargaMedio(clinica, idMedio) {
      if (!o.graph.descargaMedio) return null;
      const r = await o.graph.descargaMedio(numero(clinica).phoneNumberId, idMedio);
      return r.ok ? { bytes: r.bytes, mime: r.mime } : null;
    },
  };
}

const errorDe = (cuerpo: unknown, status: number): { codigo: number; error: string } => {
  const e = typeof cuerpo === 'object' && cuerpo !== null ? (cuerpo as { error?: { code?: number; message?: string } }).error : undefined;
  return { codigo: e?.code ?? status, error: e?.message ?? `HTTP ${status}` };
};

/** El transporte REAL contra la Cloud API. Se niega a construirse sin el gate de WhatsApp. */
export function transporteWhatsAppReal(op: { env: Entorno; token: string; fetch: typeof globalThis.fetch; revisiones?: Readonly<Record<CanalReal, string | null>> }): GraphWa {
  exigeGate('whatsapp', op.env, op.revisiones);
  const base = `https://graph.facebook.com/${VERSION_GRAPH_WA}`;
  const auth = { authorization: `Bearer ${op.token}` };
  return {
    async enviaMensaje(phoneNumberId, cuerpo) {
      const r = await op.fetch(`${base}/${phoneNumberId}/messages`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
      const j = (await r.json().catch(() => null)) as { messages?: { id?: string }[] } | null;
      const wamid = j?.messages?.[0]?.id;
      return r.status === 200 && wamid ? { ok: true, wamid } : { ok: false, ...errorDe(j, r.status) };
    },
    async descargaMedio(_phoneNumberId, mediaId) {
      const m = await op.fetch(`${base}/${encodeURIComponent(mediaId)}`, { headers: auth });
      const j = (await m.json().catch(() => null)) as { url?: string; mime_type?: string } | null;
      if (m.status !== 200 || !j?.url) return { ok: false, ...errorDe(j, m.status) };
      const b = await op.fetch(j.url, { headers: auth });
      if (b.status !== 200) return { ok: false, codigo: b.status, error: `HTTP ${b.status} al bajar el medio` };
      return { ok: true, bytes: new Uint8Array(await b.arrayBuffer()), mime: j.mime_type ?? '' };
    },
  };
}
