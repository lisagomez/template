'use client';

/** Lo que la pagina /historial le pide al servidor, siempre con el token de emparejamiento. Los errores, en espanol llano. */
import type { Estadisticas } from './estadisticas.ts';
import type { Formato } from './exporta.ts';
import type { Filtros, Pagina } from './tipos.ts';

const cabeceras = (token: string) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });

async function mensajeDe(r: Response, porDefecto: string): Promise<string> {
  if (r.status === 401) return 'el emparejamiento caducó: vuelve a emparejar el navegador';
  if (r.status === 503) return 'el servidor no tiene token configurado';
  try {
    return ((await r.json()) as { error?: string }).error ?? porDefecto;
  } catch {
    return porDefecto;
  }
}

async function orden<T>(token: string, cuerpo: Record<string, unknown>, porDefecto: string): Promise<T> {
  const r = await fetch('/api/historial', { method: 'POST', headers: cabeceras(token), body: JSON.stringify(cuerpo) });
  if (!r.ok) throw new Error(await mensajeDe(r, porDefecto));
  return (await r.json()) as T;
}

export const leePagina = (token: string, filtros: Filtros, desde = 0, cuantos = 100): Promise<Pagina> => orden(token, { orden: 'lee', filtros, desde, cuantos }, 'no se pudo leer el historial');

export const corrige = (token: string, id: string, texto: string): Promise<{ corregida: boolean; candidatos: string[] }> => orden(token, { orden: 'corrige', id, texto }, 'no se pudo guardar la corrección');

export const borraUno = (token: string, id: string): Promise<{ borrados: number; quedan: number }> => orden(token, { orden: 'borra-uno', id, confirmo: true }, 'no se pudo borrar');

export const borraRango = (token: string, antesDe: string): Promise<{ borrados: number; quedan: number }> => orden(token, { orden: 'borra-rango', antesDe, confirmo: true }, 'no se pudo borrar');

export const pegaEnPc = (token: string, texto: string): Promise<{ pegado: boolean }> => orden(token, { orden: 'pega', texto }, 'no se pudo pegar en la PC');

export const estadisticas = (token: string, hoy: string): Promise<Estadisticas> => orden(token, { orden: 'estadisticas', hoy }, 'no se pudieron calcular las cifras');

export async function exportaArchivo(token: string, filtros: Filtros, formato: Formato, hoy: string): Promise<{ blob: Blob; nombre: string; entradas: number }> {
  const r = await fetch('/api/historial', { method: 'POST', headers: cabeceras(token), body: JSON.stringify({ orden: 'exporta', filtros, formato, hoy }) });
  if (!r.ok) throw new Error(await mensajeDe(r, 'no se pudo exportar'));
  return { blob: await r.blob(), nombre: `historial-dictado-${hoy}.${formato}`, entradas: Number(r.headers.get('x-entradas') ?? 0) };
}

export const agregaAlDiccionario = async (token: string, terminos: string[]): Promise<void> => {
  const r = await fetch('/api/laboratorio/datos', { method: 'POST', headers: cabeceras(token), body: JSON.stringify({ orden: 'diccionario-agrega', terminos }) });
  if (!r.ok) throw new Error(await mensajeDe(r, 'no se pudo añadir al diccionario'));
};
