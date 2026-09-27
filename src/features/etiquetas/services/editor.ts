/**
 * El editor de etiquetas como datos puros: de lo que hay en el formulario a los simbolos, al
 * diseno y a la revision; y los arreglos de un clic devueltos al formulario. Sin React: se
 * prueba con `node --test`.
 */
import {
  aHri, aplicaArreglo, categoriaPorId, disenaEtiqueta, esErrorLectura, lineasLegibles, parseaHri, revisa, simbolosDe, unidadDe,
  type Arreglo, type Articulo, type Categoria, type Diseno, type PerfilImpresora, type ResultadoRevision, type Simbolo, type TipoUnidad,
} from './nucleo.ts';

export interface EstadoEditor {
  readonly tipo: 'caja' | 'tarima';
  readonly producto: string;
  readonly gtin: string;
  readonly lote: string;
  readonly caducidad: string;
  readonly diaCero: boolean;
  readonly cantidad: number;
  readonly sscc: string;
  readonly sku: string;
  readonly categoria: string;
  readonly sitio: string;
  readonly grosor: number | 'auto';
  /** Cadena escrita a mano: una linea por codigo, en forma legible `(01)...(17)...`. */
  readonly manual: string | null;
}

export const EDITOR_INICIAL: EstadoEditor = {
  tipo: 'caja', producto: '', gtin: '', lote: '', caducidad: '', diaCero: false, cantidad: 1, sscc: '', sku: '', categoria: 'general', sitio: '', grosor: 'auto', manual: null,
};

export function desdeArticulo(e: EstadoEditor, a: Articulo): EstadoEditor {
  return { ...e, sku: a.sku, producto: a.descripcion, categoria: a.categoria, gtin: a.gtinCaja ?? a.gtinUnidad ?? '', cantidad: e.tipo === 'tarima' ? a.cajasPorTarima ?? e.cantidad : e.cantidad, manual: null };
}

export type Simbolos = { ok: true; simbolos: Simbolo[] } | { ok: false; error: string };

/** Los simbolos que describe el editor: del formulario o de la cadena manual. */
export function simbolosDelEditor(e: EstadoEditor): Simbolos {
  if (e.manual !== null) {
    const lineas = e.manual.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lineas.length === 0) return { ok: false, error: 'escribe al menos un código, p. ej. (01)09521234000020(17)261030(10)L1' };
    const simbolos: Simbolo[] = [];
    for (const [i, l] of lineas.entries()) {
      const r = parseaHri(l);
      if (esErrorLectura(r)) return { ok: false, error: `línea ${i + 1}: ${r.mensaje}` };
      simbolos.push(r);
    }
    return { ok: true, simbolos };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.caducidad)) return { ok: false, error: 'falta la fecha de caducidad' };
  const gtin = e.gtin.replace(/\D/g, '').padStart(14, '0');
  if (e.tipo === 'caja') return { ok: true, simbolos: simbolosDe({ tipo: 'caja', producto: e.producto, gtin, caducidad: e.caducidad, diaCero: e.diaCero, lote: e.lote }) };
  return { ok: true, simbolos: simbolosDe({ tipo: 'tarima', producto: e.producto, sscc: e.sscc.replace(/\D/g, ''), gtinContenido: gtin, cantidad: e.cantidad, caducidad: e.caducidad, diaCero: e.diaCero, lote: e.lote }) };
}

export interface Resultado {
  readonly simbolos: Simbolo[];
  readonly diseno: Diseno;
  readonly revision: ResultadoRevision;
  readonly unidad: TipoUnidad;
}

export function calcula(e: EstadoEditor, perfil: PerfilImpresora, categorias: readonly Categoria[], hoy: string): Resultado | { error: string } {
  const s = simbolosDelEditor(e);
  if (!s.ok) return { error: s.error };
  const unidad = e.manual !== null ? unidadDe(s.simbolos) : e.tipo;
  const lineas = lineasLegibles(s.simbolos, Number(hoy.slice(0, 4))).filter((l) => !(unidad === 'caja' && l.startsWith('GTIN')));
  if (e.sitio) lineas.push(`SITIO: ${e.sitio}`);
  const diseno = disenaEtiqueta({ simbolos: s.simbolos, titulo: e.producto || 'Sin nombre', lineas, unidad, ...(e.grosor !== 'auto' ? { grosor: e.grosor } : {}) }, perfil);
  const revision = revisa({ simbolos: s.simbolos, diseno, perfil, categoria: categoriaPorId(categorias, e.categoria), hoy });
  return { simbolos: s.simbolos, diseno, revision, unidad };
}

/** Un arreglo de un clic, devuelto al formulario cuando se puede; si no, a la cadena manual. */
export function aplicaAlEditor(e: EstadoEditor, simbolos: Simbolo[], arreglo: Arreglo): EstadoEditor {
  if (arreglo.tipo === 'ajusta-grosor') return { ...e, grosor: arreglo.puntos };
  if (e.manual === null && (arreglo.tipo === 'corrige-digito' || arreglo.tipo === 'quita-caracteres')) {
    if (arreglo.ai === '01' || arreglo.ai === '02') return { ...e, gtin: arreglo.valor };
    if (arreglo.ai === '00') return { ...e, sscc: arreglo.valor };
    if (arreglo.ai === '10') return { ...e, lote: arreglo.valor };
  }
  return { ...e, manual: aplicaArreglo(simbolos, arreglo).map(aHri).join('\n') };
}

export function aManual(e: EstadoEditor): EstadoEditor {
  const s = simbolosDelEditor(e);
  return { ...e, manual: s.ok ? s.simbolos.map(aHri).join('\n') : '' };
}
