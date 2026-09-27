/**
 * CFDI 4.0 SINTÉTICOS para el laboratorio y el ejemplo de la app. Datos inventados y declarados:
 * el emisor usa el RFC de pruebas que el propio SAT publica (EKU9003173C9), los clientes son
 * «público en general» o RFC ficticios, y el timbre es de mentira (UUID determinista). No son
 * facturas válidas ni pretenden serlo: sirven para probar la lectura sin datos reales.
 */
export const RFC_DEMO = 'EKU9003173C9';

export interface ProductoDemo {
  readonly clave: string;
  readonly descripcion: string;
  readonly precio: number;
  /** Piezas por día antes y en los últimos 30 días: así se fabrican tendencias. */
  readonly ritmo: readonly [number, number];
}

export const CATALOGO_PANADERIA: readonly ProductoDemo[] = [
  { clave: 'PAN-001', descripcion: 'Concha de vainilla', precio: 12, ritmo: [30, 42] },
  { clave: 'PAN-002', descripcion: 'Pan de muerto', precio: 45, ritmo: [2, 14] },
  { clave: 'PAN-003', descripcion: 'Bolillo', precio: 3, ritmo: [80, 82] },
  { clave: 'PAS-010', descripcion: 'Pastel de tres leches', precio: 380, ritmo: [2, 1] },
  { clave: 'PAN-004', descripcion: 'Cuernito de mantequilla', precio: 14, ritmo: [12, 6] },
  { clave: 'BEB-020', descripcion: 'Café de olla', precio: 25, ritmo: [10, 11] },
];

function uuid(semilla: number): string {
  const h = (n: number) => ((Math.imul(semilla + n, 2654435761) >>> 0).toString(16).padStart(8, '0'));
  const s = `${h(1)}${h(2)}${h(3)}${h(4)}`.toUpperCase();
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-A${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

/** Fecha y hora ISO del SAT. Armada así para no escribir la hora pegada a la «T» en el código fuente. */
function conHora(dia: string, hora: string): string {
  return [dia, hora].join('T');
}

function dinero(n: number): string {
  return n.toFixed(2);
}

interface Linea {
  readonly producto: ProductoDemo;
  readonly cantidad: number;
}

/** Un CFDI de ingreso con sus conceptos y un timbre sintético. */
export function cfdiXml(folio: number, fecha: string, lineas: readonly Linea[], receptor = 'XAXX010101000', tipo = 'I', moneda = 'MXN'): string {
  const conceptos = lineas.map(({ producto: p, cantidad }) => {
    const importe = p.precio * cantidad;
    return `<cfdi:Concepto ClaveProdServ="50181900" NoIdentificacion="${p.clave}" Cantidad="${cantidad}" ClaveUnidad="H87" Unidad="Pieza" Descripcion="${p.descripcion}" ValorUnitario="${dinero(p.precio)}" Importe="${dinero(importe)}" ObjetoImp="01"/>`;
  }).join('');
  const subtotal = lineas.reduce((s, l) => s + l.producto.precio * l.cantidad, 0);
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="A" Folio="${folio}" Fecha="${conHora(fecha, '12:00:00')}" FormaPago="01" SubTotal="${dinero(subtotal)}" Moneda="${moneda}" Total="${dinero(subtotal)}" TipoDeComprobante="${tipo}" Exportacion="01" MetodoPago="PUE" LugarExpedicion="72000" NoCertificado="30001000000500003416">
<cfdi:Emisor Rfc="${RFC_DEMO}" Nombre="ESCUELA KEMPER URGATE" RegimenFiscal="601"/>
<cfdi:Receptor Rfc="${receptor}" Nombre="PUBLICO EN GENERAL" DomicilioFiscalReceptor="72000" RegimenFiscalReceptor="616" UsoCFDI="S01"/>
<cfdi:Conceptos>${conceptos}</cfdi:Conceptos>
<cfdi:Complemento><tfd:TimbreFiscalDigital Version="1.1" UUID="${uuid(folio)}" FechaTimbrado="${conHora(fecha, '12:01:00')}" RfcProvCertif="SAT970701NN3" NoCertificadoSAT="30001000000500003456" SelloCFD="SINTETICO" SelloSAT="SINTETICO"/></cfdi:Complemento>
</cfdi:Comprobante>`;
}

/**
 * 91 días de facturas globales diarias de una panadería de Puebla que terminan en `hasta`: los
 * últimos 30 con el ritmo «reciente» de cada producto y los anteriores con el «previo», para que
 * el resumen pueda comparar 30 contra 30 días. Determinista.
 */
export function demoPanaderia(hasta = '2026-10-18', dias = 91): string[] {
  const fin = new Date(hasta).getTime();
  const xmls: string[] = [];
  for (let i = 0; i < dias; i++) {
    const fecha = new Date(fin - (dias - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    const reciente = i >= dias - 30;
    const variacion = 0.85 + ((i * 37) % 30) / 100;
    const lineas = CATALOGO_PANADERIA.map((p) => ({ producto: p, cantidad: Math.max(0, Math.round(p.ritmo[reciente ? 1 : 0] * variacion)) }))
      .filter((l) => l.cantidad > 0);
    xmls.push(cfdiXml(1000 + i, fecha, lineas));
  }
  return xmls;
}
