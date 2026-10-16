/**
 * Donde guarda el laboratorio de la clinica lo que no se versiona: el estado del portal, el libro, el buzon,
 * Telegram, el reel y las llaves. Fuera del repo (`~/.clinica-dental` o `CLINICA_DATOS`). La app lee lo mismo
 * desde `src/features/clinica-dental/services/servidor/datos.ts`.
 */
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const DATOS = resolve(process.env['CLINICA_DATOS'] ?? join(homedir(), '.clinica-dental'));
export const DIR_REEL = join(DATOS, 'reel');
export const DIR_LIBRO = join(DATOS, 'libro');
