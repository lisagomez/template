/**
 * Un procesador de pagos mexicano, simulado: crea ligas https, cobra (o falla), manda su webhook
 * firmado (HMAC-SHA256 del cuerpo en `x-procesador-firma`), puede duplicarlo o mandar un monto que
 * no cuadra, y tiene su reporte para conciliar. El conector que usa la app es el mismo contrato
 * que tendría uno real (`ConectorPagos`); cuál procesador real es una decisión abierta del piloto.
 */
import { randomBytes } from 'node:crypto';
import { relojDelSistema, type Reloj } from '../comun/base.js';
import { firmaProcesador, leeWebhookProcesador, CABECERA_FIRMA_PROCESADOR, type ConectorPagos, type EventoDePago } from '../dominios/pagos.js';

export const DOMINIO_PAGOS_SIMULADO = 'pagos.simulado.test';

export interface LigaSimulada { id: string; url: string; referencia: string; montoCentavos: number; moneda: string; pagada: boolean }

export function creaProcesadorSimulado(o: { secreto: string; reloj?: Reloj; entrega: (cuerpo: string, cabeceras: Record<string, string>) => Promise<number> }) {
  const reloj = o.reloj ?? relojDelSistema;
  const ligas = new Map<string, LigaSimulada>();
  const porIdempotencia = new Map<string, string>();
  const cobros: EventoDePago[] = [];

  const envia = async (e: EventoDePago & { monto_override?: number }) => {
    const cuerpo = JSON.stringify({ pago_id: e.pagoId, liga_id: e.ligaId, referencia: e.referencia, monto_centavos: e.montoCentavos, moneda: e.moneda, estado: e.estado, instante: e.instante });
    return o.entrega(cuerpo, { 'content-type': 'application/json', [CABECERA_FIRMA_PROCESADOR]: firmaProcesador(o.secreto, cuerpo) });
  };

  const conector: ConectorPagos = {
    nombre: 'procesador-simulado',
    async creaLiga(p) {
      const previa = porIdempotencia.get(p.idempotencia);
      if (previa) { const l = ligas.get(previa)!; return { ok: true, liga: { id: l.id, url: l.url } }; }
      if (p.montoCentavos <= 0) return { ok: false, error: 'monto inválido' };
      const id = `liga_${randomBytes(6).toString('hex')}`;
      const l: LigaSimulada = { id, url: `https://${DOMINIO_PAGOS_SIMULADO}/l/${id}`, referencia: p.referencia, montoCentavos: p.montoCentavos, moneda: p.moneda, pagada: false };
      ligas.set(id, l);
      porIdempotencia.set(p.idempotencia, id);
      return { ok: true, liga: { id, url: l.url } };
    },
    leeWebhook: (cuerpo, firma) => leeWebhookProcesador(o.secreto, cuerpo, firma),
    async reporte() { return cobros.map((c) => ({ ...c })); },
  };

  return {
    conector,
    ligas,
    cobros,
    /** El cliente paga en la página del procesador. */
    async paga(ligaId: string, opciones: { falla?: boolean; duplicaWebhook?: boolean; montoDistinto?: number } = {}) {
      const l = ligas.get(ligaId);
      if (!l) throw new Error('liga desconocida');
      const e: EventoDePago = {
        pagoId: `pago_${randomBytes(6).toString('hex')}`, ligaId, referencia: l.referencia,
        montoCentavos: opciones.montoDistinto ?? l.montoCentavos, moneda: l.moneda, estado: opciones.falla ? 'fallido' : 'pagado', instante: reloj(),
      };
      if (!opciones.falla) { l.pagada = true; cobros.push(e); }
      const estados = [await envia(e)];
      if (opciones.duplicaWebhook) estados.push(await envia(e));
      return { evento: e, estados };
    },
    /** La liga que trae el último mensaje con botón de URL. */
    ligaDeUrl(url: string) { return [...ligas.values()].find((l) => l.url === url); },
  };
}

export type ProcesadorSimulado = ReturnType<typeof creaProcesadorSimulado>;
