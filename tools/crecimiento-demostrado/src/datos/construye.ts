/**
 * De las fuentes de la pyme a Γ: depura, normaliza, comprueba cada invariante y, solo si no hay
 * una sola violación, sella. Lo que se deja fuera sin violar nada (una compra, un cancelado, un
 * documento fuera del horizonte) se EXCLUYE con su motivo: nada se descarta en silencio.
 */
import { seudonimo } from '../comun/canonico.js';
import { centavosDeOperacion } from '../comun/dinero.js';
import { periodoDe, type Dia } from '../comun/periodos.js';
import type { Especificacion } from '../ontologia/especificacion.js';
import { huellaDeEspecificacion } from '../ontologia/especificacion.js';
import { diaContable, type DocumentoFiscal, type LecturaDeDocumento } from './cfdi.js';
import { ANONIMO, sella, type Exclusion, type Fuente, type Gamma, type NotaDeCredito, type Pago, type Transaccion, type Violacion } from './gamma.js';
import { INVARIANTES } from './invariantes.js';
import type { FilaDeCatalogo, Ticket } from './tablas.js';
import { notasDe, pagosDe, transaccionesDeCaja } from './construye-relaciones.js';

export interface EntradaDeDatos {
  readonly documentos: readonly LecturaDeDocumento[];
  readonly tickets?: readonly Ticket[];
  readonly catalogo?: readonly FilaDeCatalogo[];
  readonly cancelados?: readonly string[];
  readonly fuentes: readonly Fuente[];
}

export interface OpcionesDeConstruccion { readonly rfcPropio: string; readonly llaveDeSeudonimo: string }

export type Construccion =
  | { ok: true; gamma: Gamma; exclusiones: readonly Exclusion[] }
  | { ok: false; violaciones: readonly Violacion[]; exclusiones: readonly Exclusion[] };

/** Lo que se acumula al construir: violaciones y exclusiones, con su referencia. */
export class Acta {
  readonly violaciones: Violacion[] = [];
  readonly exclusiones: Exclusion[] = [];
  viola(invariante: string, referencia: string, detalle: string): void { this.violaciones.push({ invariante, referencia, detalle }); }
  excluye(referencia: string, motivo: string): void { this.exclusiones.push({ referencia, motivo }); }
}

export interface Contexto {
  readonly e: Especificacion;
  readonly o: OpcionesDeConstruccion;
  readonly acta: Acta;
  readonly cliente: (rfc: string) => string;
}

export interface Clasificados {
  readonly ingresos: DocumentoFiscal[];
  readonly egresos: DocumentoFiscal[];
  readonly pagos: DocumentoFiscal[];
  readonly cancelados: ReadonlySet<string>;
  /** Todo ingreso propio, vigente y fechado, DENTRO O FUERA del horizonte: una nota de enero puede corregir una factura de diciembre. */
  readonly todosLosIngresos: Map<string, DocumentoFiscal>;
}

function enHorizonte(e: Especificacion, dia: Dia): boolean {
  const p = periodoDe(dia, e.granularidad);
  return p >= e.horizonte.desde && p <= e.horizonte.hasta;
}

/** Deja solo los documentos que son de esta pyme, vigentes, únicos y fechados; el resto, con motivo. */
function depura(x: Contexto, lecturas: readonly LecturaDeDocumento[], cancelados: ReadonlySet<string>): Clasificados {
  const fuera: Clasificados = { ingresos: [], egresos: [], pagos: [], cancelados, todosLosIngresos: new Map() };
  const vistos = new Map<string, DocumentoFiscal>();
  for (const l of lecturas) {
    if (!l.ok) { x.acta.excluye(l.archivo, `ilegible: ${l.motivo}`); continue; }
    const d = l.documento;
    if (!d.uuid) { x.acta.excluye(d.archivo, 'sin timbre: no es un comprobante válido'); continue; }
    const previo = vistos.get(d.uuid);
    if (previo) {
      if (previo.huellaDeBytes === d.huellaDeBytes) x.acta.excluye(d.archivo, `copia idéntica de ${previo.archivo}`);
      else x.acta.viola('INV-02', d.uuid, `${previo.archivo} y ${d.archivo} son distintos y comparten UUID`);
      continue;
    }
    vistos.set(d.uuid, d);
    if (d.rfcEmisor !== x.o.rfcPropio.toUpperCase()) { x.acta.excluye(d.uuid, 'la emitió otro RFC: es una compra, no una venta'); continue; }
    const dia = diaContable(d);
    if (!dia) { x.acta.viola('INV-06', d.uuid, 'fecha ilegible'); continue; }
    if (cancelados.has(d.uuid)) { x.acta.excluye(d.uuid, 'cancelada (lista de cancelados)'); continue; }
    if (d.tipo === 'I') fuera.todosLosIngresos.set(d.uuid, d);
    if (!enHorizonte(x.e, dia)) { x.acta.excluye(d.uuid, 'fuera del horizonte de la spec'); continue; }
    if (d.tipo === 'I') fuera.ingresos.push(d);
    else if (d.tipo === 'E') fuera.egresos.push(d);
    else if (d.tipo === 'P') fuera.pagos.push(d);
    else x.acta.excluye(d.uuid, `tipo ${d.tipo}: no es venta`);
  }
  return fuera;
}

