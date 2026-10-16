/**
 * El libro de gasto del cerebro: una línea JSON por llamada, con la contabilidad del repo
 * (`registraUso`, precio del routing) y además el costo que reporta el proveedor, que es el que
 * manda cuando existe. Una llamada sin uso se guarda con coste `null`, nunca cero.
 *
 * El corte al 100 % lo decide ESTA app (la contabilidad solo recomienda): es el presupuesto del
 * laboratorio, no el servicio de un usuario final, así que cortar no deja a nadie sin atención.
 * Las órdenes locales siguen funcionando sin cerebro.
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { estadoPresupuesto, registraUso, type EstadoDePresupuesto, type EventoDeUso, type Registrador } from '../../../../lib/ai/contabilidad.ts';
import { LIBRO_GASTO, TOPE_USD } from './datos';

export interface Asiento extends EventoDeUso {
  /** Lo que dijo el proveedor (OpenRouter `usage.cost`); `null` si no lo dijo. */
  costoProveedorUsd: number | null;
}

const costoDe = (a: Pick<Asiento, 'costoUsd' | 'costoProveedorUsd'>): number | null => a.costoProveedorUsd ?? a.costoUsd;

async function asientos(): Promise<Asiento[]> {
  let texto = '';
  try {
    texto = await readFile(/*turbopackIgnore: true*/ LIBRO_GASTO, 'utf8');
  } catch {
    return [];
  }
  return texto
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as Asiento];
      } catch {
        return [];
      }
    });
}

function registradorConProveedor(costoProveedorUsd: number | null): Registrador {
  return {
    async guarda(evento) {
      await mkdir(/*turbopackIgnore: true*/ dirname(LIBRO_GASTO), { recursive: true });
      const asiento: Asiento = { ...evento, costoProveedorUsd };
      await appendFile(/*turbopackIgnore: true*/ LIBRO_GASTO, `${JSON.stringify(asiento)}\n`, 'utf8');
    },
    resumen: resumenGasto,
  };
}

export async function resumenGasto(): Promise<{ gastadoUsd: number; filasSinCosto: number }> {
  const todos = await asientos();
  const costos = todos.map(costoDe);
  return { gastadoUsd: costos.reduce<number>((s, c) => s + (c ?? 0), 0), filasSinCosto: costos.filter((c) => c === null).length };
}

export async function estadoGasto(): Promise<EstadoDePresupuesto> {
  const { gastadoUsd, filasSinCosto } = await resumenGasto();
  return estadoPresupuesto(gastadoUsd, TOPE_USD, filasSinCosto);
}

export async function anotaGasto(tokens: { entrada: number; salida: number; cacheados?: number } | null, costoProveedorUsd: number | null): Promise<void> {
  await registraUso(registradorConProveedor(costoProveedorUsd), 'cerebro-de-voz', tokens);
}
