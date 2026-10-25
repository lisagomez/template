'use client';

/**
 * Una sesión del centro de mando en el navegador, fuera de React: micrófono ABIERTO una sola vez
 * (escuchar es un estado lógico del bucle, no un `getUserMedia` por turno), el detector de
 * `services/detector.ts`, el oído, el bucle y el reproductor por `<audio>`.
 *
 * El detector se pide por tipo (`?detector=energia|silero|ambos` en la URL, o el de defecto). Si Silero
 * no carga (sin modelo preparado, sin WebAssembly), la sesión sigue con la energía calibrada y lo DICE
 * (`detector.motivo`): un HUD que oye peor sin avisar es el fallo que esto existe para evitar.
 *
 * El ACUSE inmediato (importado de Arbrain, `bucle-voz/src/acuse.ts`): cuando el turno va al cerebro suena primero una
 * frase fija, ya sintetizada al encender. El CIERRE de una pregunta completa por sentido (`?cierre=pregunta|vad`, para
 * comparar en la medición) es lo que deja sonar ese acuse sin esperar el silencio entero del VAD.
 */
import { capturaMicrofono, type CapturaMicrofono } from '../../../../tools/voz/dist/browser/index.js';
import type { DetectorVoz, ModeloVoz } from '../../../../tools/voz/dist/index.js';
import { creaReproductorNavegador, type ReproductorNavegador } from '../../../../tools/bucle-voz/dist/navegador/index.js';
import {
  creaAcuse,
  creaActivacion,
  creaBucle,
  creaEnrutadorLocal,
  creaOido,
  juezConPregunta,
  juezPorTexto,
  nivelDb,
  ORDENES_ES,
  type Bucle,
  type EventoDetector,
  type ModoBucle,
  type Oido,
} from '../../../../tools/bucle-voz/dist/index.js';
import { creaDetector, creaModelo, energiaCalibrada, HZ, MS_CIERRE, type EstadoDetector, type TipoDetector } from './detector.ts';
import { creaPuertos } from './puertos.ts';

export const FRASES_ACTIVACION = ['oye mando'];

/** Cómo cierra el turno una conversación: `pregunta` = una pregunta completa cierra por sentido; `vad` = el silencio entero. */
export type TipoCierre = 'pregunta' | 'vad';
export const CIERRE_POR_DEFECTO: TipoCierre = 'pregunta';
export const esTipoCierre = (v: unknown): v is TipoCierre => v === 'pregunta' || v === 'vad';

export interface Sesion {
  bucle: Bucle;
  /** El oído en curso (para la medición y la depuración). */
  readonly oido: Oido | undefined;
  readonly reproductor: ReproductorNavegador;
  /** Niveles en dBFS para pintar (micrófono y lo que suena). */
  niveles: { mic: number; salida: number };
  enciende(): Promise<void>;
  apaga(): Promise<void>;
  readonly encendida: boolean;
  /** El detector que se pidió y el que corre (y por qué, si no es el mismo). `undefined` hasta encender. */
  readonly detector: EstadoDetector | undefined;
  /** Pulsar para hablar: abre la escucha; soltar cierra el turno YA. */
  pulsa(): void;
  suelta(): void;
  destruye(): void;
}

/** Silero bajo demanda: el runtime y los pesos solo se bajan si se pide. */
const creaSilero = (): Promise<ModeloVoz> => import('./silero-navegador.ts').then((m) => m.creaSileroNavegador());

async function modeloPara(pedido: TipoDetector, maquinaHabla: () => boolean): Promise<{ modelo: ModeloVoz; estado: EstadoDetector }> {
  try {
    return { modelo: await creaModelo(pedido, creaSilero, maquinaHabla), estado: { pedido, activo: pedido } };
  } catch (e) {
    const motivo = e instanceof Error ? e.message : 'no cargó';
    return { modelo: energiaCalibrada(), estado: { pedido, activo: 'energia', motivo } };
  }
}

