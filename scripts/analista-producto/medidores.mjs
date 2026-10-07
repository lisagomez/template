#!/usr/bin/env node
/**
 * Los medidores del analista de producto (SDD §3.5): corre una LISTA BLANCA de comandos que no
 * escriben en el arbol y guarda cada salida en `<corrida>/mediciones/<id>.txt`, con una cabecera que
 * dice que comando la produjo, cuando, sobre que commit y con que codigo de salida. Las cifras del
 * informe salen de aqui, no del modelo: una cifra sin el comando que la produjo es hipotesis.
 *
 * Lo que NO esta en la lista, y por que: `mide:mcp`, `trayectorias:informe` y `vigila:versiones`
 * escriben en el arbol (o salen a la red). El analista cita su ultima salida versionada, con fecha.
 *
 * Uso:  node scripts/analista-producto/medidores.mjs docs/analisis/<fecha>
 * Exit: 0 si pudo capturar todos (aunque alguno salga rojo: un rojo tambien es una medicion) · 1 si no.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** La lista blanca. `id` es el nombre del archivo; `comando`, lo que se corre tal cual. */
export const MEDIDORES = [
  { id: 'contexto', comando: 'npm run mide:contexto' },
  { id: 'imprenta', comando: 'npm run audita:imprenta' },
  { id: 'routing', comando: 'npm run verifica:routing' },
  { id: 'inventario', comando: 'npm run verifica:inventario' },
  { id: 'gates', comando: 'npm run gates' },
  { id: 'regresion', comando: 'npm run regresion' },
  { id: 'gobernanza', comando: 'npm run verify:gobernanza' },
  { id: 'readmes', comando: 'npm run revisa:readmes' },
  { id: 'specs', comando: 'npm run verifica:specs' },
  { id: 'commits', comando: 'git rev-list --count HEAD' },
  { id: 'merges', comando: 'git rev-list --count --merges HEAD' },
]

const sinColor = (s) => s.replace(/\x1b\[[0-9;]*m/g, '')

function captura({ id, comando }, destino, commit) {
  const [bin, ...args] = comando.split(' ')
  const r = spawnSync(bin, args, { cwd: raiz, encoding: 'utf8', timeout: 300_000, maxBuffer: 32 * 1024 * 1024 })
  const cabecera = [
    `# comando: ${comando}`,
    `# fecha: ${new Date().toISOString()}`,
    `# commit: ${commit}`,
    `# salida: ${r.status ?? 'sin codigo (timeout o senal)'}`,
    '# capturado por scripts/analista-producto/medidores.mjs; colores ANSI quitados',
    '',
  ].join('\n')
  writeFileSync(join(destino, `${id}.txt`), cabecera + sinColor(`${r.stdout ?? ''}${r.stderr ?? ''}`))
  return r.status
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const corrida = process.argv[2]
  if (!corrida) {
    console.error('uso: node scripts/analista-producto/medidores.mjs docs/analisis/<fecha>')
    process.exit(1)
  }
  const destino = resolve(raiz, corrida, 'mediciones')
  if (!/^\d{4}-\d{2}-\d{2}\/mediciones$/.test(relative(resolve(raiz, 'docs', 'analisis'), destino))) {
    console.error('el analista solo escribe en docs/analisis/<fecha>/')
    process.exit(1)
  }
  mkdirSync(destino, { recursive: true })
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: raiz, encoding: 'utf8' }).trim()
  for (const m of MEDIDORES) {
    const salida = captura(m, destino, commit)
    console.log(`${salida === 0 ? '✓' : '●'} ${m.id.padEnd(11)} ${m.comando}  (salida ${salida})`)
  }
  console.log(`\n${MEDIDORES.length} mediciones en ${relative(raiz, destino)}`)
}
