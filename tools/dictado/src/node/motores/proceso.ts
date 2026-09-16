/**
 * Un motor que vive en OTRO proceso y habla JSON por lineas. Es como este paquete usa
 * `faster-whisper` (Python, CTranslate2) sin que Node cargue nada de Python, y el mismo patron
 * que el extractor documental usa con Tesseract.
 *
 * Protocolo (una linea JSON por mensaje; la contabilidad vive en `hijo-por-lineas.ts`):
 *   hijo → { listo: true, motor: string }                       al arrancar
 *   padre → { id, hz, pcm16: base64, idioma?, pista? }           una transcripcion
 *   hijo → { id, texto, ms, confianza?, rssMb?, error? }
 *   padre → { id, calienta: true }                                calentar
 *   padre → { cierra: true }                                      salir
 *
 * El audio va en base64 y no por archivo: nada toca el disco, que es la regla del flujo de
 * datos (C4) — un dictado no deja rastro salvo en el historial que el humano pidio.
 */
import type { Motor, Muestras, OpcionesTranscribe, Transcripcion } from '../../types.js';
import { floatAPcm16 } from '../audio.js';
import { creaHijoPorLineas, type MensajeHijo } from '../hijo-por-lineas.js';

export interface OpcionesMotorProceso {
  id: string;
  comando: string;
  argumentos?: readonly string[];
  admitePista?: boolean;
  entorno?: Record<string, string>;
  cwd?: string;
  /** Tope por peticion; el arranque (carga del modelo) tiene su propio tope. */
  msEspera?: number;
  msEsperaArranque?: number;
}

interface Respuesta extends MensajeHijo {
  motor?: string;
  texto?: string;
  ms?: number;
  confianza?: number;
  rssMb?: number;
}

export interface MotorPorProceso extends Motor {
  /** Memoria residente del proceso hijo en la ultima respuesta, si la declaro. */
  readonly rssMb: number | undefined;
  calienta(): Promise<void>;
  cierra(): Promise<void>;
}

export function creaMotorPorProceso(opciones: OpcionesMotorProceso): MotorPorProceso {
  const hijo = creaHijoPorLineas<Respuesta>({
    nombre: opciones.id,
    comando: opciones.comando,
    argumentos: opciones.argumentos,
    entorno: opciones.entorno,
    cwd: opciones.cwd,
    msEspera: opciones.msEspera ?? 120_000,
    msEsperaArranque: opciones.msEsperaArranque ?? 300_000,
    despedida: { cierra: true },
  });
  let rssMb: number | undefined;
  const pide = async (mensaje: Record<string, unknown>): Promise<Respuesta> => {
    const r = await hijo.pide(mensaje);
    if (typeof r.rssMb === 'number') rssMb = r.rssMb;
    return r;
  };

  return {
    id: opciones.id,
    admitePista: opciones.admitePista ?? false,
    get rssMb() {
      return rssMb;
    },
    async transcribe(muestras: Muestras, frecuenciaHz: number, o?: OpcionesTranscribe): Promise<Transcripcion> {
      const t0 = performance.now();
      const r = await pide({ hz: frecuenciaHz, pcm16: floatAPcm16(muestras).toString('base64'), idioma: o?.idioma, pista: o?.pista });
      return { texto: (r.texto ?? '').trim(), ...(r.confianza !== undefined ? { confianza: r.confianza } : {}), ms: performance.now() - t0 };
    },
    async calienta() {
      await pide({ calienta: true });
    },
    cierra: () => hijo.cierra(),
  };
}
