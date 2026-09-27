#!/usr/bin/env node
/**
 * Genera el corpus de paridad con el motor REAL de Hermes (PRP-005 Fase 1).
 *
 * Lee el motor (`evaluador.py`) y el seed (`reglas.json`) del commit pineado en
 * `CORTE_HERMES`, con `git show <commit>:<ruta>`, así que no importa en qué rama esté el clon.
 * Comprueba sus sha256 contra el pin, corre el motor con `python3` en un directorio temporal
 * (fuera del repo) y escribe en `pruebas/paridad/`:
 *
 *   corpus.json            casos de entrada y la salida EXACTA del motor de Hermes
 *   validacion-seed.json   lo que el contrato dice del seed de ese corte (desdeHermes + validaConocimiento)
 *
 * Al repo solo entran salidas, nunca el motor ni el seed (el seed entra en la Fase 2, con su
 * historial). Sin marca de tiempo: regenerar sin cambios da el mismo archivo, y un diff aquí
 * significa que algo cambió de verdad.
 *
 * Uso:  npm run paridad:genera -- --hermes ~/code/hermes-os-a2a
 * Exit: 0 escrito · 1 uso incorrecto · 2 el clon no tiene el corte o sus huellas no cuadran
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isDeepStrictEqual } from 'node:util'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CORTE_HERMES, CorpusParidad, compactaCorpus, desdeHermes, expandeSalida, SalidaHermes, validaConocimiento } from '../dist/index.js'
import { construyeCasos } from './casos.mjs'

const destino = join(dirname(fileURLToPath(import.meta.url)), '..', 'pruebas', 'paridad')
const i = process.argv.indexOf('--hermes')
const clon = i > 0 ? process.argv[i + 1] : undefined
if (!clon) {
  console.error('uso: npm run paridad:genera -- --hermes <clon de hermes-os-a2a>')
  process.exit(1)
}

// Con prefijo, como en CORTE_HERMES: `sha256:` marca un ancla pública (audita-secretos).
const sha256 = (buf) => `sha256:${createHash('sha256').update(buf).digest('hex')}`
const delCorte = (ruta) => {
  try {
    return execFileSync('git', ['-C', clon, 'show', `${CORTE_HERMES.commit}:${ruta}`], { maxBuffer: 64 << 20 })
  } catch {
    console.error(`✗ el clon ${clon} no tiene ${CORTE_HERMES.commit.slice(0, 7)}:${ruta} (¿git fetch?)`)
    process.exit(2)
  }
}

const motor = delCorte(CORTE_HERMES.motor)
const seedBuf = delCorte(CORTE_HERMES.seed)
for (const [que, real, pin] of [
  ['motor', sha256(motor), CORTE_HERMES.motor_sha256],
  ['seed', sha256(seedBuf), CORTE_HERMES.seed_sha256],
]) {
  if (real !== pin) {
    console.error(`✗ huella del ${que} en el corte: ${real}, el pin dice ${pin}`)
    process.exit(2)
  }
}
const seed = JSON.parse(seedBuf.toString('utf8'))

// El motor de Hermes es stdlib pura: basta un python3, sin venv ni base de datos.
const PILOTO = `
import json, sys
sys.path.insert(0, sys.argv[1])
import evaluador
e = json.load(sys.stdin)
reglas, categorias = e["seed"]["reglas"], e["seed"]["categorias"]
out = [evaluador.evaluar(c["entrada"]["conceptos"], reglas, categorias, c["entrada"]["contexto"]) for c in e["casos"]]
json.dump({"python": sys.version.split()[0], "salidas": out}, sys.stdout, ensure_ascii=False)
`
const { casos, notas } = construyeCasos(seed, CORTE_HERMES.fecha)
const tmp = mkdtempSync(join(tmpdir(), 'paridad-hermes-'))
let corrida
try {
  writeFileSync(join(tmp, 'evaluador.py'), motor)
  corrida = spawnSync('python3', ['-c', PILOTO, tmp], {
    input: JSON.stringify({ seed, casos }),
    encoding: 'utf8',
    maxBuffer: 256 << 20,
  })
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
if (corrida.status !== 0) {
  console.error(`✗ el motor de Hermes falló:\n${corrida.stderr}`)
  process.exit(2)
}
const { python, salidas } = JSON.parse(corrida.stdout)

// Compacta sin pérdida y lo DEMUESTRA: cada caso expandido tiene que ser idéntico a lo que
// devolvió Python. Si uno no cuadra, no se escribe nada.
const crudas = salidas.map((s, n) => {
  const r = SalidaHermes.safeParse(s)
  if (!r.success) {
    console.error(`✗ ${casos[n].id}: la salida de Hermes no tiene la forma esperada: ${r.error.issues[0]?.message}`)
    process.exit(2)
  }
  return r.data
})
const corpus = CorpusParidad.parse(compactaCorpus({ ...CORTE_HERMES, python, notas }, casos, crudas))
for (const [n, caso] of corpus.casos.entries()) {
  if (!isDeepStrictEqual(expandeSalida(corpus, caso), salidas[n])) {
    console.error(`✗ ${caso.id}: la compactación pierde información; no se escribe el corpus`)
    process.exit(2)
  }
}
const { casos: casosCompactos, ...cabecera } = corpus
const cuerpo = Object.entries(cabecera).map(([k, v]) => `"${k}": ${JSON.stringify(v)}`).join(',\n')
writeFileSync(
  join(destino, 'corpus.json'),
  `{\n${cuerpo},\n"casos": [\n${casosCompactos.map((c) => JSON.stringify(c)).join(',\n')}\n]\n}\n`,
)
const familias = corpus.familias

const v = validaConocimiento(desdeHermes(seed, { version: `0.0.0-hermes.${CORTE_HERMES.commit.slice(0, 7)}`, corte: CORTE_HERMES.fecha }))
const validacion = {
  procedencia: { commit: CORTE_HERMES.commit, seed_sha256: CORTE_HERMES.seed_sha256 },
  reglas: v.conocimiento?.reglas.length ?? null,
  dominios: v.conocimiento?.dominios.map((d) => d.clave) ?? null,
  problemas: v.problemas,
}
writeFileSync(join(destino, 'validacion-seed.json'), `${JSON.stringify(validacion, null, 2)}\n`)

console.log(`✓ corpus: ${casos.length} casos con python ${python}, ${corpus.salidas.length} salidas únicas, expansión idéntica en todos · ${JSON.stringify(familias)}`)
console.log(`✓ validación del seed: ${v.problemas.length} problema(s) → ${v.problemas.map((p) => `${p.tipo}:${p.clave}`).join(', ') || 'ninguno'}`)
