/**
 * La skill que sigue a Arbrain (`scripts/capa/actualiza.mjs`), probada sin red y sin el Arbrain real: un «autor»
 * sintético con su llave y su ancla, etiquetas firmadas, sin firma, de llave ajena, movidas y renombradas, un mapa de
 * adopción y un template de juguete. Todo vive en un temporal y la configuración global de git queda fuera.
 */
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { actualiza } from '../../../scripts/capa/actualiza.mjs'
import { clasifica } from '../../../scripts/capa/lib/adoptado.mjs'
import { comparaVersion, verificaEstricta } from '../../../scripts/capa/lib/trae.mjs'

interface Pieza { id: string; decision: string; nivel: string; origen: string[]; categoria?: string; destino?: string; simbolos?: Record<string, string[]> }
interface Propuesta { rel: string; accion: string; choques: number }
interface Copia { igual: boolean; propuesta: Propuesta[] }
interface Skill { nombre: string; cambiosTramo: unknown[]; copias: { proyecto: Copia | null; global: Copia | null } }
interface PiezaTocada { id: string; adoptadoEn: string[] }
interface Informe {
  adoptado: { porNivel: Record<string, PiezaTocada[]>; sinCambio: Record<string, number>; tocadas: number }
  alertas: Array<{ tipo: string; texto: string }>
  global: { skills: Skill[] }
  hasta: { etiqueta: string }
}
interface Resultado { codigo: number; estado: string; lineas: string[]; informe?: Informe; escritos?: string[] }

const BASE = mkdtempSync(join(tmpdir(), 'capa-actualiza-'))
process.env.GIT_CONFIG_GLOBAL = join(BASE, 'gitconfig-vacio')
process.env.GIT_CONFIG_NOSYSTEM = '1'
writeFileSync(process.env.GIT_CONFIG_GLOBAL, '')
const OFICIAL = 'https://github.com/arbrain-ai/arbrain.git'

function sh(cmd: string, args: string[], cwd?: string): string {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}
const ID = ['-c', 'user.name=Autor', '-c', 'user.email=autor@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false']
const g = (cwd: string, ...args: string[]) => sh('git', [...ID, ...args], cwd)
const firmada = (cwd: string, llave: string, etiqueta: string, objetivo = 'HEAD') =>
  g(cwd, '-c', 'gpg.format=ssh', '-c', `user.signingkey=${llave}`, 'tag', '-s', etiqueta, '-m', `Arbrain ${etiqueta}`, objetivo)
const pon = (raiz: string, rel: string, texto: string) => {
  mkdirSync(dirname(join(raiz, rel)), { recursive: true })
  writeFileSync(join(raiz, rel), texto)
}
const statusDe = (repo: string) => sh('git', ['--no-optional-locks', '-C', repo, 'status', '--porcelain', '--untracked-files=all'])
const refsDe = (repo: string) => sh('git', ['-C', repo, 'for-each-ref', '--format=%(objectname) %(refname)'])
const corre = (o: Record<string, unknown>) => actualiza(o) as unknown as Resultado

const M = {
  autor: join(BASE, 'autor'), espejo: join(BASE, 'espejo'), template: join(BASE, 'template'), global: join(BASE, 'global-skills'),
  llave: join(BASE, 'llave-autor'), ajena: join(BASE, 'llave-ajena'), ancla: join(BASE, 'firmas-permitidas'),
}
let lock: Record<string, unknown>
const MAPA = {
  fuente: { etiqueta: 'v1.0.0' },
  piezas: [
    { id: 'freno', categoria: 'funcion', decision: 'reimplementa', nivel: 'producto', origen: ['app/freno.ts'], simbolos: { 'app/freno.ts': ['pideCita', 'VIGENCIA'] }, destino: 'tools/capa/src/freno.ts' },
    { id: 'voz', categoria: 'voz', decision: 'adopta', nivel: 'producto', origen: ['app/voz.ts'], destino: 'tools/capa/src/voz.ts' },
    { id: 'agenda', categoria: 'funcion', decision: 'reimplementa', nivel: 'herramienta', origen: ['app/agenda.ts'], destino: 'tools/agenda/agenda.ts' },
    { id: 'skill-memoria', categoria: 'skill', decision: 'adopta', nivel: 'global', origen: ['.claude/skills/memoria/SKILL.md'], destino: '.claude/skills/memoria' },
    { id: 'marca', categoria: 'marca', decision: 'excluye', nivel: 'producto', origen: ['app/marca.ts'] },
  ] satisfies Pieza[],
}

