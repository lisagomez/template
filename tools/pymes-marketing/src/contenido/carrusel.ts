/**
 * Carruseles de 3 a 6 láminas (4:5, 1080×1350) que cuentan algo con datos que YA existen: una fecha
 * de temporada, un paquete del brief o los puntos que escribió el dueño. Reglas de la fuente que se
 * conservan: la lámina 1 se entiende sola (es la que se reusa como publicación suelta), un hueco por
 * producto sin repetir, precio solo confirmado. Lo que no existe no se inventa: el carrusel nace
 * «falta algo».
 */
import { formatoDinero } from '../comun/dinero.js';
import { fechaCorta } from '../comun/fechas.js';
import { normaliza, recorta } from '../comun/texto.js';
import type { PerfilDeMarca } from '../marca/perfil.js';
import type { EstrategiaDe30Dias } from './estrategia.js';
import { piezaSvg, type DatosDePieza } from './pieza-svg.js';
import { revisaPieza, type Observacion } from './revision-visual.js';

export interface Lamina {
  readonly indice: number;
  readonly datos: DatosDePieza;
  readonly svg: string;
  readonly observaciones: readonly Observacion[];
}

export interface Carrusel {
  readonly id: string;
  readonly tipo: 'temporada' | 'paquete' | 'tip';
  readonly titulo: string;
  readonly laminas: readonly Lamina[];
  readonly falta: string | null;
  readonly avisos: readonly string[];
}

export interface OpcionesDeCarrusel {
  /** Precios CONFIRMADOS por el dueño, con impuestos, por nombre de producto. */
  readonly precios?: Readonly<Record<string, number>>;
  /** Ruta REAL para pedir (el WhatsApp del negocio). */
  readonly contacto?: string;
}

function armaLaminas(marca: PerfilDeMarca, id: string, datos: readonly Omit<DatosDePieza, 'semilla' | 'formato' | 'etiqueta'>[]): Lamina[] {
  const n = datos.length;
  return datos.map((d, i) => {
    const completa: DatosDePieza = { ...d, etiqueta: `${i + 1} / ${n}`, formato: 'vertical', semilla: `${id}|${i}` };
    return { indice: i + 1, datos: completa, svg: piezaSvg(marca, completa), observaciones: revisaPieza(marca, completa, { canal: 'carrusel' }) };
  });
}

function precioDe(producto: string, o: OpcionesDeCarrusel): string | undefined {
  const p = o.precios?.[normaliza(producto)];
  return p === undefined ? undefined : formatoDinero(Math.round(p * 100));
}

/** Temporada: portada con la fecha → producto con precio → cómo pedir → cierre de marca. */
export function carruselDeTemporada(e: EstrategiaDe30Dias, marca: PerfilDeMarca, o: OpcionesDeCarrusel = {}): Carrusel | null {
  const empuje = e.empujar.find((x) => x.fecha);
  if (!empuje?.fecha) return null;
  const f = empuje.fecha, id = `carrusel-${normaliza(f.nombre).replace(/\s+/g, '-')}`;
  const precio = precioDe(empuje.producto, o);
  const avisos = precio ? [] : ['sin precio confirmado: la lámina del producto va sin precio'];
  const laminas = armaLaminas(marca, id, [
    { titular: f.nombre, apoyo: f.hasta === f.desde ? fechaCorta(f.desde) : `Del ${fechaCorta(f.desde)} al ${fechaCorta(f.hasta)}` },
    { titular: empuje.producto, apoyo: `Para ${f.nombre}`, precio },
    o.contacto ? { titular: 'Apártalo hoy', apoyo: o.contacto } : { titular: 'Apártalo hoy', apoyo: 'Escríbenos por mensaje' },
    { titular: marca.nombre, apoyo: marca.lema ?? undefined },
  ]);
  if (!o.contacto) avisos.push('falta tu WhatsApp o teléfono para «cómo pedir»');
  return { id, tipo: 'temporada', titulo: `${f.nombre}: ${empuje.producto}`, laminas, falta: null, avisos };
}

/** Paquete: un producto por lámina, sin repetir, y cierre. */
export function carruselDePaquete(e: EstrategiaDe30Dias, marca: PerfilDeMarca, o: OpcionesDeCarrusel = {}): Carrusel | null {
  const oferta = e.ofertas.find((x) => x.tipo === 'paquete' && x.descripcion.includes(' + '));
  if (!oferta) return null;
  const productos = [...new Set(oferta.descripcion.split(' + ').map((p) => p.trim()))];
  const id = `carrusel-paquete-${normaliza(productos.join(' ')).replace(/\s+/g, '-')}`;
  const laminas = armaLaminas(marca, id, [
    { titular: 'Paquete de la semana', apoyo: productos.join(' + ') },
    ...productos.map((p) => ({ titular: p, precio: precioDe(p, o) })),
    { titular: marca.nombre, apoyo: o.contacto ?? marca.lema ?? undefined },
  ]);
  return { id, tipo: 'paquete', titulo: `Paquete: ${productos.join(' + ')}`, laminas, falta: null, avisos: ['paquete: valida que te deje margen antes de publicarlo'] };
}

/** Tip del dueño: solo con los puntos que él escribió; sin ellos, «falta algo». */
export function carruselDeTip(tema: string, puntos: readonly string[], marca: PerfilDeMarca): Carrusel {
  const id = `carrusel-tip-${normaliza(tema).replace(/\s+/g, '-')}`;
  const limpios = puntos.map((p) => p.trim()).filter(Boolean).slice(0, 4);
  if (limpios.length < 2) return { id, tipo: 'tip', titulo: tema, laminas: [], falta: 'escribe de 2 a 4 puntos cortos: aquí no se inventan', avisos: [] };
  const laminas = armaLaminas(marca, id, [{ titular: tema }, ...limpios.map((p) => ({ titular: recorta(p, 42) })), { titular: marca.nombre, apoyo: marca.lema ?? undefined }]);
  return { id, tipo: 'tip', titulo: tema, laminas, falta: null, avisos: [] };
}
