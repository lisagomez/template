/**
 * El libro de gasto del agente del lienzo: una línea JSON por llamada al modelo, con la contabilidad del repo
 * (`registraUso` con la clase `agente-estudio-dashboards` y su precio del routing) y el costo que reporta OpenRouter,
 * que manda cuando existe. Una llamada sin uso se guarda con coste `null`, nunca como cero. Al 100 % del tope del
 * lienzo el agente se apaga (el tablero, los clics y las versiones siguen): es presupuesto de laboratorio, no el
 * servicio de un usuario.
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { estadoPresupuesto, registraUso, type EstadoDePresupuesto, type EventoDeUso, type Registrador } from '../../../../lib/ai/contabilidad';
import type { LlamadaModelo } from '../../../../../tools/estudio-dashboards/dist/agente/tipos.js';
import { ALMACEN, TOPE_LIENZO_USD } from './runtime';

const LIBRO = join(ALMACEN, 'gasto.jsonl');
interface Asiento extends EventoDeUso { costoProveedorUsd: number | null }

async function asientos(): Promise<Asiento[]> {
  const texto = await readFile(/*turbopackIgnore: true*/ LIBRO, 'utf8').catch(() => '');
  return texto.split('\n').filter((l) => l.trim()).flatMap((l) => { try { return [JSON.parse(l) as Asiento]; } catch { return []; } });
}

export async function estadoGasto(): Promise<EstadoDePresupuesto & { llamadas: number }> {
  const costos = (await asientos()).map((a) => a.costoProveedorUsd ?? a.costoUsd);
  const gastado = costos.reduce<number>((s, c) => s + (c ?? 0), 0);
  return { ...estadoPresupuesto(gastado, TOPE_LIENZO_USD, costos.filter((c) => c === null).length), llamadas: costos.length };
}

function registrador(costoProveedorUsd: number | null): Registrador {
  return {
    async guarda(evento) {
      await mkdir(/*turbopackIgnore: true*/ dirname(LIBRO), { recursive: true });
      await appendFile(/*turbopackIgnore: true*/ LIBRO, `${JSON.stringify({ ...evento, costoProveedorUsd })}\n`, { mode: 0o600 });
    },
    async resumen() { const e = await estadoGasto(); return { gastadoUsd: e.gastadoUsd, filasSinCosto: e.filasSinCosto }; },
  };
}

/** Lo que el agente inyecta: cada llamada, a la contabilidad del repo. */
export async function anota(l: LlamadaModelo): Promise<void> {
  await registraUso(registrador(l.costoUsd), 'agente-estudio-dashboards', l.uso ? { entrada: l.uso.entrada, salida: l.uso.salida, cacheados: l.uso.cacheados } : null);
}
