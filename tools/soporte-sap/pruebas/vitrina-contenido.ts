/**
 * El contenido de la vitrina dice lo que se ve: cada paso del journey y cada sección del manual apuntan a una captura
 * del recorrido que existe y a un momento congelado que existe; el manual del repo es el de su fuente; el deck tiene su
 * PDF; y ningún precio ni RPO/RTO se cuela como cifra.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { RAIZ } from './_ayuda.ts'

const V = join(RAIZ, 'src', 'features', 'soporte-sap', 'vitrina')
const PUBLICO = join(RAIZ, 'public', 'vitrina', 'soporte-sap')
const { ARCHIVOS_DE_CAPTURA } = await import(pathToFileURL(join(V, 'contenido', 'capturas.ts')).href)
const { JOURNEY } = await import(pathToFileURL(join(V, 'contenido', 'journey.ts')).href)
const { MANUAL } = await import(pathToFileURL(join(V, 'contenido', 'manual.ts')).href)
const propuesta = await import(pathToFileURL(join(V, 'contenido', 'propuesta.ts')).href)
const { manualEnMarkdown, RUTA_DEL_MANUAL } = await import(pathToFileURL(join(V, 'genera-manual.ts')).href)
const indice = JSON.parse(readFileSync(join(PUBLICO, 'momentos', 'indice.json'), 'utf8')) as { momentos: Array<{ id: string }>; roles: string[] }

test('vitrina · cada captura citada existe, y cada momento congelado tiene las cuatro vistas', () => {
  for (const [paso, archivo] of Object.entries(ARCHIVOS_DE_CAPTURA)) assert.ok(existsSync(join(PUBLICO, 'capturas', archivo as string)), `paso ${paso}: ${archivo}`)
  for (const m of indice.momentos) {
    const vistas = JSON.parse(readFileSync(join(PUBLICO, 'momentos', `${m.id}.json`), 'utf8'))
    assert.deepEqual(Object.keys(vistas).sort(), ['cliente', 'consultor', 'experto', 'superadmin'], m.id)
    for (const r of indice.roles) assert.equal(vistas[r].sesion.rol, r, `${m.id}: la vista de ${r} es de ${r}`)
  }
})

test('vitrina · el journey: cada paso con su captura y un momento que existe', () => {
  const momentos = new Set(indice.momentos.map((m) => m.id))
  assert.equal(JOURNEY.length, 21)
  for (const p of JOURNEY) {
    assert.ok(p.captura in ARCHIVOS_DE_CAPTURA, `${p.id}: captura ${p.captura}`)
    assert.ok(momentos.has(p.momento), `${p.id}: momento ${p.momento}`)
    assert.ok(p.hace && p.ve && p.necesita && p.decide, `${p.id}: hace, ve, necesita y decide`)
  }
  for (const m of MANUAL) for (const s of m.secciones) if (s.captura) assert.ok(s.captura in ARCHIVOS_DE_CAPTURA, `manual ${m.id}/${s.id}`)
})

test('vitrina · el manual del repo es el de su fuente, y el deck tiene su PDF', () => {
  assert.equal(readFileSync(join(RAIZ, RUTA_DEL_MANUAL), 'utf8'), manualEnMarkdown(), 'regenera con node src/features/soporte-sap/vitrina/genera-manual.ts')
  const pdf = readFileSync(join(PUBLICO, 'soporte-sap-deck.pdf'))
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  assert.equal(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length, 13, 'una página por lámina')
})

test('vitrina · ninguna cifra inventada: sin precios ni RPO/RTO, y lo medido dice dónde se midió', () => {
  const textos = [JSON.stringify(propuesta), JSON.stringify(JOURNEY), JSON.stringify(MANUAL), readFileSync(join(V, 'componentes', 'deck.tsx'), 'utf8')]
  for (const t of textos) {
    assert.doesNotMatch(t, /\$\s?\d|MXN\s?\d|\d\s?(USD|MXN|dólares|pesos)\b/, 'un precio')
    assert.doesNotMatch(t, /(RPO|RTO)\s*(de|=|:)\s*\d/, 'un RPO o RTO con cifra')
    assert.doesNotMatch(t, /\b\d{2,3}(\.\d+)?\s?%\s*(de\s+)?(disponibilidad|uptime)/i, 'una disponibilidad')
  }
  assert.match(propuesta.FUENTE_DE_LO_MEDIDO, /laboratorio con datos sintéticos/)
  assert.match(propuesta.FUENTE_DE_LO_MEDIDO, /No es una medición en una consultora real/)
})
