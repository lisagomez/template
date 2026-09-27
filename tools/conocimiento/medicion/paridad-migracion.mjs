#!/usr/bin/env node
/**
 * ¿La fuente única dice lo mismo que Hermes? Corre el motor REAL de Hermes (evaluador.py del
 * corte pineado) sobre ESTE paquete ensamblado y compara, caso por caso, con el corpus de paridad,
 * que es lo que ese mismo motor respondía sobre su propio seed.
 *
 * Demuestra dos cosas a la vez:
 * - la migración no cambió ningún veredicto que no esté declarado (y firmado);
 * - Hermes puede leer el paquete tal cual: mismos nombres de campo, sin adaptador.
 *
 * Cada diferencia se clasifica. «orden»: idéntica al ordenar sus listas (checklist, banderas,
 * fuentes), porque Hermes las arma en el orden de su seed y la fuente única ordena las reglas por
 * clave. «contenido»: cualquier otra, que tiene que estar declarada y firmada.
 *
 * Escribe `pruebas/paridad-migracion.json`. La prueba exige que corresponda a la versión actual
 * del paquete y que sus diferencias sean EXACTAMENTE las declaradas en
 * `pruebas/diferencias-esperadas.json`.
 *
 * Uso:  npm run paridad:migracion -- --hermes ~/code/hermes-os-a2a
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { CORTE_HERMES, CorpusParidad, expandeSalida } from '../../grafo-conocimiento/dist/index.js'
import { ensambla } from '../ensambla.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const i = process.argv.indexOf('--hermes')
const clon = i > 0 ? process.argv[i + 1] : undefined
if (!clon) {
  console.error('uso: npm run paridad:migracion -- --hermes <clon de hermes-os-a2a>')
  process.exit(1)
}
const motor = execFileSync('git', ['-C', clon, 'show', `${CORTE_HERMES.commit}:${CORTE_HERMES.motor}`])
if (`sha256:${createHash('sha256').update(motor).digest('hex')}` !== CORTE_HERMES.motor_sha256) {
  console.error('✗ el motor del clon no tiene la huella del corte')
  process.exit(2)
}

const conocimiento = ensambla()
const corpus = CorpusParidad.parse(
  JSON.parse(readFileSync(join(raiz, '..', 'grafo-conocimiento', 'pruebas', 'paridad', 'corpus.json'), 'utf8')),
)
const PILOTO = `
import json, sys
sys.path.insert(0, sys.argv[1])
import evaluador
e = json.load(sys.stdin)
out = [evaluador.evaluar(c["conceptos"], e["reglas"], e["categorias"], c["contexto"]) for c in e["entradas"]]
json.dump(out, sys.stdout, ensure_ascii=False)
`
const tmp = mkdtempSync(join(tmpdir(), 'paridad-migracion-'))
let corrida
try {
  writeFileSync(join(tmp, 'evaluador.py'), motor)
  corrida = spawnSync('python3', ['-c', PILOTO, tmp], {
    input: JSON.stringify({ reglas: conocimiento.reglas, categorias: conocimiento.categorias, entradas: corpus.casos.map((c) => c.entrada) }),
    encoding: 'utf8',
    maxBuffer: 256 << 20,
  })
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
if (corrida.status !== 0) {
  console.error(`✗ el motor de Hermes falló sobre el paquete:\n${corrida.stderr}`)
  process.exit(2)
}
const ahora = JSON.parse(corrida.stdout)
const resumen = (s) => s.conceptos.map((c) => ({ categoria: c.categoria, estado: c.estado, razon: c.razon }))
const ordena = (xs) => [...xs].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
const sinOrden = (s) => ({
  ...s,
  conceptos: s.conceptos.map((c) => ({ ...c, banderas: ordena(c.banderas), checklist: ordena(c.checklist) })),
  banderas_rojas: ordena(s.banderas_rojas),
  checklist: ordena(s.checklist),
  fuentes: ordena(s.fuentes),
})
let soloOrden = 0
const distintos = []
corpus.casos.forEach((caso, n) => {
  const antes = expandeSalida(corpus, caso)
  if (isDeepStrictEqual(ahora[n], antes)) return
  if (isDeepStrictEqual(sinOrden(ahora[n]), sinOrden(antes))) {
    soloOrden++
    return
  }
  distintos.push({ id: caso.id, familia: caso.familia, antes: resumen(antes), despues: resumen(ahora[n]) })
})
const resultado = {
  version: conocimiento.version,
  corte: CORTE_HERMES.commit,
  casos: corpus.casos.length,
  identicos: corpus.casos.length - distintos.length - soloOrden,
  solo_orden: soloOrden,
  distintos_en_contenido: distintos,
}
writeFileSync(join(raiz, 'pruebas', 'paridad-migracion.json'), `${JSON.stringify(resultado, null, 2)}\n`)
console.log(
  `✓ conocimiento ${conocimiento.version} con el motor de Hermes: ${resultado.identicos} idénticos, ` +
    `${soloOrden} iguales salvo el orden de sus listas, ${distintos.length} distintos en contenido (de ${resultado.casos})`,
)
for (const d of distintos) console.log(`  · ${d.id} (${d.familia}): ${JSON.stringify(d.antes)} → ${JSON.stringify(d.despues)}`)
