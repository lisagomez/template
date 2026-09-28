/**
 * La cola SIN SEÑAL del escaneo (andén y piso). Un escaneo que no llega al servidor se guarda en
 * IndexedDB con su `idCliente` y el contexto de zona de ESE momento; al volver la señal se manda
 * en el orden en que se escaneó. El servidor es la frontera: decide cada uno contra el estado de
 * ese momento, rechaza lo que ya no aplique (y se dice), y por el `idCliente` no aplica dos veces
 * el mismo escaneo si la respuesta se perdió en el camino.
 *
 * Solo se encolan escaneos. Una foto no: pesa, y la recepción con foto ya reintenta la subida.
 */
import type { AccionEtiquetas } from './esquemas.ts';

type Escaneo = Extract<AccionEtiquetas, { accion: 'escanea' }>;
export interface Encolado { readonly idCliente: string; readonly accion: Escaneo; readonly creado: string }
export interface Sincronizado { readonly idCliente: string; readonly accion: Escaneo; readonly respuesta?: unknown; readonly rechazo?: string }

const BD = 'etiquetas-cola';
const ALMACEN = 'escaneos';

function abre(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(BD, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(ALMACEN, { keyPath: 'idCliente' }); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}

async function en<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const bd = await abre();
  try {
    return await new Promise<T>((ok, mal) => {
      const r = fn(bd.transaction(ALMACEN, modo).objectStore(ALMACEN));
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    });
  } finally { bd.close(); }
}

/** Un identificador por escaneo, generado en el equipo (sirve de llave de idempotencia). */
export function nuevoIdCliente(): string {
  return `esc-${crypto.randomUUID().replace(/-/g, '')}`;
}

export const encola = (accion: Escaneo): Promise<IDBValidKey> => en('readwrite', (s) => s.put({ idCliente: accion.idCliente, accion, creado: new Date().toISOString() } satisfies Encolado));
export const pendientes = async (): Promise<Encolado[]> => (await en<Encolado[]>('readonly', (s) => s.getAll())).sort((a, b) => a.creado.localeCompare(b.creado));
const quita = (id: string) => en('readwrite', (s) => s.delete(id));

/** Un fallo de red (fetch rechaza con TypeError) o el navegador sin conexion: se encola. */
export function esSinSenal(e: unknown): boolean {
  return e instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false);
}

/**
 * Manda lo encolado en orden. Si se va la señal a medias, lo que falta se queda para la siguiente
 * vez; si el servidor RECHAZA uno (403, 400), se quita de la cola y se informa: no se reintenta
 * algo que el servidor ya dijo que no.
 */
export async function sincroniza(envia: (a: Escaneo) => Promise<unknown>): Promise<{ hechos: Sincronizado[]; quedan: number }> {
  const hechos: Sincronizado[] = [];
  const cola = await pendientes();
  for (const [i, x] of cola.entries()) {
    try {
      hechos.push({ idCliente: x.idCliente, accion: x.accion, respuesta: await envia(x.accion) });
    } catch (e) {
      if (esSinSenal(e)) return { hechos, quedan: cola.length - i };
      hechos.push({ idCliente: x.idCliente, accion: x.accion, rechazo: e instanceof Error ? e.message : String(e) });
    }
    await quita(x.idCliente);
  }
  return { hechos, quedan: 0 };
}
