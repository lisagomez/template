/**
 * La fuente única (PRP-005 Fase 2): lo que se siembra aquí y lo que un proyecto recibe.
 *
 * El paquete se valida con el contrato de @tu-scope/grafo-conocimiento, y su paridad con el
 * motor de Hermes se mide con `npm run paridad:migracion -- --hermes <clon>`: aquí se exige que esa
 * medición sea de ESTA versión y que sus diferencias sean exactamente las declaradas.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import conocimiento, { version } from '../dist/index.js'
import { CORTE_HERMES, seleccionaDominios, validaConocimiento } from '../../grafo-conocimiento/dist/index.js'

const lee = <T>(ruta: string): T => JSON.parse(readFileSync(new URL(ruta, import.meta.url), 'utf8')) as T
const paquete = lee<{ version: string }>('../package.json')
const esperadas = lee<{
  version: string
  contenido: { id: string }[]
  validacion_pendiente: { tipo: string; clave: string }[]
}>('./diferencias-esperadas.json')
const v = validaConocimiento(conocimiento)
const c = v.conocimiento!
const llave = (p: { tipo: string; clave: string }) => `${p.tipo}|${p.clave}`

test('la versión publicada es la de package.json, y CAMBIOS.md la registra', () => {
  assert.equal(version, paquete.version)
  assert.equal(c.version, paquete.version)
  const cambios = readFileSync(new URL('../CAMBIOS.md', import.meta.url), 'utf8')
  assert.match(cambios, new RegExp(`^## ${paquete.version.replaceAll('.', '\\.')} `, 'm'))
})

test('el contrato solo reporta lo declarado como pendiente, y nada más', () => {
  assert.deepEqual(v.problemas.map(llave).sort(), esperadas.validacion_pendiente.map(llave).sort())
})

test('RF-9: el conteo queda fijado; sembrar o retirar obliga a tocar esta prueba', () => {
  assert.deepEqual(
    { dominios: c.dominios.length, categorias: c.categorias.length, reglas: c.reglas.length },
    { dominios: 17, categorias: 61, reglas: 98 },
  )
})

test('cada archivo de dominio trae reglas de sus categorías (con sus requisitos generales), y cada archivo de generales solo generales', () => {
  const dir = (d: string) => readdirSync(new URL(`../${d}/`, import.meta.url)).filter((f) => f.endsWith('.json'))
  for (const f of dir('dominios')) {
    const { dominio, reglas } = lee<{ dominio: { clave: string; jurisdiccion: string; dimension: string; categorias: string[] }; reglas: { clave: string; jurisdiccion: string; dimension: string; impactos: { categoria: string | null }[] }[] }>(`../dominios/${f}`)
    assert.equal(f, `${dominio.clave}.json`)
    for (const r of reglas) {
      assert.equal(`${r.jurisdiccion}/${r.dimension}`, `${dominio.jurisdiccion}/${dominio.dimension}`, r.clave)
      // Un impacto general (categoria null) es legítimo: aporta requisitos a todo el ámbito, como en Hermes.
      assert.ok(r.impactos.some((i) => i.categoria !== null), r.clave)
      for (const i of r.impactos) assert.ok(i.categoria === null || dominio.categorias.includes(i.categoria), r.clave)
    }
  }
  for (const f of dir('generales')) {
    const { reglas } = lee<{ reglas: { clave: string; impactos: { categoria: string | null }[] }[] }>(`../generales/${f}`)
    for (const r of reglas) assert.ok(r.impactos.every((i) => i.categoria === null), r.clave)
  }
})

test('cada dominio declara si cita, su fecha de corte y su propia procedencia', () => {
  for (const d of c.dominios) {
    assert.equal(d.cita, 'publica', `${d.clave}: todas las fuentes migradas son leyes publicadas`)
    assert.ok(d.corte >= '2026-07-01' && d.corte <= CORTE_HERMES.fecha, `${d.clave}: corte ${d.corte}`)
    assert.ok(d.procedencia.length > 100, `${d.clave}: procedencia`)
  }
})

test('RF-15: registrar drones de reparto y agentes de seguros da solo esos dos dominios, y es válido', () => {
  const solo = seleccionaDominios(c, ['mx-drones-de-reparto', 'mx-agentes-de-seguros'])
  assert.deepEqual(solo.dominios.map((d) => d.clave).sort(), ['mx-agentes-de-seguros', 'mx-drones-de-reparto'])
  assert.deepEqual(solo.categorias.map((x) => x.clave).sort(), ['AGENTES_SEGUROS', 'DRONES_DELIVERY'])
  assert.equal(solo.reglas.length, 5)
  assert.ok(solo.reglas.every((r) => r.jurisdiccion === 'MX' && r.dimension === 'regulatorio'))
  assert.deepEqual(validaConocimiento(solo).problemas, [])
})

test('paridad con el motor de Hermes: medida para ESTA versión, y sin diferencias de contenido no declaradas', () => {
  const medida = lee<{ version: string; corte: string; casos: number; distintos_en_contenido: { id: string }[] }>('./paridad-migracion.json')
  assert.equal(medida.version, paquete.version, 'versión nueva sin re-medir: npm run paridad:migracion -- --hermes <clon>')
  assert.equal(esperadas.version, paquete.version)
  assert.equal(medida.corte, CORTE_HERMES.commit)
  assert.equal(medida.casos, 782)
  assert.deepEqual(medida.distintos_en_contenido.map((d) => d.id).sort(), esperadas.contenido.map((d) => d.id).sort())
})
