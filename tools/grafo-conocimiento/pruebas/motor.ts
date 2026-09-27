/**
 * El motor (PRP-005 Fase 3) con fixtures sintéticos: la semántica que el corpus de Hermes no
 * cubre (el tope, `vigente_hasta`, los empates, la fecha supuesta, los fallos) y los controles
 * negativos de la spec 004: fail-safe, exclusiones antes/después y conflicto.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasifica, evalua, evaluaSeguro, RAZON_SIN_REGLA, validaConocimiento, type Conocimiento } from '../dist/index.js'

type Regla = Conocimiento['reglas'][number]
const regla = (clave: string, dimension: string, categoria: string | null, veredicto: string | null, extra: Partial<Regla> = {}): Regla => ({
  clave,
  jurisdiccion: 'MX',
  dimension,
  titulo: `Titulo ${clave}`,
  texto_resumen: 'Resumen.',
  fuente_cita: `Ley ${clave}`,
  fuente_url: 'https://ejemplo.gob.mx/ley.pdf',
  vigente_desde: '2020-01-01',
  vigente_hasta: null,
  impactos: [{ categoria, regimen: 'GENERAL', veredicto_base: veredicto, requisitos: [`req ${clave}`], banderas: [], parametros: {} }],
  ...extra,
})

function fixture(): Conocimiento {
  const voc = { fiscal: ['deducible', 'no_deducible', 'dudoso'], regulatorio: ['permitido', 'no_permitido', 'dudoso'] }
  const dominio = (clave: string, dimension: string, categorias: string[], corte: string) =>
    ({ clave, nombre: clave, jurisdiccion: 'MX', dimension, cita: 'publica' as const, corte, procedencia: 'fixture', categorias })
  return {
    version: '0.0.0-fixture',
    procedencia: 'fixture sintético',
    jurisdicciones: [{ codigo: 'MX', nombre: 'México' }],
    dimensiones: Object.entries(voc).map(([codigo, vocabulario]) => ({ codigo, nombre: codigo, vocabulario })),
    dominios: [
      dominio('mx-drones', 'regulatorio', ['DRONES'], '2026-07-10'),
      dominio('mx-seguros', 'regulatorio', ['SEGUROS', 'CONF'], '2026-07-01'),
      dominio('mx-gastos', 'fiscal', ['VIATICOS', 'PM_SOLO'], '2026-07-30'),
    ],
    categorias: [
      { clave: 'DRONES', nombre: 'Drones', keywords: ['drones', 'dron'], exclusiones: ['agente de seguros'] },
      { clave: 'SEGUROS', nombre: 'Seguros', keywords: ['agente de seguros'], exclusiones: [] },
      { clave: 'CONF', nombre: 'Confidencialidad', keywords: ['confidencialidad'], exclusiones: [] },
      { clave: 'VIATICOS', nombre: 'Viáticos', keywords: ['viaticos', 'hotel'], exclusiones: [] },
      { clave: 'PM_SOLO', nombre: 'Solo personas morales', keywords: ['dividendo'], exclusiones: [] },
    ],
    reglas: [
      regla('R-DRONES', 'regulatorio', 'DRONES', 'permitido'),
      regla('R-SEG', 'regulatorio', 'SEGUROS', 'permitido'),
      regla('R-CONF-2010', 'regulatorio', 'CONF', 'dudoso', { vigente_desde: '2010-07-06', vigente_hasta: '2025-03-20' }),
      regla('R-CONF-2025', 'regulatorio', 'CONF', 'dudoso', { vigente_desde: '2025-03-21', reemplaza: 'R-CONF-2010' }),
      regla('R-VIAT', 'fiscal', 'VIATICOS', 'deducible', {
        impactos: [{ categoria: 'VIATICOS', regimen: 'GENERAL', veredicto_base: 'deducible', tope_monto: 1000, requisitos: ['comprobante'], banderas: [], parametros: { verificar: true } }],
      }),
      regla('R-GEN', 'fiscal', null, null),
      regla('R-PM', 'fiscal', 'PM_SOLO', 'deducible', {
        impactos: [{ categoria: 'PM_SOLO', regimen: 'PM_TITULO_II', veredicto_base: 'deducible', requisitos: [], banderas: [], parametros: {} }],
      }),
    ],
  }
}

const c = fixture()
/** `fecha: null` = el hecho no trae fecha (un parámetro por defecto no sirve: undefined lo activa). */
const pregunta = (descripcion: string, dimension = 'regulatorio', fecha: string | null = '2026-06-01', extra: object = {}) => ({
  contexto: { jurisdiccion: 'MX', dimension, regimen: 'PM_TITULO_II', ...(fecha === null ? {} : { fecha }) },
  conceptos: [{ descripcion, ...extra }],
})
const uno = (descripcion: string, dimension?: string, fecha?: string | null, extra?: object) =>
  evalua(c, pregunta(descripcion, dimension, fecha, extra)).conceptos[0]!