export function creaSesion(token: string, modo: ModoBucle, detectorPedido: TipoDetector, cierre: TipoCierre = CIERRE_POR_DEFECTO, conAcuse = true): Sesion {
  const reproductor = creaReproductorNavegador();
  const acuse = conAcuse ? creaAcuse() : undefined;
  const puertos = creaPuertos(token, () => bucle.telemetria, undefined, acuse?.frases ?? []);
  const bucle: Bucle = creaBucle({
    modo,
    ...puertos,
    reproductor,
    enrutador: creaEnrutadorLocal({ ordenes: ORDENES_ES }),
    activacion: creaActivacion({ frases: FRASES_ACTIVACION }),
    reloj: () => performance.now(),
    juezCierre: cierre === 'pregunta' ? juezConPregunta : juezPorTexto,
    ...(acuse ? { acuse } : {}),
  });
  const niveles = { mic: -120, salida: -120 };
  let captura: CapturaMicrofono | undefined;
  let detector: DetectorVoz | undefined;
  let estadoDetector: EstadoDetector | undefined;
  let encendiendo: Promise<void> | undefined;
  let oido: Oido | undefined;
  let cola: Promise<void> = Promise.resolve();
  let pulsando = false;
  let cancelaCalor: (() => void) | undefined;

  /** Al empezar y en cada cambio de minuto: la hora, la fecha y la agenda, con su primera frase ya sintetizada. */
  const calientaCadaMinuto = () => {
    void puertos.calientaLecturas();
    const id = setTimeout(calientaCadaMinuto, 60_000 - (Date.now() % 60_000) + 50);
    cancelaCalor = () => clearTimeout(id);
  };

  const encola = (f: () => Promise<void>) => {
    cola = cola.then(f).catch(() => undefined);
  };

  const alVisibilidad = () => {
    // Al volver a la pestaña los trozos llegan en ráfaga: se re-ancla el reloj (lo bueno de la fuente).
    if (document.visibilityState === 'visible') oido?.reloj.reinicia();
  };

  const sigueSalida = () => {
    niveles.salida = reproductor.nivelDb() ?? -120;
    if (captura) requestAnimationFrame(sigueSalida);
  };

  // «La máquina habla» = el turno está en su fase de hablar, HUECOS ENTRE FRASES INCLUIDOS. Con «hay un `<audio>`
  // sonando», un «para» dicho en el hueco reiniciaba la interrupción y el tramo se descartaba como eco (medido).
  const maquinaHabla = () => bucle.estado === 'hablando';

  /** Abre el micrófono con el detector pedido. Una sola vez en vuelo: dos «encender» seguidos no abren dos capturas. */
  const arranca = async () => {
    const { modelo, estado } = await modeloPara(detectorPedido, maquinaHabla);
    estadoDetector = estado;
    const d = creaDetector(modelo);
    const o = creaOido({ bucle, hz: HZ, msSilencioCierre: MS_CIERRE, maquinaHabla, atenua: (a) => reproductor.atenua(a), nivelSalidaDb: () => reproductor.nivelReferenciaEcoDb() });
    detector = d;
    oido = o;
    captura = await capturaMicrofono({
      frecuenciaHz: HZ,
      // Cancelación de eco ENCENDIDA: con el micrófono abierto mientras la máquina habla, es la primera barrera.
      restricciones: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
      alRecibir: (m) => {
        o.alimenta(m, performance.now());
        niveles.mic = nivelDb(m);
        const nivel = niveles.mic;
        encola(async () => o.procesa((await d.procesa(m)) as EventoDetector[], nivel));
      },
    });
    document.addEventListener('visibilitychange', alVisibilidad);
    requestAnimationFrame(sigueSalida);
    void puertos.sintetizador.calienta().then(calientaCadaMinuto);
  };

  return {
    bucle,
    reproductor,
    get oido() {
      return oido;
    },
    niveles,
    get encendida() {
      return captura !== undefined;
    },
    get detector() {
      return estadoDetector;
    },
    async enciende() {
      reproductor.desbloquea();
      if (captura) return;
      encendiendo ??= arranca().finally(() => {
        encendiendo = undefined;
      });
      await encendiendo;
    },
    async apaga() {
      cancelaCalor?.();
      bucle.desactiva();
      document.removeEventListener('visibilitychange', alVisibilidad);
      const c = captura;
      captura = undefined;
      await c?.detiene();
      oido?.reinicia();
      detector?.reinicia();
    },
    pulsa() {
      if (pulsando) return; // la tecla repite: un solo turno
      pulsando = true;
      reproductor.desbloquea();
      bucle.activa();
    },
    suelta() {
      if (!pulsando) return;
      pulsando = false;
      const d = detector;
      const o = oido;
      if (d && o) encola(async () => o.procesa((await d.cierra()) as EventoDetector[]));
    },
    destruye() {
      void this.apaga();
      bucle.destruye();
      reproductor.destruye();
    },
  };
}
