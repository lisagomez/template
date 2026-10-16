/**
 * Dónde guarda el centro de mando lo que guarda, y nada más: el libro de gasto del cerebro y el
 * espejo de agenda del laboratorio. Ni audio ni texto dictado.
 *
 * `turbopackIgnore`: las rutas se deciden al ejecutar; sin el comentario, Turbopack rastrea la
 * carpeta como asset al construir (aprendizaje del 2026-09-20).
 */
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const DATOS = resolve(/*turbopackIgnore: true*/ process.env['CENTRO_MANDO_DATOS'] ?? join(homedir(), '.centro-de-mando'));
export const LIBRO_GASTO = resolve(/*turbopackIgnore: true*/ DATOS, 'gasto.jsonl');
export const ESPEJO_AGENDA = resolve(/*turbopackIgnore: true*/ process.env['CENTRO_MANDO_ESPEJO'] ?? join(DATOS, 'agenda-espejo.json'));

/** Tope duro del laboratorio en US$ (el goal fija 1). */
export const TOPE_USD = Number(process.env['CENTRO_MANDO_TOPE_USD'] ?? '1');
export const ZONA = process.env['CENTRO_MANDO_ZONA'] ?? 'America/Mexico_City';
/** La agenda del laboratorio: datos sintéticos sembrados por `scripts/centro-de-mando/siembra-agenda.ts`. */
export const REF_AGENDA = { cuenta: 'laboratorio@centro-de-mando.local', calendario: 'agenda' } as const;
