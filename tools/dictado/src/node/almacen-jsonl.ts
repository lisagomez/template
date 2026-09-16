/**
 * Historial en disco: una linea JSON por dictado, solo anadir. Sin base de datos: un archivo
 * de texto que se lee con `grep`, se respalda copiandolo y no exige compilar nada nativo.
 * Para los miles de dictados que caben en un ano, leerlo entero para buscar cuesta menos que
 * el tiempo de decir la frase.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Almacen, EntradaHistorial, EntradaNueva } from '../historial.js';

export function creaAlmacenJsonl(ruta: string): Almacen {
  const lee = async (): Promise<EntradaHistorial[]> => {
    let crudo: string;
    try {
      crudo = await readFile(ruta, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const entradas: EntradaHistorial[] = [];
    for (const linea of crudo.split('\n')) {
      if (linea.trim().length === 0) continue;
      try {
        entradas.push(JSON.parse(linea) as EntradaHistorial);
      } catch {
        // Una linea rota (un corte de luz a mitad de escritura) no invalida el historial entero.
      }
    }
    return entradas;
  };
  const porFechaDesc = (entradas: EntradaHistorial[]) => [...entradas].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));

  return {
    async agrega(entrada: EntradaNueva) {
      await mkdir(dirname(ruta), { recursive: true });
      const nueva: EntradaHistorial = { ...entrada, id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, fecha: entrada.fecha ?? new Date().toISOString() };
      await appendFile(ruta, JSON.stringify(nueva) + '\n', 'utf8');
      return nueva;
    },
    async recientes(cuantas) {
      return porFechaDesc(await lee()).slice(0, cuantas);
    },
    async busca(consulta, cuantas) {
      const q = consulta.toLowerCase();
      return porFechaDesc(await lee()).filter((e) => e.texto.toLowerCase().includes(q)).slice(0, cuantas);
    },
    async actualiza(id, texto) {
      const entradas = await lee();
      const entrada = entradas.find((e) => e.id === id);
      if (!entrada) return undefined;
      entrada.texto = texto;
      await writeFile(ruta, entradas.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
      return entrada;
    },
    async cuenta() {
      return (await lee()).length;
    },
  };
}
