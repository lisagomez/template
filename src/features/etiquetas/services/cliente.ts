/**
 * Acceso a /api/etiquetas desde el navegador. El codigo del dispositivo y el nombre de quien
 * opera viven en localStorage (se emparejan una vez); todo lo demas vive en el servidor.
 */
import type { Articulo, Asignacion, CodigoAnterior, Configuracion, Consumibles, Contadores, Devolucion, Existencia, FormatoFechaArticulo, FotoArticulo, Importacion, Movimiento, PerfilImpresora } from './nucleo.ts';
import type { AccionEtiquetas } from './esquemas.ts';

export interface EstadoCliente {
  /** Lo decide el servidor por el codigo del dispositivo. `conteo` y `almacenista` no reciben cantidades. */
  readonly rol: 'operacion' | 'recibo' | 'almacenista' | 'conteo';
  readonly hoy: string;
  readonly version: number;
  readonly configuracion: Configuracion;
  readonly articulos: Articulo[];
  readonly impresoras: PerfilImpresora[];
  readonly existencias: Existencia[];
  readonly movimientos: Movimiento[];
  readonly importaciones: Importacion[];
  readonly asignaciones: Asignacion[];
  readonly contadores: Contadores;
  readonly agenteConSecreto: boolean;
  readonly consumibles: Consumibles;
  readonly devoluciones: Devolucion[];
  /** Las fotos VIGENTES de cada articulo (una por vista) y su formato de fecha aprendido. */
  readonly fotos: FotoArticulo[];
  readonly formatosFecha: FormatoFechaArticulo[];
  /** Los GTIN que un articulo tuvo y ya no tiene: se siguen leyendo como el. */
  readonly codigosAnteriores: CodigoAnterior[];
  /** Recepciones con la caducidad por confirmar (sin cantidades para un dispositivo de conteo). */
  readonly revisiones: { sitio: string; folio: string; sku: string; cajas: number; desde: string; revision: string }[];
  /** El motor local de lectura de fechas, o null si no esta instalado. */
  readonly motor: string | null;
  /** Solo al almacenista: los lotes con su ubicacion, SIN cantidades (sus existencias vienen vacias). */
  readonly lotes?: { sitio: string; sku: string; gtin: string; lote: string; caducidad: string; zona: string; posicion?: string }[];
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

export interface FotoSubida {
  readonly huella: string;
  readonly miniatura: string;
  readonly ancho: number;
  readonly alto: number;
  readonly exifQuitado: boolean;
  readonly gpsQuitado: boolean;
}

/**
 * Sube una foto (los bytes tal cual; el servidor la normaliza y le quita EXIF y GPS). En el anden
 * la señal es mala: reintenta con espera creciente y avisa cada intento, para que la persona vea
 * que sigue pendiente de subir y no la vuelva a tomar.
 */
export async function subeFoto(foto: Blob, alIntentar?: (intento: number, error?: string) => void, intentos = 4): Promise<FotoSubida> {
  const { token, operador } = credenciales();
  let ultimo = '';
  for (let i = 1; i <= intentos; i++) {
    alIntentar?.(i, ultimo || undefined);
    try {
      const r = await fetch('/api/etiquetas/fotos', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-operador': encodeURIComponent(operador), 'content-type': foto.type || 'application/octet-stream' }, body: foto });
      const j = (await r.json().catch(() => ({}))) as FotoSubida & { error?: string };
      if (r.ok) return j;
      if (r.status < 500) throw Object.assign(new Error(j.error ?? `el servidor respondió ${r.status}`), { definitivo: true });
      ultimo = j.error ?? `el servidor respondió ${r.status}`;
    } catch (e) {
      if ((e as { definitivo?: boolean }).definitivo) throw e;
      ultimo = e instanceof Error ? e.message : String(e);
    }
    if (i < intentos) await new Promise((ok) => setTimeout(ok, 800 * 2 ** (i - 1)));
  }
  throw new Error(`no se pudo subir la foto tras ${intentos} intentos (${ultimo}): revisa la señal y vuelve a intentarlo; la foto sigue en este equipo`);
}

const cacheFotos = new Map<string, Promise<string>>();

/** URL local (blob) de una foto guardada: se pide con el codigo del dispositivo, una vez por huella. */
export function urlDeFoto(huella: string): Promise<string> {
  const previo = cacheFotos.get(huella);
  if (previo) return previo;
  const { token, operador } = credenciales();
  const p = fetch(`/api/etiquetas/fotos/${encodeURIComponent(huella)}`, { headers: { authorization: `Bearer ${token}`, 'x-operador': encodeURIComponent(operador) } })
    .then((r) => { if (!r.ok) throw new Error(`foto ${r.status}`); return r.blob(); })
    .then((b) => URL.createObjectURL(b));
  p.catch(() => cacheFotos.delete(huella));
  cacheFotos.set(huella, p);
  return p;
}
