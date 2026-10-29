/**
 * El entorno del laboratorio de Ágora, para LEERLO sin efectos: importar este módulo no levanta, no borra ni toca Docker.
 * (2026-10-28: `pg.ts` importaba esto de `laboratorio.ts`, que al importarse levantaba el contenedor; en un árbol sin
 * entorno lo borró y lo recreó. Lo cazó el verificador independiente.)
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const DIR = join(RAIZ, 'tools/agora/.laboratorio');
export const ARCHIVO = join(DIR, 'entorno');
export const CONTENEDOR = 'agora-pg-lab';

export function leeEntorno(): Record<string, string> {
  if (!existsSync(ARCHIVO)) return {};
  return Object.fromEntries(readFileSync(ARCHIVO, 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
}
