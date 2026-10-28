/**
 * La memoria de Ágora (la de la capa, por organización) guarda PREFERENCIAS: qué workspace y qué categoría tenías
 * abiertos y en qué vista ves el tablero. Nunca cifras ni hilos: esos viven en la base, con su RLS. La capa ya niega
 * una clave que el enchufe no declara; aquí además cada clave tiene su forma, y un monto no cabe en ninguna.
 */
import { z } from 'zod';
import type { MemoriaProducto } from '../../../../tools/capa/dist/index.js';

export const PREFERENCIAS = {
  'workspace-abierto': z.uuid(),
  'categoria-abierta': z.uuid(),
  'vista-tablero': z.enum(['tabla', 'kanban', 'gantt']),
} as const;
export type ClavePreferencia = keyof typeof PREFERENCIAS;

/** Lo que parece una cifra financiera: un número, o un texto con montos o signo de pesos. */
const pareceCifra = (v: unknown) => typeof v === 'number' || (typeof v === 'string' && /\$|\bmxn\b|\d{1,3}([,.]\d{3})+|\d+\.\d{2}\b/i.test(v));

export async function recuerdaPreferencia(memoria: MemoriaProducto, clave: string, valor: unknown): Promise<void> {
  if (pareceCifra(valor)) throw new Error('la memoria de Ágora no guarda cifras: las cifras viven en el libro');
  const esquema = PREFERENCIAS[clave as ClavePreferencia];
  if (!esquema) throw new Error(`«${clave}» no es una preferencia de Ágora`);
  await memoria.recuerda('agora', clave, esquema.parse(valor));
}

export async function preferencia<K extends ClavePreferencia>(memoria: MemoriaProducto, clave: K): Promise<z.infer<(typeof PREFERENCIAS)[K]> | null> {
  const v = await memoria.recuerdo('agora', clave);
  const r = PREFERENCIAS[clave].safeParse(v);
  return r.success ? (r.data as z.infer<(typeof PREFERENCIAS)[K]>) : null;
}