/** El autor sintético: v1.0.0 y v1.1.0 firmadas con su llave; el ancla la autoriza a ella y a nadie más. */
function creaAutor() {
  for (const k of [M.llave, M.ajena]) sh('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'prueba', '-f', k])
  writeFileSync(M.ancla, `autor-prueba namespaces="git" ${readFileSync(`${M.llave}.pub`, 'utf8')}`)
  mkdirSync(M.autor)
  g(M.autor, 'init', '-q', '-b', 'main')
  pon(M.autor, 'VERSION', '1.0.0\n')
  pon(M.autor, 'CAPAS.json', JSON.stringify({ skills_del_autor: ['memoria', 'solo-autor'], alumno: ['.claude/memory/'] }))
  pon(M.autor, 'CHANGELOG.md', '# Cambios\n\n## v1.0.0 · 1 oct · Primera\n')
  pon(M.autor, 'app/freno.ts', 'export function pideCita() {}\nexport const VIGENCIA = 15\n')
  pon(M.autor, 'app/voz.ts', 'export function transcribe() {}\n')
  pon(M.autor, 'app/agenda.ts', 'export function agenda() {}\n')
  pon(M.autor, 'app/marca.ts', 'export const MARCA = "autor"\n')
  pon(M.autor, '.claude/skills/memoria/SKILL.md', '---\nname: memoria\n---\n# Memoria\nlinea a\nlinea b\nlinea c\n')
  pon(M.autor, '.claude/skills/solo-autor/SKILL.md', '# Solo del autor\n')
  g(M.autor, 'add', '-A'); g(M.autor, 'commit', '-q', '-m', 'v1.0.0'); firmada(M.autor, M.llave, 'v1.0.0')
  pon(M.autor, 'VERSION', '1.1.0\n')
  pon(M.autor, 'CHANGELOG.md', '# Cambios\n\n## v1.1.0 · 2 oct · Segunda\n\n## v1.0.0 · 1 oct · Primera\n')
  pon(M.autor, 'app/freno.ts', 'export function pideCita() { return true }\n// ahora avisa a https://api.nube-ajena.test/v1\n')
  pon(M.autor, 'app/marca.ts', 'export const MARCA = "autor 2"\n')
  pon(M.autor, '.claude/skills/memoria/SKILL.md', '---\nname: memoria\n---\n# Memoria\nlinea a\nlinea b\nlinea c\nlinea d del autor\n')
  pon(M.autor, '.claude/skills/memoria/scripts/ayuda.py', 'print("ayuda")\n')
  g(M.autor, 'add', '-A'); g(M.autor, 'commit', '-q', '-m', 'v1.1.0'); firmada(M.autor, M.llave, 'v1.1.0')
}

/** Un espejo: clon con `--origin dani` apuntando al oficial (nunca se contacta: las pruebas no usan la red). */
function clonaEspejo(destino: string, etiquetas: string[]) {
  g(BASE, 'clone', '-q', '--no-tags', '--origin', 'dani', M.autor, destino)
  for (const t of etiquetas) g(destino, 'fetch', '-q', '--no-tags', 'dani', `refs/tags/${t}:refs/tags/${t}`)
  g(destino, 'remote', 'set-url', 'dani', OFICIAL)
  g(destino, '-c', 'advice.detachedHead=false', 'checkout', '-q', etiquetas.at(-1)!)
}

const lockDe = (espejo: string, etiqueta: string) => ({
  espejo, etiqueta, commit: g(espejo, 'rev-parse', `${etiqueta}^{commit}`), objetoEtiqueta: g(espejo, 'rev-parse', `refs/tags/${etiqueta}`),
  ancla: { ruta: M.ancla, sha256: `sha256:${createHash('sha256').update(readFileSync(M.ancla)).digest('hex')}`, principales: ['autor-prueba'] },
})

/** El template de juguete: la capa cita `app/freno.ts` en su cabecera y el proyecto tiene su copia de la skill. */
function creaTemplate() {
  mkdirSync(M.template)
  g(M.template, 'init', '-q', '-b', 'main')
  pon(M.template, 'tools/capa/src/freno.ts', '/** Adaptado de `app/freno.ts` de Arbrain v1.0.0. */\nexport const freno = 1\n')
  pon(M.template, 'tools/capa/NOTICE', 'Piezas de Arbrain v1.0.0.\n')
  pon(M.template, '.claude/skills/memoria/SKILL.md', '---\nname: memoria\n---\n# Memoria\nlinea a\nlección propia: BLOQUEADO si falta una llave\nlinea b\nlinea c\n')
  pon(M.template, 'tools/capa/upstream.lock.json', `${JSON.stringify(lock, null, 2)}\n`)
  g(M.template, 'add', '-A'); g(M.template, 'commit', '-q', '-m', 'template')
  pon(M.global, 'memoria/SKILL.md', '---\nname: memoria\n---\n# Memoria\nlinea a\nlinea b\nlinea c\n')
}

before(() => {
  creaAutor()
  clonaEspejo(M.espejo, ['v1.0.0', 'v1.1.0'])
  lock = lockDe(M.espejo, 'v1.0.0')
  creaTemplate()
})
after(() => rmSync(BASE, { recursive: true, force: true }))

const comun = () => ({ raiz: M.template, rutaLock: join(M.template, 'tools/capa/upstream.lock.json'), mapa: MAPA, proyecto: join(M.template, '.claude/skills'), global: M.global })

test('firma buena: trae lo adoptado por nivel y por pieza, nada de lo excluido, y se detiene en el CDC', () => {
  const salida = join(BASE, 'informe-ok')
  const statusTemplate = statusDe(M.template)
  const r = corre({ ...comun(), fuente: M.espejo, sinRed: true, salida })
  assert.equal(r.codigo, 3, r.lineas.join('\n'))
  assert.equal(r.estado, 'PARADO_EN_CDC')
  const a = r.informe!.adoptado
  assert.deepEqual(a.porNivel.producto!.map((x) => x.id), ['freno'])
  assert.deepEqual(a.porNivel.herramienta, [])
  assert.deepEqual(a.porNivel.global!.map((x) => x.id), ['skill-memoria'])
  assert.deepEqual(a.sinCambio, { producto: 1, herramienta: 1, global: 0 }, 'lo que no cambió se cuenta, no se lista')
  assert.deepEqual(a.porNivel.producto![0]!.adoptadoEn, ['tools/capa/src/freno.ts'], 'la cabecera dice dónde se adoptó')
  assert.ok(!JSON.stringify(r.informe).includes('marca.ts'), 'lo excluido no aparece aunque cambie')
  const tipos = r.informe!.alertas.map((x) => x.tipo)
  assert.ok(tipos.includes('símbolo desaparecido'), 'VIGENCIA ya no está en app/freno.ts')
  assert.ok(tipos.includes('código ejecutable'), 'un script nuevo en una skill se revisa como código')
  assert.match(JSON.stringify(r.informe!.alertas), /salida nueva \(C4\)[^}]*api\.nube-ajena\.test/, 'un host nuevo en lo adoptado es una salida de la máquina')
  assert.match(r.lineas.join('\n'), /FIRMA_OK v1\.1\.0 .*\n(.|\n)*PARADO EN EL CDC/)
  for (const f of ['informe.md', 'cdc-propuesta.md', 'upstream.lock.propuesto.json', 'diff/producto/freno.diff', 'diff/global/skill-memoria.diff']) assert.ok(existsSync(join(salida, f)), f)
  assert.equal(statusDe(M.template), statusTemplate, 'el template no se tocó')
  assert.equal(JSON.parse(readFileSync(join(M.template, 'tools/capa/upstream.lock.json'), 'utf8')).etiqueta, 'v1.0.0', 'el lock no se mueve')
  assert.match(readFileSync(join(salida, 'cdc-propuesta.md'), 'utf8'), /FUERA de \.claude\/gobernanza\/BITACORA-CDC\.md/)
})

