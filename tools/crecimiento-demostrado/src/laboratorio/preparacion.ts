/**
 * Prepara las pymes del laboratorio: fuentes sintéticas → Γ, con el lector de CFDI inyectado.
 * Una vez por proceso (Γ es inmutable y el replay lo comprueba aparte).
 */
import type { ModuloXml } from '../datos/cfdi.js';
import type { Gamma } from '../datos/gamma.js';
import { gammaDesdeFuentes, type FuentesCrudas } from '../datos/ingesta.js';
import type { Construccion } from '../datos/construye.js';
import { pymeSintetica, type IdDePyme, type PymeSintetica } from '../sinteticos/pymes.js';
import { conInyeccion } from '../sinteticos/sucio.js';

export interface PymeLista { readonly pyme: PymeSintetica; readonly gamma: Gamma }

const cache = new Map<IdDePyme, PymeLista>();

export function construyeDe(xml: ModuloXml, id: IdDePyme, fuentes?: FuentesCrudas): Construccion {
  const p = pymeSintetica(id);
  return gammaDesdeFuentes(xml, p.especificacion, fuentes ?? p.fuentes, { rfcPropio: p.rfcPropio, llaveDeSeudonimo: p.llaveDeSeudonimo });
}

export function preparaPyme(xml: ModuloXml, id: IdDePyme): PymeLista {
  const hecha = cache.get(id);
  if (hecha) return hecha;
  const c = construyeDe(xml, id);
  if (!c.ok) throw new Error(`la pyme sintética ${id} no sella Γ: ${c.violaciones.map((v) => v.invariante).join(', ')}`);
  const lista = { pyme: pymeSintetica(id), gamma: c.gamma };
  cache.set(id, lista);
  return lista;
}

const inyectados = new Map<IdDePyme, Gamma>();

/** Γ de las fuentes con la instrucción inyectada: tiene que sellar (es dato) y dar los mismos hechos. */
export function gammaConInyeccion(xml: ModuloXml, id: IdDePyme): Gamma {
  const hecho = inyectados.get(id);
  if (hecho) return hecho;
  const c = construyeDe(xml, id, conInyeccion(id));
  if (!c.ok) throw new Error(`las fuentes con inyección no sellan: ${c.violaciones.map((v) => v.invariante).join(', ')}`);
  inyectados.set(id, c.gamma);
  return c.gamma;
}