test('el fixture es un conocimiento válido (el motor no depende de eso, evaluaSeguro sí)', () => {
  assert.deepEqual(validaConocimiento(c).problemas, [])
})

test('clasificación: sin acentos, con frontera de palabra y por la keyword más larga', () => {
  assert.equal(clasifica('Vuelo de un DRÓN sobre la ciudad', c.categorias), 'DRONES')
  assert.equal(clasifica('dronesque no es una palabra', c.categorias), null)
  assert.equal(clasifica('el agente de seguros vende pólizas', c.categorias), 'SEGUROS')
})

test('RF-7, control negativo: sin la exclusión, «agente de seguros para drones» cae en DRONES; con ella, en SEGUROS', () => {
  const frase = 'quiero ser agente de seguros para drones'
  const sinExclusion = c.categorias.map((x) => (x.clave === 'DRONES' ? { ...x, exclusiones: [] } : x))
  assert.equal(clasifica(frase, sinExclusion.filter((x) => x.clave !== 'SEGUROS')), 'DRONES')
  assert.equal(clasifica(frase, c.categorias), 'SEGUROS')
})

test('empate de keywords: gana la categoría de clave menor, no el orden de llegada', () => {
  const a = { clave: 'B_CAT', nombre: 'b', keywords: ['poliza'], exclusiones: [] }
  const b = { clave: 'A_CAT', nombre: 'a', keywords: ['poliza'], exclusiones: [] }
  assert.equal(clasifica('una poliza', [a, b]), 'A_CAT')
  assert.equal(clasifica('una poliza', [b, a]), 'A_CAT')
})

test('RF-6, control negativo: sin regla no hay veredicto ni fuente, y el motivo lo dice', () => {
  const x = uno('una pregunta que no casa nada')
  assert.deepEqual([x.motivo, x.veredicto, x.fuente, x.razon], ['sin_regla', null, null, RAZON_SIN_REGLA])
})

test('regla aplicable: veredicto, fuente rectora, dominio, y los requisitos generales del ámbito primero', () => {
  const x = uno('hotel en Monterrey', 'fiscal')
  assert.deepEqual([x.motivo, x.veredicto, x.fuente?.clave, x.dominio], ['regla', 'deducible', 'R-VIAT', 'mx-gastos'])
  assert.deepEqual(x.checklist, ['req R-GEN', 'comprobante'])
  assert.deepEqual(x.fuentes.map((f) => f.clave), ['R-GEN', 'R-VIAT'])
})

test('RF-8, control negativo: dos veredictos vivos distintos degradan a fail-safe con bandera, nunca eligen', () => {
  const conflicto = { ...c, reglas: [...c.reglas, regla('R-DRONES-NO', 'regulatorio', 'DRONES', 'no_permitido')] }
  const x = evalua(conflicto, pregunta('entrega con dron')).conceptos[0]!
  assert.deepEqual([x.motivo, x.veredicto], ['conflicto', null])
  assert.ok(x.banderas.some((b) => b === 'Reglas vigentes en conflicto: R-DRONES-NO=no_permitido, R-DRONES=permitido — requiere revision'))
})

test('tope: por debajo afirma, por encima no afirma nada, y sin importe no hay tope que aplicar', () => {
  assert.equal(uno('hotel', 'fiscal', '2026-06-01', { importe: 999.99 }).veredicto, 'deducible')
  const encima = uno('hotel', 'fiscal', '2026-06-01', { importe: 1234.5 })
  assert.deepEqual([encima.motivo, encima.veredicto], ['tope_excedido', null])
  assert.ok(encima.banderas.includes('Importe 1,234.50 excede el tope de 1,000.00 (Ley R-VIAT)'))
  assert.equal(uno('hotel', 'fiscal').veredicto, 'deducible')
})

