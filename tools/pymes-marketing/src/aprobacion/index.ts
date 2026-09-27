/**
 * Aprobación con huella: se aprueba EL ARCHIVO EXACTO. La huella SHA-256 de sus bytes (SVG, PNG o
 * MP4) ata la aprobación a esa versión; si la pieza cambia, su huella cambia y la aprobación vieja se
 * REVOCA sola (nadie aprueba a ciegas algo que cambió). Aprobar NO es publicar: lo aprobado sale en un
 * CSV del mes para que el dueño lo suba él. Todo corre local (WebCrypto): aprobar no sale a la red.
 */
export type EstadoDeAprobacion = 'aprobada' | 'cambio-pedido';

export interface Aprobacion {
  readonly pieza: string;
  readonly version: number;
  readonly huella: string;
  readonly estado: EstadoDeAprobacion;
  readonly cuando: string;
  readonly nota: string | null;
  /** En video: el segundo exacto de la nota. */
  readonly segundo: number | null;
}

export async function huellaSha256(datos: string | Uint8Array): Promise<string> {
  const bytes = typeof datos === 'string' ? new TextEncoder().encode(datos) : datos;
  const copia = new Uint8Array(bytes.byteLength);
  copia.set(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copia.buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function aprueba(pieza: string, contenido: string | Uint8Array, version: number, cuando: string): Promise<Aprobacion> {
  return { pieza, version, huella: await huellaSha256(contenido), estado: 'aprobada', cuando, nota: null, segundo: null };
}

export async function pideCambio(pieza: string, contenido: string | Uint8Array, version: number, nota: string, cuando: string, segundo: number | null = null): Promise<Aprobacion> {
  const limpia = nota.trim();
  if (!limpia) throw new Error('un cambio necesita una nota que diga qué cambiar');
  return { pieza, version, huella: await huellaSha256(contenido), estado: 'cambio-pedido', cuando, nota: limpia, segundo };
}

/** ¿La aprobación sigue valiendo para el contenido de ahora? */
export async function vigencia(a: Aprobacion, contenidoActual: string | Uint8Array): Promise<'vigente' | 'revocada'> {
  return (await huellaSha256(contenidoActual)) === a.huella ? 'vigente' : 'revocada';
}

export interface FilaDelMes {
  readonly dia: string;
  readonly canal: string;
  readonly texto: string;
  readonly archivo: string;
  readonly aprobacion: Aprobacion | null;
  readonly vigente: boolean;
}

const celda = (s: string) => `"${s.replace(/"/g, '""')}"`;

/**
 * El CSV del mes con SOLO lo aprobado y vigente: fecha, hora sugerida (mediodía, siempre en el futuro
 * respecto a `hoy`), canal, texto, archivo, huella. Lo sube el dueño; nada se programa desde aquí.
 */
export function csvDelMes(filas: readonly FilaDelMes[], hoy: string, hora = '12:00'): string {
  const encabezado = ['Fecha', 'Hora', 'Canal', 'Texto', 'Archivo', 'Huella', 'Estado'].join(',');
  const lineas = filas
    .filter((f) => f.aprobacion?.estado === 'aprobada' && f.vigente && f.dia > hoy)
    .map((f) => [f.dia, hora, f.canal, celda(f.texto), f.archivo, f.aprobacion!.huella, 'aprobada: la subes tú'].join(','));
  return [encabezado, ...lineas].join('\n');
}
