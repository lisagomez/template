/**
 * Contra la capa REAL (MetricFlow sobre golfo_norte en DuckDB): las cifras del tablero cuadran con la tabla de
 * cifras, el motor reencuentra las 3 señales sembradas SIN que nada en el motor ni en el perfil las nombre, y el
 * análisis de julio da la caída de margen de la propuesta. Si el entorno o los datos no están (otro clon, CI sin
 * `.datos/`), se OMITE y lo dice: omitir no es pasar.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { analizaVariacion, cargaCatalogo, consultor, detectaSenales, resuelve } from '../dist/index.js'
import { dirEntorno } from '../dist/metricflow/index.js'
import { RAIZ, tablero } from './_doble.ts'

const lab = join(RAIZ, 'laboratorio')
const { DATOS_GN, DUCKDB_GN, puertoGolfoNorte } = await import(join(lab, 'puerto.mjs'))
const { PERFIL_GN, MAPA_GN } = await import(join(lab, 'perfil.mjs'))
const falta = [[join(dirEntorno(), 'bin', 'python'), 'entorno Python del lock'], [join(DATOS_GN, 'pedidos.csv'), 'CSV en .datos/'], [DUCKDB_GN, 'golfo_norte.duckdb (corre laboratorio/corre.mjs)'], [join(lab, 'golfo_norte', 'target', 'semantic_manifest.json'), 'target/ de dbt']].filter(([r]) => !existsSync(r!)).map(([, q]) => q)
const omitir = falta.length ? `falta: ${falta.join(', ')}` : false
const cifras = JSON.parse(readFileSync(join(RAIZ, '..', '..', 'docs', 'goals', 'estudio-dashboards-medicion', 'cifras.json'), 'utf8')) as { cifras: { id: string; metricflow: number | null }[] }
const mf = (id: string) => cifras.cifras.find((c) => c.id === id)!.metricflow!

test('capa real: tablero, señales y análisis', { skip: omitir }, async (t) => {
  const puerto = puertoGolfoNorte()
  try {
    const x = consultor(puerto, await cargaCatalogo(puerto))
    await t.test('el tablero growth resuelve con las cifras de la tabla de cifras', async () => {
      const d = await resuelve(x, tablero('growth'), MAPA_GN)
      const hero = d.componentes['principal']!.forma
      assert.equal(hero.tipo, 'valores')
      if (hero.tipo !== 'valores') return
      assert.ok(Math.abs(hero.valores[0]!.valor! - mf('ventas_2026')) < 1e-3)
      assert.ok(Math.abs(hero.valores[0]!.anterior! - mf('ventas_2025')) < 1e-3)
      assert.ok(Math.abs(hero.valores[0]!.variacion! - mf('ventas_var')) < 1e-6)
      assert.deepEqual(Object.values(d.componentes).filter((c) => c.error).map((c) => `${c.id}: ${c.error}`), [])
    })
    await t.test('3 de 3 señales sembradas, reencontradas sin nombrarlas', async () => {
      const ss = await detectaSenales(x, PERFIL_GN)
      const frecuencia = ss.find((s) => s.palancas.includes('frecuencia'))
      const segmento = ss.find((s) => s.segmento)
      const riesgo = ss.find((s) => s.palancas.includes('riesgo'))
      assert.deepEqual([...(frecuencia?.entidades ?? [])].sort(), ['Mérida', 'Oaxaca'], 'los establecidos del Sureste compran menos')
      assert.equal(segmento?.segmento?.bajo, 'Campaña', 'los clientes de campaña abandonan antes')
      assert.equal(riesgo?.entidades[0], 'Tampico', 'una tienda crece sin inventario')
      for (const s of ss) assert.ok(s.evidencia.length > 0, `${s.id} sin evidencia`)
      const fuentes = [join(RAIZ, 'src', 'senales.ts'), join(lab, 'perfil.mjs')].map((f) => readFileSync(f, 'utf8')).join('\n')
      assert.doesNotMatch(fuentes, /Mérida|Oaxaca|Sureste|Tampico|Polanco|['"«]Campaña['"»]/, 'ni el motor ni el perfil nombran lo que se busca')
    })
    await t.test('¿por qué cayó el margen en julio? −7.8 pp contra julio de 2025, explicado por la campaña', async () => {
      const a = await analizaVariacion(x, { metrica: 'margen_bruto_pct', periodo: { desde: '2026-07', hasta: '2026-07' } })
      assert.ok(Math.abs(a.cambio! - mf('julio_margen_pp')) < 1e-6)
      assert.match(a.texto, /linea__en_campana/)
      assert.match(a.texto, /-7\.8 pp/)
    })
  } finally {
    await puerto.cierra?.()
  }
})
