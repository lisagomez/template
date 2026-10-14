/**
 * @tu-scope/sistema-integrado — un solo sistema de gestión para ISO 9001 e ISO/IEC 42001.
 * Núcleo: el motor determinista (avance, puertas por fase y rol, migración de edición) sobre el catálogo propio.
 * Subpaths: `./catalogo`, `./agentes`, `./documentos`, `./openrouter` (red y costo: se importa a propósito).
 */
export * from './motor/index.js';
export {
  CATALOGO, requisito, existe, requisitosDe, deFase, controlesAnexoA, edicionesDe, mapeoCruzado, comparaClausula,
  type Catalogo, type Requisito, type IdEdicion, type Fase, type Edicion, type Referencia, type InfoDocumentada, type Familia,
} from './catalogo/index.js';
