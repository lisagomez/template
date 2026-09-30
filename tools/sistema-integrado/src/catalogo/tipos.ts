/**
 * Tipos del catálogo de requisitos. El catálogo es PROPIO: rótulos, preguntas y explicaciones escritos con palabras
 * nuestras; de la norma solo se usa el NÚMERO de cláusula o de control, como referencia. El texto de una norma ISO
 * tiene derechos de autor (ver `.claude/goals/sistema-integrado-iso/investigacion.md` §2).
 */

/** Identificador de una edición: norma + edición. Nunca se reutiliza para otra cosa. */
export type IdEdicion = 'iso-9001:2015+a1:2024' | 'iso-9001:2026' | 'iso-iec-42001:2023';

export interface Edicion {
  readonly id: IdEdicion;
  readonly norma: 'ISO 9001' | 'ISO/IEC 42001';
  readonly edicion: string;
  /** Situación de hoy (consultada el 2026-09-30). */
  readonly situacion: string;
  /**
   * `false` = la estructura y los requisitos se catalogaron sin cotejar contra la norma licenciada. Toda edición nace
   * así; pasa a `true` solo con la firma de un auditor competente (PRP-008 fase 10).
   */
  readonly verificada: boolean;
  readonly nota?: string;
}

/** Fases del roadmap (0 diagnóstico … 8 preparación para la certificación). */
export type Fase = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Qué información documentada pide el requisito: `mantener` = documento vivo; `conservar` = registro. */
export type InfoDocumentada = 'mantener' | 'conservar' | null;

/** Familia del requisito: común a las dos normas, solo calidad, solo IA (cuerpo) o control del Anexo A. */
export type Familia = 'C' | 'Q' | 'IA' | 'A';

export interface Referencia {
  readonly edicion: IdEdicion;
  /** Número de cláusula (`4.1`, `7.1.5.2`) o de control del Anexo A (`A.6.2.4`). Solo el número. */
  readonly clausula: string;
}

export interface Requisito {
  /** ID propio y estable: `SGI-<familia>-<cláusula>-<nn>`. Jamás se reutiliza ni se renumera. */
  readonly id: string;
  readonly familia: Familia;
  readonly fase: Fase;
  /** Rótulo corto propio (no es el título de la cláusula ni del control). */
  readonly tema: string;
  /** Pregunta guía propia: lo que un auditor querría ver resuelto. */
  readonly pregunta: string;
  /** La misma idea sin jerga, para el modo pyme. */
  readonly sencillo: string;
  readonly refs: readonly Referencia[];
  readonly doc: InfoDocumentada;
  /** Ejemplos de evidencia que suelen cubrirlo. */
  readonly evidencias: readonly string[];
}

export interface Catalogo {
  readonly version: string;
  /** Mientras no firme un auditor competente: `borrador-sin-revision-experta`. */
  readonly estado: 'borrador-sin-revision-experta' | 'revisado';
  readonly ediciones: readonly Edicion[];
  /**
   * Estructura de cada edición: la lista de números que el catálogo tiene que cubrir. Es la referencia del gate de
   * cobertura (L2). La clave `iso-iec-42001:2023#anexo-a` lista los controles del Anexo A.
   */
  readonly estructura: Readonly<Record<string, readonly string[]>>;
  readonly requisitos: readonly Requisito[];
}
