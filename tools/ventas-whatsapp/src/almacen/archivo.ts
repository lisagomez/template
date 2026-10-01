/**
 * Almacén en un archivo JSON, para la app del laboratorio (`.datos/ventas-whatsapp/`). Escribe con
 * reemplazo atómico (archivo temporal + rename) para no dejar un JSON a medias.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { almacenEnMemoria, type Almacen, type ColaDurable, type Volcado } from './almacen.js';
import type { AlmacenAnclas, Ancla } from '../trazabilidad/cadena.js';

export function almacenArchivo(ruta: string): Almacen & { volcado(): Volcado } {
  let inicial: Volcado | undefined;
  if (existsSync(ruta)) inicial = JSON.parse(readFileSync(ruta, 'utf8')) as Volcado;
  mkdirSync(dirname(ruta), { recursive: true });
  return almacenEnMemoria(inicial, (v) => {
    const tmp = `${ruta}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(v));
    renameSync(tmp, ruta);
  });
}

/** La cola durable en una carpeta: un archivo por lote, escrito antes del 200 y borrado al procesarlo. */
export function colaEnArchivo(carpeta: string): ColaDurable {
  mkdirSync(carpeta, { recursive: true });
  let n = 0;
  return {
    guarda(cuerpo) {
      const id = `${Date.now().toString().padStart(15, '0')}-${process.pid}-${(++n).toString().padStart(8, '0')}`;
      const tmp = join(carpeta, `${id}.tmp`);
      writeFileSync(tmp, cuerpo);
      renameSync(tmp, join(carpeta, `${id}.json`));
      return id;
    },
    hecho(id) { try { unlinkSync(join(carpeta, `${id}.json`)); } catch { /* ya no estaba */ } },
    pendientes() {
      return readdirSync(carpeta).filter((f) => f.endsWith('.json')).sort().map((f) => ({ id: f.slice(0, -5), cuerpo: readFileSync(join(carpeta, f), 'utf8') }));
    },
  };
}

/** Las anclas en su propio archivo: fuera del almacén del inquilino (en producción, otro servicio). */
export function anclasEnArchivo(ruta: string): AlmacenAnclas {
  mkdirSync(dirname(ruta), { recursive: true });
  const lee = (): Ancla[] => (existsSync(ruta) ? (JSON.parse(readFileSync(ruta, 'utf8')) as Ancla[]) : []);
  return {
    async anclas(inquilino) { return lee().filter((a) => a.inquilino === inquilino); },
    async agrega(a) { const tmp = `${ruta}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify([...lee(), a])); renameSync(tmp, ruta); },
  };
}
