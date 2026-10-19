/**
 * Los almacenes del LABORATORIO en archivo: el del portal (una instantanea JSON, escrita entera y de forma
 * atomica tras cada cambio) y el del libro (un JSONL por clinica, solo se agrega; los sellos, aparte). Para
 * los volumenes del laboratorio basta; en produccion va la migracion propuesta.
 */
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AlmacenPortalEnMemoria, type InstantaneaPortal } from '../almacen.js';
import type { AlmacenLibro, Eslabon, Sello } from '../libro.js';
import type { ColaEntrada, ElementoCola } from '../whatsapp/receptor.js';

async function leeTexto(ruta: string): Promise<string | null> {
  try {
    return await readFile(ruta, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

export class AlmacenPortalEnArchivo extends AlmacenPortalEnMemoria {
  private readonly ruta: string;
  private cola: Promise<void> = Promise.resolve();

  private constructor(ruta: string) {
    super();
    this.ruta = ruta;
  }

  static async abre(ruta: string): Promise<AlmacenPortalEnArchivo> {
    const a = new AlmacenPortalEnArchivo(ruta);
    const texto = await leeTexto(ruta);
    if (texto) a.s = JSON.parse(texto) as InstantaneaPortal;
    return a;
  }

  protected override async cambio(): Promise<void> {
    const foto = JSON.stringify(this.s);
    this.cola = this.cola.then(async () => {
      await mkdir(dirname(this.ruta), { recursive: true });
      const tmp = `${this.ruta}.${process.pid}.tmp`;
      await writeFile(tmp, foto, { mode: 0o600 });
      await rename(tmp, this.ruta);
    });
    await this.cola;
  }
}

const lineas = <T>(texto: string | null): T[] => (texto ?? '').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as T);

/** El libro en archivo: `<dir>/<clinica>.jsonl` y `<dir>/sellos/<clinica>.jsonl`. Se lee en el ORDEN DEL ARCHIVO. */
export function libroEnArchivo(dir: string): AlmacenLibro {
  const archivo = (c: string) => join(dir, `${c}.jsonl`);
  const sellos = (c: string) => join(dir, 'sellos', `${c}.jsonl`);
  return {
    async eslabones(c) {
      return lineas<Eslabon>(await leeTexto(archivo(c)));
    },
    async agrega(e) {
      await mkdir(dir, { recursive: true });
      await appendFile(archivo(e.clinica), `${JSON.stringify(e)}\n`, { mode: 0o600 });
    },
    async sellos(c) {
      return lineas<Sello>(await leeTexto(sellos(c)));
    },
    async agregaSello(s) {
      await mkdir(join(dir, 'sellos'), { recursive: true });
      await appendFile(sellos(s.clinica), `${JSON.stringify(s)}\n`, { mode: 0o600 });
    },
  };
}

/**
 * La cola durable del webhook de WhatsApp en archivo: cada cuerpo se AGREGA a `entrada.jsonl` (y se espera a que
 * llegue al disco) ANTES de contestar 200; lo procesado se agrega a `hechos.jsonl`. Si el proceso se cae entre las
 * dos, al arrancar el elemento sigue pendiente y se procesa (una vez: el receptor es idempotente por `wamid`).
 */
export function colaEnArchivo(dir: string): ColaEntrada {
  const entrada = join(dir, 'entrada.jsonl');
  const hechos = join(dir, 'hechos.jsonl');
  let n = 0;
  return {
    async agrega(cuerpo, recibido) {
      await mkdir(dir, { recursive: true });
      const id = `${recibido.toString(36)}-${process.pid}-${++n}`;
      await appendFile(entrada, `${JSON.stringify({ id, cuerpo, recibido } satisfies ElementoCola)}\n`, { mode: 0o600 });
      return id;
    },
    async pendientes() {
      const listos = new Set(lineas<{ id: string }>(await leeTexto(hechos)).map((h) => h.id));
      return lineas<ElementoCola>(await leeTexto(entrada)).filter((e) => !listos.has(e.id));
    },
    async hecho(id) {
      await mkdir(dir, { recursive: true });
      await appendFile(hechos, `${JSON.stringify({ id })}\n`, { mode: 0o600 });
    },
  };
}
