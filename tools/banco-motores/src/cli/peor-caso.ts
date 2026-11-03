#!/usr/bin/env node
/**
 * CLI del generador de peor caso: imprime JSON a stdout. De solo lectura, sin red, sin LLM.
 *
 *   node tools/banco-motores/dist/cli/peor-caso.js                  todo el catálogo
 *   node tools/banco-motores/dist/cli/peor-caso.js nombres correos  solo esas familias
 *   … --semilla 7                                                    otro orden, igual de determinista
 */
import { FAMILIAS, catalogoDePeorCaso, type Familia } from '../peor-caso.js';

const args = process.argv.slice(2);
const i = args.indexOf('--semilla');
const semilla = i === -1 ? 25 : Number(args[i + 1]);
const pedidas = args.filter((a, j) => !a.startsWith('--') && j !== i + 1);
const desconocidas = pedidas.filter((p) => !(FAMILIAS as readonly string[]).includes(p));
if (desconocidas.length || !Number.isInteger(semilla)) {
  process.stderr.write(`familias válidas: ${FAMILIAS.join(', ')}; --semilla <entero>\n`);
  process.exit(1);
}
const catalogo = catalogoDePeorCaso(semilla);
const salida = pedidas.length ? Object.fromEntries(pedidas.map((p) => [p, catalogo[p as Familia]])) : catalogo;
process.stdout.write(`${JSON.stringify({ sintetico: true, semilla, familias: salida }, null, 2)}\n`);