test('RF-13: se juzga con la regla vigente el día del hecho, a ambos lados del cierre', () => {
  assert.equal(uno('confidencialidad', 'regulatorio', '2024-06-01').fuente?.clave, 'R-CONF-2010')
  assert.equal(uno('confidencialidad', 'regulatorio', '2025-03-20').fuente?.clave, 'R-CONF-2010')
  assert.equal(uno('confidencialidad', 'regulatorio', '2025-03-21').fuente?.clave, 'R-CONF-2025')
  assert.equal(uno('confidencialidad', 'regulatorio', '2009-01-01').motivo, 'sin_regla')
})

test('RF-13: sin fecha del hecho se juzga con la de la consulta, y el resultado lo dice', () => {
  const r = evalua(c, pregunta('confidencialidad', 'regulatorio', null), { hoy: '2024-06-01' })
  assert.deepEqual([r.contexto.fecha, r.contexto.fecha_supuesta, r.conceptos[0]!.fuente?.clave], ['2024-06-01', true, 'R-CONF-2010'])
  assert.equal(evalua(c, pregunta('confidencialidad')).contexto.fecha_supuesta, false)
})

test('régimen: un impacto de régimen concreto solo aplica a ese régimen; GENERAL, a todos', () => {
  assert.equal(uno('dividendo', 'fiscal').veredicto, 'deducible')
  const pf = evalua(c, { ...pregunta('dividendo', 'fiscal'), contexto: { jurisdiccion: 'MX', dimension: 'fiscal', regimen: 'PF', fecha: '2026-06-01' } })
  assert.equal(pf.conceptos[0]!.motivo, 'sin_regla')
  assert.deepEqual(pf.conceptos[0]!.checklist, ['req R-GEN'])
})

test('el veredicto global solo existe si todos coinciden; el corte es el más antiguo del ámbito', () => {
  const r = evalua(c, { contexto: { jurisdiccion: 'MX', dimension: 'regulatorio', regimen: 'X', fecha: '2026-06-01' }, conceptos: [{ descripcion: 'dron' }, { descripcion: 'agente de seguros' }] })
  assert.deepEqual([r.veredicto_global, r.corte], ['permitido', '2026-07-01'])
  const mixto = evalua(c, { contexto: { jurisdiccion: 'MX', dimension: 'regulatorio', regimen: 'X', fecha: '2026-06-01' }, conceptos: [{ descripcion: 'dron' }, { descripcion: 'nada' }] })
  assert.equal(mixto.veredicto_global, null)
})

test('un ámbito sin conocimiento: sin regla y sin fecha de corte (no inventa una)', () => {
  const r = evalua(c, { contexto: { jurisdiccion: 'CO', dimension: 'fiscal', regimen: 'X', fecha: '2026-06-01' }, conceptos: [{ descripcion: 'hotel' }] })
  assert.deepEqual([r.conceptos[0]!.motivo, r.corte], ['sin_regla', null])
})

test('la rectora no depende del orden de llegada de las reglas', () => {
  const dos = { ...c, reglas: [...c.reglas, regla('R-DRONES-B', 'regulatorio', 'DRONES', 'permitido')] }
  const alReves = { ...dos, reglas: [...dos.reglas].reverse(), categorias: [...dos.categorias].reverse() }
  const x = evalua(dos, pregunta('dron')).conceptos[0]!
  const y = evalua(alReves, pregunta('dron')).conceptos[0]!
  assert.deepEqual([x.fuente?.clave, y.fuente?.clave], ['R-DRONES', 'R-DRONES'])
})

test('evaluaSeguro: conocimiento que no valida o pregunta sin forma dan un fallo sin veredicto, no una respuesta', () => {
  const roto = evaluaSeguro({ ...c, _bajas: ['R-X'] }, pregunta('dron'))
  assert.equal('tipo' in roto && roto.tipo, 'conocimiento_no_disponible')
  const sinRegimen = evaluaSeguro(c, { contexto: { jurisdiccion: 'MX', dimension: 'regulatorio' }, conceptos: [{ descripcion: 'dron' }] })
  assert.equal('tipo' in sinRegimen && sinRegimen.tipo, 'pregunta_invalida')
  const bien = evaluaSeguro(c, pregunta('dron'))
  assert.ok('conceptos' in bien && bien.conceptos[0]!.veredicto === 'permitido')
})
