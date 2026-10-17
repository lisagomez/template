/**
 * El libro de gasto del asistente de la clinica: una linea JSON por llamada al cerebro, con la contabilidad del
 * repo (`registraUso`, precio del routing) y el costo que reporta OpenRouter, que manda cuando existe. Una llamada
 * sin uso (abortada, fallida) se guarda con coste `null`, NUNCA como cero. Al 100 % del tope del goal (US$1) el
 * cerebro se apaga: es el presupuesto del laboratorio, no el servicio de un paciente real, y las urgencias, el
 * enrutador y las respuestas fijas siguen funcionando sin el.
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { estadoPresupuesto, registraUso, type EstadoDePresupuesto, type EventoDeUso, type Registrador } from '../../../../lib/ai/contabilidad.ts';
import { RUTAS, TOPE_USD } from './datos';

interface Asiento extends EventoDeUso { costoProveedorUsd: number | null }

async function asientos(): Promise<Asiento[]> {
  const texto = await readFile(/*turbopackIgnore: true*/ RUTAS.gasto, 'utf8').catch(() => '');
  return texto.split('\n').filter((l) => l.trim()).flatMap((l) => {
    try {
      return [JSON.parse(l) as Asiento];
    } catch {
      return [];
    }
  });
}

export async function resumenGasto(): Promise<{ gastadoUsd: number; llamadas: number; filasSinCosto: number }> {
  const costos = (await asientos()).map((a) => a.costoProveedorUsd ?? a.costoUsd);
  return { gastadoUsd: costos.reduce<number>((s, c) => s + (c ?? 0), 0), llamadas: costos.length, filasSinCosto: costos.filter((c) => c === null).length };
}

export async function estadoGasto(): Promise<EstadoDePresupuesto> {
  const r = await resumenGasto();
  return estadoPresupuesto(r.gastadoUsd, TOPE_USD, r.filasSinCosto);
}

function registrador(costoProveedorUsd: number | null): Registrador {
  return {
    async guarda(evento) {
      await mkdir(/*turbopackIgnore: true*/ dirname(RUTAS.gasto), { recursive: true });
      await appendFile(/*turbopackIgnore: true*/ RUTAS.gasto, `${JSON.stringify({ ...evento, costoProveedorUsd })}\n`, { mode: 0o600 });
    },
    async resumen() {
      const r = await resumenGasto();
      return { gastadoUsd: r.gastadoUsd, filasSinCosto: r.filasSinCosto };
    },
  };
}

export async function anotaGasto(tokens: { entrada: number; salida: number } | null, costoProveedorUsd: number | null): Promise<void> {
  await registraUso(registrador(costoProveedorUsd), 'asistente-paciente', tokens);
}
