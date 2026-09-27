/**
 * El contrato del conocimiento (PRP-005 Fase 1) con fixtures SINTÉTICOS: todavía no entra ninguna
 * regla de Hermes al repo (eso es la Fase 2, con su historial). Cada caso imita la forma de un
 * fallo real: la baja que borra, el veredicto de otra dimensión, el conflicto vivo, el reemplazo
 * que deja vivas dos versiones.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ConceptoEvaluado, FalloSinVeredicto, desdeHermes, seleccionaDominios, validaConocimiento, type TipoProblema } from '../dist/index.js'

type Fixture = Record<string, unknown> & { reglas: Record<string, unknown>[] }

const regla = (clave: string, categoria: string | null, veredicto: string | null, extra: Record<string, unknown> = {}) => ({
  clave,
  jurisdiccion: 'MX',
  dimension: 'regulatorio',
  titulo: `Regla ${clave}`,
  texto_resumen: 'Resumen de la regla.',
  fuente_cita: 'Ley X, Art. 1',
  fuente_url: 'https://ejemplo.gob.mx/ley.pdf',
  vigente_desde: '2020-01-01',
  vigente_hasta: null,
  impactos: [{ categoria, regimen: 'GENERAL', veredicto_base: veredicto, requisitos: ['requisito'], banderas: [], parametros: {} }],
  ...extra,
})

function base(): Fixture {
  return {
    version: '0.1.0',
    procedencia: 'fixture sintético',
    jurisdicciones: [{ codigo: 'MX', nombre: 'México' }],
    dimensiones: [{ codigo: 'regulatorio', nombre: 'Regulatorio', vocabulario: ['permitido', 'no_permitido', 'dudoso'] }],
    dominios: [
      {
        clave: 'MX-reparto',
        nombre: 'Reparto con drones',
        jurisdiccion: 'MX',
        dimension: 'regulatorio',
        cita: 'publica',
        corte: '2026-09-06',
        procedencia: 'fixture sintético',
        categorias: ['DRONES', 'SEGUROS'],
      },
    ],
    categorias: [
      { clave: 'DRONES', nombre: 'Drones', keywords: ['drones', 'dron'], exclusiones: ['agente de seguros'] },
      { clave: 'SEGUROS', nombre: 'Agentes de seguros', keywords: ['agente de seguros'] },
    ],
    reglas: [regla('MX-A-1', 'DRONES', 'permitido'), regla('MX-B-1', 'SEGUROS', 'permitido')],
  }
}

const tipos = (entrada: unknown): TipoProblema[] => validaConocimiento(entrada).problemas.map((p) => p.tipo)

test('un conocimiento bien formado valida sin problemas', () => {
  const v = validaConocimiento(base())
  assert.deepEqual(v.problemas, [])
  assert.equal(v.ok, true)
  assert.equal(v.conocimiento?.reglas.length, 2)
})

test('RF-14: `_bajas` es borrar, y sale como baja_por_borrado con la clave (no como error genérico)', () => {
  const v = validaConocimiento({ ...base(), _bajas: ['MX-VIEJA-1'] })
  assert.deepEqual(v.problemas.map((p) => [p.tipo, p.clave]), [['baja_por_borrado', 'MX-VIEJA-1']])
})

test('RF-1: un veredicto de otra dimensión no siembra (el hueco del gate de Hermes)', () => {
  const f = base()
  f.reglas[0] = regla('MX-A-1', 'DRONES', 'deducible')
  assert.deepEqual(tipos(f), ['veredicto_fuera_de_vocabulario'])
})

test('RF-8/12: dos veredictos distintos vivos a la vez en la misma categoría son conflicto', () => {
  const f = base()
  f.reglas.push(regla('MX-A-2', 'DRONES', 'dudoso'))
  const v = validaConocimiento(f)
  assert.deepEqual(v.problemas.map((p) => [p.tipo, p.clave]), [['conflicto_de_veredicto', 'MX/regulatorio/DRONES']])
})

test('conflicto: no lo hay si una regla cerró antes de que la otra empezara (así se reemplaza)', () => {
  const f = base()
  f.reglas[0] = regla('MX-A-1', 'DRONES', 'permitido', { vigente_hasta: '2023-12-31' })
  f.reglas.push(regla('MX-A-2', 'DRONES', 'dudoso', { vigente_desde: '2024-01-01', reemplaza: 'MX-A-1' }))
  assert.deepEqual(tipos(f), [])
})

test('conflicto: GENERAL choca con cualquier régimen; dos regímenes específicos distintos no chocan', () => {
  const conRegimen = (clave: string, regimen: string, veredicto: string) => {
    const r = regla(clave, 'DRONES', veredicto)
    r.impactos[0] = { ...r.impactos[0]!, regimen }
    return r
  }
  const general = base()
  general.reglas.push(conRegimen('MX-A-2', 'PM_TITULO_II', 'dudoso'))
  assert.deepEqual(tipos(general), ['conflicto_de_veredicto'])

  const especificos = base()
  especificos.reglas[0] = conRegimen('MX-A-1', 'PF_ACTIVIDAD_EMPRESARIAL', 'permitido')
  especificos.reglas.push(conRegimen('MX-A-2', 'PM_TITULO_II', 'dudoso'))
  assert.deepEqual(tipos(especificos), [])
})

test('RF-14: reemplazar sin cerrar la versión anterior deja vivas las dos (reemplazo_abierto)', () => {
  const f = base()
  f.reglas.push(regla('MX-A-2', 'DRONES', 'permitido', { vigente_desde: '2024-01-01', reemplaza: 'MX-A-1' }))
  assert.deepEqual(tipos(f), ['reemplazo_abierto'])
})

test('keywords: en minúsculas (esquema) y nunca la misma en dos categorías', () => {
  const mayus = base()
  mayus.categorias = [{ clave: 'DRONES', nombre: 'Drones', keywords: ['Drones'] }, { clave: 'SEGUROS', nombre: 'S', keywords: ['x'] }]
  assert.deepEqual(tipos(mayus), ['esquema'])

  const repetida = base()
  repetida.categorias = [
    { clave: 'DRONES', nombre: 'Drones', keywords: ['drones'] },
    { clave: 'SEGUROS', nombre: 'Seguros', keywords: ['drones'] },
  ]
  assert.deepEqual(tipos(repetida), ['keyword_repetida'])
})

test('un umbral numérico sin verificar: true es una cifra que nadie cotejó', () => {
  const f = base()
  f.reglas[0]!.impactos = [{ categoria: 'DRONES', regimen: 'GENERAL', veredicto_base: 'permitido', requisitos: [], banderas: [], parametros: { altura_max_m: 120 } }]
  assert.deepEqual(tipos(f), ['monto_sin_verificar'])
  f.reglas[0]!.impactos = [{ categoria: 'DRONES', regimen: 'GENERAL', veredicto_base: 'permitido', requisitos: [], banderas: [], parametros: { altura_max_m: 120, verificar: true } }]
  assert.deepEqual(tipos(f), [])
})

test('RF-15: una categoría con reglas que ningún dominio incluye no se podría registrar', () => {
  const f = base()
  ;(f.dominios as { categorias: string[] }[])[0]!.categorias = ['DRONES']
  const v = validaConocimiento(f)
  assert.deepEqual(v.problemas.map((p) => [p.tipo, p.clave]), [['categoria_sin_dominio', 'MX/regulatorio/SEGUROS']])
})

test('referencias rotas: categoría, dimensión y reemplazo que no existen', () => {
  const f = base()
  f.reglas.push(regla('MX-C-1', 'NO_EXISTE', 'permitido', { reemplaza: 'MX-FANTASMA' }))
  assert.deepEqual(tipos(f).sort(), ['categoria_sin_dominio', 'referencia_rota', 'referencia_rota'])
})

test('RF-6/8: solo una regla aplicable da veredicto; sin regla, en conflicto o sobre el tope no se afirma nada', () => {
  const fuente = { clave: 'MX-A-1', cita: 'Ley X, Art. 1', url: 'https://x', vigencia: { desde: '2020-01-01', hasta: null } }
  const concepto = { descripcion: 'x', categoria: null, dominio: null, razon: 'r', fuentes: [], banderas: [], checklist: [] }
  const ok = (c: object) => ConceptoEvaluado.safeParse({ ...concepto, ...c }).success
  assert.equal(ok({ motivo: 'sin_regla', veredicto: null, fuente: null }), true)
  assert.equal(ok({ motivo: 'sin_regla', veredicto: 'permitido', fuente: null }), false)
  assert.equal(ok({ motivo: 'regla', veredicto: null, fuente }), false)
  assert.equal(ok({ motivo: 'regla', veredicto: 'permitido', fuente }), true)
  assert.equal(ok({ motivo: 'conflicto', veredicto: 'dudoso', fuente }), false)
  assert.equal(ok({ motivo: 'conflicto', veredicto: null, fuente }), true)
  assert.equal(ok({ motivo: 'tope_excedido', veredicto: null, fuente }), true)
  assert.equal(ok({ motivo: 'regla', veredicto: 'permitido', fuente: null }), false)
})

test('duda del parser: un fallo sin veredicto no admite nada con forma de veredicto', () => {
  assert.equal(FalloSinVeredicto.safeParse({ tipo: 'parser_no_disponible', detalle: 'timeout' }).success, true)
  assert.equal(
    FalloSinVeredicto.safeParse({ tipo: 'parser_no_disponible', detalle: 'timeout', veredicto: 'permitido' }).success,
    false,
  )
})

test('desdeHermes: hace explícito lo que el motor de Hermes leía con default, y no esconde las bajas', () => {
  const seedHermes = {
    _meta: { source_version: 'fixture', regimen_default: 'PM_TITULO_II' },
    _bajas: ['MX-VIEJA-1'],
    jurisdicciones: [{ codigo: 'MX', nombre: 'México' }],
    dimensiones: [{ codigo: 'regulatorio', nombre: 'Regulatorio' }],
    categorias: [{ clave: 'DRONES', nombre: 'Drones', descripcion: 'd', keywords: ['drones'] }],
    reglas: [
      {
        ...regla('MX-A-1', 'DRONES', 'permitido'),
        vigente_hasta: undefined,
        impactos: [{ categoria: 'DRONES', requisitos: [], banderas: [], parametros: {} }],
      },
    ],
  }
  const adaptado = desdeHermes(seedHermes, { version: '0.0.0-fixture', corte: '2026-09-06' })
  const v = validaConocimiento(adaptado)
  assert.deepEqual(v.problemas.map((p) => p.tipo), ['baja_por_borrado'])
  const imp = v.conocimiento?.reglas[0]?.impactos[0]
  assert.equal(imp?.regimen, 'PM_TITULO_II')
  assert.equal(imp?.veredicto_base, null)
  assert.equal(v.conocimiento?.reglas[0]?.vigente_hasta, null)
  assert.deepEqual(v.conocimiento?.dominios.map((d) => [d.clave, d.cita, d.categorias]), [['MX-regulatorio', 'publica', ['DRONES']]])
  assert.deepEqual(v.conocimiento?.dimensiones[0]?.vocabulario, ['permitido', 'no_permitido', 'dudoso'])
})

test('desdeHermes: una dimensión sin vocabulario declarado no pasa en silencio', () => {
  const seedHermes = {
    _meta: { source_version: 'fixture' },
    jurisdicciones: [{ codigo: 'MX', nombre: 'México' }],
    dimensiones: [{ codigo: 'inventada', nombre: 'Inventada' }],
    categorias: [{ clave: 'DRONES', nombre: 'Drones', keywords: ['drones'] }],
    reglas: [{ ...regla('MX-A-1', 'DRONES', 'permitido'), dimension: 'inventada' }],
  }
  const v = validaConocimiento(desdeHermes(seedHermes, { version: '0.0.0-fixture', corte: '2026-09-06' }))
  assert.equal(v.ok, false)
  assert.ok(v.problemas.some((p) => p.tipo === 'esquema' && p.clave.startsWith('dimensiones.0.vocabulario')))
})

test('RF-15: seleccionar un dominio trae solo sus categorías, sus reglas y las generales de su ámbito', () => {
  const f = base()
  ;(f.dominios as unknown[]).push({
    clave: 'MX-seguros', nombre: 'Seguros', jurisdiccion: 'MX', dimension: 'regulatorio', cita: 'publica',
    corte: '2026-09-06', procedencia: 'fixture', categorias: ['SEGUROS'],
  })
  ;(f.dominios as { categorias: string[] }[])[0]!.categorias = ['DRONES']
  f.reglas.push(regla('MX-GEN-1', null, null))
  const v = validaConocimiento(f)
  assert.deepEqual(v.problemas, [])
  const solo = seleccionaDominios(v.conocimiento!, ['MX-seguros'])
  assert.deepEqual(solo.categorias.map((c) => c.clave), ['SEGUROS'])
  assert.deepEqual(solo.reglas.map((r) => r.clave), ['MX-B-1', 'MX-GEN-1'])
  assert.deepEqual(validaConocimiento(solo).problemas, [])
  assert.throws(() => seleccionaDominios(v.conocimiento!, ['MX-no-existe']), /dominios desconocidos: MX-no-existe/)
})
