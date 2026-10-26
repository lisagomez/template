/**
 * Los enchufes del bucle. Todo lo que toca el mundo se inyecta: el núcleo no sabe si el motor
 * es el demonio local, si el cerebro es OpenRouter o un modelo de prueba, ni si el reproductor
 * es un `<audio>` o un reloj falso. Por eso se prueba entero sin audio, sin red y sin modelos.
 */
import type { Acuse } from './acuse.js';
import type { Activacion } from './activacion.js';
import type { AudioFrase, PiezaReproducir, Sintetizador } from './canal-voz.js';
import type { JuezCierre } from './cierre.js';
import type { Decision, Enrutador } from './enrutador.js';

export type EstadoBucle = 'reposo' | 'escuchando' | 'transcribiendo' | 'pensando' | 'hablando';

/** `toque`: un turno por activación · `palabra`: en reposo escucha su nombre · `manos-libres`: siempre. */
export type ModoBucle = 'toque' | 'palabra' | 'manos-libres';

export interface AudioTurno {
  muestras: Float32Array;
  hz: number;
}

export interface Mensaje {
  rol: 'usuario' | 'asistente';
  texto: string;
}

export interface TokensUso {
  entrada: number;
  salida: number;
  cacheados?: number;
}

/**
 * `costoUsd: null` = el proveedor no lo dijo y no hay con qué estimarlo (se declara, no se inventa).
 * `meta`: de dónde sale la respuesta; `simulado` = un cerebro de medición que contesta un texto fijo sin modelo (la
 * telemetría lo marca para que una cifra medida así nunca pase por la de un modelo real).
 */
export type PiezaCerebro = { tipo: 'token'; texto: string } | { tipo: 'uso'; costoUsd: number | null; tokens?: TokensUso } | { tipo: 'meta'; simulado: boolean };

/** Lo que da un modelo de verdad: nunca `meta` (así quien re-emite sus piezas con su propio tipo no se rompe). */
export type PiezaModelo = Exclude<PiezaCerebro, { tipo: 'meta' }>;

export interface Cerebro {
  piensa(mensajes: readonly Mensaje[], senal: AbortSignal): AsyncIterable<PiezaCerebro>;
}

export interface CerebroModelo extends Cerebro {
  piensa(mensajes: readonly Mensaje[], senal: AbortSignal): AsyncIterable<PiezaModelo>;
}

export interface Transcriptor {
  /** Transcripciones alternativas del mismo audio, la preferida primero. */
  transcribe(audio: AudioTurno, senal: AbortSignal): Promise<readonly string[]>;
}

/** Las órdenes de LECTURA (hora, agenda…): devuelve lo que se dice. Nunca escribe. */
export interface Lector {
  lee(orden: string, senal: AbortSignal): Promise<string>;
}

export type EventoReproductor =
  | { tipo: 'suena'; turno: number; indice: number; t: number }
  | { tipo: 'progreso'; turno: number; indice: number; fraccion: number }
  | { tipo: 'termina'; turno: number; indice: number; t: number }
  | { tipo: 'error'; turno: number; indice: number; mensaje: string };

export interface Reproductor {
  reproduce(p: PiezaReproducir): void;
  /** Corta lo que suena y vacía la cola, ya. */
  detiene(): void;
  atenua(activo: boolean): void;
  velocidad(v: number): void;
  alEvento(f: (e: EventoReproductor) => void): () => void;
}

export interface OpcionesBucle {
  modo: ModoBucle;
  transcriptor: Transcriptor;
  enrutador: Enrutador;
  cerebro: Cerebro;
  sintetizador: Sintetizador;
  reproductor: Reproductor;
  lector: Lector;
  /** Obligatoria en modo `palabra`. */
  activacion?: Activacion;
  juezCierre?: JuezCierre;
  reloj(): number;
  /** Temporizador inyectable (pruebas con reloj falso). Devuelve cómo cancelarlo. */
  programa?(f: () => void, ms: number): () => void;
  velocidadInicial?: number;
  /** Tras contestar en modo `palabra`, cuánto sigue escuchando sin pedir el nombre. */
  msSeguimiento?: number;
  /** Cierre anticipado de una orden segura: silencio mínimo desde el fin real. */
  msCierreYa?: number;
  /** Espera extra cuando la frase quedó abierta («…y»). */
  msEsperaExtra?: number;
  /** Turnos de conversación que se mandan al cerebro. */
  maxHistorial?: number;
  /** Arrancar el cerebro durante la pausa, antes de que el VAD cierre (se aborta si la voz sigue). */
  cerebroPreventivo?: boolean;
  /** El acuse inmediato (`creaAcuse`): una frase fija que suena al mandar un turno al cerebro. Sin él, no hay acuse. */
  acuse?: Acuse;
}

export type EventoBucle =
  | { tipo: 'estado'; estado: EstadoBucle }
  | { tipo: 'oido'; turno: number; texto: string; especulativo: boolean }
  /** El turno quedó cerrado (por el VAD, por sentido o por texto): ya no es especulación. */
  | { tipo: 'confirmado'; turno: number; anticipado: boolean }
  | { tipo: 'activado'; turno: number; texto: string }
  | { tipo: 'decision'; turno: number; decision: Decision }
  | { tipo: 'respuesta'; turno: number; texto: string }
  /** `acuse`: la frase fija que suena mientras piensa el cerebro (no es parte de la respuesta). */
  | { tipo: 'frase'; turno: number; indice: number; texto: string; acuse?: true }
  | { tipo: 'karaoke'; turno: number; indice: number; fraccion: number }
  | { tipo: 'interrumpido'; turno: number; dicho: string }
  | { tipo: 'descartado'; turno: number; motivo: string }
  | { tipo: 'fin'; turno: number }
  | { tipo: 'aviso'; turno?: number; mensaje: string };

export type { AudioFrase, PiezaReproducir, Sintetizador };
