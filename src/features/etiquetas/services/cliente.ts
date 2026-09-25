/**
 * Acceso a /api/etiquetas desde el navegador. El codigo del dispositivo y el nombre de quien
 * opera viven en localStorage (se emparejan una vez); todo lo demas vive en el servidor.
 */
import type { Articulo, Asignacion, Configuracion, Contadores, Existencia, Importacion, PerfilImpresora } from './nucleo.ts';
import type { AccionEtiquetas } from './esquemas.ts';

export interface EstadoCliente {
  readonly hoy: string;
  readonly version: number;
  readonly configuracion: Configuracion;
  readonly articulos: Articulo[];
  readonly impresoras: PerfilImpresora[];
  readonly existencias: Existencia[];
  readonly importaciones: Importacion[];
  readonly asignaciones: Asignacion[];
  readonly contadores: Contadores;
  readonly agenteConSecreto: boolean;
}

const CLAVE_TOKEN = 'etiquetas-token';
const CLAVE_OPERADOR = 'etiquetas-operador';

function lee(clave: string): string {
  try { return localStorage.getItem(clave) ?? ''; } catch { return ''; }
}

export function credenciales(): { token: string; operador: string } {
  return { token: lee(CLAVE_TOKEN), operador: lee(CLAVE_OPERADOR) };
}

export function empareja(token: string, operador: string): void {
  try {
    localStorage.setItem(CLAVE_TOKEN, token.trim());
    localStorage.setItem(CLAVE_OPERADOR, operador.trim());
  } catch { /* sin almacenamiento: se pedira de nuevo */ }
}

export function olvida(): void {
  try { localStorage.removeItem(CLAVE_TOKEN); } catch { /* nada */ }
}

async function pide<T>(metodo: 'GET' | 'POST', cuerpo?: AccionEtiquetas): Promise<T> {
  const { token, operador } = credenciales();
  const r = await fetch('/api/etiquetas', {
    method: metodo,
    headers: { authorization: `Bearer ${token}`, 'x-operador': encodeURIComponent(operador), ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
    cache: 'no-store',
  });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string; detalle?: string[] };
  if (!r.ok) throw new Error([j.error ?? `el servidor respondió ${r.status}`, ...(j.detalle ?? [])].join(' · '));
  return j;
}

export const leeEstadoRemoto = (): Promise<EstadoCliente> => pide<EstadoCliente>('GET');
export const accion = <T>(a: AccionEtiquetas): Promise<T> => pide<T>('POST', a);
