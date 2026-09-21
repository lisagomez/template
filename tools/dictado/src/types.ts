/**
 * El contrato que ven los puntos de entrada. TypeScript puro, CERO dependencias en tiempo de
 * ejecucion: lo unico que se importa de `@tu-scope/voz` son TIPOS, y un `import type` no deja
 * rastro en el JavaScript compilado.
 *
 * El nucleo no sabe de microfonos, de Windows ni de ningun modelo: habla con cuatro
 * interfaces —`DetectorVoz` (lo pone `voz`), `Transcriptor` (un motor local, un proceso de
 * Python o un servicio remoto), `Pegador` (donde acaba el texto) y `Almacen` (el historial)— y
 * cada entry point le inyecta las suyas. Por eso el dictado entero se prueba sin descargar un
 * solo MB de modelos, y por eso el mismo nucleo sirve en WSL2, en un VPS o en una prueba.
 *
 * `Muestras`, `Turno`, `EventoVoz`, `DetectorVoz`, `Transcriptor`, `OpcionesTranscribe` y
 * `Transcripcion` SON los de `@tu-scope/voz` 0.5.0 (hasta 0.1.0 se redeclaraban aqui
 * «estructuralmente iguales», y nadie lo comprobaba). Una sola duena del contrato: si voz lo
 * cambia, esto se entera al compilar, no en produccion.
 */
import type { DetectorVoz, EventoVoz, Muestras, OpcionesTranscribe, Transcripcion, Transcriptor, Turno } from '@tu-scope/voz';

export type { DetectorVoz, EventoVoz, Muestras, OpcionesTranscribe, Transcripcion, Transcriptor, Turno };

/** Un motor con nombre: lo que se mide y lo que se escribe en el historial. */
export interface Motor extends Transcriptor {
  /** Identificador pineado, con version y cuantizacion (`sherpa-parakeet-tdt-0.6b-v3-int8`). */
  readonly id: string;
  /** Si honra `OpcionesTranscribe.pista`. */
  readonly admitePista: boolean;
  /** Primera inferencia con silencio para dejar el modelo residente. */
  calienta?(): Promise<void>;
  cierra?(): Promise<void>;
}

/** Acciones verbales que se ejecutan DESPUES de pegar («… y dale enter»). */
export type Accion = 'enter';

/** Donde acaba el texto. En WSL2 lo implementa el pegador de Windows; en una prueba, un array. */
export interface Pegador {
  pega(texto: string): Promise<void>;
  /** Opcional: un pegador que no sepa ejecutar acciones las deja pasar. */
  ejecuta?(acciones: readonly Accion[]): Promise<void>;
}

/**
 * Limpieza opcional por modelo de lenguaje (puntuacion, muletillas). El nucleo NO trae ningun
 * proveedor y esta APAGADA por defecto: la fidelidad gana a la limpieza, y por defecto nada
 * sale de la maquina (C4).
 */
export interface Limpiador {
  limpia(texto: string, contexto: { perfil: string }): Promise<string>;
}
