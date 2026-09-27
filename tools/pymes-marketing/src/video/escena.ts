/**
 * La escena de un video corto: un DATO, no un programa. Tamaño, fps, duración y capas con su
 * entrada animada. Contrato propio (no GSAP ni código de terceros). Tipos de capa cerrados: no hay
 * capa de foto ni de cámara, así que un video de esta versión es SIN PERSONAS por construcción.
 */
import { contraste } from '../marca/colores.js';
import type { PerfilDeMarca } from '../marca/perfil.js';
import { disposicion, type DatosDePieza } from '../contenido/pieza-svg.js';

export type Animacion = 'aparece' | 'sube' | 'crece';
export type TipoDeCapa = 'etiqueta' | 'titular' | 'apoyo' | 'precio' | 'marca';

export interface Capa {
  readonly id: string;
  readonly tipo: TipoDeCapa;
  readonly texto: string;
  readonly x: number;
  readonly y: number;
  readonly tam: number;
  readonly color: string;
  readonly fuente: string;
  readonly peso: number;
  /** Segundo en que empieza a entrar y cuánto tarda en llegar. */
  readonly entra: number;
  readonly dura: number;
  readonly animacion: Animacion;
  /** Solo en precio: la pastilla detrás del número. */
  readonly pastilla?: { readonly ancho: number; readonly alto: number; readonly color: string };
}

export interface Escena {
  readonly ancho: number;
  readonly alto: number;
  readonly fps: number;
  readonly duracion: number;
  readonly semilla: string;
  readonly colores: { readonly fondo: string; readonly primario: string; readonly secundario: string };
  readonly capas: readonly Capa[];
}

export const TIPOS_DE_CAPA: readonly TipoDeCapa[] = ['etiqueta', 'titular', 'apoyo', 'precio', 'marca'];

/**
 * Promo vertical 9:16 a partir de la misma pieza del calendario. Las entradas se escalonan y el final
 * se sostiene al menos 1.5 s: lo que se quiere recordar se queda quieto (oficio de motion design).
 */
export function escenaDePromo(marca: PerfilDeMarca, d: Omit<DatosDePieza, 'formato'>, opciones: { duracion?: number } = {}): Escena {
  const datos: DatosDePieza = { ...d, formato: 'historia' };
  const L = disposicion(datos), c = marca.colores, x = L.caja.x0, k = L.escala;
  const tinta = contraste(c.primario, c.fondo) >= 4.5 ? c.primario : c.texto;
  const capas: Capa[] = [];
  let t = 0.25;
  const agrega = (capa: Omit<Capa, 'entra'>, paso: number) => { capas.push({ ...capa, entra: Math.round(t * 100) / 100 }); t += paso; };
  if (d.etiqueta) agrega({ id: 'etiqueta', tipo: 'etiqueta', texto: d.etiqueta.toUpperCase(), x, y: L.yEtiqueta, tam: Math.round(36 * k), color: c.texto, fuente: marca.tipografia.cuerpo, peso: 400, dura: 0.4, animacion: 'aparece' }, 0.3);
  L.lineas.forEach((linea, i) => agrega({ id: `titular-${i}`, tipo: 'titular', texto: linea, x, y: L.yTitular + Math.round(L.tamTitular * 1.05) * i, tam: L.tamTitular, color: tinta, fuente: marca.tipografia.titulos, peso: 700, dura: 0.5, animacion: 'sube' }, 0.18));
  t += 0.3;
  if (d.apoyo) agrega({ id: 'apoyo', tipo: 'apoyo', texto: d.apoyo, x, y: L.yApoyo, tam: Math.round(44 * k), color: c.texto, fuente: marca.tipografia.cuerpo, peso: 400, dura: 0.45, animacion: 'sube' }, 0.5);
  if (d.precio && L.precio) {
    const blanco = contraste('#ffffff', c.primario) >= 3 ? '#ffffff' : c.texto;
    agrega({ id: 'precio', tipo: 'precio', texto: d.precio, x: L.precio.x, y: L.precio.y, tam: Math.round(72 * k), color: blanco, fuente: marca.tipografia.cuerpo, peso: 700, dura: 0.35, animacion: 'crece', pastilla: { ancho: L.precio.ancho, alto: L.precio.alto, color: c.primario } }, 0.5);
  }
  agrega({ id: 'marca', tipo: 'marca', texto: marca.nombre, x, y: L.yFirma, tam: Math.round(46 * k), color: tinta, fuente: marca.tipografia.titulos, peso: 400, dura: 0.5, animacion: 'aparece' }, 0);
  const duracion = Math.max(opciones.duracion ?? 6, Math.ceil((t + 0.5 + 1.5) * 2) / 2);
  return { ancho: L.ancho, alto: L.alto, fps: 30, duracion, semilla: d.semilla, colores: { fondo: c.fondo, primario: c.primario, secundario: c.secundario }, capas };
}

export function planDeRender(e: Escena): { readonly cuadros: number; readonly tiempo: (i: number) => number } {
  return { cuadros: Math.round(e.duracion * e.fps), tiempo: (i: number) => i / e.fps };
}
