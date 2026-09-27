/**
 * Medidas y zonas seguras por canal, unificadas (la fuente las tenía dispersas: 1200×628, ×630, ×627).
 * En 9:16 la interfaz de Reels, Historias y el estado de WhatsApp tapa arriba y abajo: 14 % arriba,
 * 35 % abajo y 6 % a los lados, según guías de terceros que resumen las especificaciones de Meta
 * (a verificar en la guía oficial). En los demás formatos se deja un margen de respiro del 8 %.
 */
export type FormatoDePieza = 'cuadrado' | 'vertical' | 'historia' | 'horizontal';

export interface Formato {
  readonly nombre: FormatoDePieza;
  readonly ancho: number;
  readonly alto: number;
  readonly relacion: string;
  /** Proporción que se reserva en cada borde; el texto y el precio van dentro. */
  readonly zona: { readonly arriba: number; readonly abajo: number; readonly lados: number };
  readonly usos: readonly string[];
}

export const FORMATOS: Readonly<Record<FormatoDePieza, Formato>> = {
  vertical: { nombre: 'vertical', ancho: 1080, alto: 1350, relacion: '4:5', zona: { arriba: 0.08, abajo: 0.08, lados: 0.08 }, usos: ['Instagram publicación', 'lámina de carrusel'] },
  cuadrado: { nombre: 'cuadrado', ancho: 1080, alto: 1080, relacion: '1:1', zona: { arriba: 0.08, abajo: 0.08, lados: 0.08 }, usos: ['Instagram o Facebook cuadrado'] },
  horizontal: { nombre: 'horizontal', ancho: 1200, alto: 630, relacion: '1.91:1', zona: { arriba: 0.1, abajo: 0.1, lados: 0.06 }, usos: ['Facebook horizontal'] },
  historia: { nombre: 'historia', ancho: 1080, alto: 1920, relacion: '9:16', zona: { arriba: 0.14, abajo: 0.35, lados: 0.06 }, usos: ['Historia', 'Reel', 'estado de WhatsApp', 'TikTok'] },
};

export interface CajaSegura {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** El rectángulo donde puede ir texto sin que lo tape la interfaz de la red. */
export function cajaSegura(f: Formato): CajaSegura {
  return {
    x0: Math.round(f.ancho * f.zona.lados), x1: Math.round(f.ancho * (1 - f.zona.lados)),
    y0: Math.round(f.alto * f.zona.arriba), y1: Math.round(f.alto * (1 - f.zona.abajo)),
  };
}

/** Formato recomendado para cada canal del calendario. */
export const FORMATO_POR_CANAL: Readonly<Record<string, FormatoDePieza>> = {
  instagram: 'vertical', facebook: 'horizontal', whatsapp: 'historia', tiktok: 'historia', carrusel: 'vertical',
};
