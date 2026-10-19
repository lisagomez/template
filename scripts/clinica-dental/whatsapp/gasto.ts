/**
 * EL GASTO DEL GOAL: el uso de la llave de OpenRouter antes de la primera llamada (`gasto-antes.json`) y ahora, y el
 * libro de gasto de la app (lo que el proveedor reportó llamada por llamada: la medida primaria, porque el uso de la
 * llave va con retraso). Solo montos: la llave nunca se imprime.
 *
 *   CLINICA_DATOS=~/.clinica-dental-whatsapp node scripts/clinica-dental/whatsapp/gasto.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATOS } from '../rutas.ts';
import { saldo, type Saldo } from '../saldo.ts';

const M = join(process.cwd(), 'docs/goals/clinica-dental-whatsapp-medicion');
const antes = JSON.parse(readFileSync(join(M, 'gasto-antes.json'), 'utf8')) as Saldo;
const despues = await saldo();
const libro = readFileSync(join(DATOS, 'gasto.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { costoProveedorUsd: number | null; costoUsd: number | null; cuando: string });
const costo = (g: (typeof libro)[number]) => g.costoProveedorUsd ?? g.costoUsd;
const usd = Math.round(libro.reduce((t, g) => t + (costo(g) ?? 0), 0) * 1e6) / 1e6;
const delta = antes.usoLlaveUsd !== null && despues.usoLlaveUsd !== null ? Math.round((despues.usoLlaveUsd - antes.usoLlaveUsd) * 1e6) / 1e6 : null;
const salida = { antes, despues, deltaUsoLlaveUsd: delta, libroDeGastoApp: { llamadas: libro.length, usd, sinCostoDesconocido: libro.filter((g) => costo(g) === null).length, desde: libro[0]?.cuando ?? null, hasta: libro.at(-1)?.cuando ?? null }, tope: 1, dentroDelTope: usd <= 1 && (delta ?? 0) <= 1 };
writeFileSync(join(M, 'gasto.json'), `${JSON.stringify(salida, null, 1)}\n`);
console.log(`gasto del goal · Δ uso de la llave: US$${delta} (con retraso) · libro de la app: ${libro.length} llamadas, US$${usd} (${salida.libroDeGastoApp.sinCostoDesconocido} sin costo reportado) · tope: US$1 · dentro: ${salida.dentroDelTope}`);
