/**
 * La sala de aprobación (respuesta 8): el dueño marca «aquí corta» o «cambia este texto» en el segundo
 * exacto del reel editado; cada marca produce una versión nueva y revoca lo aprobado. Aprobar exige la
 * huella de ESA versión: nadie aprueba a ciegas un archivo que cambió. Aprobar ≠ publicar.
 */
import type { Marca, Observacion } from './tipos.js';
import { aOriginal, edlDesde, type Descarte, type Edl } from './cortes.js';
import type { Rotulo } from './subtitulos.js';

/** Las marcas de corte (en tiempo editado) se vuelven descartes en tiempo original y rehacen el EDL. */
export function aplicaCortes(edl: Edl, marcas: readonly Marca[]): Edl {
  const nuevos: Descarte[] = marcas.filter((m) => m.tipo === 'corte').map((m) => ({
    inicio: aOriginal(m.segundo, edl), fin: aOriginal(m.hasta ?? m.segundo + 1, edl), motivo: 'marca',
  }));
  return nuevos.length ? edlDesde([...edl.descartes, ...nuevos], edl.duracionOriginal) : edl;
}

/**
 * Al retirarse un consentimiento, lo que dependía de esa persona deja de valer: las caras marcadas como
 * consentidas y los cortes en su voz ya revisados. La decisión no guarda a qué consentimiento iba cada una,
 * así que se revisan TODAS de nuevo (se desenfoca de más, nunca de menos). Las marcas de corte o texto y los
 * datos cubiertos siguen: no dependen de ninguna persona.
 */
export function decisionesTrasRetirar<D extends { conConsentimiento: number[]; revisados?: string[] }>(d: D): D {
  return { ...d, conConsentimiento: [], revisados: [] };
}

/** «Cambia este texto»: la nota reemplaza el rótulo que está en pantalla en ese segundo. */
export function aplicaTextos(rs: readonly Rotulo[], marcas: readonly Marca[]): Rotulo[] {
  return rs.map((r) => {
    const m = marcas.find((x) => x.tipo === 'texto' && x.nota && x.segundo >= r.inicio && x.segundo <= r.fin);
    return m?.nota ? { ...r, texto: m.nota.slice(0, 80) } : r;
  });
}

export interface VersionVigente { numero: number; huella: string; bloqueos: readonly Observacion[] }
export interface PeticionDeAprobacion { version: number; huella: string; decision: 'aprobada' | 'cambio-pedido'; nota?: string }

/** `null` si se puede registrar; si no, el motivo en palabras del dueño. */
export function validaAprobacion(v: VersionVigente, p: PeticionDeAprobacion): string | null {
  if (p.version !== v.numero) return `Estás viendo la versión ${p.version}, pero la vigente es la ${v.numero}: recarga antes de decidir`;
  if (p.huella !== v.huella) return 'El archivo que viste no es el que está guardado (la huella no coincide): recarga antes de decidir';
  if (p.decision === 'cambio-pedido' && !(p.nota ?? '').trim()) return 'Di qué cambio quieres: sin nota no se puede pedir un cambio';
  if (p.decision === 'aprobada' && v.bloqueos.some((o) => o.nivel === 'bloquea')) return 'Esta versión tiene bloqueos sin resolver: no se puede aprobar';
  return null;
}
