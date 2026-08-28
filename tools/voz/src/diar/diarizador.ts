/**
 * Diarizacion por lotes: a un conjunto de turnos ya cerrados les pone hablante.
 *
 * Por lotes y no en streaming a proposito. Con todos los turnos delante, el agrupamiento ve
 * el conjunto y las etiquetas salen estables. En streaming hay que decidir con lo que se
 * lleva oido y RE-ETIQUETAR hacia atras cuando aparece evidencia nueva; es otro algoritmo y
 * otra promesa a la interfaz de usuario, y llega en el tramo 2.
 */

import { agrupa, type OpcionesAgrupar } from './agrupacion.js';
import type { ModeloHablante, Turno } from '../types.js';

export interface OpcionesDiarizador extends OpcionesAgrupar {
  modelo: ModeloHablante;
  /**
   * Turnos mas cortos que esto no se embeben: no hay senal suficiente para identificar a
   * nadie y el vector resultante es ruido que arrastra el agrupamiento. Se devuelven sin
   * hablante, que es una respuesta honesta; inventarles uno no lo es.
   */
  msMinimo?: number;
}

export interface Diarizador {
  /** Devuelve los mismos turnos con `hablante` puesto. No muta la entrada. */
  asigna(turnos: readonly Turno[]): Promise<Turno[]>;
}

export function creaDiarizador(opciones: OpcionesDiarizador): Diarizador {
  const { modelo, msMinimo = 400, ...agrupamiento } = opciones;

  return {
    async asigna(turnos: readonly Turno[]): Promise<Turno[]> {
      const utilizables: number[] = [];
      const vectores: Float32Array[] = [];

      for (let i = 0; i < turnos.length; i++) {
        const turno = turnos[i]!;
        if (!turno.audio) {
          throw new Error(
            `el turno ${i} no lleva audio: crea el detector con conservaAudio para poder diarizar`,
          );
        }
        if (turno.finMs - turno.inicioMs < msMinimo) continue;
        vectores.push(await modelo.vector(turno.audio));
        utilizables.push(i);
      }

      const etiquetas = agrupa(vectores, agrupamiento);
      const salida = turnos.map((t) => ({ ...t }));
      utilizables.forEach((indiceTurno, k) => {
        salida[indiceTurno]!.hablante = `Hablante ${etiquetas[k]! + 1}`;
      });
      return salida;
    },
  };
}
