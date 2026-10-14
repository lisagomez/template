/** Rutas del repo para las pruebas: la herramienta vive en tools/soporte-sap. */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HERRAMIENTA = join(dirname(fileURLToPath(import.meta.url)), '..')
export const RAIZ = join(HERRAMIENTA, '..', '..')
export const lee = (ruta: string): string => readFileSync(join(RAIZ, ruta), 'utf8')

/** Los ids del inventario de activos, para comprobar que lo citado existe. */
export function idsDelInventario(): Set<string> {
  const indice = JSON.parse(lee('inventario/activos.json')) as { activos: Array<{ id: string }> }
  return new Set(indice.activos.map((a) => a.id))
}
