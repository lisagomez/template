#!/usr/bin/env node
/**
 * Registra las huellas de una versión del conocimiento en `versiones.json` (PRP-005 Fase 4).
 *
 * El registro es de SOLO AÑADIR: una versión ya registrada no se reescribe. Si el conocimiento
 * actual no coincide con las huellas de su versión, es que cambió sin subir de versión, y el
 * script se niega. El gate (`pruebas/gate.ts`) compara cada versión con la anterior: nada borrado
 * y nada editado en su sitio sin firma (RF-14).
 *
 * Uso:
 *   npm run registra -- --firmadas MX-LISR-27-VII         # la versión del package.json, desde el árbol
 *   npm run registra -- --desde <git-ref>                   # reconstruye una versión desde un commit
 *
 * `--firmadas`: claves que esta versión cambia EN SU SITIO con firma del laboratorio (correcciones
 * de modelado). Lo que se firma se anota también en CAMBIOS.md.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validaConocimiento } from '../../grafo-conocimiento/dist/index.js'
import { huellas } from '../../grafo-conocimiento/dist/gate-entrada.js'
import { ensambla } from '../ensambla.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const registro = join(raiz, 'versiones.json')
const arg = (nombre) => {
  const i = process.argv.indexOf(nombre)
  return i > 0 ? process.argv[i + 1] : undefined
}

/** El conocimiento tal como estaba en un commit: los mismos archivos, ensamblados igual. */
function desdeGit(ref) {
  // Desde la raíz del repo: desde un subdirectorio, `ls-tree ref:ruta` resuelve la ruta relativa a él.
  const tope = execFileSync('git', ['-C', raiz, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const git = (...a) => execFileSync('git', ['-C', tope, ...a], { encoding: 'utf8', maxBuffer: 64 << 20 })
  const lee = (ruta) => JSON.parse(git('show', `${ref}:tools/conocimiento/${ruta}`))
  const lista = (dir) =>
    git('ls-tree', '--name-only', `${ref}:tools/conocimiento/${dir}`).split('\n').filter((f) => f.endsWith('.json')).sort()
  const catalogo = lee('catalogo.json')
  const dominios = lista('dominios').map((f) => lee(`dominios/${f}`))
  const generales = lista('generales').map((f) => lee(`generales/${f}`))
  return {
    version: lee('package.json').version,
    procedencia: catalogo.procedencia,
    jurisdicciones: catalogo.jurisdicciones,
    dimensiones: catalogo.dimensiones,
    dominios: dominios.map((d) => d.dominio),
    categorias: catalogo.categorias,
    reglas: [...dominios, ...generales].flatMap((a) => a.reglas).sort((a, b) => a.clave.localeCompare(b.clave)),
  }
}

const semver = (v) => v.split(/[.-]/).slice(0, 3).map(Number)
const mayor = (a, b) => {
  const [x, y] = [semver(a), semver(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}

const ref = arg('--desde')
const crudo = ref ? desdeGit(ref) : ensambla()
const v = validaConocimiento(crudo)
if (v.conocimiento === null) {
  console.error(`✗ ${crudo.version} no tiene la forma del contrato: ${v.problemas.slice(0, 3).map((p) => p.clave).join(', ')}`)
  process.exit(1)
}
const firmadas = (arg('--firmadas') ?? '').split(',').filter(Boolean).sort()
const entrada = { version: crudo.version, firmadas, huellas: huellas(v.conocimiento) }
const actual = JSON.parse(readFileSync(registro, 'utf8'))
const previa = actual.versiones.find((x) => x.version === entrada.version)

if (previa) {
  if (JSON.stringify(previa.huellas) !== JSON.stringify(entrada.huellas)) {
    console.error(`✗ ${entrada.version} ya está registrada con otras huellas: el conocimiento cambió sin subir de versión`)
    process.exit(1)
  }
  console.log(`✓ ${entrada.version} ya registrada; sin cambios`)
  process.exit(0)
}
const ultima = actual.versiones.at(-1)
if (ultima && !mayor(entrada.version, ultima.version)) {
  console.error(`✗ ${entrada.version} no es posterior a ${ultima.version}: el registro solo avanza`)
  process.exit(1)
}
actual.versiones.push(entrada)
writeFileSync(registro, `${JSON.stringify(actual, null, 2)}\n`)
console.log(`✓ registrada ${entrada.version}${ref ? ` (desde ${ref})` : ''}; firmadas: ${firmadas.join(', ') || 'ninguna'}`)
