/**
 * El microfono de una sesion de `dictar`: se abre y se cierra con el estado (en espera no hay
 * microfono abierto, salvo `--mic-en-espera abierto` o entrada por archivo). Mientras habla el
 * agente NO se cierra: se cierra la puerta logica (medicion B del PRP-003). Si la captura muere POR SU CUENTA (ffmpeg termino sin que lo pidieramos), la
 * sesion tiene que enterarse y apagarse: seguir «escuchando» seria mentir (vivido el 2026-09-19).
 * Un cierre pedido por nosotros no cuenta como muerte.
 */
import { capturaMicrofono, type Captura } from './audio.js';

export interface OpcionesMicrofonoSesion {
  frecuenciaHz: number;
  /** `--entrada <audio>`: el archivo hace de microfono, a tiempo real. */
  entrada?: string;
  alRecibir: (muestras: Float32Array, msDesdeApertura: () => number, primera: { valor: boolean }) => void;
  log?: (linea: string) => void;
}

export interface MicrofonoSesion {
  readonly abierto: boolean;
  abre(): void;
  cierra(motivo?: string): void;
  /** Resuelve cuando la captura termina por su cuenta; con el error si murio. Nunca por `cierra`. */
  readonly finDeCaptura: Promise<Error | undefined>;
  /** Al salir: cierra y da la captura por terminada, sin error. */
  suelta(): void;
}

export function creaMicrofonoDeSesion(o: OpcionesMicrofonoSesion): MicrofonoSesion {
  const log = o.log ?? ((l: string) => console.log(l));
  let captura: Captura | undefined;
  let cierrePedido = false;
  let resolverFin: (e?: Error) => void = () => undefined;
  const finDeCaptura = new Promise<Error | undefined>((r) => (resolverFin = r));
  const cierra = (motivo = 'en espera no se captura nada') => {
    if (!captura) return;
    cierrePedido = true;
    captura.detiene();
    log(`microfono cerrado (${motivo})`);
  };
  return {
    get abierto() {
      return captura !== undefined;
    },
    abre() {
      if (captura) return;
      cierrePedido = false;
      const desde = performance.now();
      const primera = { valor: true };
      const c = capturaMicrofono({
        frecuenciaHz: o.frecuenciaHz,
        gananciaDb: 0, // la ganancia se aplica en la sesion (cambia en caliente), no en la captura
        ...(o.entrada ? { entrada: o.entrada } : {}),
        alRecibir: (m) => o.alRecibir(m, () => performance.now() - desde, primera),
        alError: (e) => console.error(`ffmpeg: ${e}`),
      });
      captura = c;
      c.terminada.then(
        () => { if (captura === c) captura = undefined; if (!cierrePedido) resolverFin(undefined); },
        (e: Error) => { if (captura === c) captura = undefined; if (!cierrePedido) resolverFin(e); },
      );
    },
    cierra,
    finDeCaptura,
    suelta() {
      cierrePedido = true;
      captura?.detiene();
      resolverFin(undefined);
    },
  };
}
