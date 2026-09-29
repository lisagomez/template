/** Tipos del reel. Tiempos en SEGUNDOS; cajas en píxeles del cuadro 1080×1920. */

export interface Palabra { texto: string; inicio: number; fin: number }

/** Compatible con el contrato de `@tu-scope/voz` 0.5.0 (texto, idioma, ms) y añade las palabras con su tiempo. */
export interface Transcripcion { texto: string; palabras: Palabra[]; idioma?: string; ms?: number }

export interface TranscriptorConPalabras {
  transcribe(muestras: Float32Array, frecuenciaHz: number): Promise<Transcripcion>;
}

export interface Tramo { inicio: number; fin: number }
export interface Caja { x: number; y: number; ancho: number; alto: number }
export interface DeteccionCara extends Caja { t: number; confianza: number }

export interface PistaCara {
  id: number;
  detecciones: DeteccionCara[];
  /** Fracción de los cuadros muestreados en los que aparece. */
  presencia: number;
  areaMedia: number;
}

export type TipoDeDato = 'telefono' | 'rfc' | 'curp' | 'correo' | 'tarjeta';
export interface HallazgoPantalla { t: number; tipo: TipoDeDato; muestra: string; caja: Caja }

export interface Consentimiento { alias: string; rol: 'dueno' | 'empleado' | 'cliente'; vigenteHasta: string; revocado?: boolean }

export interface Medidas { ancho: number; alto: number; fps: number; duracion: number; audioHz?: number; codecVideo?: string; codecAudio?: string }

export type Nivel = 'bloquea' | 'aviso';
export interface Observacion { regla: string; nivel: Nivel; mensaje: string; t?: number }

export interface Desenfoque extends Tramo { caja: Caja; motivo: 'cara' | 'pantalla' }

export interface Marca { tipo: 'corte' | 'texto'; segundo: number; hasta?: number; nota?: string }

export interface MarcaDeNegocio {
  nombre: string;
  colores: { primario: string; texto: string };
  tipografia: 'sans' | 'serif';
}

export interface ProductoDeCatalogo { nombre: string; precio: number }

export const FORMATO = { ancho: 1080, alto: 1920, fps: 30, audioHz: 48_000, lufs: -14 } as const;
/** Zona segura de 9:16 (misma que `@tu-scope/pymes-marketing/contenido`, «a verificar en la guía oficial de Meta»). */
export const ZONA_SEGURA = { arriba: 0.14, abajo: 0.35, lados: 0.06 } as const;
