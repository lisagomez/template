#!/usr/bin/env node
/**
 * Genera `src/diccionario/datos.ts` desde el GS1 Barcode Syntax Dictionary (Apache-2.0),
 * que es la version legible por maquina de las AIs de las GS1 General Specifications:
 * longitud, juego de caracteres, si pide FNC1, linters y reglas `req=`/`ex=`.
 *
 * La fuente va FIJADA en `fuentes/gs1-syntax-dictionary.txt` (commit anotado abajo). Cambiarla
 * cambia lo que el nucleo acepta: se regenera, se corren las pruebas y se revisa el diff.
 *
 * Uso:  node generador/genera-diccionario.mjs [--comprueba]   (--comprueba: exit 1 si datos.ts diverge;
 *       lo corre `verifica:generados` del template)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const COMMIT = 'c63d8a12210dd0cfaceac4aae45ccf57b48eb15b'
const texto = readFileSync(join(raiz, 'fuentes/gs1-syntax-dictionary.txt'), 'utf8')
const lineas = texto.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#'))
const entradas = lineas.map((l) => l.replace(/\s+/g, ' ').trim())
const cuerpo = entradas.map((e) => `  ${JSON.stringify(e)},`).join('\n')
const salida = `// ALTO: ARTEFACTO AUTOGENERADO por generador/genera-diccionario.mjs. No lo edites a mano: se regenera.
// Fuente: GS1 Barcode Syntax Dictionary, github.com/gs1/gs1-syntax-dictionary @ ${COMMIT}
// Copyright (c) 2020-2021 BWIPP project · (c) 2020-2021 Zint Project · (c) 2021-2025 GS1 AISBL
// Licensed under the Apache License, Version 2.0: http://www.apache.org/licenses/LICENSE-2.0
// Formato de cada linea: AIs [Flags] Especificacion [Atributos...] [# Titulo]

export const COMMIT_DICCIONARIO = '${COMMIT}'

export const LINEAS_DICCIONARIO: readonly string[] = [
${cuerpo}
]
`
const destino = join(raiz, 'src/diccionario/datos.ts')
if (process.argv.includes('--comprueba')) {
  const igual = existsSync(destino) && readFileSync(destino, 'utf8') === salida
  console.log(igual ? '✓ src/diccionario/datos.ts coincide con la fuente' : '✗ src/diccionario/datos.ts diverge de la fuente: regeneralo')
  process.exit(igual ? 0 : 1)
}
writeFileSync(destino, salida)
console.log(`diccionario: ${entradas.length} entradas -> src/diccionario/datos.ts`)
