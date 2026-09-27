/**
 * Ventas desde CFDI 4.0 (los XML que la pyme ya tiene de su facturación). Solo cuentan los
 * comprobantes de INGRESO emitidos por el propio negocio; el resto se excluye con motivo.
 */
import { leeDia } from '../comun/fechas.js';
import { huella, normaliza } from '../comun/texto.js';
import type { CfdiLeido, Exclusion, LineaDeVenta, VentasNormalizadas } from './tipos.js';

const PUBLICO_EN_GENERAL = new Set(['XAXX010101000', 'XEXX010101000']);

const POR_TIPO: Readonly<Record<string, string>> = {
  P: 'complemento de pago: el ingreso ya se contó en su factura',
  N: 'recibo de nómina: no es venta',
  T: 'traslado: mueve mercancía, no la vende',
};

function campo(campos: CfdiLeido['campos'], clave: string): string | null {
  return campos.find((c) => c.clave === clave)?.valor ?? null;
}

function centavos(texto: string | null): number {
  return texto === null ? 0 : Math.round(Number(texto) * 100);
}

function motivoDeExclusion(c: CfdiLeido, rfcPropio: string | undefined): string | null {
  if (!c.esCfdi) return `no se pudo leer como CFDI: ${c.motivo ?? 'motivo no dado'}`;
  const tipo = c.tipoDeComprobante ?? '';
  if (tipo !== 'I' && tipo !== 'E') return POR_TIPO[tipo] ?? `tipo de comprobante «${tipo}» desconocido`;
  const emisor = campo(c.campos, 'rfc_emisor');
  if (rfcPropio && emisor && emisor.toUpperCase() !== rfcPropio.toUpperCase()) {
    return 'la emitió otro RFC: para este negocio es una compra, no una venta';
  }
  if (!leeDia(campo(c.campos, 'fecha') ?? '')) return 'sin fecha válida';
  return null;
}

function conversion(c: CfdiLeido): { moneda: string; factor: number; aviso: string | null } {
  const moneda = (campo(c.campos, 'moneda') ?? 'MXN').toUpperCase();
  if (moneda === 'MXN' || moneda === 'XXX') return { moneda: 'MXN', factor: 1, aviso: null };
  const tc = Number(campo(c.campos, 'tipo_cambio'));
  if (Number.isFinite(tc) && tc > 0) {
    return { moneda: 'MXN', factor: tc, aviso: `CFDI en ${moneda} convertido a pesos con el TipoCambio del propio comprobante (${tc})` };
  }
  return { moneda, factor: 1, aviso: `CFDI en ${moneda} sin tipo de cambio: se reporta aparte, no se suma a pesos` };
}

function lineasDe(c: CfdiLeido, referencia: string): { lineas: LineaDeVenta[]; aviso: string | null } {
  const dia = leeDia(campo(c.campos, 'fecha') ?? '')!;
  const receptor = (campo(c.campos, 'rfc_receptor') ?? '').toUpperCase();
  const cliente = receptor === '' || PUBLICO_EN_GENERAL.has(receptor) ? null : huella(receptor);
  const { moneda, factor, aviso } = conversion(c);
  const lineas = c.conceptos.map((k): LineaDeVenta => {
    const producto = (campo(k.campos, 'descripcion') ?? 'sin descripción').trim();
    const neto = centavos(campo(k.campos, 'importe')) - centavos(campo(k.campos, 'descuento'));
    return {
      dia, producto, clave: normaliza(campo(k.campos, 'no_identificacion') ?? producto),
      cantidad: Number(campo(k.campos, 'cantidad') ?? '1') || 1,
      importe: { centavos: Math.round(neto * factor), moneda }, canal: 'facturado',
      origen: 'cfdi', referencia, cliente,
    };
  });
  return { lineas, aviso };
}

/** Normaliza lecturas de CFDI a líneas de venta. `rfcPropio` excluye lo que emitió otro RFC. */
export function ventasDesdeCfdi(lecturas: readonly CfdiLeido[], opciones: { rfcPropio?: string } = {}): VentasNormalizadas {
  const lineas: LineaDeVenta[] = [], excluidas: Exclusion[] = [], avisos = new Set<string>();
  const vistos = new Set<string>();
  let sinTimbre = 0;
  let notas = 0, cuantasNotas = 0;
  lecturas.forEach((c, i) => {
    const uuid = campo(c.campos, 'uuid');
    const referencia = uuid ?? `${campo(c.campos, 'serie') ?? ''}${campo(c.campos, 'folio') ?? `archivo ${i + 1}`}`;
    const motivo = motivoDeExclusion(c, opciones.rfcPropio);
    if (motivo) return excluidas.push({ referencia, motivo });
    if (vistos.has(referencia)) return excluidas.push({ referencia, motivo: 'repetida: el mismo comprobante ya se contó' });
    vistos.add(referencia);
    if (!c.timbrado) sinTimbre++;
    const r = lineasDe(c, referencia);
    if (r.aviso) avisos.add(r.aviso);
    if (c.tipoDeComprobante === 'E') {
      notas += r.lineas.filter((l) => l.importe.moneda === 'MXN').reduce((s, l) => s + l.importe.centavos, 0);
      cuantasNotas++;
      return;
    }
    for (const a of avisosDeIngreso(c, r.lineas)) avisos.add(a);
    lineas.push(...r.lineas);
  });
  if (sinTimbre) avisos.add(`${sinTimbre} comprobante(s) sin timbre del SAT: se contaron, pero pueden no ser válidos`);
  if (cuantasNotas) avisos.add(`${cuantasNotas} nota(s) de crédito: se restan del total (no se asignan a producto) y cuentan como señal de reembolso`);
  avisos.add('importes sin IVA (Subtotal − Descuento); el estatus ante el SAT no viene en el XML: una factura cancelada se cuenta hasta que la quites');
  avisos.add('los CFDI son lo FACTURADO: la venta sin factura no aparece; para ver todo por producto, suma el CSV de tu caja');
  return { lineas, excluidas, avisos: [...avisos], notasDeCredito: { centavos: notas, cuantas: cuantasNotas } };
}

const GENERICA = /^(venta|ventas|venta al publico|venta publico en general|mercancia|productos varios)$/;

function avisosDeIngreso(c: CfdiLeido, lineas: readonly LineaDeVenta[]): string[] {
  const avisos: string[] = [];
  if (campo(c.campos, 'metodo_pago') === 'PPD') avisos.push('hay facturas PPD (pago en parcialidades o diferido): facturado no es cobrado; aquí se reporta lo facturado');
  if (lineas.length === 1 && GENERICA.test(normaliza(lineas[0]!.producto))) {
    avisos.push('hay facturas globales con un solo concepto genérico («Venta»): no dicen qué producto se vendió; usa el CSV de la caja para eso');
  }
  return avisos;
}
