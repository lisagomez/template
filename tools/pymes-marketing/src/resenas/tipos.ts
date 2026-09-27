import type { AlertaDeContenido } from '../comun/no-confiable.js';
import type { Dia } from '../comun/fechas.js';

export type Plataforma = 'Google Maps' | 'Facebook' | 'TripAdvisor' | 'Mercado Libre' | 'App de comida' | 'Mensaje' | 'Otra';

/** Una reseña ya revisada: texto ajeno citado, datos personales tapados, autor reducido. */
export interface Resena {
  readonly id: string;
  readonly plataforma: Plataforma;
  readonly estrellas: number | null;
  readonly dia: Dia | null;
  /** «Nombre I.»: nunca el nombre completo. */
  readonly autor: string;
  /** Textual (sin parafrasear), con teléfonos, correos, RFC… sustituidos por su etiqueta. */
  readonly texto: string;
  readonly alertas: readonly AlertaDeContenido[];
  readonly yaRespondida: boolean;
  readonly datosPersonalesTapados: number;
}

export interface LecturaDeResenas {
  readonly resenas: readonly Resena[];
  readonly rechazadas: readonly { readonly referencia: string; readonly motivo: string }[];
  readonly avisos: readonly string[];
}
