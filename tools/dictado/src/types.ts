/**
 * El contrato que ven los puntos de entrada. TypeScript puro, CERO dependencias.
 *
 * El nucleo no sabe de microfonos, de Windows ni de ningun modelo: habla con cuatro
 * interfaces —`DetectorVoz` (lo pone `@tu-scope/voz`), `Transcriptor` (un motor local, un
 * proceso de Python o un servicio remoto), `Pegador` (donde acaba el texto) y `Almacen` (el
 * historial)— y cada entry point le inyecta las suyas. Por eso el dictado entero se prueba
 * sin descargar un solo MB de modelos, y por eso el mismo nucleo sirve en WSL2, en un VPS o
 * en una prueba.
 *
 * `Muestras`, `Turno`, `EventoVoz` y `DetectorVoz` son ESTRUCTURALMENTE los de `@tu-scope/voz`:
 * se redeclaran aqui para que el nucleo no importe ese paquete ni en tipos. Un detector de
 * `voz` encaja sin adaptador.
 */

/** Audio mono, punto flotante en [-1, 1]. Es el unico formato que cruza este nucleo. */
export type Muestras = Float32Array;

/** Un tramo de habla delimitado por el detector (mismo contrato que `voz`). */
export interface Turno {
  inicioMs: number;
  finMs: number;
  audio?: Muestras;
  hablante?: string;
  texto?: string;
}

export type EventoVoz =
  | { tipo: 'inicioHabla'; ms: number }
  | { tipo: 'finHabla'; turno: Turno }
  | { tipo: 'probabilidad'; valor: number; ms: number };

/** Lo que el dictado necesita de un VAD. `creaDetectorVoz` de `voz` lo cumple tal cual. */
export interface DetectorVoz {
  procesa(entrada: Muestras): Promise<EventoVoz[]>;
  cierra(): Promise<EventoVoz[]>;
  reinicia(): void;
  readonly hablando: boolean;
}

export interface OpcionesTranscribe {
  /** Codigo ISO del idioma (`es`). Sin el, el motor detecta o asume el suyo. */
  idioma?: string;
  /**
   * Vocabulario que el motor debe favorecer (nombres, jerga). Solo lo honran los motores con
   * `admitePista` (Whisper lo recibe como prompt inicial); los demas lo ignoran.
   */
  pista?: string;
}

export interface Transcripcion {
  texto: string;
  confianza?: number;
  idioma?: string;
  /** Lo que tardo el motor, si lo mide. */
  ms?: number;
}

/**
 * El enchufe de transcripcion. Es un superconjunto del `Transcriptor` de `voz`: un motor de
 * este paquete se le puede pasar a `transcribeTurnos` de `voz` sin adaptar nada.
 */
export interface Transcriptor {
  transcribe(muestras: Muestras, frecuenciaHz: number, opciones?: OpcionesTranscribe): Promise<Transcripcion>;
}

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
