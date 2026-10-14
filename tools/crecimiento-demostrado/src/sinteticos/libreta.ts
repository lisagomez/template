/**
 * La libreta: escribe en el libro una venta, su nota de crédito, su cancelación con sustitución o
 * sus complementos de pago, y arma el comprobante XML de cada movimiento. La comparten la
 * distribuidora y la tienda.
 */
import type { Azar } from './azar.js';
import { fechaHora, sumaDias } from './calendario.js';
import { convierte, type Libro, type Venta } from './libro.js';
import { ivaDe, type ComprobanteXml, type Concepto } from './xml.js';

export const PUBLICO_EN_GENERAL = 'XAXX010101000';

export interface Receptor { readonly rfc: string; readonly nombre: string }

export interface PedidoDeVenta {
  readonly dia: string;
  readonly receptor: Receptor;
  readonly conceptos: readonly Concepto[];
  readonly metodo: 'PUE' | 'PPD';
  /** USD con tipo de cambio ×10⁴; los importes de los conceptos van en centavos de dólar. */
  readonly usd?: number;
  readonly global?: { readonly mes: string; readonly anio: string; readonly emision: string };
  readonly relacion?: { readonly tipo: string; readonly uuids: readonly string[] };
}

export class Libreta {
  readonly libro: Libro;
  readonly azar: Azar;
  readonly fin: string;
  private folio = 1000;
  constructor(libro: Libro, azar: Azar, fin: string) {
    this.libro = libro;
    this.azar = azar;
    this.fin = fin;
  }

  private fecha(dia: string): string { return fechaHora(dia, this.azar.entero(8, 20), this.azar.entero(0, 59)); }
  private emisor() { return { rfc: this.libro.rfcPropio, nombre: this.libro.nombrePropio }; }

  venta(p: PedidoDeVenta, cancelada = false): Venta {
    const neto = p.conceptos.reduce((s, c) => s + c.importe - c.descuento, 0);
    const total = neto + p.conceptos.reduce((s, c) => s + ivaDe(c.importe - c.descuento), 0);
    const tc = p.usd ? `${Math.trunc(p.usd / 10000)}.${String(p.usd % 10000).padStart(4, '0')}` : undefined;
    const comprobante: ComprobanteXml = {
      uuid: this.azar.uuid(), tipo: 'I', fecha: this.fecha(p.global?.emision ?? p.dia), folio: String(this.folio++), emisor: this.emisor(), receptor: p.receptor,
      moneda: p.usd ? 'USD' : 'MXN', ...(tc ? { tipoCambio: tc } : {}), metodo: p.metodo, conceptos: p.conceptos,
      ...(p.relacion ? { relacionados: { tipo: p.relacion.tipo, uuids: p.relacion.uuids } } : {}),
      ...(p.global ? { global: { mes: p.global.mes, anio: p.global.anio } } : {}),
    };
    const v: Venta = {
      uuid: comprobante.uuid, dia: p.dia, rfc: p.receptor.rfc, anonimo: p.receptor.rfc === PUBLICO_EN_GENERAL, cancelada, comprobante, metodo: p.metodo,
      netoMxn: p.usd ? convierte(neto, p.usd) : neto, totalMxn: p.usd ? convierte(total, p.usd) : total,
    };
    this.libro.ventas.push(v);
    return v;
  }

  /** Cancela una venta y emite su sustitución (TipoRelacion 04) al día siguiente, si cabe en el horizonte. */
  cancelaYSustituye(v: Venta, pedido: PedidoDeVenta): Venta | null {
    const i = this.libro.ventas.indexOf(v);
    this.libro.ventas[i] = { ...v, cancelada: true };
    const dia = sumaDias(v.dia, 1);
    if (dia > this.fin || dia.slice(0, 7) !== v.dia.slice(0, 7)) return null;
    return this.venta({ ...pedido, dia, relacion: { tipo: '04', uuids: [v.uuid] } });
  }

  /** Nota de crédito (tipo E) por una fracción del neto, relacionada (01) con la venta. */
  nota(v: Venta, dia: string, porMil: number): void {
    if (dia > this.fin) return;
    const neto = Math.max(100, Math.floor((v.netoMxn * porMil) / 1000));
    const comprobante: ComprobanteXml = {
      uuid: this.azar.uuid(), tipo: 'E', fecha: this.fecha(dia), folio: String(this.folio++), emisor: this.emisor(), receptor: v.comprobante.receptor,
      moneda: 'MXN', metodo: 'PUE', conceptos: [{ descripcion: 'Bonificación por devolución', importe: neto, descuento: 0 }], relacionados: { tipo: '01', uuids: [v.uuid] },
    };
    this.libro.notas.push({ uuid: comprobante.uuid, dia, rfc: v.rfc, netoMxn: neto, comprobante });
  }

  /** Complementos de pago de una venta PPD: una o dos parcialidades, solo las que caen en el horizonte. */
  pagos(v: Venta, dias: readonly string[]): void {
    let saldo = v.totalMxn;
    dias.forEach((dia, i) => {
      if (dia > this.fin) return;
      const pagado = i === dias.length - 1 ? saldo : Math.floor(saldo / 2);
      const comprobante: ComprobanteXml = {
        uuid: this.azar.uuid(), tipo: 'P', fecha: this.fecha(dia), folio: String(this.folio++), emisor: this.emisor(), receptor: v.comprobante.receptor,
        moneda: 'XXX', conceptos: [], pagos: [{ fecha: fechaHora(dia, 12, 0), documentos: [{ uuid: v.uuid, pagado, saldoAnterior: saldo, parcialidad: i + 1 }] }],
      };
      this.libro.pagos.push({ uuid: comprobante.uuid, dia, documentos: [{ uuid: v.uuid, pagado }], comprobante });
      saldo -= pagado;
    });
  }
}

/** Reparte un monto en `n` conceptos de productos, con descuento ocasional. */
export function conceptos(azar: Azar, productos: readonly string[], monto: number, n: number): Concepto[] {
  const pesos = Array.from({ length: n }, () => 0.5 + azar());
  const suma = pesos.reduce((s, x) => s + x, 0);
  return pesos.map((w) => {
    const importe = Math.max(5000, Math.round((monto * w) / suma));
    const descuento = azar.probabilidad(0.08) ? Math.round(importe * 0.05) : 0;
    return { descripcion: azar.elige(productos), importe, descuento };
  });
}
