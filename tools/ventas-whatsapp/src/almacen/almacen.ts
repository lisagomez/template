/**
 * El almacén, INYECTADO. La frontera entre inquilinos vive aquí: la única forma de leer o escribir
 * datos de negocio es `de(inquilinoId)`, que devuelve una vista acotada a ese inquilino. No hay
 * método que liste documentos de todos.
 *
 * En el laboratorio: memoria (pruebas) o un archivo JSON (la app). En producción iría Postgres con
 * `tenant_id` y RLS: la propuesta está en `migraciones/propuesta-ventas-whatsapp.sql`, validada en
 * efímero y NO aplicada.
 */
import type { Colecciones, Inquilino, NombreColeccion } from '../modelo.js';

export interface AlmacenInquilino {
  readonly inquilinoId: string;
  lee<K extends NombreColeccion>(coleccion: K, id: string): Promise<Colecciones[K] | undefined>;
  guarda<K extends NombreColeccion>(coleccion: K, id: string, valor: Colecciones[K]): Promise<void>;
  lista<K extends NombreColeccion>(coleccion: K): Promise<Array<Colecciones[K]>>;
}

export interface Almacen {
  inquilinos(): Promise<Inquilino[]>;
  inquilino(id: string): Promise<Inquilino | undefined>;
  guardaInquilino(i: Inquilino): Promise<void>;
  /** El ruteo del webhook: `phone_number_id` → inquilino. */
  inquilinoPorTelefono(phoneNumberId: string): Promise<string | undefined>;
  inquilinosPorWaba(wabaId: string): Promise<string[]>;
  /** Vista acotada. Lanza si el inquilino no existe: nunca se crea uno por accidente. */
  de(inquilinoId: string): AlmacenInquilino;
  /** Idempotencia: `true` la primera vez que se ve la llave, `false` después. */
  primeraVez(llave: string): Promise<boolean>;
}

export interface Volcado {
  inquilinos: Record<string, Inquilino>;
  datos: Record<string, Partial<Record<NombreColeccion, Record<string, unknown>>>>;
  vistos: string[];
}

const copia = <T>(v: T): T => structuredClone(v);

/** Almacén en memoria. `alGuardar` permite persistir (el de archivo lo usa). */
export function almacenEnMemoria(inicial?: Volcado, alGuardar?: (v: Volcado) => void): Almacen & { volcado(): Volcado } {
  const inquilinos = new Map<string, Inquilino>(Object.entries(inicial?.inquilinos ?? {}));
  const datos = new Map<string, Map<NombreColeccion, Map<string, unknown>>>();
  for (const [id, cols] of Object.entries(inicial?.datos ?? {})) {
    const m = new Map<NombreColeccion, Map<string, unknown>>();
    for (const [col, docs] of Object.entries(cols ?? {})) m.set(col as NombreColeccion, new Map(Object.entries(docs ?? {})));
    datos.set(id, m);
  }
  const vistos = new Set<string>(inicial?.vistos ?? []);

  const volcado = (): Volcado => ({
    inquilinos: Object.fromEntries(inquilinos),
    datos: Object.fromEntries([...datos].map(([id, cols]) => [id, Object.fromEntries([...cols].map(([c, docs]) => [c, Object.fromEntries(docs)]))])),
    vistos: [...vistos],
  });
  const persiste = () => alGuardar?.(volcado());

  const coleccion = (inquilinoId: string, nombre: NombreColeccion) => {
    let cols = datos.get(inquilinoId);
    if (!cols) { cols = new Map(); datos.set(inquilinoId, cols); }
    let docs = cols.get(nombre);
    if (!docs) { docs = new Map(); cols.set(nombre, docs); }
    return docs;
  };

  return {
    volcado,
    async inquilinos() { return [...inquilinos.values()].map(copia); },
    async inquilino(id) { const i = inquilinos.get(id); return i ? copia(i) : undefined; },
    async guardaInquilino(i) { inquilinos.set(i.id, copia(i)); persiste(); },
    async inquilinoPorTelefono(phoneNumberId) {
      for (const i of inquilinos.values()) if (i.canal.phoneNumberId === phoneNumberId) return i.id;
      return undefined;
    },
    async inquilinosPorWaba(wabaId) { return [...inquilinos.values()].filter((i) => i.canal.wabaId === wabaId).map((i) => i.id); },
    de(inquilinoId) {
      if (!inquilinos.has(inquilinoId)) throw new Error('inquilino desconocido');
      return {
        inquilinoId,
        async lee(col, id) { const v = coleccion(inquilinoId, col).get(id); return v === undefined ? undefined : copia(v) as never; },
        async guarda(col, id, valor) { coleccion(inquilinoId, col).set(id, copia(valor)); persiste(); },
        async lista(col) { return [...coleccion(inquilinoId, col).values()].map((v) => copia(v)) as never; },
      };
    },
    async primeraVez(llave) {
      if (vistos.has(llave)) return false;
      vistos.add(llave);
      persiste();
      return true;
    },
  };
}

/**
 * La cola DURABLE del webhook. Meta recibe el 200 antes de que el agente trabaje; si el proceso se
 * cae entre el 200 y el trabajo, Meta no reintenta y el mensaje se pierde. Por eso el cuerpo crudo
 * (ya verificado) se guarda ANTES del acuse, y al arrancar se reproduce lo pendiente. La
 * idempotencia por `wamid` hace que reproducir dos veces no duplique nada.
 */
export interface ColaDurable {
  /** Síncrono: el acuse no sale sin esto. Devuelve el id del lote. */
  guarda(cuerpo: string): string;
  hecho(id: string): void;
  pendientes(): Array<{ id: string; cuerpo: string }>;
}

export function colaEnMemoria(): ColaDurable {
  const lotes = new Map<string, string>();
  let n = 0;
  return {
    guarda(cuerpo) { const id = `lote_${(++n).toString().padStart(10, '0')}`; lotes.set(id, cuerpo); return id; },
    hecho(id) { lotes.delete(id); },
    pendientes() { return [...lotes].map(([id, cuerpo]) => ({ id, cuerpo })); },
  };
}
