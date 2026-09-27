import type { Dia } from '../comun/fechas.js';
import type { Importe } from '../comun/dinero.js';

/** Una línea de venta normalizada, venga de un CFDI o de un CSV. Importes SIN IVA. */
export interface LineaDeVenta {
  readonly dia: Dia;
  readonly producto: string;
  /** Clave estable para agrupar (normalizada): el mismo producto escrito distinto cae junto. */
  readonly clave: string;
  readonly cantidad: number;
  readonly importe: Importe;
  readonly canal: string;
  readonly origen: 'cfdi' | 'csv';
  /** UUID o folio del CFDI, o «csv:línea N». Para auditar de dónde salió cada peso. */
  readonly referencia: string;
  /** Huella del cliente (nunca su RFC ni su nombre); `null` si es público en general. */
  readonly cliente: string | null;
}

export interface Exclusion {
  readonly referencia: string;
  readonly motivo: string;
}

export interface VentasNormalizadas {
  readonly lineas: readonly LineaDeVenta[];
  /** Lo que se leyó y NO entró, con su motivo. Nada se descarta en silencio. */
  readonly excluidas: readonly Exclusion[];
  readonly avisos: readonly string[];
  /** Notas de crédito (CFDI tipo E) en pesos: RESTAN y además son señal de reembolso. */
  readonly notasDeCredito?: { readonly centavos: number; readonly cuantas: number };
}

/**
 * Lo mínimo que se necesita de un CFDI ya leído. Es la FORMA de `LecturaDeCfdi` de
 * `@tu-scope/extractor-documental/xml` (`leeCfdi40`): se pasa su resultado tal cual, sin que este
 * paquete dependa de aquel.
 */
export interface CfdiLeido {
  readonly esCfdi: boolean;
  readonly motivo: string | null;
  readonly tipoDeComprobante: string | null;
  readonly timbrado: boolean;
  readonly campos: readonly { readonly clave: string; readonly valor: string }[];
  readonly conceptos: readonly { readonly indice: number; readonly campos: readonly { readonly clave: string; readonly valor: string }[] }[];
}
