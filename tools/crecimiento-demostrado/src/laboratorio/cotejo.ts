/**
 * El sistema contra la VERDAD PLANTADA: por pyme, transición y métrica, el ΔR de cada clase que
 * calcula el motor sobre Γ contra el que calcula el generador sobre su libro, por otro camino.
 * También los snapshots sucios (cada uno detenido por su invariante), el replay y la inyección.
 */
import type { ModuloXml } from '../datos/cfdi.js';
import { serializaGamma } from '../datos/gamma.js';
import { anterior, rango } from '../comun/periodos.js';
import { valorDe } from '../motor/evalua.js';
import type { Clase } from '../motor/terminos.js';
import { verdadDelPuente } from '../sinteticos/verdad.js';
import { variantesSucias } from '../sinteticos/sucio.js';
import type { IdDePyme } from '../sinteticos/pymes.js';
import type { Metrica } from '../ontologia/especificacion.js';
import { construyeDe, gammaConInyeccion, preparaPyme } from './preparacion.js';

export const CLASES_COTEJADAS = ['N', 'K_exp', 'K_con', 'K_flat', 'L', 'Z', 'A', 'T'] as const;

export interface FilaDeCotejo {
  readonly pyme: IdDePyme;
  readonly desde: string;
  readonly hasta: string;
  readonly metrica: Metrica;
  readonly sistema: Readonly<Record<string, number>>;
  readonly verdad: Readonly<Record<string, number>>;
  readonly nft: { readonly sistema: readonly number[]; readonly verdad: readonly number[] };
  readonly cierra: boolean;
}

export function cotejaConLaVerdad(xml: ModuloXml, id: IdDePyme, metricas: readonly Metrica[] = ['neto', 'facturado', 'cobrado']): FilaDeCotejo[] {
  const { pyme, gamma } = preparaPyme(xml, id);
  const e = pyme.especificacion;
  const periodos = rango(e.horizonte.desde, e.horizonte.hasta);
  return periodos.slice(1).flatMap((hasta) => metricas.map((metrica): FilaDeCotejo => {
    const desde = anterior(hasta);
    const v = verdadDelPuente(pyme.libro, metrica, desde, hasta, e.estable.bandaPorMil);
    const sistema = Object.fromEntries(CLASES_COTEJADAS.map((clase) => {
      const r = valorDe(gamma, e, { m: 'dR', metrica, clase: clase as Clase, desde, hasta });
      return [clase, r.tipo === 'centavos' ? r.v : Number.NaN];
    }));
    const en = (lado: 'desde' | 'hasta') => {
      const R = valorDe(gamma, e, { m: 'R', metrica, clase: 'U', desde, hasta, en: lado });
      const tx = valorDe(gamma, e, { m: 'tx', metrica, clase: 'U', desde, hasta, en: lado });
      return [R.tipo === 'centavos' ? R.v : NaN, tx.tipo === 'conteo' ? tx.v : NaN];
    };
    const nftSistema = [...en('desde'), ...en('hasta')];
    const nftVerdad = [v.nft.desde.R, v.nft.desde.tx, v.nft.hasta.R, v.nft.hasta.tx];
    const cierra = CLASES_COTEJADAS.every((k) => sistema[k] === v.delta[k]) && nftSistema.every((x, i) => x === nftVerdad[i]);
    return { pyme: id, desde, hasta, metrica, sistema, verdad: v.delta, nft: { sistema: nftSistema, verdad: nftVerdad }, cierra };
  }));
}

export interface FilaDeSucio { readonly id: string; readonly pyme: IdDePyme; readonly descripcion: string; readonly esperado: string; readonly obtenidos: readonly string[]; readonly sellado: boolean; readonly pasa: boolean }

export function correSucios(xml: ModuloXml): FilaDeSucio[] {
  return variantesSucias().map((s) => {
    const c = construyeDe(xml, s.pyme, s.fuentes);
    const obtenidos = c.ok ? [] : [...new Set(c.violaciones.map((v) => v.invariante))].sort();
    return { id: s.id, pyme: s.pyme, descripcion: s.descripcion, esperado: s.invariante, obtenidos, sellado: c.ok, pasa: !c.ok && obtenidos.includes(s.invariante) };
  });
}

/** Mismas fuentes + misma spec ⇒ el mismo Γ, byte a byte (dos construcciones independientes). */
export function replayDeGamma(xml: ModuloXml, id: IdDePyme): { primera: string; segunda: string; bytes: number; iguales: boolean } {
  const [a, b] = [construyeDe(xml, id), construyeDe(xml, id)];
  if (!a.ok || !b.ok) return { primera: '', segunda: '', bytes: 0, iguales: false };
  const [sa, sb] = [serializaGamma(a.gamma), serializaGamma(b.gamma)];
  return { primera: a.gamma.hash, segunda: b.gamma.hash, bytes: sa.length, iguales: sa === sb };
}

/** La inyección no mueve un solo hecho: el puente de las fuentes inyectadas es idéntico al limpio. */
export function hechosConInyeccion(xml: ModuloXml, id: IdDePyme): { sellado: boolean; mismosHechos: boolean; gammaLimpio: string; gammaInyectado: string } {
  const limpio = preparaPyme(xml, id);
  const inyectado = gammaConInyeccion(xml, id);
  const e = limpio.pyme.especificacion;
  const desde = anterior(e.horizonte.hasta);
  const iguales = CLASES_COTEJADAS.every((clase) => {
    const t = { m: 'dR' as const, metrica: 'neto' as const, clase: clase as Clase, desde, hasta: e.horizonte.hasta };
    return JSON.stringify(valorDe(limpio.gamma, e, t)) === JSON.stringify(valorDe(inyectado, e, t));
  });
  return { sellado: true, mismosHechos: iguales, gammaLimpio: limpio.gamma.hash, gammaInyectado: inyectado.hash };
}
