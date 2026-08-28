/**
 * El contrato que ven los dos puntos de entrada. TypeScript puro, CERO dependencias.
 *
 * La pieza que sostiene todo lo demas son `ModeloVoz` y `ModeloHablante`: el nucleo NO
 * importa `onnxruntime` ni sabe que existe Silero. Habla con estas dos interfaces y cada
 * entry point le inyecta su runtime. Gracias a eso el algoritmo se prueba con un modelo
 * falso, sin descargar un solo MB, y el mismo codigo corre en el navegador y en Node.
 */

/** Audio mono, punto flotante en [-1, 1]. Es el unico formato que cruza este nucleo. */
export type Muestras = Float32Array;

/**
 * Modelo que puntua un marco de audio. Lo implementan `modeloEnergia` (cero MB, en este
 * mismo paquete) y los runtimes de Silero en `./browser` y `./node`.
 */
export interface ModeloVoz {
  /** Marcos que espera el modelo, en muestras. Silero usa 512 a 16 kHz (~32 ms). */
  readonly tamMarco: number;
  /** Frecuencia de muestreo que exige el modelo, en Hz. */
  readonly frecuenciaHz: number;
  /** Probabilidad [0,1] de que este marco contenga voz. */
  probabilidad(marco: Muestras): Promise<number>;
  /** Olvida el estado recurrente. Se llama entre flujos distintos, no entre marcos. */
  reinicia(): void;
  cierra?(): Promise<void>;
}

/** Modelo que convierte un fragmento de voz en un vector de hablante. */
export interface ModeloHablante {
  readonly frecuenciaHz: number;
  /** Vector L2-normalizado. Fragmentos del mismo hablante deben quedar cerca en coseno. */
  vector(muestras: Muestras): Promise<Float32Array>;
  cierra?(): Promise<void>;
}

/** Un tramo de habla delimitado por el detector. */
export interface Turno {
  inicioMs: number;
  finMs: number;
  /**
   * El audio del turno, si se pidio `conservaAudio`. Es lo que come la diarizacion y lo
   * que se le pasa a un transcriptor; sin el, el turno solo sirve para saber CUANDO.
   */
  audio?: Muestras;
  /** Etiqueta de hablante. La pone la diarizacion o el reparto por canal, nunca el VAD. */
  hablante?: string;
  /** Texto, si un `Transcriptor` paso por aqui. */
  texto?: string;
}

export type EventoVoz =
  | { tipo: 'inicioHabla'; ms: number }
  | { tipo: 'finHabla'; turno: Turno }
  /** Se emite en cada marco. Sirve para medidores de nivel y para depurar umbrales. */
  | { tipo: 'probabilidad'; valor: number; ms: number };

export interface OpcionesDetector {
  modelo: ModeloVoz;
  /**
   * Probabilidad a partir de la cual se declara habla. Por debajo de `umbralSalida` se
   * declara silencio. Dos umbrales y no uno: con uno solo, una senal que oscila alrededor
   * del umbral abre y cierra turnos decenas de veces por segundo.
   */
  umbralEntrada?: number;
  umbralSalida?: number;
  /**
   * Cuanto silencio hace falta para cerrar el turno. Es el mando que decide si la
   * herramienta corta a alguien que respira a mitad de frase.
   */
  msSilencioParaCerrar?: number;
  /** Tramos de habla mas cortos que esto se descartan: son golpes, clics o toses. */
  msMinimoHabla?: number;
  /**
   * Audio ANTERIOR a la deteccion que se incluye en el turno. Sin esto el modelo tarda uno
   * o dos marcos en reaccionar y el turno empieza con "ola" en vez de "hola". Es el detalle
   * que separa un VAD usable de uno de juguete.
   */
  msRelleno?: number;
  /** Guardar el audio del turno. Necesario para diarizar o transcribir; cuesta memoria. */
  conservaAudio?: boolean;
}

/** Transcriptor externo. La herramienta NO transcribe: define el enchufe y se aparta. */
export interface Transcriptor {
  transcribe(muestras: Muestras, frecuenciaHz: number): Promise<{ texto: string; confianza?: number }>;
}
