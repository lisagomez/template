#!/usr/bin/env node
/**
 * Recorrido del CLI del Estudio sobre la capa REAL del laboratorio: cada subcomando con su código de salida y un
 * extracto de su salida → docs/goals/estudio-dashboards-medicion/recorrido-cli.md. El almacén va a un directorio
 * temporal (no toca el del lienzo). El subcomando `agente` corre solo si OPENROUTER_API_KEY está en el entorno.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const AQUI = import.meta.dirname
const RAIZ = join(AQUI, '..', '..', '..')
const CLI = join(AQUI, '..', 'dist', 'cli', 'index.js')
const tmp = mkdtempSync(join(tmpdir(), 'estudio-cli-'))
const base = JSON.parse(readFileSync(join(AQUI, 'estudio.config.json'), 'utf8'))
const abs = (r) => (r.startsWith('./') || r.startsWith('../') ? join(AQUI, r) : r)
const config = { ...base, metricflow: { ...base.metricflow, proyecto: abs(base.metricflow.proyecto), perfiles: abs(base.metricflow.perfiles), entorno: { ...base.metricflow.entorno, GN_DATOS: abs(base.metricflow.entorno.GN_DATOS) } }, tableros: Object.fromEntries(Object.entries(base.tableros).map(([k, v]) => [k, abs(v)])), perfil: abs(base.perfil), almacen: join(tmp, 'almacen') }
writeFileSync(join(tmp, 'config.json'), JSON.stringify(config))
writeFileSync(join(tmp, 'foto.json'), JSON.stringify({ foto: join(AQUI, '..', 'evaluacion', 'catalogo-golfo-norte.json'), corte: '2026-09' }))
const lineas = ['# Recorrido del CLI del Estudio', '', `Generado por \`laboratorio/recorrido-cli.mjs\` el ${new Date().toISOString().slice(0, 10)} contra la capa real (MetricFlow sobre golfo_norte). Almacén temporal. Grado del CLI: **no medido**.`, '']
const extracto = (s) => (s.length > 700 ? `${s.slice(0, 700)}… (${s.length} caracteres)` : s)
function corre(titulo, args, { cfg = 'config.json', env = {} } = {}) {
  const r = spawnSync('node', [CLI, ...args, '--config', join(tmp, cfg)], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env } })
  const salida = (r.stdout || r.stderr).trim()
  lineas.push(`## ${titulo}`, '', '```', `$ estudio-dashboards ${args.map((a) => (/[\s"{]/.test(a) ? `'${a}'` : a)).join(' ')}`, `# código de salida: ${r.status}`, extracto(salida), '```', '')
  console.log(`${String(r.status).padStart(2)} · ${titulo}`)
  return { codigo: r.status, json: (() => { try { return JSON.parse(salida) } catch { return null } })() }
}
const parche = (tipo, componentes, operaciones) => JSON.stringify({ tablero: 'ejecutivo', parche: { esquema: 'estudio.parche/1', base: 0, alcance: { tipo, componentes }, operaciones } })
corre('ayuda', ['ayuda'])
corre('listar_metricas', ['listar_metricas'])
corre('describir_metrica', ['describir_metrica', '--entrada', '{"metrica":"ticket_promedio"}'])
corre('consultar_metricas: margen por región sin mayoreo, 2026', ['consultar_metricas', '--entrada', JSON.stringify({ metricas: ['margen_bruto_pct'], agrupar: ['tienda__region'], periodo: { desde: '2026-01', hasta: '2026-09' }, filtros: [{ dimension: 'linea__canal', operador: 'no_en', valores: ['Mayoreo'] }] })])
corre('leer_dashboard', ['leer_dashboard', '--entrada', '{"tablero":"ejecutivo"}'])
const p = parche('modificar', ['por_region'], [{ op: 'cambiar', id: 'por_region', cambios: { tipo: 'linea' } }])
const seco = corre('editar_dashboard EN SECO (por defecto)', ['editar_dashboard', '--entrada', p])
lineas.push(`¿Se escribió algo en el almacén tras el seco? ${existsSync(join(tmp, 'almacen', 'ejecutivo.json')) ? 'sí (MAL)' : 'no'} · aplicado: ${seco.json?.aplicado}`, '')
corre('editar_dashboard --aplicar', ['editar_dashboard', '--entrada', p, '--aplicar'])
corre('analizar_variacion: margen de julio de 2026', ['analizar_variacion', '--entrada', '{"metrica":"margen_bruto_pct","periodo":{"desde":"2026-07","hasta":"2026-07"}}'])
corre('ver_senales', ['ver_senales'])
corre('crear_alerta EN SECO: propuesta y evaluación, sin canal', ['crear_alerta', '--entrada', JSON.stringify({ regla: { metrica: 'ventas_netas', filtros: [{ dimension: 'tienda__tienda_nombre', operador: 'en', valores: ['Mérida'] }], condicion: 'cae_mas_de', valor: 5, unidad: '%', ventana: 'semanal' } })])
corre('crear_alerta --aplicar SIN quien confirme → rechazo (3)', ['crear_alerta', '--entrada', JSON.stringify({ regla: { metrica: 'ventas_netas', filtros: [], condicion: 'cae_mas_de', valor: 5, unidad: '%', ventana: 'mensual' } }), '--aplicar'])
corre('proponer_metrica: se arma con piezas que existen → diff, sin PR', ['proponer_metrica', '--entrada', JSON.stringify({ nombre: 'venta_ecommerce_por_pedido', etiqueta: 'Venta e-commerce por pedido', descripcion: 'Ventas e-commerce entre pedidos', tipo: 'ratio', numerador: 'ventas_ecommerce', denominador: 'pedidos', dueno: 'Digital', unidad: 'MXN' })])
corre('proponer_metrica: NPS no existe en la capa → requiere datos', ['proponer_metrica', '--entrada', JSON.stringify({ nombre: 'nps', etiqueta: 'NPS', descripcion: 'Net Promoter Score', tipo: 'simple', medida: 'respuestas_nps', dueno: 'Experiencia', unidad: 'puntos' })])
corre('comparar_versiones 0 → 1 (componentes y cifras)', ['comparar_versiones', '--entrada', '{"tablero":"ejecutivo","a":0,"b":1}'])
corre('volver_version EN SECO', ['volver_version', '--entrada', '{"tablero":"ejecutivo","n":0}'])
corre('fijar_oficial --aplicar', ['fijar_oficial', '--entrada', '{"tablero":"ejecutivo","n":1}', '--aplicar'])
if (process.env.OPENROUTER_API_KEY) corre('agente EN SECO (LLM real, modelo pineado de la config)', ['agente', '¿Cómo se calcula el ticket promedio?', '--tablero', 'ejecutivo'], { env: { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY } })
corre('error de uso → 2', ['consultar_metricas', '--entrada', '{roto'])
corre('métrica inventada → 3', ['describir_metrica', '--entrada', '{"metrica":"ventas_magicas"}'])
corre('SQL libre en un filtro → 3', ['consultar_metricas', '--entrada', JSON.stringify({ metricas: ['ventas_netas'], filtros: [{ dimension: 'tienda__region', operador: 'en', valores: ["Golfo' union select * from raw_clientes --"] }] })])
corre('sin capa (solo la foto del catálogo): consultar falla, no inventa → 4', ['consultar_metricas', '--entrada', '{"metricas":["ventas_netas"]}'], { cfg: 'foto.json' })
corre('agente sin llave → 5', ['agente', 'muéstrame ventas', '--tablero', 'ejecutivo'])
writeFileSync(join(RAIZ, 'docs', 'goals', 'estudio-dashboards-medicion', 'recorrido-cli.md'), `${lineas.join('\n')}\n`)
