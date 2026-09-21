/**
 * La maquina de estados de la PILDORA flotante (lo que se ve en Windows), pura y con el reloj
 * inyectado: recibe los estados del dictado y los avisos de un momento (texto pegado, sin voz,
 * fallo) y dice que hay que pintar. Los avisos se cierran solos: «hecho» a los 800 ms y «error» a
 * los 1200 ms (los tiempos de la pildora de sflow), y al cerrarse vuelve a lo que el dictado
 * este haciendo en ese momento, no a lo que hacia cuando empezo el aviso.
 *
 * Vive aqui y no en PowerShell para poder probarla sin Windows; el script solo pinta la palabra
 * que recibe (`pildora <visual>`).
 */
import type { Estado } from '../dictado.js';

export type Visual = 'idle' | 'escuchando' | 'procesando' | 'hecho' | 'error';

export type EntradaPildora = { tipo: 'estado'; estado: Estado } | { tipo: 'hecho' } | { tipo: 'error' } | { tipo: 'tick' };

export interface OpcionesPildora {
  msHecho?: number;
  msError?: number;
}

export interface Pildora {
  readonly visual: Visual;
  /** Aplica una entrada en el instante `ahoraMs`; devuelve el visual nuevo si cambio. */
  aplica(entrada: EntradaPildora, ahoraMs: number): Visual | undefined;
  /** Milisegundos hasta que un aviso se cierre solo (para programar el siguiente tick), o nada. */
  vence(ahoraMs: number): number | undefined;
}

export const DEFECTOS_PILDORA = { msHecho: 800, msError: 1200 };

const visualDe = (estado: Estado): Visual => (estado === 'escuchando' ? 'escuchando' : estado === 'inactivo' ? 'idle' : 'procesando');

export function creaPildora(opciones: OpcionesPildora = {}): Pildora {
  const msHecho = opciones.msHecho ?? DEFECTOS_PILDORA.msHecho;
  const msError = opciones.msError ?? DEFECTOS_PILDORA.msError;
  let estado: Estado = 'inactivo';
  let visual: Visual = 'idle';
  /** Instante en que el aviso vigente se cierra solo; nada si no hay aviso. */
  let hasta: number | undefined;

  const recalcula = (ahoraMs: number): Visual | undefined => {
    if (hasta !== undefined && ahoraMs < hasta) return undefined;
    hasta = undefined;
    const nuevo = visualDe(estado);
    if (nuevo === visual) return undefined;
    visual = nuevo;
    return visual;
  };

  return {
    get visual() {
      return visual;
    },
    aplica(entrada, ahoraMs) {
      if (entrada.tipo === 'estado') {
        estado = entrada.estado;
        return recalcula(ahoraMs);
      }
      if (entrada.tipo === 'hecho' || entrada.tipo === 'error') {
        const nuevo: Visual = entrada.tipo;
        hasta = ahoraMs + (entrada.tipo === 'hecho' ? msHecho : msError);
        if (nuevo === visual) return undefined;
        visual = nuevo;
        return visual;
      }
      return recalcula(ahoraMs);
    },
    vence(ahoraMs) {
      return hasta === undefined ? undefined : Math.max(0, hasta - ahoraMs);
    },
  };
}
