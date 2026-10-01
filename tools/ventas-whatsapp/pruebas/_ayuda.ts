/** Ayudas compartidas por las pruebas: el circuito con los Flows del repo cargados. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creaCircuito, type OpcionesCircuito } from '../dist/laboratorio/index.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

export const FLOWS = Object.fromEntries(['entrega', 'reserva', 'lead', 'checkout'].map((t) => [t, JSON.parse(readFileSync(join(raiz, 'flows', `${t}.json`), 'utf8')) as Record<string, unknown>]));

export async function circuito(o: OpcionesCircuito = {}) {
  const c = creaCircuito({ flows: FLOWS, ...o });
  const pymes = await c.prepara();
  return { c, ...pymes };
}
