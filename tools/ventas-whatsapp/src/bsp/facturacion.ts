/**
 * El cobro del BSP propio (N-02). Lo que Meta cobra sale de los estados con `pricing` que ya guarda
 * el vendedor (`costoMicros` por mensaje), así que la factura a la pyme y la de Meta se pueden conciliar.
 *
 *  - **Tech Provider**: Meta le cobra a la pyme directo; nosotros solo la cuota. El costo de Meta va
 *    en la factura como informativo, para que la pyme sepa qué le llegará.
 *  - **Solution Partner**: Meta nos cobra a nosotros (línea de crédito en USD) y se lo cobramos a la
 *    pyme con un margen, en pesos al tipo de cambio del cierre: el riesgo cambiario es nuestro.
 *
 * Al llegar al tope de crédito NO se corta el servicio: se frenan los envíos de marketing y el resto
 * lo decide una persona. Dejar sin respuesta a los clientes de la pyme para proteger nuestro crédito es
 * una decisión con víctima (C4), no una regla automática.
 */
import type { Almacen } from '../almacen/almacen.js';
import { mesDeFacturacion, TARJETA_LABORATORIO, type TarjetaDeTarifas } from '../meta/tarifas.js';
import type { ModalidadBsp } from './alta.js';

export interface PoliticaCobro {
  modalidad: ModalidadBsp;
  /** Margen sobre lo que cobra Meta (Solution Partner), 0.12 = 12 %. */
  margen: number;
  /** MXN por USD al cierre del mes. */
  tipoDeCambio: number;
  cuotaMensualCentavos: number;
  tarjeta?: TarjetaDeTarifas;
}

export interface LineaFactura {
  inquilinoId: string;
  wabaId: string;
  mes: string;
  mensajesCobrados: number;
  /** Lo que Meta cobró por esa WABA (micro-dólares). */
  metaMicros: number;
  /** Lo que se le cobra a la pyme (centavos MXN). */
  metaCentavos: number;
  margenCentavos: number;
  cuotaCentavos: number;
  totalCentavos: number;
  nota: string;
}

export async function facturaMes(almacen: Almacen, mes: string, p: PoliticaCobro): Promise<LineaFactura[]> {
  const tarjeta = p.tarjeta ?? TARJETA_LABORATORIO;
  const lineas: LineaFactura[] = [];
  for (const i of await almacen.inquilinos()) {
    const cobrados = (await almacen.de(i.id).lista('mensajes')).filter((m) => (m.costoMicros ?? 0) > 0 && mesDeFacturacion(m.instante, tarjeta) === mes);
    const metaMicros = cobrados.reduce((a, m) => a + (m.costoMicros ?? 0), 0);
    const sp = p.modalidad === 'solution_partner';
    const metaCentavos = sp ? Math.round((metaMicros / 1e6) * p.tipoDeCambio * 100) : 0;
    const margenCentavos = sp ? Math.round(metaCentavos * p.margen) : 0;
    lineas.push({
      inquilinoId: i.id, wabaId: i.canal.wabaId, mes, mensajesCobrados: cobrados.length, metaMicros, metaCentavos, margenCentavos,
      cuotaCentavos: p.cuotaMensualCentavos, totalCentavos: metaCentavos + margenCentavos + p.cuotaMensualCentavos,
      nota: sp ? `Meta en USD al tipo de cambio ${p.tipoDeCambio} + margen ${Math.round(p.margen * 100)} %` : 'Meta le cobra a la pyme directo (informativo)',
    });
  }
  return lineas;
}

export interface Diferencia { wabaId: string; nuestraMicros: number; metaMicros: number; diferenciaPct: number }

/** Concilia nuestra cuenta con la factura de Meta por WABA; más de `tolerancia` es para revisar. */
export function concilia(lineas: LineaFactura[], facturaMeta: Record<string, number>, tolerancia = 0.01): Diferencia[] {
  const wabas = new Set([...lineas.map((l) => l.wabaId), ...Object.keys(facturaMeta)]);
  const fuera: Diferencia[] = [];
  for (const w of wabas) {
    const nuestra = lineas.filter((l) => l.wabaId === w).reduce((a, l) => a + l.metaMicros, 0);
    const deMeta = facturaMeta[w] ?? 0;
    const pct = Math.abs(nuestra - deMeta) / Math.max(deMeta, nuestra, 1);
    if (pct > tolerancia) fuera.push({ wabaId: w, nuestraMicros: nuestra, metaMicros: deMeta, diferenciaPct: Math.round(pct * 1000) / 10 });
  }
  return fuera;
}

export interface EstadoCredito {
  nivel: 'normal' | 'aviso' | 'tope';
  usadoPct: number;
  permite: { servicio: boolean; utilidad: boolean; marketing: boolean };
  /** Al tope, lo que sigue lo decide una persona (no la regla). */
  decide: 'regla' | 'humano';
  mensaje: string | null;
}

export function estadoCredito(gastoMicros: number, limiteMicros: number): EstadoCredito {
  const usado = limiteMicros > 0 ? gastoMicros / limiteMicros : 1;
  const pct = Math.round(usado * 1000) / 10;
  if (usado >= 1) return { nivel: 'tope', usadoPct: pct, permite: { servicio: true, utilidad: true, marketing: false }, decide: 'humano', mensaje: `Crédito al ${pct} %: se frenó el marketing; responder a clientes y avisos de pedido siguen. Una persona decide si se amplía o se pide pago.` };
  if (usado >= 0.8) return { nivel: 'aviso', usadoPct: pct, permite: { servicio: true, utilidad: true, marketing: true }, decide: 'regla', mensaje: `Crédito al ${pct} %: avisar a la pyme y al laboratorio.` };
  return { nivel: 'normal', usadoPct: pct, permite: { servicio: true, utilidad: true, marketing: true }, decide: 'regla', mensaje: null };
}
