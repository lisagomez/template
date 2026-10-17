/**
 * El detector de voz del centro de mando, en un solo sitio: lo usan el HUD (`sesion.ts`) y la medición con
 * ruido (`scripts/centro-de-mando/mide-detector.ts`), así que lo que se mide es lo que corre.
 *
 *  - `energia`: energía calibrada (los primeros 9 marcos son el suelo; voz = 9 dB por encima). Cero MB.
 *  - `silero`: Silero VAD v6.2 por ONNX. El runtime y los pesos se INYECTAN: en el navegador
 *    `onnxruntime-web`, en Node `onnxruntime-node`. Mientras la máquina habla, con la puerta de nivel encima
 *    (`conPuertaAlHablar`): sin ella, la máquina se interrumpe sola con su eco.
 *  - `ambos`: Silero decide si es VOZ y una puerta de nivel si está por encima del SUELO de la sala (el
 *    mínimo de las dos probabilidades). La puerta es la energía calibrada con otro margen
 *    (`MARGEN_PUERTA_DB`): la de 9 dB exige 15 sobre el suelo para abrir, y con ruido no abre nunca.
 *
 * Sin dependencias de navegador ni de React: corre igual en Node.
 */
import { creaDetectorVoz, modeloEnergia, type DetectorVoz, type ModeloVoz } from '../../../../tools/voz/dist/index.js';

export const HZ = 16_000;
/** Cierre por silencio del VAD: 600 ms (500 parte el 17 % de las frases, 700 el 6,7 %; README de dictado). Las órdenes seguras cierran antes por sentido. */
export const MS_CIERRE = 600;

export const TIPOS_DETECTOR = ['energia', 'silero', 'ambos'] as const;
export type TipoDetector = (typeof TIPOS_DETECTOR)[number];

export const esTipoDetector = (v: unknown): v is TipoDetector => (TIPOS_DETECTOR as readonly unknown[]).includes(v);

/** El que corre si la URL no pide otro. */
export const DETECTOR_POR_DEFECTO: TipoDetector = 'silero';

export const NOMBRE_DETECTOR: Readonly<Record<TipoDetector, string>> = { energia: 'energía calibrada', silero: 'Silero v6.2', ambos: 'Silero + energía' };

export interface EstadoDetector {
  pedido: TipoDetector;
  activo: TipoDetector;
  /** Por qué no corre el pedido (solo si `activo` ≠ `pedido`). */
  motivo?: string;
}

export const energiaCalibrada = (): ModeloVoz => modeloEnergia({ frecuenciaHz: HZ, marcosCalibracion: 9 });

/** Margen de la puerta de nivel de `ambos`, sobre el suelo calibrado. */
export const MARGEN_PUERTA_DB = 3;

export const puertaDeNivel = (margenDb = MARGEN_PUERTA_DB): ModeloVoz => modeloEnergia({ frecuenciaHz: HZ, marcosCalibracion: 9, margenDb });

/** Margen de la puerta mientras la máquina habla: voz desde 6 dB sobre el suelo (p ≥ 0,5), para no perder un «para» con ruido. */
export const MARGEN_PUERTA_AL_HABLAR_DB = 0;

/**
 * Silero, y mientras la máquina habla, el mínimo con una puerta de nivel.
 *
 * La puerta de eco de `bucle-voz` aprende cuánto eco llega solo de los marcos «con sonido», y toma la
 * probabilidad del detector como señal de sonido. Silero no lo es: sostiene p ≈ 1 en los huecos entre sílabas
 * con el micrófono en el suelo, así que la pérdida aprendida sube (28 dB con el eco a 20) y el eco pasa la
 * puerta. Medido en el HUD el 2026-10-17: 6 de 6 respuestas se interrumpieron solas con eco a −20 dB, frente a
 * 0 de 6 con la energía. La puerta de nivel quita esos marcos del suelo, pero no basta sola (5 de 6): los valles del
 * eco entre sílabas también la pasan. La otra mitad es que la pérdida suba despacio (`bucle-voz`, `interrupcion.ts`);
 * con las dos, 0 de 6 (sin esta puerta, la pérdida vuelve a subir: 26-27 dB y creciendo). Con la máquina callada no
 * cambia nada: los turnos los decide Silero solo.
 */
export function conPuertaAlHablar(silero: ModeloVoz, puerta: ModeloVoz, maquinaHabla: () => boolean): ModeloVoz {
  return {
    tamMarco: silero.tamMarco,
    frecuenciaHz: silero.frecuenciaHz,
    async probabilidad(marco) {
      const ps = await silero.probabilidad(marco);
      const pp = await puerta.probabilidad(marco);
      return maquinaHabla() ? Math.min(ps, pp) : ps;
    },
    reinicia() {
      silero.reinicia();
      puerta.reinicia();
    },
  };
}

/** Los dos modelos ven TODOS los marcos (los dos llevan estado); manda el que menos voz oye. */
export function ambos(a: ModeloVoz, b: ModeloVoz): ModeloVoz {
  if (a.tamMarco !== b.tamMarco || a.frecuenciaHz !== b.frecuenciaHz) throw new Error('los dos modelos deben usar el mismo marco y la misma frecuencia');
  return {
    tamMarco: a.tamMarco,
    frecuenciaHz: a.frecuenciaHz,
    async probabilidad(marco) {
      const pa = await a.probabilidad(marco);
      const pb = await b.probabilidad(marco);
      return Math.min(pa, pb);
    },
    reinicia() {
      a.reinicia();
      b.reinicia();
    },
  };
}

/** `maquinaHabla`: si la máquina está hablando ahora (en la medición fuera del navegador, nunca). */
export async function creaModelo(tipo: TipoDetector, creaSilero: () => Promise<ModeloVoz>, maquinaHabla: () => boolean = () => false): Promise<ModeloVoz> {
  if (tipo === 'energia') return energiaCalibrada();
  const silero = await creaSilero();
  return tipo === 'silero' ? conPuertaAlHablar(silero, puertaDeNivel(MARGEN_PUERTA_AL_HABLAR_DB), maquinaHabla) : ambos(silero, puertaDeNivel());
}

export const creaDetector = (modelo: ModeloVoz): DetectorVoz =>
  creaDetectorVoz({ modelo, msSilencioParaCerrar: MS_CIERRE, msMinimoHabla: 150, msRelleno: 200, conservaAudio: true });
