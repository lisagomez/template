/**
 * Carga el runtime del laboratorio (`src/features/soporte-sap/services`) fuera de Next, para EJECUTARLO en las pruebas
 * en vez de leer su código con expresiones regulares (PRP-010, tercera revisión: R3-14). Next resuelve lo que Node no:
 * las importaciones sin extensión (relativas, con el alias `@/` o de `next/`) y el JSON sin atributos de importación.
 * Estos ganchos hacen solo eso.
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** El alias `@/` de la app apunta a `src/` (tsconfig). */
const SRC = new URL('../../../src/', import.meta.url)

export async function resolve(especificador, contexto, siguiente) {
  const relativo = especificador.startsWith('./') || especificador.startsWith('../')
  if ((relativo || especificador.startsWith('@/')) && !/\.[a-z]+$/i.test(especificador)) {
    for (const ext of ['.ts', '.tsx', '.js']) {
      const url = especificador.startsWith('@/') ? new URL(especificador.slice(2) + ext, SRC) : new URL(especificador + ext, contexto.parentURL)
      if (existsSync(fileURLToPath(url))) return siguiente(url.href, contexto)
    }
  }
  // `next/server` no tiene mapa de exports: en ESM hay que nombrar el archivo.
  if (/^next\/[a-z-]+$/.test(especificador)) return siguiente(`${especificador}.js`, contexto)
  return siguiente(especificador, contexto)
}

export async function load(url, contexto, siguiente) {
  if (url.endsWith('.json')) return { format: 'module', source: `export default ${await readFile(fileURLToPath(url), 'utf8')};`, shortCircuit: true }
  return siguiente(url, contexto)
}
