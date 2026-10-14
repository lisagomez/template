/**
 * Las fuentes CRUDAS de una pyme (sus XML, su caja, su catálogo y su lista de cancelados) → Γ.
 * Cada fuente entra con su sha-256: Γ sabe de qué bytes salió.
 */
import { sha256 } from '../comun/canonico.js';
import type { Especificacion } from '../ontologia/especificacion.js';
import { leeDocumentoFiscal, type ModuloXml } from './cfdi.js';
import { construyeGamma, type Construccion, type OpcionesDeConstruccion } from './construye.js';
import type { Fuente } from './gamma.js';
import { leeCancelados, leeCatalogo, leeTickets } from './tablas.js';

export interface FuentesCrudas {
  readonly documentos: readonly { readonly nombre: string; readonly texto: string }[];
  /** CSV de la caja; en B2C es la fuente transaccional. */
  readonly caja?: string;
  readonly catalogo?: string;
  readonly cancelados?: string;
}

export function gammaDesdeFuentes(xml: ModuloXml, e: Especificacion, f: FuentesCrudas, o: OpcionesDeConstruccion): Construccion {
  const fuentes: Fuente[] = f.documentos.map((d) => ({ tipo: 'cfdi', nombre: d.nombre, sha256: sha256(d.texto) }));
  if (f.caja !== undefined) fuentes.push({ tipo: 'caja', nombre: 'caja.csv', sha256: sha256(f.caja) });
  if (f.catalogo !== undefined) fuentes.push({ tipo: 'catalogo', nombre: 'catalogo.csv', sha256: sha256(f.catalogo) });
  if (f.cancelados !== undefined) fuentes.push({ tipo: 'cancelados', nombre: 'cancelados.csv', sha256: sha256(f.cancelados) });
  return construyeGamma(e, {
    documentos: f.documentos.map((d) => leeDocumentoFiscal(xml, d.nombre, d.texto)),
    ...(f.caja !== undefined ? { tickets: leeTickets(f.caja) } : {}),
    ...(f.catalogo !== undefined ? { catalogo: leeCatalogo(f.catalogo) } : {}),
    ...(f.cancelados !== undefined ? { cancelados: leeCancelados(f.cancelados) } : {}),
    fuentes,
  }, o);
}
