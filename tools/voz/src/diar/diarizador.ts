/**
 * Diarizacion por lotes: a un conjunto de turnos ya cerrados les pone hablante.
 *
 * Por lotes y no en streaming a proposito. Con todos los turnos delante, el agrupamiento ve
 * el conjunto y las etiquetas salen estables. En streaming hay que decidir con lo que se
 * lleva oido y RE-ETIQUETAR hacia atras cuando aparece evidencia nueva; es otro algoritmo y
 * otra promesa a la interfaz de usuario, y vive en `./streaming.js`.
 */

import { agrupa, type OpcionesAgrupar } from './agrupacion.js';
import type { RegistroHablantes } from './registro.js';
import type { ModeloHablante, Turno } from '../types.js';

export interface OpcionesDiarizador extends OpcionesAgrupar {
  modelo: ModeloHablante;
  /**
   * Turnos mas cortos que esto no se embeben: no hay senal suficiente para identificar a
   * nadie y el vector resultante es ruido que arrastra el agrupamiento. Se devuelven sin
   * hablante, que es una respuesta honesta; inventarles uno no lo es.
   */
  msMinimo?: number;
  /**
   * Voces conocidas. Con registro, los grupos que se reconocen salen con su nombre y el
   * resto sigue siendo anonimo. Sin registro, todo es anonimo, que es como funcionaba antes.
   *
   * El registro se consulta DESPUES de agrupar, nunca antes. Agrupar es la pregunta barata y
   * fiable —"¿estos turnos son la misma voz?"— y responderla con todo el audio delante da
   * grupos mejores que los que daria ir turno a turno preguntandole al registro. Ponerle
   * nombre a un grupo entero es, ademas, mas robusto: se decide sobre el centroide de todos
   * sus turnos y no sobre un turno suelto que pudo salir ronco.
   */
  registro?: RegistroHablantes;
}

export interface Diarizador {
  /** Devuelve los mismos turnos con `hablante` puesto. No muta la entrada. */
  asigna(turnos: readonly Turno[]): Promise<Turno[]>;
}

/** Centroide de un grupo: la media de sus vectores, normalizada. */
function centroideDe(vectores: readonly Float32Array[], miembros: readonly number[]): Float32Array {
  const suma = new Float64Array(vectores[miembros[0]!]!.length);
  for (const i of miembros) {
    const v = vectores[i]!;
    for (let k = 0; k < v.length; k++) suma[k] = suma[k]! + v[k]!;
  }
  let norma = 0;
  for (let k = 0; k < suma.length; k++) norma += suma[k]! * suma[k]!;
  norma = Math.sqrt(norma) || 1;
  const centroide = new Float32Array(suma.length);
  for (let k = 0; k < suma.length; k++) centroide[k] = suma[k]! / norma;
  return centroide;
}

/**
 * Etiqueta de cada grupo: el nombre del registro si lo reconoce, y si no, su numero.
 *
 * Los numeros NO se renumeran cuando un grupo se lleva un nombre. "Hablante 2" sigue
 * queriendo decir "la segunda persona que hablo": si Ana fue la primera, el siguiente
 * anonimo es el 2 y no el 1. El hueco es informacion —dice que hubo alguien antes— y
 * taparlo haria que dos actas del mismo audio, una con registro y otra sin el, numerasen
 * distinto a las mismas personas.
 */
function etiquetaGrupos(
  vectores: readonly Float32Array[],
  etiquetas: readonly number[],
  registro: RegistroHablantes | undefined,
): string[] {
  const total = etiquetas.length === 0 ? 0 : Math.max(...etiquetas) + 1;
  const nombres = new Array<string | null>(total).fill(null);

  if (registro) {
    const miembros: number[][] = Array.from({ length: total }, () => []);
    etiquetas.forEach((g, i) => miembros[g]!.push(i));

    const candidatos = miembros.map((m, g) => ({ g, voz: registro.identifica(centroideDe(vectores, m)) }));
    // Un nombre identifica a UNA persona: si dos grupos lo reclaman, el registro se esta
    // equivocando en uno de los dos. Se lo queda el mas cercano y el otro vuelve a anonimo,
    // porque repartir el mismo nombre entre dos filas del acta es peor que no ponerlo.
    const duenos = new Map<string, { g: number; distancia: number }>();
    for (const { g, voz } of candidatos) {
      if (!voz) continue;
      const previo = duenos.get(voz.nombre);
      if (!previo || voz.distancia < previo.distancia) duenos.set(voz.nombre, { g, distancia: voz.distancia });
    }
    for (const [nombre, { g }] of duenos) nombres[g] = nombre;
  }

  return nombres.map((nombre, g) => nombre ?? `Hablante ${g + 1}`);
}

export function creaDiarizador(opciones: OpcionesDiarizador): Diarizador {
  const { modelo, msMinimo = 400, registro, ...agrupamiento } = opciones;

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
      const nombres = etiquetaGrupos(vectores, etiquetas, registro);
      const salida = turnos.map((t) => ({ ...t }));
      utilizables.forEach((indiceTurno, k) => {
        salida[indiceTurno]!.hablante = nombres[etiquetas[k]!]!;
      });
      return salida;
    },
  };
}
