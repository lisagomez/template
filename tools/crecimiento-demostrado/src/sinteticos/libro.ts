/**
 * El LIBRO del generador: lo que de verdad pasó en la pyme sintética, en pesos y por RFC, antes
 * de convertirse en XML y CSV. La VERDAD PLANTADA se calcula de aquí, por un camino que no toca
 * el lector de CFDI, ni Γ, ni el motor: si el sistema y la verdad coinciden al centavo, coinciden
 * dos cálculos independientes.
 */
import type { ComprobanteXml } from './xml.js';

export interface Venta {
  readonly uuid: string;
  readonly dia: string;
  readonly rfc: string;
  readonly anonimo: boolean;
  readonly netoMxn: number;
  readonly totalMxn: number;
  readonly metodo: 'PUE' | 'PPD';
  readonly cancelada: boolean;
  readonly comprobante: ComprobanteXml;
}

export interface Nota { readonly uuid: string; readonly dia: string; readonly rfc: string; readonly netoMxn: number; readonly comprobante: ComprobanteXml }
export interface PagoDelLibro { readonly uuid: string; readonly dia: string; readonly documentos: readonly { readonly uuid: string; readonly pagado: number }[]; readonly comprobante: ComprobanteXml }
export interface TicketDelLibro { readonly ticket: string; readonly dia: string; readonly hora: string; readonly importe: number; readonly total: number; readonly uuidFactura: string; readonly rfc: string | null }

export interface Libro {
  readonly modelo: 'b2b' | 'b2c';
  readonly rfcPropio: string;
  readonly nombrePropio: string;
  readonly ventas: Venta[];
  readonly notas: Nota[];
  readonly pagos: PagoDelLibro[];
  readonly tickets: TicketDelLibro[];
  readonly catalogo: { readonly rfc: string; readonly segmento: string }[];
  /** XML que entran a las fuentes sin ser ventas: una copia idéntica, una compra. Se excluyen con motivo. */
  readonly extras: { readonly nombre: string; readonly texto: string }[];
}

/** Lo que el libro planta a propósito, para que el laboratorio sepa dónde buscar. */
export interface Plantado { readonly descripcion: string; readonly desde: string; readonly hasta: string }

/** Conversión con tipo de cambio de 4 decimales (entero ×10⁴), mitades lejos del cero. Propia del generador. */
export function convierte(centavos: number, tcDiezMil: number): number {
  const p = BigInt(centavos) * BigInt(tcDiezMil);
  const q = p / BigInt(10000);
  const r = p % BigInt(10000);
  return Number(r * BigInt(2) >= BigInt(10000) ? q + BigInt(1) : q);
}