test('global: la unión a tres bandas mete lo del autor y conserva lo aprendido aquí, sin escribir en la copia', () => {
  const salida = join(BASE, 'informe-global')
  const r = corre({ ...comun(), fuente: M.espejo, sinRed: true, salida })
  const memoria = r.informe!.global.skills.find((s) => s.nombre === 'memoria')!
  assert.ok(memoria.cambiosTramo.length > 0)
  const p = memoria.copias.proyecto!.propuesta
  assert.deepEqual(p.map((x) => [x.rel, x.choques]), [['SKILL.md', 0], ['scripts/ayuda.py', 0]])
  const unida = readFileSync(join(salida, 'global/memoria/propuesta-proyecto/SKILL.md'), 'utf8')
  assert.match(unida, /lección propia: BLOQUEADO/)
  assert.match(unida, /linea d del autor/)
  assert.doesNotMatch(readFileSync(join(M.template, '.claude/skills/memoria/SKILL.md'), 'utf8'), /linea d del autor/, 'la copia no se toca')
  assert.ok(existsSync(join(salida, 'global/memoria/global-contra-v1.1.0.diff')))
})

test('al día: sin etiqueta nueva sale con 0 en una línea y no escribe la salida', () => {
  const salida = join(BASE, 'informe-al-dia')
  const r = corre({ ...comun(), lock: lockDe(M.espejo, 'v1.1.0'), fuente: M.espejo, sinRed: true, salida })
  assert.equal(r.codigo, 0)
  assert.equal(r.lineas.length, 2)
  assert.match(r.lineas[0]!, /AL DÍA: v1\.1\.0/)
  assert.ok(!existsSync(salida))
})

