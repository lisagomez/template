'use client';

/**
 * Una sesión del centro de mando en el navegador, fuera de React: micrófono ABIERTO una sola vez
 * (escuchar es un estado lógico del bucle, no un `getUserMedia` por turno), detector por energía
 * calibrada de `@tu-scope/voz`, el oído, el bucle y el reproductor por `<audio>`.
 *
 * Silero en el navegador sería más robusto en una sala con ruido, pero activarlo es un CDC
 * (`docs/goals/propuesta-cdc.md`): hasta entonces, energía calibrada + cancelación de eco del
 * navegador + la puerta de eco del oído.
 */
import { capturaMicrofono, type CapturaMicrofono } from '../../../../tools/voz/dist/browser/index.js';
import { creaDetectorVoz, modeloEnergia, type DetectorVoz } from '../../../../tools/voz/dist/index.js';
import { creaReproductorNavegador, type ReproductorNavegador } from '../../../../tools/bucle-voz/dist/navegador/index.js';
import {
  creaActivacion,
  creaBucle,
  creaEnrutadorLocal,
  creaOido,
  nivelDb,
  ORDENES_ES,
  type Bucle,
  type EventoDetector,
  type ModoBucle,
  type Oido,
} from '../../../../tools/bucle-voz/dist/index.js';
import { creaPuertos } from './puertos.ts';

export const HZ = 16_000;
/** Cierre por silencio del VAD: 600 ms (500 parte el 17 % de las frases, 700 el 6,7 %; README de dictado). Las órdenes seguras cierran antes por sentido. */
export const MS_CIERRE = 600;
export const FRASES_ACTIVACION = ['oye mando'];

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
  /** Pulsar para hablar: abre la escucha; soltar cierra el turno YA. */
  pulsa(): void;
  suelta(): void;
  destruye(): void;
}

export function creaSesion(token: string, modo: ModoBucle): Sesion {
  const reproductor = creaReproductorNavegador();
  const puertos = creaPuertos(token, () => bucle.telemetria);
  const bucle: Bucle = creaBucle({
    modo,
    ...puertos,
    reproductor,
    enrutador: creaEnrutadorLocal({ ordenes: ORDENES_ES }),
    activacion: creaActivacion({ frases: FRASES_ACTIVACION }),
    reloj: () => performance.now(),
  });
  const niveles = { mic: -120, salida: -120 };
  let captura: CapturaMicrofono | undefined;
  let detector: DetectorVoz | undefined;
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
    async enciende() {
      reproductor.desbloquea();
      if (captura) return;
      const d = creaDetectorVoz({ modelo: modeloEnergia({ frecuenciaHz: HZ, marcosCalibracion: 9 }), msSilencioParaCerrar: MS_CIERRE, msMinimoHabla: 150, msRelleno: 200, conservaAudio: true });
      // «La máquina habla» = el turno está en su fase de hablar, HUECOS ENTRE FRASES INCLUIDOS. Con «hay un `<audio>`
      // sonando», un «para» dicho en el hueco reiniciaba la interrupción y el tramo se descartaba como eco (medido).
      const o = creaOido({ bucle, hz: HZ, msSilencioCierre: MS_CIERRE, maquinaHabla: () => bucle.estado === 'hablando', atenua: (a) => reproductor.atenua(a), nivelSalidaDb: () => reproductor.nivelReferenciaEcoDb() });
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
