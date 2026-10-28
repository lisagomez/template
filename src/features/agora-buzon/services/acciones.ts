'use server';

/** El hilo de la categoría abierta, para la ranura de conversación de la ventana (lo último y lo pendiente). */
import { z } from 'zod';
import { mensajesDe, propuestasDe, type Mensaje } from '../../../../tools/agora/dist/index.js';
import { conSesion } from '@/features/agora/services/datos';

export interface HiloCorto { categoria: { id: string; nombre: string }; mensajes: Mensaje[]; pendientes: number }

export async function leeHilo(categoria: string) {
  const id = z.uuid().parse(categoria);
  return conSesion(async (s): Promise<HiloCorto | null> => {
    const [c] = await s.consulta<{ id: string; nombre: string }>(`select id, nombre from agora.nodo where id = $1 and tipo = 'categoria'`, [id]);
    if (!c) return null;
    const mensajes = (await mensajesDe(s, id)).slice(-6);
    return { categoria: c, mensajes, pendientes: (await propuestasDe(s, [id])).length };
  });
}
