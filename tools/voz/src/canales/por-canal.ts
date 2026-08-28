/**
 * Hablante por canal: la diarizacion que no necesita modelos.
 *
 * Si el audio llega en pistas separadas —centralita con agente y cliente, dos auriculares,
 * una grabacion multipista— el canal YA te dice quien habla. Diarizar ahi es pagar 55 MB de
 * modelos y un monton de latencia por una respuesta que tenias en la mano y con una
 * precision que ningun modelo va a igualar.
 *
 * Esta funcion existe para que ese caso no acabe usando la maquinaria cara por inercia.
 */

import { creaDetectorVoz, type DetectorVoz } from '../vad/detector.js';
import type { EventoVoz, ModeloVoz, Muestras, OpcionesDetector, Turno } from '../types.js';

export interface OpcionesPorCanal extends Omit<OpcionesDetector, 'modelo'> {
  /** Una etiqueta por canal, en el mismo orden: `['agente', 'cliente']`. */
  etiquetas: readonly string[];
  /**
   * Un modelo por canal. Se piden N y no uno porque los modelos con estado recurrente
   * (Silero lo tiene) no se pueden compartir entre flujos: mezclarian el contexto de dos
   * personas y las decisiones de una contaminarian a la otra.
   */
  modelos: readonly ModeloVoz[];
}

export interface DetectorPorCanal {
  /** Un bloque por canal, alineados en el tiempo y del mismo tamano. */
  procesa(bloques: readonly Muestras[]): Promise<Array<{ canal: string; evento: EventoVoz }>>;
  cierra(): Promise<Array<{ canal: string; evento: EventoVoz }>>;
  reinicia(): void;
}

export function creaDetectorPorCanal(opciones: OpcionesPorCanal): DetectorPorCanal {
  const { etiquetas, modelos, ...resto } = opciones;
  if (etiquetas.length !== modelos.length) {
    throw new Error(`hacen falta tantos modelos como etiquetas: ${etiquetas.length} etiquetas, ${modelos.length} modelos`);
  }
  if (etiquetas.length === 0) throw new Error('hace falta al menos un canal');
  if (new Set(etiquetas).size !== etiquetas.length) {
    throw new Error('las etiquetas de canal deben ser distintas: con dos iguales no se sabe quien hablo');
  }

  const detectores: DetectorVoz[] = modelos.map((modelo) => creaDetectorVoz({ ...resto, modelo }));

  const etiqueta = (evento: EventoVoz, canal: string): EventoVoz => {
    if (evento.tipo !== 'finHabla') return evento;
    const turno: Turno = { ...evento.turno, hablante: canal };
    return { tipo: 'finHabla', turno };
  };

  return {
    async procesa(bloques) {
      if (bloques.length !== detectores.length) {
        throw new Error(`llegaron ${bloques.length} canales y se esperaban ${detectores.length}`);
      }
      const salida: Array<{ canal: string; evento: EventoVoz }> = [];
      for (let i = 0; i < detectores.length; i++) {
        const canal = etiquetas[i]!;
        for (const evento of await detectores[i]!.procesa(bloques[i]!)) {
          salida.push({ canal, evento: etiqueta(evento, canal) });
        }
      }
      return salida;
    },
    async cierra() {
      const salida: Array<{ canal: string; evento: EventoVoz }> = [];
      for (let i = 0; i < detectores.length; i++) {
        const canal = etiquetas[i]!;
        for (const evento of await detectores[i]!.cierra()) {
          salida.push({ canal, evento: etiqueta(evento, canal) });
        }
      }
      return salida;
    },
    reinicia() {
      for (const d of detectores) d.reinicia();
    },
  };
}
