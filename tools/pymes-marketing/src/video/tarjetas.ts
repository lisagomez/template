/**
 * Tarjetas animadas (propuesta de video §1, herramienta 2; respuestas 1, 10 y 13 firmadas): la versión
 * video de una pieza de temporada, hecha por código con la marca del cliente y SIN personas. Solo las
 * temporadas que firmó el laboratorio; el precio entra solo si el dueño lo confirmó. Sin GSAP.
 */
import type { PerfilDeMarca } from '../marca/index.js';
import { escenaDePromo, type Escena } from './escena.js';

export const TEMPORADAS_FIRMADAS = [
  { id: 'dia-de-las-madres', nombre: 'Día de las Madres', cuando: '10 de mayo' },
  { id: 'regreso-a-clases', nombre: 'Regreso a clases', cuando: 'agosto' },
  { id: 'dia-de-muertos', nombre: 'Día de Muertos', cuando: '1 y 2 de noviembre' },
  { id: 'buen-fin', nombre: 'Buen Fin', cuando: 'noviembre (fecha aproximada)' },
  { id: 'quincena', nombre: 'Quincena', cuando: 'el 15 y fin de mes' },
  { id: 'navidad', nombre: 'Navidad', cuando: '24 y 25 de diciembre' },
  { id: 'reyes', nombre: 'Día de Reyes', cuando: '6 de enero' },
] as const;
export type IdDeTemporada = (typeof TEMPORADAS_FIRMADAS)[number]['id'];

export interface PiezaDeTemporada { temporada: string; titular: string; apoyo?: string; precio?: { texto: string; confirmado: boolean } }

/** La escena de la tarjeta, o por qué no se hace. */
export function tarjetaDeTemporada(marca: PerfilDeMarca, p: PiezaDeTemporada): { escena: Escena } | { falta: string } {
  const t = TEMPORADAS_FIRMADAS.find((x) => x.id === p.temporada);
  if (!t) return { falta: `«${p.temporada}» no es una temporada firmada (${TEMPORADAS_FIRMADAS.map((x) => x.nombre).join(', ')})` };
  if (!p.titular.trim()) return { falta: 'la tarjeta necesita un titular' };
  const precio = p.precio?.confirmado ? p.precio.texto : undefined;
  return { escena: escenaDePromo(marca, { titular: p.titular, etiqueta: t.nombre.toUpperCase(), ...(p.apoyo ? { apoyo: p.apoyo } : {}), ...(precio ? { precio } : {}), semilla: `${t.id}:${p.titular}` }) };
}
