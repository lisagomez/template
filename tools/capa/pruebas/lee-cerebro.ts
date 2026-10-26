/**
 * Leer el cerebro desde un espejo en solo lectura (`scripts/capa/lee-cerebro.mjs`), contra un cerebro sintético con
 * la forma de la capa del alumno de Arbrain: esencia, índice con disparadores y user/feedback/project/reference.
 * Ninguna persona real: las memorias, el precio y la «llave» son inventados.
 */
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { enTexto, leeCerebro, palabras } from '../../../scripts/capa/lee-cerebro.mjs'
import { huellaDirectorio } from '../../../scripts/capa/lib/huella.mjs'

interface Encontrado { ruta: string; tipo: string; lineas: Array<{ n: number; texto: string }>; via?: string }
interface Lectura {
  codigo: number; ok: boolean; encontrados: Encontrado[]; saltados: Array<{ ruta: string }>
  soloLectura: { igual: boolean; statusAntes: string; statusDespues: string; huellaAntes: { sha256: string } }
}

const BASE = mkdtempSync(join(tmpdir(), 'capa-cerebro-'))
process.env.GIT_CONFIG_GLOBAL = join(BASE, 'gitconfig-vacio')
process.env.GIT_CONFIG_NOSYSTEM = '1'
writeFileSync(process.env.GIT_CONFIG_GLOBAL, '')
const CEREBRO = join(BASE, 'cerebro')
const CENTRO = join(BASE, 'centro.git')

const g = (cwd: string, ...args: string[]) => {
  const r = spawnSync('git', ['-c', 'user.name=Sintetico', '-c', 'user.email=s@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr)
  return r.stdout.trim()
}
const pon = (rel: string, texto: string) => {
  mkdirSync(dirname(join(CEREBRO, rel)), { recursive: true })
  writeFileSync(join(CEREBRO, rel), texto)
}
const lee = (o: Record<string, unknown>) => leeCerebro(o as Parameters<typeof leeCerebro>[0]) as unknown as Lectura

before(() => {
  mkdirSync(CEREBRO)
  g(CEREBRO, 'init', '-q', '-b', 'main')
  pon('.claude/memory/MEMORY.md', '# Esencia\nHablo directo y en español.\n')
  pon('.claude/memory/MEMORY-indice.md', '# Índice\n- [Precio del plan](project/precio-del-plan.md) — triggers: precio, plan, suscripción\n')
  pon('.claude/memory/project/precio-del-plan.md', '# Precio del plan\nEl plan sube a US$49 al mes desde el 1 de noviembre.\n')
  pon('.claude/memory/feedback/no-enviar.md', '# No enviar sin revisión\nNunca mandar el precio a clientes sin revisarlo.\n')
  pon('.claude/memory/reference/pagos.md', '# Pagos\nEl precio se cobra con la llave sk-falsa-012345678 (falsa).\n')
  pon('.claude/memory/.env.local', 'PRECIO_LLAVE=no-se-lee\n')
  pon('.claude/daily/2026-10-24.md', '# Conversación\nhablamos del precio del plan\n')
  pon('.claude/knowledge/precios.md', '# Conocimiento\nEl precio de la competencia es US$45.\n')
  g(CEREBRO, 'add', '-A')
  g(CEREBRO, 'commit', '-q', '-m', 'cerebro sintético')
  appendFileSync(join(CEREBRO, '.claude/memory/project/precio-del-plan.md'), 'Sin commit: el precio pasa a US$59.\n')
  pon('.claude/memory/project/borrador.md', '# Borrador sin seguimiento\nprecio tentativo\n')
  g(BASE, 'clone', '-q', '--bare', CEREBRO, CENTRO)
})
after(() => rmSync(BASE, { recursive: true, force: true }))

test('encuentra el tema en la memoria del commit, por el detalle y por el índice, y la lectura no cambia nada', () => {
  const r = lee({ repo: CEREBRO, tema: '¿Cuál es el precio del plan?' })
  assert.equal(r.codigo, 0)
  assert.equal(r.encontrados[0]!.ruta, '.claude/memory/project/precio-del-plan.md')
  assert.equal(r.encontrados[0]!.tipo, 'project')
  const rutas = r.encontrados.map((e) => e.ruta)
  assert.ok(rutas.includes('.claude/memory/MEMORY-indice.md'), 'el índice con disparadores también cuenta')
  assert.ok(!rutas.some((x) => x.includes('daily') || x.includes('knowledge')), 'ni conversaciones ni knowledge sin --todo')
  const todo = JSON.stringify(r.encontrados)
  assert.doesNotMatch(todo, /US\$59/, 'se lee el commit, no el árbol')
  assert.doesNotMatch(todo, /borrador/, 'lo no versionado no se lee')
  assert.doesNotMatch(todo, /falsa-012345678/, 'lo que parece una llave se enmascara')
  assert.ok(r.saltados.some((s) => s.ruta.endsWith('.env.local')), 'el .env se salta y se dice')
  assert.equal(r.soloLectura.igual, true)
  assert.notEqual(r.soloLectura.statusAntes, '', 'el espejo tenía cambios y siguen ahí, iguales')
  assert.equal(r.soloLectura.statusAntes, r.soloLectura.statusDespues)
  assert.match(enTexto(r as unknown as Parameters<typeof enTexto>[0]), /Solo lectura comprobada: huella por contenido IGUAL/)
})

test('lo que no está, no se inventa: sale con 4 y la lista vacía', () => {
  const r = lee({ repo: CEREBRO, tema: 'telescopio marciano' })
  assert.equal(r.codigo, 4)
  assert.deepEqual(r.encontrados, [])
  assert.equal(r.soloLectura.igual, true)
})

test('--todo suma knowledge, plan y diario, pero nunca las conversaciones de daily/', () => {
  const r = lee({ repo: CEREBRO, tema: 'precio competencia', todo: true })
  const rutas = r.encontrados.map((e) => e.ruta)
  assert.ok(rutas.includes('.claude/knowledge/precios.md'))
  assert.ok(!rutas.some((x) => x.includes('.claude/daily/')))
})

test('también lee un centro sin árbol (repo bare), en solo lectura', () => {
  const r = lee({ repo: CENTRO, tema: 'precio plan' })
  assert.equal(r.codigo, 0)
  assert.equal(r.soloLectura.statusAntes, '(repo sin árbol de trabajo)')
  assert.equal(r.soloLectura.igual, true)
})

test('la huella por contenido caza un byte, un archivo nuevo vacío y nada más', () => {
  const d = join(BASE, 'huella')
  mkdirSync(d)
  writeFileSync(join(d, 'a.md'), 'uno')
  const h0 = huellaDirectorio(d).sha256
  assert.equal(huellaDirectorio(d).sha256, h0, 'leer no cambia la huella')
  writeFileSync(join(d, 'a.md'), 'unO')
  assert.notEqual(huellaDirectorio(d).sha256, h0, 'un byte')
  writeFileSync(join(d, 'a.md'), 'uno')
  assert.equal(huellaDirectorio(d).sha256, h0)
  writeFileSync(join(d, 'nuevo'), '')
  assert.notEqual(huellaDirectorio(d).sha256, h0, 'un archivo vacío nuevo')
  assert.equal(huellaDirectorio(d, { excluye: ['nuevo'] }).sha256, h0)
  assert.deepEqual(palabras('¿Qué precio tiene el PLAN Pro?'), ['precio', 'plan', 'pro'], 'sin acentos, sin mayúsculas y sin palabras vacías')
})
