#!/usr/bin/env node
/**
 * Pruebas del inventario de activos (spec 014). `node --test scripts/prueba-inventario.ts`.
 * Sobre repos de juguete en memoria: sin red, sin disco, sin git, sin base de datos.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { descubre, cruza, camposProhibidos, validaAsientos, hashDeActivo, coincide, TIPOS, CLASES }
  from './inventario/nucleo.mjs'
import { construccion, componenteConstruccion, componenteOperacion, clasificacionPropuesta }
  from './inventario/costeo.mjs'
import { sqlDeActivos } from './inventario/sql.mjs'
import { renderVista } from './inventario/vista.mjs'

type Activo = Record<string, unknown>
const archivos = ['tools/a/index.ts', 'tools/a/package.json', 'tools/b/index.ts', 'scripts/g.mjs',
  '.claude/skills/x/SKILL.md', '.claude/skills/y/SKILL.md']
const activo = (id: string, cubre: string[], extra: Activo = {}): Activo => ({
  id, nombre: id, tipo: 'software', clase: 'FABRICA', estado: 'beta',
  ubicacion: cubre[0].replace('/*', ''), responsable: 'dep-sw', cubre, ...extra,
})
const indice = (activos: Activo[]) => ({
  fuentes: [{ patron: 'tools/*/' }, { patron: 'scripts/*.mjs' }, { patron: '.claude/skills/*/' }, { patron: 'cli-impreso' }],
  activos,
})
const existe = (r: string) => r.startsWith('cli:') || archivos.some((a) => a === r || a.startsWith(`${r}/`))
const todoCubierto = () => indice([activo('TPL-a', ['tools/a']), activo('TPL-b', ['tools/b']),
  activo('TPL-g', ['scripts/g.mjs']), activo('TPL-skills', ['.claude/skills/*']),
  activo('TPL-clis', ['cli:*'], { externo: true, ubicacion: 'cli:*' })])

test('descubre unidades por fuente: directorios, archivos y CLIs impresos', () => {
  const u = descubre(todoCubierto(), archivos, ['polar'])
  assert.deepEqual(u, ['.claude/skills/x', '.claude/skills/y', 'cli:polar', 'scripts/g.mjs', 'tools/a', 'tools/b'])
  assert.ok(coincide('docs/SDD-*', 'docs/SDD-uno.md'))
  assert.ok(!coincide('tools/*', 'tools/a/b'), '* no cruza /')
})

test('repo cubierto: cero hallazgos; una skill nueva cae en el grupo y no hace ruido', () => {
  const idx = todoCubierto()
  const { hallazgos, porActivo } = cruza(idx, descubre(idx, archivos, ['polar']), existe)
  assert.deepEqual(hallazgos, [])
  assert.equal(porActivo.get('TPL-skills').length, 2)
})

test('DIENTES: una herramienta nueva sin asiento es NUEVO y se nombra', () => {
  const idx = todoCubierto()
  const conNueva = [...archivos, 'tools/fantasma/index.ts']
  const { hallazgos } = cruza(idx, descubre(idx, conNueva, ['polar']), existe)
  assert.deepEqual(hallazgos, [{ tipo: 'NUEVO', unidad: 'tools/fantasma' }])
})

test('DIENTES: un asiento sin unidades, o con ubicacion borrada, es HUERFANO', () => {
  const idx = todoCubierto()
  idx.activos.push(activo('TPL-borrada', ['tools/borrada']))
  const { hallazgos } = cruza(idx, descubre(idx, archivos, ['polar']), existe)
  assert.equal(hallazgos.length, 1)
  assert.equal(hallazgos[0].tipo, 'HUERFANO')
  assert.equal(hallazgos[0].activo, 'TPL-borrada')
})

test('una unidad con dos duenos es AMBIGUO: su costo se contaria dos veces', () => {
  const idx = todoCubierto()
  idx.activos.push(activo('TPL-otra', ['tools/a']))
  const { hallazgos } = cruza(idx, descubre(idx, archivos, ['polar']), existe)
  assert.deepEqual(hallazgos, [{ tipo: 'AMBIGUO', unidad: 'tools/a', activos: ['TPL-a', 'TPL-otra'] }])
})

test('REPO PUBLICO: el indice rechaza costo y clasificacion estrategica', () => {
  const idx = todoCubierto()
  Object.assign(idx.activos[0], { costo_construccion: { usd: 3 }, eje_dei: 'desarrollo', defensibilidad: 'defendible' })
  assert.deepEqual(camposProhibidos(idx), ['activos[0].costo_construccion',
    'activos[0].costo_construccion.usd', 'activos[0].eje_dei', 'activos[0].defensibilidad'])
})

test('asientos mal formados: enum, id y campo desconocido', () => {
  const idx = indice([activo('mal id', ['tools/a'], { tipo: 'app', clase: 'X', estado: 'vivo', color: 'rojo' })])
  const errores = validaAsientos(idx, existe).join('\n')
  for (const esperado of ['id debe ser TPL-', 'tipo «app»', 'clase «X»', 'estado «vivo»', 'campo desconocido «color»']) {
    assert.ok(errores.includes(esperado), esperado)
  }
})

