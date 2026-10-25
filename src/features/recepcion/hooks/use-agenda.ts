'use client';

/**
 * La agenda de ESTA pestaña: una sola para la ranura de plan, el lienzo y las intenciones, creada al primer uso en
 * el navegador (en el servidor nunca: allí se pinta la foto vacía y la hidratación coincide). Es el simulador de
 * tools/calendario en memoria: al recargar vuelve a la semilla sintética.
 */
import { useSyncExternalStore } from 'react';
import { creaAgenda, FOTO_VACIA, type Agenda, type Foto } from '../services/agenda.ts';

let agenda: Agenda | null = null;

export const agendaDelMostrador = (): Agenda => (agenda ??= creaAgenda());

const suscribe = (fn: () => void) => agendaDelMostrador().suscribe(fn);
const foto = (): Foto => agendaDelMostrador().foto();
const fotoDelServidor = (): Foto => FOTO_VACIA;

/** La foto de la agenda (instancias y el momento en que se leyeron); `ahora` en 0 mientras se lee. */
export function useFotoDeAgenda(): Foto {
  return useSyncExternalStore(suscribe, foto, fotoDelServidor);
}
