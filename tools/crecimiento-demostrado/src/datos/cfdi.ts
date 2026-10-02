/**
 * Un CFDI 4.0 → un DOCUMENTO FISCAL con lo que la ontología necesita. La lectura la hace el
 * extractor (`@tu-scope/extractor-documental/xml`), que el proyecto INYECTA: esta herramienta no
 * depende de aquella, solo de la forma de su módulo.
 *
 * Hallazgo que explica la segunda pasada: `leeCfdi40` no traduce `CfdiRelacionados` ni
 * `InformacionGlobal` (los declara en `noLeido`). Sin el primero, el invariante «toda nota de
 * crédito referencia una factura que existe» no se puede comprobar; sin el segundo, una factura
 * global no se distingue de una venta a público en general. Se leen aquí con el MISMO analizador
 * XML del extractor, no con uno propio.
 */
import { sha256 } from '../comun/canonico.js';
import { diaDe, diasDelMes, type Dia } from '../comun/periodos.js';

export interface ElementoXml {
  readonly nombreLocal: string;
  readonly hijos: readonly ElementoXml[];
}

interface CampoLeido { readonly clave: string; readonly valor: string }

/** La forma mínima de `LecturaDeCfdi` que se usa. */
export interface LecturaCfdi {
  readonly esCfdi: boolean;
  readonly motivo: string | null;
  readonly tipoDeComprobante: string | null;
  readonly campos: readonly CampoLeido[];
  readonly complementos: { readonly leidos: readonly { readonly campos: readonly CampoLeido[] }[] };
  readonly timbrado: boolean;
}

/** Lo que se usa del subpath `./xml` del extractor. Se pasa el módulo tal cual. */
export interface ModuloXml {
  leeCfdi40(fuente: string, registro: unknown): LecturaCfdi;
  registroDeEsquemas(lectores: readonly unknown[]): unknown;
  readonly lectorDeTimbre11: unknown;
  readonly lectorDePagos20: unknown;
  analizaXml(fuente: string): { readonly raiz: ElementoXml };
  hijo(elemento: ElementoXml, espacio: string, nombreLocal: string): ElementoXml | null;
  hijos(elemento: ElementoXml, espacio: string, nombreLocal: string): readonly ElementoXml[];
  atributo(elemento: ElementoXml, nombreLocal: string): string | null;
  readonly CFDI_40: string;
}

export interface DocumentoPagado { readonly uuid: string; readonly impPagado: string; readonly moneda: string }

export interface DocumentoFiscal {
  readonly archivo: string;
  /** sha-256 de los bytes: dos copias del mismo XML son el mismo documento. */
  readonly huellaDeBytes: string;
  readonly uuid: string | null;
  readonly tipo: string;
  readonly dia: Dia | null;
  readonly rfcEmisor: string;
  readonly rfcReceptor: string;
  readonly moneda: string;
  readonly tipoCambio: string | null;
  readonly subtotal: string;
  readonly descuento: string | null;
  readonly total: string;
  readonly metodoPago: string | null;
  readonly relacionados: readonly { readonly tipoRelacion: string; readonly uuids: readonly string[] }[];
  /** `InformacionGlobal`: la factura global de un periodo de ventas a público en general. */
  readonly global: { readonly periodicidad: string; readonly meses: string; readonly anio: string } | null;
  readonly pagos: readonly { readonly dia: Dia | null; readonly documentos: readonly DocumentoPagado[] }[];
}

export type LecturaDeDocumento = { ok: true; documento: DocumentoFiscal } | { ok: false; archivo: string; motivo: string };

const campo = (campos: readonly CampoLeido[], clave: string): string | null => campos.find((c) => c.clave === clave)?.valor ?? null;

