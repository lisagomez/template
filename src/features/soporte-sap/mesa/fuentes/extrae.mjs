#!/usr/bin/env node
/**
 * Regenera lo que la mesa sabe de sus fuentes. Lo corre el laboratorio:
 *
 *   node src/features/soporte-sap/mesa/fuentes/extrae.mjs sapstack <copia-de-sapstack>
 *     Lee `data/tcodes.yaml` y `data/sap-notes.yaml` de una copia que esté EXACTAMENTE en el SHA de `fuente.json` y
 *     escribe `candidatos-sapstack.json`. Con otro SHA se niega: mover el pin es decisión del laboratorio (se cambia
 *     `fuente.json`, se vuelve a extraer y la diferencia de candidatos va a la mesa).
 *   node src/features/soporte-sap/mesa/fuentes/extrae.mjs base
 *     Vuelve a tomar la foto de `tools/conocimiento` en `base.json` (después de cada `npm run registra`).
 *   node src/features/soporte-sap/mesa/fuentes/extrae.mjs revisa
 *     Pregunta a GitHub el último commit de sapstack (`git ls-remote`) y lo apunta en `fuente.json` → «revision». Avisa,
 *     no mueve: el mapa enseña «commit nuevo» si no coincide con el pin.
 *
 * sapstack es de un tercero: nunca se corre un guion suyo ni se instala nada de él.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { baseDe, candidatosDe } from './generadores.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '../../../../..')
const FUENTE = join(AQUI, 'sapstack/fuente.json')
const escribe = (ruta, x) => writeFileSync(ruta, `${JSON.stringify(x, null, 2)}\n`)
const fuente = () => JSON.parse(readFileSync(FUENTE, 'utf8'))

function sapstack(clon) {
  if (!clon) throw new Error('falta la ruta de la copia de sapstack')
  const f = fuente()
  const head = execFileSync('git', ['-C', clon, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (head !== f.sha) throw new Error(`la copia está en ${head.slice(0, 12)} y el pin es ${f.sha.slice(0, 12)}: mover el pin lo decide el laboratorio, en fuente.json`)
  const c = candidatosDe(clon, f)
  escribe(join(AQUI, 'sapstack/candidatos-sapstack.json'), c)
  console.log(`✓ ${c.candidatos.length} candidatos de ${f.repo}@${f.sha.slice(0, 12)} · ${c.huella.slice(0, 19)}`)
}

function base() {
  const b = baseDe(RAIZ)
  escribe(join(AQUI, 'base.json'), b)
  console.log(`✓ ${b.paquete}: ${b.versiones.length} versión(es) registradas`)
}

function revisa() {
  const f = fuente()
  const salida = execFileSync('git', ['ls-remote', `${f.web}.git`, 'HEAD'], { encoding: 'utf8', timeout: 30_000 })
  const head = salida.split(/\s+/)[0]
  if (!/^[0-9a-f]{40}$/.test(head ?? '')) throw new Error('GitHub no devolvió un commit')
  f.revision = { fecha: new Date().toISOString().slice(0, 10), head }
  escribe(FUENTE, f)
  console.log(head === f.sha ? `✓ sin commits nuevos (${head.slice(0, 12)})` : `! commit nuevo: ${head.slice(0, 12)} (el pin sigue en ${f.sha.slice(0, 12)})`)
}

const [orden, arg] = process.argv.slice(2)
try {
  if (orden === 'sapstack') sapstack(arg)
  else if (orden === 'base') base()
  else if (orden === 'revisa') revisa()
  else throw new Error('uso: extrae.mjs sapstack <copia> | base | revisa')
} catch (e) {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
}
