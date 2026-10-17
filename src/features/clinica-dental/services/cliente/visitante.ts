'use client';

/**
 * El visitante sin cuenta: un seudonimo AL AZAR por pestaña (sessionStorage: muere al cerrarla), nunca derivado
 * de nada suyo. Con el se cuenta el embudo visita → registro dentro del libro interno; no viaja al dataLayer.
 */
import type { CanalAdquisicion, EventoDataLayer } from '../../../../../tools/clinica-dental/dist/index.js';
import { empuja } from './datalayer';

const hex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');

function guardado(clave: string, crea: () => string): string {
  try {
    const v = sessionStorage.getItem(clave);
    if (v) return v;
    const nuevo = crea();
    sessionStorage.setItem(clave, nuevo);
    return nuevo;
  } catch {
    return crea();
  }
}

export const visitante = (): string => guardado('clinica-visitante', () => `vis_${hex(10)}`);
export const conversacionNueva = (): string => `cnv_${hex(10)}`;
export const dispositivo = (): 'escritorio' | 'celular' => (window.matchMedia('(max-width: 640px)').matches ? 'celular' : 'escritorio');

const CANALES: readonly CanalAdquisicion[] = ['busqueda', 'redes', 'referido', 'convenio', 'directo'];
/** De donde llego (`?canal=` o `utm_source`), una vez por pestaña. */
export function canal(): CanalAdquisicion {
  return guardado('clinica-canal', () => {
    const q = new URLSearchParams(location.search);
    const c = (q.get('canal') ?? q.get('utm_source') ?? '').toLowerCase();
    if ((CANALES as readonly string[]).includes(c)) return c;
    if (/google|bing/.test(c)) return 'busqueda';
    if (/facebook|instagram|tiktok/.test(c)) return 'redes';
    return 'directo';
  }) as CanalAdquisicion;
}

const contadas = new Set<string>();
/**
 * La visita cuenta UNA vez por pestaña y clínica: ni una recarga ni el doble efecto de React en desarrollo la
 * duplican (antes salía dos veces en el dataLayer y el embudo contaba visitas de más).
 */
export function primeraVisita(clinica: string): boolean {
  const clave = `clinica-visita-${clinica}`;
  if (contadas.has(clave)) return false;
  contadas.add(clave);
  try {
    if (sessionStorage.getItem(clave)) return false;
    sessionStorage.setItem(clave, '1');
  } catch {
    /* sin almacenamiento: cuenta la de esta carga */
  }
  return true;
}

export async function registraEvento(cuerpo: Record<string, unknown>): Promise<void> {
  try {
    const r = await fetch('/api/clinica-dental/eventos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...cuerpo, visitante: visitante() }) });
    if (r.ok) empuja([((await r.json()) as { dataLayer: EventoDataLayer | null }).dataLayer]);
  } catch {
    /* la analitica nunca rompe la pagina */
  }
}
