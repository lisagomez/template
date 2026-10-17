/**
 * El saldo de OpenRouter, como lo mira el laboratorio (GET /api/v1/key y /api/v1/credits): lo gastado por la LLAVE
 * (acumulado) y lo que queda en la CUENTA, que comparten otras llaves. Solo montos: la llave nunca se imprime.
 *
 *   node scripts/clinica-dental/saldo.ts antes|despues   → anota en docs/goals/clinica-dental-medicion/gasto.json
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATOS } from './rutas.ts';

export function llaveOpenRouter(): string {
  if (process.env['OPENROUTER_API_KEY']) return process.env['OPENROUTER_API_KEY'];
  const m = /^OPENROUTER_API_KEY=(.+)$/m.exec(readFileSync('.env.local', 'utf8'));
  if (!m?.[1]) throw new Error('falta OPENROUTER_API_KEY (.env.local): presente = no');
  return m[1].trim();
}

export interface Saldo { cuando: string; usoLlaveUsd: number | null; topeLlaveUsd: number | null; restanteLlaveUsd: number | null; creditosCuentaUsd: number | null; usoCuentaUsd: number | null }

export async function saldo(): Promise<Saldo> {
  const k = llaveOpenRouter();
  const lee = async (url: string) => ((await (await fetch(url, { headers: { authorization: `Bearer ${k}` } })).json()) as { data?: Record<string, number | null> }).data ?? {};
  const [llave, cuenta] = await Promise.all([lee('https://openrouter.ai/api/v1/key'), lee('https://openrouter.ai/api/v1/credits')]);
  const n = (v: unknown) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : null);
  return { cuando: new Date().toISOString(), usoLlaveUsd: n(llave['usage']), topeLlaveUsd: n(llave['limit']), restanteLlaveUsd: n(llave['limit_remaining']), creditosCuentaUsd: n(cuenta['total_credits']), usoCuentaUsd: n(cuenta['total_usage']) };
}

const RUTA = join(process.cwd(), 'docs/goals/clinica-dental-medicion/gasto.json');

/**
 * El libro de gasto de la app: lo que el PROVEEDOR reportó (`usage.cost`) llamada por llamada. Medido el 16/10: el
 * uso de la llave en /api/v1/key no reflejó en 5 min una llamada ya cobrada, así que el saldo va con retraso y el
 * libro es la medida primaria; el saldo, la verificación cuando alcanza.
 */
function libroDeGasto() {
  const ruta = join(DATOS, 'gasto.jsonl');
  if (!existsSync(ruta)) return null;
  const xs = readFileSync(ruta, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { costoProveedorUsd: number | null; costoUsd: number | null; cuando: string });
  const costo = xs.reduce((t, x) => t + (x.costoProveedorUsd ?? x.costoUsd ?? 0), 0);
  return { llamadas: xs.length, costoConocidoUsd: Math.round(costo * 1e6) / 1e6, sinCostoDesconocido: xs.filter((x) => (x.costoProveedorUsd ?? x.costoUsd) === null).length, desde: xs[0]?.cuando ?? null, hasta: xs[xs.length - 1]?.cuando ?? null };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const momento = process.argv[2] === 'despues' ? 'despues' : 'antes';
  const previo = existsSync(RUTA) ? (JSON.parse(readFileSync(RUTA, 'utf8')) as Record<string, Saldo>) : {};
  const s = await saldo();
  const salida: Record<string, unknown> = { ...previo, [momento]: s, ...(momento === 'despues' ? { libroDeGastoApp: libroDeGasto() } : {}) };
  const a = (salida['antes'] as Saldo | undefined)?.usoLlaveUsd;
  const d = (salida['despues'] as Saldo | undefined)?.usoLlaveUsd;
  delete salida['gastoDelGoalUsd'];
  // Lo que se movió el uso de la LLAVE entre las dos lecturas: con el retraso medido, es un piso, no el gasto.
  if (typeof a === 'number' && typeof d === 'number') salida['deltaUsoLlaveUsd'] = Math.round((d - a) * 1e6) / 1e6;
  writeFileSync(RUTA, `${JSON.stringify(salida, null, 1)}\n`);
  console.log(`saldo ${momento}: uso de la llave US$${s.usoLlaveUsd} · le quedan US$${s.restanteLlaveUsd} de su tope · cuenta: US$${s.creditosCuentaUsd === null || s.usoCuentaUsd === null ? '?' : Math.round((s.creditosCuentaUsd - s.usoCuentaUsd) * 1e4) / 1e4} disponibles${salida['deltaUsoLlaveUsd'] !== undefined ? ` · Δ uso de la llave US$${String(salida['deltaUsoLlaveUsd'])} (con retraso)` : ''}`);
}
