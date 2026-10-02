/**
 * CFDI 4.0 SINTÉTICOS en XML: la forma real (espacios del SAT, timbre 1.1, pagos 2.0,
 * CfdiRelacionados, InformacionGlobal), con sellos que dicen «SINTETICO» para que nadie confunda
 * uno con un comprobante. Importes como texto con dos decimales, el IVA al 16 %.
 */
export interface Concepto { readonly descripcion: string; readonly importe: number; readonly descuento: number }

export interface ComprobanteXml {
  readonly uuid: string;
  readonly tipo: 'I' | 'E' | 'P';
  readonly fecha: string;
  readonly folio: string;
  readonly emisor: { readonly rfc: string; readonly nombre: string };
  readonly receptor: { readonly rfc: string; readonly nombre: string };
  readonly moneda: 'MXN' | 'USD' | 'XXX';
  /** Texto con cuatro decimales; omitido en MXN. `null` fuerza la ausencia (para un defecto). */
  readonly tipoCambio?: string | null;
  readonly metodo?: 'PUE' | 'PPD';
  readonly conceptos: readonly Concepto[];
  readonly relacionados?: { readonly tipo: string; readonly uuids: readonly string[] };
  readonly global?: { readonly mes: string; readonly anio: string };
  readonly pagos?: readonly { readonly fecha: string; readonly documentos: readonly { readonly uuid: string; readonly pagado: number; readonly saldoAnterior: number; readonly parcialidad: number }[] }[];
}

export const textoDe = (c: number): string => `${c < 0 ? '-' : ''}${Math.trunc(Math.abs(c) / 100)}.${String(Math.abs(c) % 100).padStart(2, '0')}`;
export const ivaDe = (neto: number): number => Math.floor((neto * 16 + 50) / 100);
const escapa = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function conceptosXml(cs: readonly Concepto[]): string {
  return cs.map((c) => {
    const neto = c.importe - c.descuento;
    const traslado = `<cfdi:Traslado Base="${textoDe(neto)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${textoDe(ivaDe(neto))}"/>`;
    const desc = c.descuento ? ` Descuento="${textoDe(c.descuento)}"` : '';
    return `<cfdi:Concepto ClaveProdServ="50000000" Cantidad="1" ClaveUnidad="H87" Descripcion="${escapa(c.descripcion)}" ValorUnitario="${textoDe(c.importe)}" Importe="${textoDe(c.importe)}"${desc} ObjetoImp="02"><cfdi:Impuestos><cfdi:Traslados>${traslado}</cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto>`;
  }).join('');
}

function pagosXml(c: ComprobanteXml): string {
  const monto = (c.pagos ?? []).reduce((s, p) => s + p.documentos.reduce((t, d) => t + d.pagado, 0), 0);
  const pagos = (c.pagos ?? []).map((p) => {
    const m = p.documentos.reduce((t, d) => t + d.pagado, 0);
    const docs = p.documentos.map((d) => `<pago20:DoctoRelacionado IdDocumento="${d.uuid}" MonedaDR="MXN" EquivalenciaDR="1" NumParcialidad="${d.parcialidad}" ImpSaldoAnt="${textoDe(d.saldoAnterior)}" ImpPagado="${textoDe(d.pagado)}" ImpSaldoInsoluto="${textoDe(d.saldoAnterior - d.pagado)}" ObjetoImpDR="01"/>`).join('');
    return `<pago20:Pago FechaPago="${p.fecha}" FormaDePagoP="03" MonedaP="MXN" TipoCambioP="1" Monto="${textoDe(m)}">${docs}</pago20:Pago>`;
  }).join('');
  return `<pago20:Pagos Version="2.0"><pago20:Totales MontoTotalPagos="${textoDe(monto)}"/>${pagos}</pago20:Pagos>`;
}

function totales(c: ComprobanteXml): { subtotal: number; descuento: number; iva: number } {
  if (c.tipo === 'P') return { subtotal: 0, descuento: 0, iva: 0 };
  const subtotal = c.conceptos.reduce((s, x) => s + x.importe, 0);
  const descuento = c.conceptos.reduce((s, x) => s + x.descuento, 0);
  return { subtotal, descuento, iva: c.conceptos.reduce((s, x) => s + ivaDe(x.importe - x.descuento), 0) };
}

export function comprobanteXml(c: ComprobanteXml): string {
  const { subtotal, descuento, iva } = totales(c);
  const tc = c.moneda === 'USD' && c.tipoCambio !== null ? ` TipoCambio="${c.tipoCambio}"` : '';
  const metodo = c.metodo ? ` MetodoPago="${c.metodo}" FormaPago="${c.metodo === 'PPD' ? '99' : '03'}"` : '';
  const desc = descuento ? ` Descuento="${textoDe(descuento)}"` : '';
  const impuestos = c.tipo === 'P' ? '' : `<cfdi:Impuestos TotalImpuestosTrasladados="${textoDe(iva)}"><cfdi:Traslados><cfdi:Traslado Base="${textoDe(subtotal - descuento)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${textoDe(iva)}"/></cfdi:Traslados></cfdi:Impuestos>`;
  const conceptos = c.tipo === 'P' ? '<cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago" ValorUnitario="0" Importe="0" ObjetoImp="01"/>' : conceptosXml(c.conceptos);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" xmlns:pago20="http://www.sat.gob.mx/Pagos20" Version="4.0" Serie="S" Folio="${c.folio}" Fecha="${c.fecha}"${metodo} SubTotal="${textoDe(subtotal)}"${desc} Moneda="${c.moneda}"${tc} Total="${textoDe(subtotal - descuento + iva)}" TipoDeComprobante="${c.tipo}" Exportacion="01" LugarExpedicion="91700" NoCertificado="00000000000000000000" Sello="SINTETICO-NO-VALIDO" Certificado="">`,
    c.global ? `<cfdi:InformacionGlobal Periodicidad="04" Meses="${c.global.mes}" Año="${c.global.anio}"/>` : '',
    c.relacionados ? `<cfdi:CfdiRelacionados TipoRelacion="${c.relacionados.tipo}">${c.relacionados.uuids.map((u) => `<cfdi:CfdiRelacionado UUID="${u}"/>`).join('')}</cfdi:CfdiRelacionados>` : '',
    `<cfdi:Emisor Rfc="${c.emisor.rfc}" Nombre="${escapa(c.emisor.nombre)}" RegimenFiscal="601"/>`,
    `<cfdi:Receptor Rfc="${escapa(c.receptor.rfc)}" Nombre="${escapa(c.receptor.nombre)}" DomicilioFiscalReceptor="91000" RegimenFiscalReceptor="601" UsoCFDI="${c.tipo === 'P' ? 'CP01' : 'G01'}"/>`,
    `<cfdi:Conceptos>${conceptos}</cfdi:Conceptos>`,
    impuestos,
    `<cfdi:Complemento>${c.tipo === 'P' ? pagosXml(c) : ''}<tfd:TimbreFiscalDigital Version="1.1" UUID="${c.uuid}" FechaTimbrado="${c.fecha}" RfcProvCertif="SIN000000SN0" SelloCFD="SINTETICO" NoCertificadoSAT="00000000000000000000" SelloSAT="SINTETICO"/></cfdi:Complemento>`,
    '</cfdi:Comprobante>',
  ].join('');
}
