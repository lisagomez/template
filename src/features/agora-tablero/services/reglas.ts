/**
 * Qué puede hacer quien mira con cada campo (la PISTA para la pantalla; la base lo vuelve a decidir): directo, por
 * propuesta o nada. El dinero siempre es propuesta; asignar a un externo también; lo de un colaborador, solo lo suyo.
 */
import type { ItemTablero } from '../../../../tools/agora/dist/index.js';
import type { Categoria } from './lecturas';

export type ModoCampo = { modo: 'directo' } | { modo: 'propuesta'; porque: string } | { modo: 'no'; porque: string };

export const CAMPO_DE_COLUMNA: Record<string, string> = {
  nombre: 'nombre', estado: 'estado', responsable: 'responsable', prioridad: 'prioridad', cronograma: 'inicio', fin: 'fin', monto: 'monto_mxn', progreso: 'progreso',
  dependencia: 'dependencia', etiquetas: 'etiquetas', vinculo: 'vinculo', archivo: 'archivo', hilo: 'hilo', por_ejercer: 'formula',
};

export function modoDe(item: ItemTablero, columna: string, cat: Categoria | undefined, yo: string, externo = false): ModoCampo {
  if (columna === 'por_ejercer') return { modo: 'no', porque: 'fórmula: la calcula el libro (comprometido − ejercido)' };
  if (columna === 'hilo') return { modo: 'no', porque: 'el hilo se abre en el buzón' };
  if (!cat || cat.modo === 'lector') return { modo: 'no', porque: 'tu rol aquí es de lectura' };
  if (columna === 'monto') return { modo: 'propuesta', porque: 'el dinero nunca se cambia directo: lo aprueba quien dice la matriz (sobre el umbral, Finanzas)' };
  if (columna === 'responsable' && externo) return { modo: 'propuesta', porque: 'asignar a un socio externo pide aprobador' };
  if (cat.modo === 'editor') return { modo: 'directo' };
  const suyo = item.responsable?.tipo === 'humano' && item.responsable.id === yo;
  if (suyo && (columna === 'progreso' || columna === 'etiquetas')) return { modo: 'directo' };
  if (['cronograma', 'fin', 'responsable'].includes(columna)) return { modo: 'propuesta', porque: 'como colaboradora, lo propones y lo aprueba quien edita' };
  return { modo: 'no', porque: suyo ? 'como colaboradora solo cambias el progreso y las etiquetas de lo tuyo' : 'no es tuyo: propónlo en el hilo' };
}

export { esHabil, diasEntre as dias, sumaDias as suma } from '../../../../tools/agora/dist/fechas.js';