/** El importe sin IVA en centavos de MXN, o una violación de moneda. */
export function netoDe(x: Contexto, d: DocumentoFiscal): number | null {
  if (d.moneda !== 'MXN' && d.moneda !== 'XXX' && !d.tipoCambio) {
    x.acta.viola('INV-05', d.uuid ?? d.archivo, `${d.moneda} sin TipoCambio`);
    return null;
  }
  const tc = d.moneda === 'MXN' || d.moneda === 'XXX' ? null : d.tipoCambio;
  const neto = centavosDeOperacion(d.subtotal, d.descuento, tc);
  if (neto === null) x.acta.viola('INV-05', d.uuid ?? d.archivo, 'importe ilegible');
  return neto;
}

export function totalDe(d: DocumentoFiscal): number {
  const tc = d.moneda === 'MXN' || d.moneda === 'XXX' ? null : d.tipoCambio;
  return centavosDeOperacion(d.total, null, tc) ?? 0;
}

function transaccionesDeCfdi(x: Contexto, c: Clasificados): Transaccion[] {
  return c.ingresos.flatMap((d) => {
    const neto = netoDe(x, d);
    if (neto === null) return [];
    const metodo = d.metodoPago === 'PPD' ? 'PPD' : 'PUE';
    return [{ id: d.uuid!, dia: diaContable(d)!, cliente: x.cliente(d.rfcReceptor), centavos: neto, totalCentavos: totalDe(d), metodo, origen: 'cfdi' } satisfies Transaccion];
  });
}

/** Cada cliente que compró, con su segmento del catálogo (o el resto). INV-11. */
function segmentosDe(x: Contexto, catalogo: readonly FilaDeCatalogo[], tx: readonly Transaccion[]) {
  const porCliente = new Map<string, string>();
  for (const f of catalogo) {
    const c = x.cliente(f.rfc);
    const previo = porCliente.get(c);
    if (previo !== undefined && previo !== f.segmento) x.acta.viola('INV-11', `catálogo línea ${f.linea}`, `el cliente ya estaba en «${previo}» y aparece en «${f.segmento}»`);
    else porCliente.set(c, f.segmento);
  }
  const clientes = [...new Set(tx.map((t) => t.cliente))].filter((c) => c !== ANONIMO);
  return clientes.map((cliente) => ({ cliente, segmento: porCliente.get(cliente) ?? x.e.segmentos.resto }));
}

/** INV-01 e INV-07 sobre las transacciones ya normalizadas. */
function compruebaClientes(x: Contexto, tx: readonly Transaccion[]): void {
  const porId = new Map<string, Set<string>>();
  for (const t of tx) porId.set(t.id, (porId.get(t.id) ?? new Set()).add(t.cliente));
  for (const [id, clientes] of porId) if (clientes.size > 1) x.acta.viola('INV-01', id, `${clientes.size} clientes para la misma transacción`);
  const genericos = new Set(x.e.cliente.anonimos.map((r) => seudonimo(x.o.llaveDeSeudonimo, r)));
  for (const t of tx) if (genericos.has(t.cliente)) x.acta.viola('INV-07', t.id, 'un RFC genérico quedó como cliente');
}

/**
 * RFC → cliente. Un RFC genérico es la clase anónima; uno que solo se le PARECE («XAXX-010101-000»)
 * no se corrige en silencio: viola INV-07, porque quedaría contado como un cliente.
 */
function clientePor(e: Especificacion, o: OpcionesDeConstruccion, acta: Acta): (rfc: string) => string {
  const anonimos = new Set(e.cliente.anonimos);
  const avisados = new Set<string>();
  return (rfc) => {
    const limpio = rfc.trim().toUpperCase();
    if (limpio === '' || anonimos.has(limpio)) return ANONIMO;
    if (anonimos.has(limpio.replace(/[^A-Z0-9&Ñ]/g, '')) && !avisados.has(limpio)) {
      avisados.add(limpio);
      acta.viola('INV-07', limpio, 'un RFC genérico mal escrito quedaría contado como cliente');
    }
    return seudonimo(o.llaveDeSeudonimo, limpio);
  };
}

/** Construye Γ. Si algún invariante se viola, no hay Γ: hay la lista de violaciones. */
export function construyeGamma(e: Especificacion, entrada: EntradaDeDatos, o: OpcionesDeConstruccion): Construccion {
  const acta = new Acta();
  const x: Contexto = { e, o, acta, cliente: clientePor(e, o, acta) };
  const c = depura(x, entrada.documentos, new Set(entrada.cancelados ?? []));
  const transacciones = e.transaccional === 'cfdi' ? transaccionesDeCfdi(x, c) : transaccionesDeCaja(x, c, entrada.tickets ?? []);
  const notas: NotaDeCredito[] = notasDe(x, c);
  const pagos: Pago[] = pagosDe(x, c);
  const segmentos = segmentosDe(x, entrada.catalogo ?? [], transacciones);
  compruebaClientes(x, transacciones);
  if (acta.violaciones.length) return { ok: false, violaciones: acta.violaciones, exclusiones: acta.exclusiones };
  const gamma = sella({
    version: 1, pyme: e.pyme.id, especificacion: huellaDeEspecificacion(e), transacciones: dedupe(transacciones), notas, pagos, segmentos,
    fuentes: entrada.fuentes, exclusiones: acta.exclusiones, invariantes: INVARIANTES.map((i) => i.id),
  });
  return { ok: true, gamma, exclusiones: acta.exclusiones };
}

/** Las transacciones idénticas (una copia del mismo ticket) cuentan una vez. */
function dedupe(tx: readonly Transaccion[]): Transaccion[] {
  const vistos = new Map<string, Transaccion>();
  for (const t of tx) if (!vistos.has(t.id)) vistos.set(t.id, t);
  return [...vistos.values()];
}

