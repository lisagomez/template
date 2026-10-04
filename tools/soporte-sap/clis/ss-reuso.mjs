#!/usr/bin/env node
/**
 * ss-reuso — cuenta el reuso del producto desde la matriz dominio × capa del SDD.
 *
 * Solo lectura salvo `--escribe`, que sustituye el bloque de reuso del SDD por el recontado.
 *
 * Uso:  node tools/soporte-sap/clis/ss-reuso.mjs [--escribe] [--json] [--sdd <ruta>]
 * Exit: 0 · 1 si la matriz tiene errores de forma.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { leeMatriz, cuentaReuso, bloqueReuso, conBloqueReuso } from '../dist/index.js'

export const DESCRIPCION = { nombre: 'ss-reuso', readOnly: true, escribe: '--escribe sustituye el bloque de reuso del SDD' }

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const argumento = (bandera) => {
  const i = process.argv.indexOf(bandera)
  return i > 0 ? process.argv[i + 1] : undefined
}
const ruta = argumento('--sdd') ?? join(raiz, 'docs', 'SDD-soporte-sap.md')

if (process.argv.includes('--help')) {
  console.log('ss-reuso [--escribe] [--json] [--sdd <ruta>] — cuenta el reuso desde la matriz del SDD')
  process.exit(0)
}

const md = readFileSync(ruta, 'utf8')
const matriz = leeMatriz(md)
if (matriz.errores.length) {
  console.error(`✗ la matriz tiene ${matriz.errores.length} error(es):\n  ${matriz.errores.join('\n  ')}`)
  process.exit(1)
}
const cuenta = cuentaReuso(matriz.celdas)
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(cuenta, null, 1))
} else {
  console.log(bloqueReuso(cuenta))
}
if (process.argv.includes('--escribe')) {
  writeFileSync(ruta, conBloqueReuso(md, bloqueReuso(cuenta)))
  console.log(`\n✓ bloque de reuso escrito en ${ruta.slice(raiz.length + 1)}`)
}
