/**
 * El conector del procesador de pagos, INYECTADO. En México los pagos nativos de WhatsApp no
 * existen (fuente §Investigación: solo India y Brasil): se cobra con una liga de un procesador
 * local enviada con botón de URL y se confirma por el webhook del procesador. Qué procesador
 * (Mercado Pago, Conekta, Stripe MX, Clip…) es una decisión abierta del piloto: aquí vive la
 * interfaz y el conector del procesador SIMULADO.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { esObjeto, numero, texto } from '../comun/base.js';

export interface EventoDePago {
  pagoId: string;
  ligaId: string;
  /** `<inquilino>|<pedido>`: el webhook del procesador se enruta sin buscar entre inquilinos. */
  referencia: string;
  montoCentavos: number;
  moneda: string;
  estado: 'pagado' | 'fallido';
  instante: number;
}

export interface LigaDePago {
  id: string;
  url: string;
}

export interface ConectorPagos {
  nombre: string;
  /** `idempotencia`: la misma llave devuelve la misma liga (un reintento no crea dos cobros). */
  creaLiga(p: { referencia: string; montoCentavos: number; moneda: string; descripcion: string; idempotencia: string }): Promise<{ ok: true; liga: LigaDePago } | { ok: false; error: string }>;
  leeWebhook(cuerpoCrudo: string, firma: string | null | undefined): { ok: true; evento: EventoDePago } | { ok: false; error: string };
  /** El reporte del procesador, para conciliar contra los pedidos. */
  reporte(): Promise<EventoDePago[]>;
}

export const CABECERA_FIRMA_PROCESADOR = 'x-procesador-firma';

export const firmaProcesador = (secreto: string, cuerpo: string): string =>
  `sha256=${createHmac('sha256', secreto).update(cuerpo).digest('hex')}`;

/** Lee y verifica el webhook del procesador simulado (HMAC-SHA256 del cuerpo). */
export function leeWebhookProcesador(secreto: string, cuerpoCrudo: string, firma: string | null | undefined): { ok: true; evento: EventoDePago } | { ok: false; error: string } {
  const esperada = Buffer.from(firmaProcesador(secreto, cuerpoCrudo));
  const recibida = Buffer.from(firma ?? '');
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return { ok: false, error: 'firma inválida' };
  let c: unknown;
  try { c = JSON.parse(cuerpoCrudo); } catch { return { ok: false, error: 'cuerpo ilegible' }; }
  if (!esObjeto(c)) return { ok: false, error: 'cuerpo inválido' };
  const pagoId = texto(c.pago_id);
  const ligaId = texto(c.liga_id);
  const referencia = texto(c.referencia);
  const monto = numero(c.monto_centavos);
  const estado = texto(c.estado);
  if (!pagoId || !ligaId || !referencia || monto === undefined || (estado !== 'pagado' && estado !== 'fallido')) return { ok: false, error: 'campos faltantes' };
  return { ok: true, evento: { pagoId, ligaId, referencia, montoCentavos: monto, moneda: texto(c.moneda) ?? 'MXN', estado, instante: (numero(c.instante) ?? 0) } };
}

/** `<inquilino>|<pedido>` → sus partes. */
export function partesDeReferencia(referencia: string): { inquilinoId: string; pedidoId: string } | null {
  const [inquilinoId, pedidoId] = referencia.split('|');
  return inquilinoId && pedidoId ? { inquilinoId, pedidoId } : null;
}

type FetchJson = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; json(): Promise<unknown> }>;

/** El conector HTTP del procesador simulado (`POST /ligas`, `GET /reporte`). Un procesador real tendría el suyo. */
export function conectorPagosHttp(o: { base: string; secreto: string; fetch: FetchJson }): ConectorPagos {
  const base = o.base.replace(/\/$/, '');
  return {
    nombre: 'procesador-simulado-http',
    async creaLiga(p) {
      const r = await o.fetch(`${base}/ligas`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p) });
      const c = await r.json().catch(() => null);
      if (r.status !== 200 || !esObjeto(c) || !texto(c.id) || !texto(c.url)) return { ok: false, error: `el procesador respondió ${r.status}` };
      return { ok: true, liga: { id: texto(c.id)!, url: texto(c.url)! } };
    },
    leeWebhook: (cuerpo, firma) => leeWebhookProcesador(o.secreto, cuerpo, firma),
    async reporte() {
      const r = await o.fetch(`${base}/reporte`);
      const c = await r.json().catch(() => []);
      return Array.isArray(c) ? (c as EventoDePago[]) : [];
    },
  };
}
