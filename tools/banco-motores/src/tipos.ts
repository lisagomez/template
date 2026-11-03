/**
 * Los tipos del banco. Una FUNCIÓN es lo que en Gradio es una `Interface`: qué entra, qué sale, qué motor
 * corre detrás y con qué ejemplos sintéticos se prueba. De su esquema salen la pantalla y la ruta API.
 */
import type { z } from 'zod';

/** El tipo de bloque etiquetado que pinta cada campo (el contrato preprocess/postprocess de Gradio). */
export type TipoBloque =
  | 'texto' | 'texto-largo' | 'numero' | 'opcion' | 'booleano'
  | 'imagen' | 'audio' | 'archivo' | 'lista' | 'tabla' | 'objeto' | 'json';

export interface Bloque {
  readonly campo: string;
  readonly etiqueta: string;
  readonly tipo: TipoBloque;
  readonly requerido: boolean;
  readonly descripcion?: string;
  readonly opciones?: readonly string[];
  readonly minimo?: number;
  readonly maximo?: number;
  readonly unidad?: string;
  readonly columnas?: readonly string[];
  readonly hijos?: readonly Bloque[];
  readonly porDefecto?: unknown;
}

/** Un caso sintético con el que se prueba la función (los `examples` de Gradio). Nunca datos reales. */
export interface Ejemplo<T> {
  readonly id: string;
  readonly titulo: string;
  /** Lo que se puede escribir en línea. */
  readonly entrada: Partial<T>;
  /** Campos de archivo que la pantalla carga de una ruta pública (misma máquina) y convierte en data URL. */
  readonly archivos?: Readonly<Record<string, string>>;
  readonly trampa?: string | null;
  readonly sintetico: true;
}

export interface ContextoDeEjecucion {
  readonly signal: AbortSignal;
}

export interface Funcion<E extends z.ZodType, S extends z.ZodType> {
  readonly id: string;
  readonly titulo: string;
  readonly descripcion: string;
  /** Qué corre detrás, dicho (y pineado): «tesseract 5.5.0 por el adaptador de proceso del extractor». */
  readonly motor: string;
  readonly entrada: E;
  readonly salida: S;
  readonly ejemplos: readonly Ejemplo<z.input<E>>[];
  ejecuta(entrada: z.output<E>, ctx: ContextoDeEjecucion): Promise<z.input<S>>;
}

/** La función con los genéricos borrados, para registrarla junto a otras. Solo la crea `defineFuncion`. */
export interface FuncionDeBanco {
  readonly id: string;
  readonly titulo: string;
  readonly descripcion: string;
  readonly motor: string;
  readonly entrada: z.ZodType;
  readonly salida: z.ZodType;
  readonly ejemplos: readonly Ejemplo<Record<string, unknown>>[];
  ejecuta(entrada: unknown, ctx: ContextoDeEjecucion): Promise<unknown>;
}

export interface Problema {
  readonly ruta: string;
  readonly mensaje: string;
}

export type EtapaDeFallo = 'entrada' | 'motor' | 'salida' | 'cancelada';

export type Resultado =
  | { readonly ok: true; readonly salida: unknown; readonly ms: number }
  | { readonly ok: false; readonly etapa: EtapaDeFallo; readonly mensaje: string; readonly problemas: readonly Problema[]; readonly ms: number };

/** Lo que la pantalla y la doc de la API necesitan saber de una función, ya serializable. */
export interface Descriptor {
  readonly id: string;
  readonly titulo: string;
  readonly descripcion: string;
  readonly motor: string;
  readonly entrada: readonly Bloque[];
  readonly salida: readonly Bloque[];
  readonly ejemplos: readonly Ejemplo<Record<string, unknown>>[];
  readonly esquemas: { readonly entrada: unknown; readonly salida: unknown };
}
