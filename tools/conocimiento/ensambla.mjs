#!/usr/bin/env node
/**
 * Ensambla la fuente única en un solo `Conocimiento` (el contrato de @tu-scope/grafo-conocimiento)
 * y lo publica en `dist/`: `conocimiento.json` más un `index.js` que lo exporta.
 *
 * Se siembra por archivo (un dominio por archivo, las generales por ámbito) porque así se
 * investiga y se revisa. Se consume ensamblado, porque así lo lee el motor. La versión sale de
 * package.json, que es la que el proyecto consumidor fija.
 *
 * Exporta el conocimiento como `unknown` a propósito: pásalo por `validaConocimiento` y luego por
 * `seleccionaDominios`. Nadie debería usarlo sin validarlo.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = dirname(fileURLToPath(import.meta.url))
const lee = (ruta) => JSON.parse(readFileSync(join(raiz, ruta), 'utf8'))
const archivos = (dir) => readdirSync(join(raiz, dir)).filter((f) => f.endsWith('.json')).sort().map((f) => `${dir}/${f}`)

export function ensambla() {
  const { version } = lee('package.json')
  const catalogo = lee('catalogo.json')
  const dominios = archivos('dominios').map(lee)
  const generales = archivos('generales').map(lee)
  return {
    version,
    procedencia: catalogo.procedencia,
    jurisdicciones: catalogo.jurisdicciones,
    dimensiones: catalogo.dimensiones,
    dominios: dominios.map((d) => d.dominio),
    categorias: catalogo.categorias,
    reglas: [...dominios, ...generales].flatMap((a) => a.reglas).sort((a, b) => a.clave.localeCompare(b.clave)),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const c = ensambla()
  mkdirSync(join(raiz, 'dist'), { recursive: true })
  writeFileSync(join(raiz, 'dist', 'conocimiento.json'), JSON.stringify(c))
  writeFileSync(
    join(raiz, 'dist', 'index.js'),
    "import conocimiento from './conocimiento.json' with { type: 'json' }\n" +
      `export const version = ${JSON.stringify(c.version)}\nexport default conocimiento\n`,
  )
  writeFileSync(
    join(raiz, 'dist', 'index.d.ts'),
    '/** Sin validar a propósito: pásalo por validaConocimiento (@tu-scope/grafo-conocimiento). */\n' +
      'declare const conocimiento: unknown\nexport default conocimiento\nexport declare const version: string\n',
  )
  console.log(`✓ conocimiento ${c.version}: ${c.dominios.length} dominios, ${c.categorias.length} categorías, ${c.reglas.length} reglas`)
}
