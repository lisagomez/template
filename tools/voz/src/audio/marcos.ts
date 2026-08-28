/**
 * Trocear el flujo en marcos del tamano exacto que pide el modelo, y guardar los ultimos
 * milisegundos de audio para poder mirar hacia atras cuando el habla ya empezo.
 */

import type { Muestras } from '../types.js';

/**
 * Acumula audio de cualquier tamano y lo suelta en marcos fijos.
 *
 * El navegador entrega bloques de 128 muestras y Silero quiere 512: sin este intermediario,
 * el consumidor tendria que hacer esta contabilidad a mano en cada proyecto, que es
 * exactamente el trozo que se copia y se pega mal.
 */
export function creaTroceador(tamMarco: number) {
  let resto = new Float32Array(0);
  return {
    /** Devuelve los marcos completos que hayan salido; guarda lo que sobra. */
    empuja(entrada: Muestras): Muestras[] {
      const buf = new Float32Array(resto.length + entrada.length);
      buf.set(resto, 0);
      buf.set(entrada, resto.length);
      const marcos: Muestras[] = [];
      let i = 0;
      for (; i + tamMarco <= buf.length; i += tamMarco) marcos.push(buf.subarray(i, i + tamMarco));
      resto = buf.slice(i);
      return marcos;
    },
    /** El ultimo marco incompleto, rellenado con silencio. Para cerrar el flujo. */
    vacia(): Muestras | null {
      if (resto.length === 0) return null;
      const ultimo = new Float32Array(tamMarco);
      ultimo.set(resto, 0);
      resto = new Float32Array(0);
      return ultimo;
    },
    reinicia() {
      resto = new Float32Array(0);
    },
  };
}

/**
 * Buffer circular de los ultimos N muestras.
 *
 * Existe por una sola razon: cuando el modelo dice "aqui hay voz" el hablante ya lleva uno
 * o dos marcos hablando. Sin este historial el turno empieza cortado — se pierde la primera
 * consonante, que es justo la que un transcriptor necesita para acertar la palabra.
 */
export function creaRelleno(capacidad: number) {
  const buf = new Float32Array(capacidad);
  let escritos = 0;
  let fin = 0;
  return {
    escribe(marco: Muestras) {
      for (let i = 0; i < marco.length; i++) {
        buf[fin] = marco[i]!;
        fin = (fin + 1) % capacidad;
      }
      escritos = Math.min(escritos + marco.length, capacidad);
    },
    /** Lo guardado, en orden cronologico. */
    lee(): Muestras {
      const salida = new Float32Array(escritos);
      const inicio = (fin - escritos + capacidad) % capacidad;
      for (let i = 0; i < escritos; i++) salida[i] = buf[(inicio + i) % capacidad]!;
      return salida;
    },
    reinicia() {
      escritos = 0;
      fin = 0;
    },
  };
}

/** Une trozos en un solo Float32Array. */
export function concatena(trozos: readonly Muestras[]): Muestras {
  let total = 0;
  for (const t of trozos) total += t.length;
  const salida = new Float32Array(total);
  let off = 0;
  for (const t of trozos) {
    salida.set(t, off);
    off += t.length;
  }
  return salida;
}