test('los enums son los de los check de 005_activos.sql y del catalogo', () => {
  assert.deepEqual(TIPOS, ['software', 'config_agentica', 'datos', 'documento', 'infraestructura', 'licencia_suscripcion'])
  assert.deepEqual(CLASES, ['PRODUCTO', 'FABRICA', 'CONOCIMIENTO', 'DISEÑO', 'COMERCIAL', 'INFRA'])
})

test('el hash cambia con el contenido y no con el orden de listado', () => {
  const bytes = (c: string) => () => Buffer.from(c)
  const h1 = hashDeActivo(['tools/a'], archivos, bytes('uno'))
  assert.equal(h1, hashDeActivo(['tools/a'], [...archivos].reverse(), bytes('uno')))
  assert.notEqual(h1, hashDeActivo(['tools/a'], archivos, bytes('dos')))
  assert.equal(hashDeActivo(['cli:polar'], archivos, bytes('x')), null)
})

const porActivo = new Map([['TPL-a', ['tools/a']], ['TPL-b', ['tools/b']]])
const t = (h: number) => Date.parse(`2026-09-10T${String(h).padStart(2, '0')}:00:00Z`)
const commits = [
  { hash: 'c1', fecha: t(10), archivos: ['tools/a/index.ts', 'tools/a/package.json', 'tools/b/index.ts'] },
  { hash: 'c2', fecha: t(20), archivos: ['tools/b/index.ts'] },
]
const sesion = (costoUsd: number | null) => ({ cuando: { inicio: '2026-09-10T09:00:00Z', fin: '2026-09-10T11:00:00Z' },
  uso: { entrada: 300, salida: 30, cacheLectura: 0 }, costoUsd })

test('costeo: la sesion se reparte por archivos tocados; lo no cubierto se dice PARCIAL', () => {
  const datos = construccion(porActivo, commits, [sesion(3)])
  const a = componenteConstruccion('TPL-a', datos)
  const b = componenteConstruccion('TPL-b', datos)
  assert.equal(a.usd, 2)
  assert.equal(b.usd, 1)
  assert.deepEqual(a.tokens, { in: 200, out: 20 })
  assert.equal(b.parcial, true, 'c2 de TPL-b cae fuera de toda sesion')
  assert.match(b.fuente, /1\/2 commits cubiertos — PARCIAL/)
})

test('NUNCA un cero inventado: sin sesion es null con razon; sin costoUsd, tokens sin USD', () => {
  const nada = componenteConstruccion('TPL-a', construccion(porActivo, commits, []))
  assert.equal(nada.usd, null)
  assert.match(nada.fuente, /^no_medido: ninguno de los 1 commits/)
  const sinPrecio = componenteConstruccion('TPL-a', construccion(porActivo, commits, [sesion(null)]))
  assert.equal(sinPrecio.usd, null)
  assert.deepEqual(sinPrecio.tokens, { in: 200, out: 20 })
  const op = componenteOperacion({ ubicacion: 'tools/a' }, [], [{ actor: { herramienta: 'a' }, costoUsd: null }])
  assert.equal(op.usd_mes, null)
  assert.match(op.fuente, /^no_medido: 1 corrida/)
})

test('clasificacion siempre propuesta y reemplazable en repo publico', () => {
  const c = clasificacionPropuesta({ estado: 'blueprint' })
  assert.deepEqual([c.di, c.defensibilidad, c.estado], ['investigacion', 'reemplazable', 'propuesta'])
  assert.equal(clasificacionPropuesta({ estado: 'beta', origen: ['.claude/specs/007-x'] }).di, 'desarrollo')
})

test('SQL: sin USD no hay fila en act_costo; el UUID del tenant es variable, no literal', () => {
  const fila = (usd: number | null) => ({ id: 'TPL-a', clasificacion_erp: { di: 'desarrollo', defensibilidad: 'reemplazable' },
    costo_construccion: { usd, fuente: 'f', tokens: { in: 1, out: 1 } } })
  const a = { id: 'TPL-a', nombre: "l'a", tipo: 'software', ubicacion: 'tools/a', responsable: 'dep-sw', hash: 'h' }
  const con = sqlDeActivos([a], [fila(1.5)], '2026-09-24')
  const sin = sqlDeActivos([a], [fila(null)], '2026-09-24')
  assert.match(con, /insert into erp\.act_costo/)
  assert.doesNotMatch(sin, /act_costo/)
  assert.doesNotMatch(con, /costo_acumulado/, 'lo mantiene el trigger')
  assert.match(con, /'l''a'/, 'comillas escapadas')
  assert.doesNotMatch(con, /[0-9a-f]{8}-[0-9a-f]{4}-/, 'ningun UUID literal')
})

test('la vista no lleva costo ni clasificacion y es determinista', () => {
  const idx = todoCubierto()
  const { porActivo: pa } = cruza(idx, descubre(idx, archivos, ['polar']), existe)
  const v = renderVista(idx, pa)
  assert.equal(v, renderVista(idx, pa))
  assert.doesNotMatch(v, /\$|usd|desarrollo|investigacion|defendible/i)
})
