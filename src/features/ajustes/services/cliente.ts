'use client';

/** Lo que la pagina /ajustes le pide al servidor, siempre con el token de emparejamiento. Los errores, en espanol llano. */
import type { EstadoAjustes, Valor } from './tipos.ts';

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

export async function leeEstado(token: string): Promise<EstadoAjustes> {
  const r = await fetch('/api/ajustes', { headers: cabeceras(token) });
  if (!r.ok) throw new Error(await mensajeDe(r, 'no se pudieron leer los ajustes'));
  return (await r.json()) as EstadoAjustes;
}

async function orden(token: string, cuerpo: Record<string, unknown>, porDefecto: string): Promise<{ ok: true; valor?: Valor; estado: EstadoAjustes }> {
  const r = await fetch('/api/ajustes', { method: 'POST', headers: cabeceras(token), body: JSON.stringify(cuerpo) });
  if (!r.ok) throw new Error(await mensajeDe(r, porDefecto));
  return (await r.json()) as { ok: true; valor?: Valor; estado: EstadoAjustes };
}

export const pon = (token: string, clave: string, valor: Valor) => orden(token, { orden: 'pon', clave, valor }, 'no se pudo guardar');
export const quita = (token: string, clave: string) => orden(token, { orden: 'quita', clave }, 'no se pudo volver al defecto');
export const restablece = (token: string) => orden(token, { orden: 'restablece', confirmo: true }, 'no se pudo restablecer');
