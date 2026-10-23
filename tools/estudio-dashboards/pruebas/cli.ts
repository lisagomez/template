/**
 * Las reglas del CLI: salida idéntica a la del núcleo sobre las mismas entradas (paridad), escrituras en seco por
 * defecto, códigos de salida distintos para uso, esquema, capa y modelo, y nunca una respuesta inventada (sin capa,
 * consultar falla como capa). Contra MetricFlow real, la paridad de una consulta (se omite si falta el entorno).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { construyeCatalogo, consultor, ejecutaHerramienta, memoriaAlertas, memoriaVersiones, type ContextoEstudio } from '../dist/index.js'
import { dirEntorno } from '../dist/metricflow/index.js'
import { FOTO, RAIZ, tablero } from './_doble.ts'

const CLI = join(RAIZ, 'dist', 'cli', 'index.js')
const dir = mkdtempSync(join(tmpdir(), 'estudio-cli-'))
const config = join(dir, 'config.json')
writeFileSync(config, JSON.stringify({ foto: join(RAIZ, 'evaluacion', 'catalogo-golfo-norte.json'), tableros: { ejecutivo: join(RAIZ, 'laboratorio', 'tableros', 'ejecutivo.json') }, almacen: join(dir, 'almacen'), corte: '2026-09' }))
const cli = (...a: string[]) => { const r = spawnSync('node', [CLI, ...a, '--config', config], { encoding: 'utf8', env: { NODE_ENV: process.env['NODE_ENV'] ?? 'test', PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '' } }); return { codigo: r.status, out: r.stdout, err: r.stderr } }
const cat = construyeCatalogo(FOTO, FOTO.dominios)
const nucleo = (): ContextoEstudio => ({ consultor: consultor({ catalogo: async () => FOTO, valores: async () => [], consulta: async () => { throw new Error('sin capa') } }, cat), versiones: memoriaVersiones(), alertas: memoriaAlertas(), tablerosBase: { ejecutivo: tablero('ejecutivo') }, fechaCorte: '2026-09' })
const parche = { esquema: 'estudio.parche/1', base: 0, alcance: { tipo: 'modificar', componentes: ['por_region'] }, operaciones: [{ op: 'cambiar', id: 'por_region', cambios: { tipo: 'linea' } }] }

test.after(() => rmSync(dir, { recursive: true, force: true }))

test('paridad: listar, describir y editar en seco dan EXACTAMENTE lo que da el núcleo', async () => {
  for (const [sub, e] of [['listar_metricas', {}], ['describir_metrica', { metrica: 'ticket_promedio' }], ['editar_dashboard', { tablero: 'ejecutivo', parche }], ['leer_dashboard', { tablero: 'ejecutivo' }]] as const) {
    const r = cli(sub, '--entrada', JSON.stringify(e))
    assert.equal(r.codigo, 0, r.err)
    const directo = JSON.parse(JSON.stringify(await ejecutaHerramienta(nucleo(), sub, e)))
    const viaCli = JSON.parse(r.out)
    if (sub === 'leer_dashboard') for (const v of [...directo.versiones, ...viaCli.versiones]) delete v.cuando
    assert.deepEqual(viaCli, directo, sub)
  }
})

test('escrituras en seco por defecto; --aplicar guarda una versión', () => {
  const seco = cli('editar_dashboard', '--entrada', JSON.stringify({ tablero: 'ejecutivo', parche }))
  assert.equal(JSON.parse(seco.out).aplicado, false)
  assert.equal(existsSync(join(dir, 'almacen', 'ejecutivo.json')), false, 'en seco no se escribe nada')
  const hecho = cli('editar_dashboard', '--entrada', JSON.stringify({ tablero: 'ejecutivo', parche }), '--aplicar')
  assert.deepEqual([hecho.codigo, JSON.parse(hecho.out).aplicado, JSON.parse(hecho.out).version], [0, true, 1])
  assert.equal(JSON.parse(cli('leer_dashboard', '--entrada', '{"tablero":"ejecutivo"}').out).version, 1)
})

test('códigos de salida: 2 uso, 3 esquema, 4 capa, 5 modelo', () => {
  assert.equal(spawnSync('node', [CLI], { encoding: 'utf8' }).status, 2, 'sin subcomando')
  assert.equal(cli('borrar_todo').codigo, 2, 'subcomando desconocido')
  assert.equal(cli('describir_metrica', '--entrada', '{malo').codigo, 2, 'JSON roto')
  assert.equal(cli('describir_metrica', '--entrada', '{"metrica":"ventas_magicas"}').codigo, 3, 'métrica inventada')
  assert.equal(cli('editar_dashboard', '--entrada', JSON.stringify({ tablero: 'ejecutivo', parche: { ...parche, operaciones: [{ op: 'cambiar', id: 'por_region', cambios: { sql: 'select 1' } }] } })).codigo, 3, 'SQL libre')
  const capa = cli('consultar_metricas', '--entrada', '{"metricas":["ventas_netas"]}')
  assert.equal(capa.codigo, 4, 'sin capa: falla, no inventa')
  assert.match(capa.err, /sin capa semántica/)
  assert.equal(cli('agente', 'muéstrame ventas', '--tablero', 'ejecutivo').codigo, 5, 'sin llave ni modelo')
})

const lab = join(RAIZ, 'laboratorio', 'estudio.config.json')
const sinCapa = [join(dirEntorno(), 'bin', 'python'), join(RAIZ, 'laboratorio', 'golfo_norte', 'target', 'semantic_manifest.json')].some((r) => !existsSync(r))
test('paridad contra la capa real: una consulta por CLI = la misma por el núcleo', { skip: sinCapa ? 'falta el entorno o target/ de dbt' : false }, async () => {
  const q = { metricas: ['ventas_netas', 'margen_bruto_pct'], agrupar: ['tienda__region'], periodo: { desde: '2026-01', hasta: '2026-09' }, filtros: [{ dimension: 'linea__canal', operador: 'no_en', valores: ['Mayoreo'] }] }
  const r = spawnSync('node', [CLI, 'consultar_metricas', '--config', lab, '--entrada', JSON.stringify(q)], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const { puertoGolfoNorte } = await import(join(RAIZ, 'laboratorio', 'puerto.mjs'))
  const p = puertoGolfoNorte()
  try {
    const directo = await p.consulta(q)
    const viaCli = JSON.parse(r.stdout)
    assert.deepEqual([viaCli.columnas, viaCli.filas, viaCli.sql], [directo.columnas, directo.filas, directo.sql])
  } finally { await p.cierra() }
})