function pagosDe(campos: readonly CampoLeido[]): DocumentoFiscal['pagos'] {
  const cuantos = Number(campo(campos, 'numero_de_pagos') ?? '0');
  const fuera: { dia: Dia | null; documentos: DocumentoPagado[] }[] = [];
  for (let i = 1; i <= cuantos; i++) {
    const documentos: DocumentoPagado[] = [];
    for (let j = 1; campo(campos, `pago_${i}_docto_${j}_id_documento`) !== null; j++) {
      const pre = `pago_${i}_docto_${j}_`;
      documentos.push({ uuid: (campo(campos, `${pre}id_documento`) ?? '').toUpperCase(), impPagado: campo(campos, `${pre}imp_pagado`) ?? '', moneda: (campo(campos, `${pre}moneda`) ?? 'MXN').toUpperCase() });
    }
    fuera.push({ dia: diaDe(campo(campos, `pago_${i}_fecha`) ?? ''), documentos });
  }
  return fuera;
}

function relacionesDe(xml: ModuloXml, texto: string): Pick<DocumentoFiscal, 'relacionados' | 'global'> {
  const raiz = xml.analizaXml(texto).raiz;
  const relacionados = xml.hijos(raiz, xml.CFDI_40, 'CfdiRelacionados').map((bloque) => ({
    tipoRelacion: xml.atributo(bloque, 'TipoRelacion') ?? '',
    uuids: xml.hijos(bloque, xml.CFDI_40, 'CfdiRelacionado').map((r) => (xml.atributo(r, 'UUID') ?? '').toUpperCase()),
  }));
  const info = xml.hijo(raiz, xml.CFDI_40, 'InformacionGlobal');
  const global = info ? { periodicidad: xml.atributo(info, 'Periodicidad') ?? '', meses: xml.atributo(info, 'Meses') ?? '', anio: xml.atributo(info, 'Año') ?? '' } : null;
  return { relacionados, global };
}

/** Lee un CFDI. Nunca lanza: un XML ilegible vuelve con su motivo, y se excluye declarado. */
export function leeDocumentoFiscal(xml: ModuloXml, archivo: string, texto: string): LecturaDeDocumento {
  const registro = xml.registroDeEsquemas([xml.lectorDeTimbre11, xml.lectorDePagos20]);
  const l = xml.leeCfdi40(texto, registro);
  if (!l.esCfdi) return { ok: false, archivo, motivo: l.motivo ?? 'no es un CFDI 4.0' };
  const todos = [...l.campos, ...l.complementos.leidos.flatMap((c) => c.campos)];
  const uuid = campo(todos, 'uuid');
  return {
    ok: true,
    documento: {
      archivo, huellaDeBytes: sha256(texto), uuid: uuid ? uuid.toUpperCase() : null,
      tipo: l.tipoDeComprobante ?? '', dia: diaDe(campo(l.campos, 'fecha') ?? ''),
      rfcEmisor: (campo(l.campos, 'rfc_emisor') ?? '').toUpperCase(), rfcReceptor: (campo(l.campos, 'rfc_receptor') ?? '').toUpperCase(),
      moneda: (campo(l.campos, 'moneda') ?? 'MXN').toUpperCase(), tipoCambio: campo(l.campos, 'tipo_cambio'),
      subtotal: campo(l.campos, 'subtotal') ?? '0', descuento: campo(l.campos, 'descuento'), total: campo(l.campos, 'total') ?? '0',
      metodoPago: campo(l.campos, 'metodo_pago'), pagos: l.tipoDeComprobante === 'P' ? pagosDe(todos) : [],
      ...relacionesDe(xml, texto),
    },
  };
}

/**
 * El día CONTABLE: el de emisión, salvo en una global mensual, que se atribuye al último día del
 * mes que declara. La global de septiembre se emite el 2 de octubre; contarla en octubre movería
 * un mes de mostrador al trimestre siguiente (SA de la spec).
 */
export function diaContable(d: DocumentoFiscal): Dia | null {
  const g = d.global;
  if (!g || g.periodicidad !== '04' || !/^(0[1-9]|1[0-2])$/.test(g.meses) || !/^\d{4}$/.test(g.anio)) return d.dia;
  return `${g.anio}-${g.meses}-${String(diasDelMes(Number(g.anio), Number(g.meses))).padStart(2, '0')}`;
}
