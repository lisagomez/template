/**
 * «¿Qué tengo hoy?» por la herramienta de calendario del repo, SOLO LECTURA: el `Lector` sobre un
 * espejo en archivo (sin red y sin Google). En el laboratorio el espejo trae datos sintéticos
 * (`scripts/centro-de-mando/siembra-agenda.ts`). Nunca se usa la pluma: aquí no se escribe.
 */
import { access } from 'node:fs/promises';
import { Lector, type Instancia } from '../../../../../tools/calendario/dist/index.js';
import { AlmacenEnArchivo } from '../../../../../tools/calendario/dist/almacenes/archivo.js';
import { numeroEnPalabras, partesDe } from '../../../../../tools/bucle-voz/dist/index.js';
import { ESPEJO_AGENDA, REF_AGENDA, ZONA } from './datos';

const DIA_MS = 86_400_000;

/** «a las nueve», «a las doce y media», «a la una y cuarto». */
export function aLaHora(ms: number, zona: string): string {
  const { hora, minuto } = partesDe(new Date(ms), zona);
  const h12 = hora % 12 === 0 ? 12 : hora % 12;
  const base = h12 === 1 ? 'a la una' : `a las ${numeroEnPalabras(h12)}`;
  if (minuto === 0) return base;
  if (minuto === 15) return `${base} y cuarto`;
  if (minuto === 30) return `${base} y media`;
  return `${base} y ${numeroEnPalabras(minuto)}`;
}

/** Inicio del día local (a la precisión del minuto) en la zona dada. */
function inicioDelDia(ahora: number, zona: string): number {
  const { hora, minuto } = partesDe(new Date(ahora), zona);
  return ahora - ahora % 60_000 - (hora * 60 + minuto) * 60_000;
}

export function frasesDeAgenda(instancias: readonly Instancia[], cuando: 'hoy' | 'mañana', zona: string): string {
  const ordenadas = [...instancias].sort((a, b) => a.inicioMs - b.inicioMs);
  if (ordenadas.length === 0) return cuando === 'hoy' ? 'Hoy no tienes nada en la agenda.' : 'Mañana no tienes nada en la agenda.';
  const cuantos = ordenadas.length === 1 ? 'un pendiente' : `${numeroEnPalabras(ordenadas.length)} pendientes`;
  const partes = ordenadas.slice(0, 6).map((i) => `${aLaHora(i.inicioMs, zona)}, ${i.titulo}`);
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join('; ')}; y ${partes.at(-1)}` : (partes[0] ?? '');
  const extra = ordenadas.length > 6 ? ` Y ${numeroEnPalabras(ordenadas.length - 6)} más.` : '';
  return `${cuando === 'hoy' ? 'Hoy' : 'Mañana'} tienes ${cuantos}: ${lista}.${extra}`;
}

export async function leeAgenda(cuando: 'hoy' | 'mañana', ahora = Date.now()): Promise<string> {
  try {
    await access(/*turbopackIgnore: true*/ ESPEJO_AGENDA);
  } catch {
    return 'No tengo una agenda conectada en este laboratorio.';
  }
  const lector = new Lector({ almacen: await AlmacenEnArchivo.abre(ESPEJO_AGENDA) });
  const desde = inicioDelDia(ahora, ZONA) + (cuando === 'mañana' ? DIA_MS : 0);
  const { instancias, salud } = await lector.consulta({ calendarios: [{ ...REF_AGENDA }], desde, hasta: desde + DIA_MS, zona: ZONA });
  const aviso = salud.estado === 'fresco' ? '' : 'Ojo: la agenda no está al día. ';
  return `${aviso}${frasesDeAgenda(instancias, cuando, ZONA)}`;
}
