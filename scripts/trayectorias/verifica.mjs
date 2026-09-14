#!/usr/bin/env node
/**
 * Verificador del almacen de trayectorias (spec 011, RF-4). Corre dentro de `npm run validate`.
 *
 * Recorre `trayectorias/datos/**.json` y exige que cada archivo sea una trayectoria valida del
 * formato: solo forma, sin contenido, sin secretos, sin identificadores del corpus, coste `null`
 * cuando no hay uso. Tambien vigila las evaluaciones y los informes generados: un informe que
 * cite un valor de documento es la misma fuga por otra puerta.
 *
 * Exit 0 conforme · 1 divergente. Un almacen vacio es valido y se dice.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validaTrayectoria, LARGO_MAXIMO } from './formato.mjs'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DATOS = join(raiz, 'trayectorias', 'datos')
const verde = (s) => `\x1b[32m${s}\x1b[0m`
const rojo = (s) => `\x1b[31m${s}\x1b[0m`
const gris = (s) => `\x1b[2m${s}\x1b[0m`

function archivosBajo(dir) {
  if (!existsSync(dir)) return []
  const salida = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name)
    if (e.isDirectory()) salida.push(...archivosBajo(ruta))
    else if (e.name.endsWith('.json')) salida.push(ruta)
  }
  return salida
}

let fallos = 0
let total = 0
const porLinea = {}
for (const ruta of archivosBajo(DATOS).sort()) {
  total++
  let t
  try { t = JSON.parse(readFileSync(ruta, 'utf8')) } catch { fallos++; console.log(`  ${rojo('✗')} ${ruta.replace(raiz, '.')}: JSON ilegible`); continue }
  const errores = validaTrayectoria(t)
  if (errores.length > 0) { fallos++; console.log(`  ${rojo('✗')} ${ruta.replace(raiz, '.')}\n      ${errores.slice(0, 5).join('\n      ')}`); continue }
  porLinea[t.linea] = (porLinea[t.linea] ?? 0) + 1
  if (statSync(ruta).size > 16 * 1024) { fallos++; console.log(`  ${rojo('✗')} ${ruta.replace(raiz, '.')}: ${statSync(ruta).size} bytes; una trayectoria de forma no pesa eso`) }
}

// Los artefactos derivados (evaluaciones, informes, propuestas) no pueden llevar lo que el dato no lleva.
const FORMAS = [[/\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/, 'RFC'], [/\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/, 'CURP'], [/\bT\d{1,2}\b/, 'identificador de caso'], [/\bsk-[A-Za-z0-9_-]{10,}/, 'clave de API']]
for (const carpeta of ['evaluaciones', 'informes', 'propuestas']) {
  const dir = join(raiz, 'trayectorias', carpeta)
  if (!existsSync(dir)) continue
  for (const nombre of readdirSync(dir)) {
    const texto = readFileSync(join(dir, nombre), 'utf8')
    for (const [forma, que] of FORMAS) if (forma.test(texto)) { fallos++; console.log(`  ${rojo('✗')} trayectorias/${carpeta}/${nombre}: contiene algo con forma de ${que}`) }
  }
}

console.log(gris(`\nTrayectorias — ${total} archivo(s) en trayectorias/datos · por linea ${JSON.stringify(porLinea)} · largo maximo de cadena ${LARGO_MAXIMO}\n`))
if (total === 0) console.log(gris('  (almacen vacio: valido, y se dice)'))
if (fallos > 0) { console.log(rojo(`✗ Trayectorias: ${fallos} archivo(s) fuera del formato.`)); process.exit(1) }
console.log(verde(`✓ Trayectorias conformes: ${total} archivo(s), solo forma.`))
