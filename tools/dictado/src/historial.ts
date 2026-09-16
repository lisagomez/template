/**
 * Historial de dictados sobre un `Almacen` inyectado: en memoria para probar, JSONL en disco
 * en `./node`, lo que sea en otro proyecto. El nucleo no sabe de archivos.
 *
 * `corrige` es el lazo de aprendizaje de sflow: cuando el humano edita un dictado, las
 * palabras nuevas se proponen como candidatas al diccionario. Se PROPONEN: meterlas solas
 * llenaria el diccionario de erratas.
 */
import type { Diccionario } from './diccionario.js';

export interface EntradaHistorial {
  id: string;
  /** ISO 8601. */
  fecha: string;
  texto: string;
  /** Lo que dijo el motor antes del posproceso, si difiere. */
  textoCrudo?: string;
  motor: string;
  duracionMs: number;
  /** Fin de habla → texto pegado, si se midio. */
  latenciaMs?: number;
}

export type EntradaNueva = Omit<EntradaHistorial, 'id' | 'fecha'> & Partial<Pick<EntradaHistorial, 'fecha'>>;

export interface Almacen {
  agrega(entrada: EntradaNueva): Promise<EntradaHistorial>;
  recientes(cuantas: number): Promise<EntradaHistorial[]>;
  busca(consulta: string, cuantas: number): Promise<EntradaHistorial[]>;
  actualiza(id: string, texto: string): Promise<EntradaHistorial | undefined>;
  cuenta(): Promise<number>;
}

export interface Historial extends Almacen {
  /** Guarda el texto editado y devuelve las candidatas al diccionario. */
  corrige(id: string, textoEditado: string): Promise<{ entrada?: EntradaHistorial; candidatos: string[] }>;
}

export function almacenEnMemoria(): Almacen {
  const entradas: EntradaHistorial[] = [];
  let siguiente = 1;
  const porFechaDesc = () => [...entradas].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));
  return {
    async agrega(entrada) {
      const nueva: EntradaHistorial = { ...entrada, id: String(siguiente++), fecha: entrada.fecha ?? new Date().toISOString() };
      entradas.push(nueva);
      return { ...nueva };
    },
    async recientes(cuantas) {
      return porFechaDesc().slice(0, cuantas).map((e) => ({ ...e }));
    },
    async busca(consulta, cuantas) {
      const q = consulta.toLowerCase();
      return porFechaDesc().filter((e) => e.texto.toLowerCase().includes(q)).slice(0, cuantas).map((e) => ({ ...e }));
    },
    async actualiza(id, texto) {
      const entrada = entradas.find((e) => e.id === id);
      if (!entrada) return undefined;
      entrada.texto = texto;
      return { ...entrada };
    },
    async cuenta() {
      return entradas.length;
    },
  };
}

export function creaHistorial(almacen: Almacen, diccionario?: Diccionario): Historial {
  return {
    ...almacen,
    async corrige(id, textoEditado) {
      const previas = (await almacen.recientes(Number.MAX_SAFE_INTEGER)).find((e) => e.id === id);
      const entrada = await almacen.actualiza(id, textoEditado);
      if (!entrada) return { candidatos: [] };
      const candidatos = diccionario && previas ? diccionario.candidatos(previas.texto, textoEditado) : [];
      return { entrada, candidatos };
    },
  };
}
