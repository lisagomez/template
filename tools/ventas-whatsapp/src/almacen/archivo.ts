/**
 * Almacén en un archivo JSON, para la app del laboratorio (`.datos/ventas-whatsapp/`). Escribe con
 * reemplazo atómico (archivo temporal + rename) para no dejar un JSON a medias.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { almacenEnMemoria, type Almacen, type ColaDurable, type Volcado } from './almacen.js';
import type { AlmacenAnclas, Ancla } from '../trazabilidad/cadena.js';
import { registroAltasEnMemoria, type RegistroAltas, type VolcadoAltas } from '../bsp/alta.js';
import type { NumeroGestionado, PoolNumeros } from '../dominios/numeros.js';

/** Lee un JSON si existe y devuelve con qué reescribirlo de forma atómica (temporal + rename). */
function jsonEnArchivo<T>(ruta: string): { inicial: T | undefined; escribe: (v: T) => void } {
  const inicial = existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) as T : undefined;
  mkdirSync(dirname(ruta), { recursive: true });
  return { inicial, escribe: (v) => { const tmp = `${ruta}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(v)); renameSync(tmp, ruta); } };
}

export function almacenArchivo(ruta: string): Almacen & { volcado(): Volcado } {
  const f = jsonEnArchivo<Volcado>(ruta);
  return almacenEnMemoria(f.inicial, f.escribe);
}

/** Las altas del BSP, su embudo y los nonces de las ligas (N-02). Los tokens NO: viven en la bóveda. */
export function registroAltasEnArchivo(ruta: string): RegistroAltas {
  const f = jsonEnArchivo<VolcadoAltas>(ruta);
  return registroAltasEnMemoria(f.inicial, f.escribe);
}

/** El pool de números (N-01). El PIN no está aquí: el gestor no lo guarda. */
export function poolEnArchivo(ruta: string): PoolNumeros {
  const f = jsonEnArchivo<Record<string, NumeroGestionado>>(ruta);
  const m: Record<string, NumeroGestionado> = f.inicial ?? {};
  return {
    async lee(e) { const n = m[e]; return n ? structuredClone(n) : undefined; },
    async guarda(n) { m[n.e164] = structuredClone(n); f.escribe(m); },
    async lista() { return Object.values(m).map((n) => structuredClone(n)); },
  };
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