/** Un clon desechable del espejo con una v1.2.0 mala dentro (sin firma o de llave ajena). */
function espejoConMala(nombre: string, como: 'sin-firma' | 'ajena') {
  const e = join(BASE, nombre)
  clonaEspejo(e, ['v1.0.0', 'v1.1.0'])
  pon(e, 'VERSION', '1.2.0\n')
  pon(e, 'app/freno.ts', 'export function pideCita() { return false }\n')
  g(e, 'add', '-A'); g(e, 'commit', '-q', '-m', 'v1.2.0')
  if (como === 'sin-firma') g(e, 'tag', '-a', 'v1.2.0', '-m', 'Arbrain v1.2.0')
  else firmada(e, M.ajena, 'v1.2.0')
  g(e, '-c', 'advice.detachedHead=false', 'checkout', '-q', 'v1.1.0')
  return e
}

for (const como of ['sin-firma', 'ajena'] as const) {
  test(`etiqueta ${como === 'sin-firma' ? 'sin firma' : 'de llave ajena'}: FALLA y no escribe nada (template, espejo ni salida)`, () => {
    const e = espejoConMala(`espejo-${como}`, como)
    const salida = join(BASE, `informe-${como}`)
    const antes = { template: statusDe(M.template), espejo: statusDe(e), refs: refsDe(e) }
    const r = corre({ ...comun(), fuente: e, sinRed: true, salida })
    assert.equal(r.codigo, 1, r.lineas.join('\n'))
    assert.equal(r.estado, 'FALLA')
    assert.match(r.lineas.join('\n'), /FIRMA_FALLA v1\.2\.0/)
    assert.match(r.lineas.join('\n'), como === 'sin-firma' ? /no signature found/ : /No principal matched/)
    assert.match(r.lineas.join('\n'), /BLOQUEADO/)
    assert.ok(!existsSync(salida), 'la salida no se crea')
    assert.deepEqual({ template: statusDe(M.template), espejo: statusDe(e), refs: refsDe(e) }, antes)
    assert.match(r.lineas.join('\n'), /\.git del espejo: los \d+ archivos IGUALES/)
  })
}

test('por la red: la etiqueta buena pasa al espejo; la mala se queda en la cuarentena y el espejo no recibe ni un objeto', () => {
  const bueno = join(BASE, 'espejo-red-bueno')
  clonaEspejo(bueno, ['v1.0.0'])
  const remotoBueno = join(BASE, 'remoto-bueno')
  g(BASE, 'clone', '-q', '--bare', M.autor, remotoBueno)
  g(remotoBueno, 'tag', '-a', 'v0.9.0', '-m', 'vieja y sin firma', 'v1.0.0^{commit}')
  const ok = corre({ ...comun(), fuente: bueno, remoto: remotoBueno })
  assert.equal(ok.codigo, 3, ok.lineas.join('\n'))
  assert.match(ok.lineas.join('\n'), /TRAÍDA v1\.1\.0 de .*cuarentena → verificada → espejo/)
  assert.match(ok.lineas.join('\n'), /fuera del espejo .*: v0\.9\.0/)
  assert.equal(g(bueno, 'tag', '-l', 'v1.1.0'), 'v1.1.0')
  assert.equal(g(bueno, 'tag', '-l', 'v0.9.0'), '', 'una nueva que no se verificó (anterior al lock) tampoco entra al espejo')
  const remotoMalo = join(BASE, 'remoto-malo')
  g(BASE, 'clone', '-q', '--bare', espejoConMala('taller-red', 'ajena'), remotoMalo)
  const espejo = join(BASE, 'espejo-red-malo')
  clonaEspejo(espejo, ['v1.0.0', 'v1.1.0'])
  const objetos = sh('git', ['-C', espejo, 'count-objects', '-v'])
  const mal = corre({ ...comun(), fuente: espejo, remoto: remotoMalo })
  assert.equal(mal.codigo, 1, mal.lineas.join('\n'))
  assert.equal(g(espejo, 'tag', '-l', 'v1.2.0'), '', 'la etiqueta mala no entra al espejo')
  assert.equal(sh('git', ['-C', espejo, 'count-objects', '-v']), objetos, 'ni sus objetos')
})

