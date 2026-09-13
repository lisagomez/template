#!/usr/bin/env node
/**
 * Ingesta al almacen (spec 011, RF-9): recoge trayectorias que otras lineas dejaron fuera del
 * repo y las mete en `trayectorias/datos/<linea>/<mes>/`, validadas una a una.
 *
 *   node scripts/trayectorias/ingesta.mjs                 # busca trayectoria.json en tools/<herramienta>/corpus/salida-...
 *   node scripts/trayectorias/ingesta.mjs --desde RUTA    # un .json (una) o un .jsonl (una por linea)
 *
 * Lo crudo (resumenes, lecturas, transcripts) se queda donde estaba: fuera de git.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validaTrayectoria } from './formato.mjs'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DATOS = join(raiz, 'trayectorias', 'datos')
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? null : process.argv[i + 1] }

function guarda(t) {
  const dir = join(DATOS, t.linea, t.cuando.inicio.slice(0, 7))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${t.id}.json`), JSON.stringify(t, null, 1) + '\n')
  return `${t.linea}/${t.cuando.inicio.slice(0, 7)}/${t.id}.json`
}

const candidatas = []
const desde = arg('desde')
if (desde !== null) {
  const texto = readFileSync(desde, 'utf8')
  if (desde.endsWith('.jsonl')) for (const l of texto.split('\n')) { if (l.trim()) candidatas.push([desde, JSON.parse(l)]) }
  else candidatas.push([desde, JSON.parse(texto)])
} else {
  const tools = join(raiz, 'tools')
  for (const herramienta of existsSync(tools) ? readdirSync(tools) : []) {
    const corpus = join(tools, herramienta, 'corpus')
    if (!existsSync(corpus) || !statSync(corpus).isDirectory()) continue
    for (const salida of readdirSync(corpus).filter((n) => n.startsWith('salida-'))) {
      const ruta = join(corpus, salida, 'trayectoria.json')
      if (existsSync(ruta)) candidatas.push([ruta, JSON.parse(readFileSync(ruta, 'utf8'))])
    }
  }
}

let ok = 0
let rechazadas = 0
for (const [origen, t] of candidatas) {
  const errores = validaTrayectoria(t)
  if (errores.length > 0) { rechazadas++; console.log(`  ✗ ${origen.replace(raiz, '.')}: ${errores.slice(0, 3).join('; ')}`); continue }
  ok++
  console.log(`  ✓ ${guarda(t)}`)
}
console.log(`\n${ok} ingestada(s) · ${rechazadas} rechazada(s)`)
if (rechazadas > 0) process.exit(1)
