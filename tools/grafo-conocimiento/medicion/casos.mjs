/**
 * Los casos del corpus de paridad, derivados del seed (no escritos a mano, salvo los incidentes).
 *
 * Cubren cada camino del motor de Hermes que el port tiene que reproducir: cada keyword en cada
 * ámbito de su categoría, cada exclusión, el fail-safe, la vigencia a ambos lados de cada
 * `vigente_desde`, el régimen, la agregación de varios conceptos, el ámbito cruzado y los
 * incidentes reales. Todos con fecha fija: nada depende del día en que se genera.
 */

const REGIMEN = 'PM_TITULO_II'
const OTRO_REGIMEN = 'PF_ACTIVIDAD_EMPRESARIAL'
const SIN_REGLA = ['compra de flores para la oficina', '¿puedo hacer envios internacionales sin permiso especial?']

// Date.UTC y no una hora ISO literal: esa forma la toma verifica-gobernanza por identificador de caso-trampa.
const diaAntes = (iso) => {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10)
}

/** Ámbitos (jurisdicción, dimensión) en los que alguna regla usa cada categoría. */
function ambitosPorCategoria(seed) {
  const m = new Map()
  for (const r of seed.reglas) {
    for (const imp of r.impactos) {
      if (!imp.categoria) continue
      const set = m.get(imp.categoria) ?? new Set()
      set.add(`${r.jurisdiccion}|${r.dimension}`)
      m.set(imp.categoria, set)
    }
  }
  return new Map([...m].map(([k, v]) => [k, [...v].sort().map((a) => a.split('|'))]))
}

const caso = (familia, conceptos, [jurisdiccion, dimension], fecha, regimen = REGIMEN) => ({
  familia,
  entrada: { conceptos, contexto: { jurisdiccion, dimension, regimen, fecha } },
})

function incidentes(fecha) {
  return [
    // 2026-07-09, #dep-legal: sin exclusiones caía en DRONES_DELIVERY (commit 86ee4dc).
    caso('incidente', [{ descripcion: 'quiero ser un agente de seguros para drones delivery' }], ['MX', 'regulatorio'], fecha),
    caso('incidente', [{ descripcion: 'Uso de drones para delivery en Mexico' }], ['MX', 'regulatorio'], fecha),
    // Conflicto vivo del seed: 27-VII deducible frente a 28-XXVII dudoso.
    caso('incidente', [{ descripcion: 'Intereses del credito bancario' }], ['MX', 'fiscal'], fecha),
    // La regla de 2010 se borró (_bajas): un hecho de 2024 se queda sin regla.
    caso('incidente', [{ descripcion: 'clausula de confidencialidad' }], ['MX', 'contractual'], '2024-06-01'),
    caso('incidente', [{ descripcion: 'clausula de confidencialidad' }], ['MX', 'contractual'], '2026-06-01'),
  ]
}

export function construyeCasos(seed, fecha) {
  const ambitos = ambitosPorCategoria(seed)
  const categorias = [...seed.categorias].sort((a, b) => a.clave.localeCompare(b.clave))
  const casos = []
  for (const cat of categorias) {
    for (const amb of ambitos.get(cat.clave) ?? []) {
      for (const kw of cat.keywords) casos.push(caso('keyword', [{ descripcion: kw }], amb, fecha))
      for (const x of cat.exclusiones ?? []) casos.push(caso('exclusion', [{ descripcion: `${x} ${cat.keywords[0]}` }], amb, fecha))
      casos.push(caso('regimen', [{ descripcion: cat.keywords[0] }], amb, fecha, OTRO_REGIMEN))
    }
  }
  const todos = [...new Set([...ambitos.values()].flat().map((a) => a.join('|')))].sort().map((a) => a.split('|'))
  for (const amb of todos) for (const t of SIN_REGLA) casos.push(caso('sin_regla', [{ descripcion: t }], amb, fecha))

  const kwDe = new Map(categorias.map((c) => [c.clave, c.keywords[0]]))
  const vistos = new Set()
  for (const r of [...seed.reglas].sort((a, b) => a.clave.localeCompare(b.clave))) {
    const cat = r.impactos.find((imp) => imp.categoria)?.categoria
    if (!cat || r.vigente_desde <= '1900-01-02') continue
    for (const f of [diaAntes(r.vigente_desde), r.vigente_desde]) {
      const llave = `${cat}|${r.jurisdiccion}|${r.dimension}|${f}`
      if (vistos.has(llave)) continue
      vistos.add(llave)
      casos.push(caso('vigencia', [{ descripcion: kwDe.get(cat) }], [r.jurisdiccion, r.dimension], f))
    }
  }

  // Agregación: un concepto con regla y otro sin regla en la misma evaluación → el agregado.
  const fiscal = categorias.find((c) => (ambitos.get(c.clave) ?? []).some(([j, d]) => j === 'MX' && d === 'fiscal'))
  if (fiscal) {
    casos.push(caso('agregado', [{ descripcion: fiscal.keywords[0] }, { descripcion: SIN_REGLA[0] }], ['MX', 'fiscal'], fecha))
    casos.push(caso('agregado', [{ descripcion: fiscal.keywords[0] }, { descripcion: fiscal.keywords[0] }], ['MX', 'fiscal'], fecha))
    // Ámbito cruzado: una categoría de MX consultada en CO no clasifica (el motor filtra por ámbito).
    casos.push(caso('ambito_cruzado', [{ descripcion: fiscal.keywords[0] }], ['CO', 'fiscal'], fecha))
  }
  casos.push(...incidentes(fecha))

  const notas = [
    'tope_monto: ninguna regla del corte lo usa (solo tope_pct, que el motor no evalúa); el camino de «excede tope» se prueba con fixtures en la Fase 3',
    'vigente_hasta: ninguna regla del corte lo usa; el lado «después de la baja» se prueba con fixtures en la Fase 3',
    `fecha fija ${fecha} (la del corte) salvo en vigencia e incidentes; régimen ${REGIMEN}, y ${OTRO_REGIMEN} en la familia regimen`,
  ]
  return { casos: casos.map((c, n) => ({ id: `${c.familia}-${String(n + 1).padStart(4, '0')}`, ...c })), notas }
}