test('lo que no se negocia: ancla cambiada, etiqueta movida, regreso de versión y remoto dani ajeno dan FALLA', () => {
  const ancla = { ...(lock.ancla as object), sha256: `sha256:${'0'.repeat(64)}` }
  assert.equal(corre({ ...comun(), lock: { ...lock, ancla }, fuente: M.espejo, sinRed: true }).codigo, 1, 'ancla cambiada')
  assert.equal(corre({ ...comun(), lock: lockDe(M.espejo, 'v1.1.0'), etiqueta: 'v1.0.0', fuente: M.espejo, sinRed: true }).codigo, 1, 'regreso')
  const movido = join(BASE, 'remoto-movido')
  g(BASE, 'clone', '-q', '--bare', M.autor, movido)
  g(movido, 'tag', '-d', 'v1.0.0')
  firmada(movido, M.llave, 'v1.0.0', 'v1.1.0^{commit}')
  const r = corre({ ...comun(), fuente: M.espejo, remoto: movido })
  assert.equal(r.codigo, 1, 'etiqueta movida')
  assert.match(r.lineas.join('\n'), /movió etiqueta\(s\) que el espejo ya tenía: v1\.0\.0/)
  const ajeno = join(BASE, 'espejo-dani-ajeno')
  clonaEspejo(ajeno, ['v1.0.0', 'v1.1.0'])
  g(ajeno, 'remote', 'set-url', 'dani', 'https://example.invalid/otro.git')
  assert.equal(corre({ ...comun(), fuente: ajeno, sinRed: true }).codigo, 1, 'remoto dani ajeno')
})

test('verificación estricta: una etiqueta renombrada o con otro VERSION no pasa aunque la firma sea del autor', () => {
  const e = join(BASE, 'espejo-estricto')
  clonaEspejo(e, ['v1.0.0', 'v1.1.0'])
  firmada(e, M.llave, 'v1.9.0', 'v1.1.0^{commit}')
  g(e, 'update-ref', 'refs/tags/v1.3.0', g(e, 'rev-parse', 'refs/tags/v1.9.0'))
  const base = String(lock.commit)
  const comunV = { repo: e, ancla: M.ancla, principales: ['autor-prueba'], base }
  assert.match(verificaEstricta({ ...comunV, etiqueta: 'v1.3.0' }).motivo ?? '', /renombrada/)
  assert.match(verificaEstricta({ ...comunV, etiqueta: 'v1.9.0' }).motivo ?? '', /VERSION dentro de v1\.9\.0 dice «1\.1\.0»/)
  assert.equal(verificaEstricta({ ...comunV, etiqueta: 'v1.1.0' }).ok, true)
  assert.match(verificaEstricta({ ...comunV, etiqueta: 'v1.1.0', principales: ['otro'] }).motivo ?? '', /no es un principal del ancla/)
})

test('clasificación: cada cambio va a su nivel y a su pieza; una carpeta de origen cubre lo de dentro; versiones en orden', () => {
  const piezas: Pieza[] = [
    { id: 'p', decision: 'adopta', nivel: 'producto', origen: ['a/x.ts'] },
    { id: 'h', decision: 'reimplementa', nivel: 'herramienta', origen: ['b'] },
    { id: 'g', decision: 'adopta', nivel: 'global', origen: ['.claude/skills/s/SKILL.md'] },
    { id: 'q', decision: 'adopta', nivel: 'producto', origen: ['c/y.ts'] },
  ]
  const lista = [{ estado: 'M', ruta: 'a/x.ts' }, { estado: 'A', ruta: 'b/nuevo.ts' }, { estado: 'R', ruta: 'z/s.md', antes: '.claude/skills/s/SKILL.md' }, { estado: 'M', ruta: 'bb/no.ts' }]
  const c = clasifica(lista, piezas)
  assert.deepEqual(Object.fromEntries(Object.entries(c.porNivel).map(([n, xs]) => [n, (xs as Array<{ pieza: Pieza }>).map((x) => x.pieza.id)])), { producto: ['p'], herramienta: ['h'], global: ['g'] })
  assert.deepEqual(c.sinCambio, { producto: 1, herramienta: 0, global: 0 })
  assert.equal(c.tocadas, 3)
  assert.ok(comparaVersion('v0.2.10', 'v0.2.9') > 0, 'v0.2.10 es más nueva que v0.2.9 (no orden de texto)')
})
