/**
 * Embedded Signup y las llamadas del BSP, simulados. Reglas que se imitan (documentación del 30/09/2026):
 * el código canjeable vive 30 s y sirve una sola vez; el token de negocio vale para SU WABA; la línea de
 * crédito solo acepta AUD, EUR, GBP, IDR, INR o USD; el registro pide PIN de 6 dígitos.
 * SUPUESTO: que el código sea de un solo uso (lo natural en OAuth; la página no lo dice).
 */
import { randomBytes } from 'node:crypto';
import type { Reloj } from '../comun/base.js';
import { MONEDAS_CREDITO, VIDA_CODIGO_SIGNUP_MS, type GraphBsp } from '../bsp/alta.js';

interface SesionSignup { code: string; emitido: number; usado: boolean; wabaId: string }

export interface OpcionesSignup {
  wabaId: string;
  businessId: string;
  phoneNumberId?: string;
  coexistencia?: boolean;
  abandonaEn?: string;
  datasetIds?: string[];
  catalogIds?: string[];
}

export function creaMetaBspSimulada(o: { reloj: Reloj }) {
  const sesiones = new Map<string, SesionSignup>();
  const tokens = new Map<string, string>();
  const suscritas = new Set<string>();
  const creditos = new Map<string, { moneda: string; allocationConfigId: string }>();
  const registrados = new Map<string, string>();
  const llamadas: string[] = [];
  const valido = (wabaId: string, token: string) => tokens.get(token) === wabaId;

  const graph: GraphBsp = {
    async canjeaCodigo(code) {
      llamadas.push('GET /oauth/access_token');
      const s = sesiones.get(code);
      if (!s) return { ok: false, error: 'código desconocido' };
      if (s.usado) return { ok: false, error: 'el código ya se canjeó' };
      if (o.reloj() - s.emitido > VIDA_CODIGO_SIGNUP_MS) return { ok: false, error: 'el código venció (30 s)' };
      s.usado = true;
      const token = `EAAB${randomBytes(24).toString('hex')}`;
      tokens.set(token, s.wabaId);
      return { ok: true, token };
    },
    async suscribe(wabaId, token) {
      llamadas.push(`POST /${wabaId}/subscribed_apps`);
      if (!valido(wabaId, token)) return { ok: false, error: '(#200) el token no es de esta WABA' };
      suscritas.add(wabaId);
      return { ok: true };
    },
    async desuscribe(wabaId, token) {
      llamadas.push(`DELETE /${wabaId}/subscribed_apps`);
      if (!valido(wabaId, token)) return { ok: false };
      suscritas.delete(wabaId);
      return { ok: true };
    },
    async comparteCredito(lineaId, wabaId, moneda) {
      llamadas.push(`POST /${lineaId}/whatsapp_credit_sharing_and_attach`);
      if (!(MONEDAS_CREDITO as readonly string[]).includes(moneda)) return { ok: false, error: `(#100) waba_currency ${moneda} no admitida` };
      const allocationConfigId = `58${randomBytes(6).toString('hex')}`;
      creditos.set(wabaId, { moneda, allocationConfigId });
      return { ok: true, allocationConfigId };
    },
    async registra(phoneNumberId, pin, token) {
      llamadas.push(`POST /${phoneNumberId}/register`);
      const waba = tokens.get(token);
      if (!waba) return { ok: false, codigo: 190, error: 'token inválido' };
      if (!/^\d{6}$/.test(pin)) return { ok: false, codigo: 100, error: 'el PIN son 6 dígitos' };
      registrados.set(phoneNumberId, waba);
      return { ok: true };
    },
  };

  return {
    graph,
    /** La pyme recorre la ventana de Embedded Signup: devuelve el `code` y el `message` que recibe la página. */
    signup(s: OpcionesSignup) {
      if (s.abandonaEn) return { code: '', recibidoEn: o.reloj(), mensaje: { type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL', data: { current_step: s.abandonaEn } } };
      const code = `AQ${randomBytes(16).toString('hex')}`;
      sesiones.set(code, { code, emitido: o.reloj(), usado: false, wabaId: s.wabaId });
      const event = s.coexistencia ? 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' : s.phoneNumberId ? 'FINISH' : 'FINISH_ONLY_WABA';
      const data: Record<string, unknown> = { waba_id: s.wabaId, business_id: s.businessId, dataset_ids: s.datasetIds ?? [], catalog_ids: s.catalogIds ?? [] };
      if (s.phoneNumberId) data.phone_number_id = s.phoneNumberId;
      return { code, recibidoEn: o.reloj(), mensaje: { type: 'WA_EMBEDDED_SIGNUP', event, data } };
    },
    suscritas: () => [...suscritas],
    credito: (wabaId: string) => creditos.get(wabaId),
    registrado: (phoneNumberId: string) => registrados.get(phoneNumberId),
    llamadas: () => [...llamadas],
  };
}

export type MetaBspSimulada = ReturnType<typeof creaMetaBspSimulada>;
