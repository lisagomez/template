/**
 * Γ: los hechos base de una pyme, normalizados, con los invariantes comprobados y SELLADOS por
 * hash. Lo que no está en Γ no existe para el kernel, y Γ no se sella si viola un solo invariante.
 */
import { canoniza, huellaDe, porTexto, type Canonizable } from '../comun/canonico.js';
import type { Dia } from '../comun/periodos.js';

/** El cliente de una transacción: un seudónimo, o la clase anónima (público en general). */
export const ANONIMO = 'ANONIMO';

export interface Transaccion {
  /** UUID del CFDI (B2B) o `tk:<ticket>` (caja). */
  readonly id: string;
  readonly dia: Dia;
  readonly cliente: string;
  /** Sin IVA, en centavos de MXN. Es el ingreso facturado de la transacción. */
  readonly centavos: number;
  /** Con IVA: lo que se cobra. */
  readonly totalCentavos: number;
  readonly metodo: 'PUE' | 'PPD';
  readonly origen: 'cfdi' | 'caja' | 'erp';
}

export interface NotaDeCredito {
  readonly id: string;
  readonly dia: Dia;
  readonly cliente: string;
  /** Positivo: RESTA del ingreso neto en el periodo de su emisión (SA). */
  readonly centavos: number;
  readonly relacionadas: readonly string[];
}

export interface Pago {
  readonly id: string;
  readonly dia: Dia;
  readonly documento: string;
  /** Con IVA (ImpPagado). */
  readonly centavos: number;
}

export interface Fuente { readonly tipo: 'cfdi' | 'caja' | 'catalogo' | 'cancelados' | 'erp'; readonly nombre: string; readonly sha256: string }
export interface Exclusion { readonly referencia: string; readonly motivo: string }
export interface Violacion { readonly invariante: string; readonly referencia: string; readonly detalle: string }

export interface ContenidoGamma {
  readonly version: 1;
  readonly pyme: string;
  readonly especificacion: string;
  readonly transacciones: readonly Transaccion[];
  readonly notas: readonly NotaDeCredito[];
  readonly pagos: readonly Pago[];
  readonly segmentos: readonly { readonly cliente: string; readonly segmento: string }[];
  readonly fuentes: readonly Fuente[];
  readonly exclusiones: readonly Exclusion[];
  readonly invariantes: readonly string[];
}

export interface Gamma { readonly hash: string; readonly contenido: ContenidoGamma }

const porId = <T extends { readonly id: string }>(a: T, b: T) => porTexto(a.id, b.id);

/** Ordena todo (sin depender del orden de llegada) y sella. */
export function sella(c: ContenidoGamma): Gamma {
  const contenido: ContenidoGamma = {
    ...c,
    transacciones: [...c.transacciones].sort(porId),
    notas: [...c.notas].map((n) => ({ ...n, relacionadas: [...n.relacionadas].sort(porTexto) })).sort(porId),
    pagos: [...c.pagos].sort(porId),
    segmentos: [...c.segmentos].sort((a, b) => porTexto(a.cliente, b.cliente)),
    fuentes: [...c.fuentes].sort((a, b) => porTexto(`${a.tipo}/${a.nombre}`, `${b.tipo}/${b.nombre}`)),
    exclusiones: [...c.exclusiones].sort((a, b) => porTexto(`${a.referencia}|${a.motivo}`, `${b.referencia}|${b.motivo}`)),
    invariantes: [...c.invariantes].sort(porTexto),
  };
  return { hash: huellaDe('snap', contenido as unknown as Canonizable), contenido };
}

/** Recalcula el hash: un Γ alterado después de sellarse deja de ser el mismo Γ. */
export const verificaSello = (g: Gamma): boolean => sella(g.contenido).hash === g.hash;

export const serializaGamma = (g: Gamma): string => canoniza({ hash: g.hash, contenido: g.contenido as unknown as Canonizable });
