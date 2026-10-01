/** Las acciones del panel, validadas con Zod antes de tocar nada. */
import { z } from 'zod';

const canal = z.object({
  wabaId: z.string().min(1).max(64), phoneNumberId: z.string().min(1).max(64), telefonoVisible: z.string().regex(/^\d{8,15}$/),
  datasetId: z.string().min(1).max(64), catalogoId: z.string().min(1).max(64),
  flows: z.object({ entrega: z.string().optional(), reserva: z.string().optional(), lead: z.string().optional(), checkout: z.string().optional() }),
});

export const esquemaAccion = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('tomar'), casoId: z.string().min(1).max(80) }),
  z.object({ accion: z.literal('responder'), conversacionId: z.string().min(1).max(80), texto: z.string().trim().min(1).max(1000) }),
  z.object({ accion: z.literal('liberar'), casoId: z.string().min(1).max(80) }),
  z.object({ accion: z.literal('liberarPausa'), conversacionId: z.string().min(1).max(80) }),
  z.object({ accion: z.literal('catalogo'), csv: z.string().min(10).max(200_000) }),
  z.object({ accion: z.literal('qr'), etiqueta: z.string().regex(/^[A-Z0-9-]{2,20}$/), mensaje: z.string().min(1).max(100) }),
  z.object({ accion: z.literal('gasto'), campanaId: z.string().min(1).max(64), nombre: z.string().min(1).max(80), gastoCentavos: z.number().int().nonnegative(), anuncios: z.array(z.string().max(64)).max(50) }),
  z.object({ accion: z.literal('conciliar') }),
  z.object({ accion: z.literal('reintentar') }),
  /** Ancla la cadena de hashes del inquilino (raíz de Merkle firmada, guardada fuera de su almacén). */
  z.object({ accion: z.literal('anclar') }),
  /** Solo en el laboratorio: da de alta la pyme ficticia de este token con su canal. */
  z.object({ accion: z.literal('semilla'), pyme: z.enum(['restaurante', 'tienda']), canal }),
]);

export type AccionPanel = z.infer<typeof esquemaAccion>;
