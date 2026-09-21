/**
 * Contratos del laboratorio de voz: los 20 casos en 4 salas, su estado REAL y lo que la
 * persona que prueba deja como veredicto. Sin dependencias: los usan el catalogo, los paneles,
 * las rutas y las pruebas.
 */

export type SalaId = 'escribir' | 'quien' | 'habla' | 'donde';

/**
 * LISTO: la pieza existe y se demuestra. REGLAS: se demuestra con logica local sin ningun
 * modelo de lenguaje, y se dice. PUERTA: falta un peso, una llave, una integracion o una firma
 * humana; la tarjeta lo explica y no simula nada.
 */
export type EstadoCaso = 'listo' | 'reglas' | 'puerta';

/** Lo que se comprueba en la maquina (presencia, nunca valores) para calcular el estado real. */
export type PiezaId = 'parakeet' | 'silero' | 'embedding' | 'piper' | 'ffmpeg' | 'runtime' | 'tokenServidor' | 'llaveLlm' | 'supabase';

export type Piezas = Record<PiezaId, boolean>;

export type PanelId =
  | 'transcribir'
  | 'segmentos'
  | 'comandos'
  | 'reunion'
  | 'sentimiento'
  | 'competencias'
  | 'faq'
  | 'locucion'
  | 'podcast'
  | 'picking'
  | 'celular'
  | 'puerta';

export interface Caso {
  id: number;
  slug: string;
  sala: SalaId;
  titulo: string;
  /** En lenguaje llano: que hace, para quien. */
  queEs: string;
  estadoBase: EstadoCaso;
  /** Piezas que deben estar en la maquina; si falta una, el caso cae a PUERTA con su razon. */
  requiere: PiezaId[];
  /** Solo para estadoBase 'puerta': que falta y quien lo decide. */
  razonPuerta?: string;
  pasos: string[];
  esperado: string;
  panel: PanelId;
  /** Lo que conviene saber antes de juzgar (ruido sin medir, limites de plataforma...). */
  notaHonesta?: string;
}

export interface Sala {
  id: SalaId;
  titulo: string;
  bajada: string;
}

export interface EstadoCalculado {
  estado: EstadoCaso;
  razon: string;
}

export interface Segmento {
  inicioMs: number;
  finMs: number;
  hablante: string;
  texto: string;
}

export interface MetricasTranscripcion {
  motor: string;
  segundosAudio: number;
  /** Tiempo total de la peticion, del lado del servidor. */
  ms: number;
  /** Lo que tardo el motor en si (sin carga), si se pudo leer. */
  msMotor?: number;
  hablantes?: number;
  /** Por donde paso el audio: el demonio residente o el CLI por proceso. */
  via?: 'demonio' | 'cli';
  /** Lo transcribio el motor de respaldo (segundo pase con el idioma forzado). */
  respaldo?: boolean;
}

export interface RespuestaTranscripcion extends MetricasTranscripcion {
  texto: string;
  segmentos?: Segmento[];
  /** Por que no hay texto, cuando no lo hay. */
  razon?: string;
}

export interface MetricasSintesis {
  voz: string;
  segundosAudio: number;
  msSintesis: number;
  msPrimerAudio: number;
  ms: number;
}

export type ResultadoVeredicto = 'funciono' | 'a-medias' | 'no';

/** Numeros que el panel midio en la prueba que se juzga (ms, WER...). Nunca texto. */
export type MetricasVeredicto = Record<string, number | null>;

export interface VeredictoNuevo {
  caso: number;
  resultado: ResultadoVeredicto;
  nota: string;
  estado: EstadoCaso;
  /** Quien prueba, por rol (no por nombre). */
  rol?: string;
  /** Tipo de dispositivo, deducido del navegador: PC, iPhone, Android. */
  dispositivo?: string;
  metricas?: MetricasVeredicto;
}

export interface Veredicto extends VeredictoNuevo {
  id: string;
  fecha: string;
}
