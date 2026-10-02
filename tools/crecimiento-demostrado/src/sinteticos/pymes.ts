/**
 * Las dos pymes sintéticas listas para usarse: su especificación (la ontología que su dueño
 * declararía), sus fuentes CRUDAS (XML, CSV de caja, catálogo y cancelados, tal como las
 * entregaría) y su libro, del que sale la verdad plantada.
 */
import type { FuentesCrudas } from '../datos/ingesta.js';
import type { Especificacion } from '../ontologia/especificacion.js';
import { libroDistribuidora, PLANTADO_DISTRIBUIDORA } from './distribuidora.js';
import type { Libro, Plantado } from './libro.js';
import { cajaCsv, libroTienda, PLANTADO_TIENDA } from './tienda.js';
import { comprobanteXml } from './xml.js';

export type IdDePyme = 'distribuidora' | 'tienda';


export interface PymeSintetica {
  readonly id: IdDePyme;
  readonly especificacion: Especificacion;
  readonly rfcPropio: string;
  /** Llave del seudónimo: en el laboratorio es fija y declarada; en una pyme real vive en su bóveda. */
  readonly llaveDeSeudonimo: string;
  readonly fuentes: FuentesCrudas;
  readonly libro: Libro;
  readonly plantado: readonly Plantado[];
}

const sa = (id: string, texto: string, exigidoPor: string[]) => ({ id, texto, exigidoPor });

const COMUNES = {
  version: '1.0.0', moneda: 'MXN' as const, granularidad: 'trimestre' as const, horizonte: { desde: '2024-1T', hasta: '2026-3T' },
  cliente: { identidad: 'rfc-seudonimizado' as const, anonimos: ['XAXX010101000', 'XEXX010101000'] },
  ingreso: { principal: 'neto' as const }, estable: { bandaPorMil: 50 }, materialidadCentavos: 1_000_000,
};

export const ESPEC_DISTRIBUIDORA: Especificacion = {
  ...COMUNES,
  pyme: { id: 'distribuidora-sotavento', nombre: 'Distribuidora Sotavento (sintética)', giro: 'Distribuidora mayorista de abarrotes e insumos, Veracruz', modelo: 'b2b' },
  transaccional: 'cfdi', segmentos: { nombre: 'tipo de cliente', resto: 'sin-segmento' },
  inferencia: { nMinimo: 20, alfaPorMil: 50, iteraciones: 2000, semilla: 20261002 },
  supuestos: [
    sa('SA-01', 'Un cliente es un RFC receptor: las sucursales del mismo RFC son el mismo cliente.', ['ingreso']),
    sa('SA-02', 'Las notas de crédito de cada periodo ya están emitidas: el cierre del periodo es definitivo.', ['neto']),
    sa('SA-03', 'Las facturas canceladas son exactamente las de la lista de cancelados entregada: el XML no trae el estatus ante el SAT.', ['ingreso']),
    sa('SA-04', 'Una factura PUE se cobra en su fecha de emisión; una PPD, en la fecha de cada complemento de pago.', ['cobrado']),
    sa('SA-05', 'Entre los periodos comparados no hay estacionalidad que explique la diferencia.', ['prueba-no-anual']),
    sa('SA-06', 'Las ventas en dólares se convierten con el TipoCambio del propio comprobante.', ['ingreso']),
    sa('SA-07', 'La factura global se atribuye al mes que declara (InformacionGlobal), no a su fecha de emisión.', ['anonimo']),
    sa('SA-08', 'El segmento de cada cliente es el que la pyme le da en su catálogo; quien no aparece va a «sin-segmento».', ['segmento']),
    sa('SA-09', 'Una nota de crédito resta en el periodo de su emisión, no en el de la factura que corrige.', ['neto']),
    sa('SA-10', 'En una prueba pareada la unidad es el cliente: sus facturas de un periodo no son observaciones independientes.', ['prueba']),
  ],
};

export const ESPEC_TIENDA: Especificacion = {
  ...COMUNES,
  pyme: { id: 'tienda-la-esquina', nombre: 'Abarrotes La Esquina (sintética)', giro: 'Tienda de abarrotes de barrio, Xalapa', modelo: 'b2c' },
  transaccional: 'caja', segmentos: { nombre: 'tipo de cliente', resto: 'sin-segmento' },
  inferencia: { nMinimo: 20, alfaPorMil: 50, iteraciones: 2000, semilla: 20261003 },
  supuestos: [
    sa('SA-01', 'Un cliente identificado es el RFC de la factura nominativa de su ticket; un ticket sin nominativa es de público en general.', ['ingreso']),
    sa('SA-02', 'Las notas de crédito de cada periodo ya están emitidas: el cierre del periodo es definitivo.', ['neto']),
    sa('SA-03', 'Las facturas canceladas son exactamente las de la lista de cancelados entregada.', ['ingreso']),
    sa('SA-04', 'Cada ticket se cobra al momento: lo cobrado es el total del ticket.', ['cobrado']),
    sa('SA-05', 'Entre los periodos comparados no hay estacionalidad que explique la diferencia.', ['prueba-no-anual']),
    sa('SA-07', 'La caja es la venta; la global y las nominativas son su espejo fiscal: se concilian, no se suman.', ['ingreso', 'anonimo']),
    sa('SA-09', 'Una nota de crédito resta en el periodo de su emisión, no en el de la factura que corrige.', ['neto']),
    sa('SA-10', 'Los tickets de público en general son independientes entre sí; en una prueba pareada la unidad es el cliente.', ['prueba']),
  ],
};

function fuentesDe(libro: Libro): Required<Pick<FuentesCrudas, 'documentos' | 'catalogo' | 'cancelados'>> & FuentesCrudas {
  const documentos = [
    ...libro.ventas.map((v) => ({ nombre: `ingreso-${v.uuid}.xml`, texto: comprobanteXml(v.comprobante) })),
    ...libro.notas.map((n) => ({ nombre: `egreso-${n.uuid}.xml`, texto: comprobanteXml(n.comprobante) })),
    ...libro.pagos.map((p) => ({ nombre: `pago-${p.uuid}.xml`, texto: comprobanteXml(p.comprobante) })),
    ...libro.extras,
  ];
  return {
    documentos,
    ...(libro.modelo === 'b2c' ? { caja: cajaCsv(libro) } : {}),
    catalogo: ['rfc,segmento', ...libro.catalogo.map((c) => `${c.rfc},${c.segmento}`)].join('\n'),
    cancelados: ['uuid', ...libro.ventas.filter((v) => v.cancelada).map((v) => v.uuid)].join('\n'),
  };
}

const cache = new Map<IdDePyme, PymeSintetica>();

export function pymeSintetica(id: IdDePyme): PymeSintetica {
  const hecha = cache.get(id);
  if (hecha) return hecha;
  const libro = id === 'distribuidora' ? libroDistribuidora() : libroTienda();
  const p: PymeSintetica = {
    id, libro, rfcPropio: libro.rfcPropio, fuentes: fuentesDe(libro),
    especificacion: id === 'distribuidora' ? ESPEC_DISTRIBUIDORA : ESPEC_TIENDA,
    llaveDeSeudonimo: `laboratorio-${id}-llave-sintetica-declarada`,
    plantado: id === 'distribuidora' ? PLANTADO_DISTRIBUIDORA : PLANTADO_TIENDA,
  };
  cache.set(id, p);
  return p;
}
