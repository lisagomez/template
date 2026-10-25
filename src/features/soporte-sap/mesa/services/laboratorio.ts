/**
 * Lo que el laboratorio lee de la mesa: lo que dijo el experto, caso por caso y en agregado, y el export para convertirlo
 * en un PRP o en reglas firmadas. Cada número sale de los casos guardados: aquí solo se cuentan. Lo de prueba (la
 * automatización con su token) se cuenta aparte, para que no se lea como la opinión del experto.
 */
import type { AgregadoLaboratorio, CasoMesa, Veredicto } from './modelo'
import { VEREDICTOS } from './modelo'

export function agrega(casos: readonly CasoMesa[]): AgregadoLaboratorio {
  const porVeredicto = Object.fromEntries([...VEREDICTOS, 'sin_veredicto'].map((v) => [v, 0])) as Record<Veredicto | 'sin_veredicto', number>
  const porResultado = { solucion: 0, grado_insuficiente: 0, sin_solucion: 0 }
  const pasos = new Map<string, { etapa: string; titulo: string; mal: number; bien: number }>()
  for (const c of casos) {
    porVeredicto[c.retro.veredicto?.valor ?? 'sin_veredicto'] += 1
    porResultado[c.resultado.tipo] += 1
    for (const p of c.pasos) {
      const r = c.retro.pasos[p.clave]
      if (!r) continue
      const fila = pasos.get(p.etapa) ?? { etapa: p.etapa, titulo: p.titulo, mal: 0, bien: 0 }
      fila[r.gesto] += 1
      pasos.set(p.etapa, fila)
    }
  }
  return {
    casos: casos.length, deExpertos: casos.filter((c) => !c.por.prueba).length, dePrueba: casos.filter((c) => c.por.prueba).length,
    porVeredicto, porResultado,
    pasosMal: [...pasos.values()].sort((a, b) => b.mal - a.mal || b.bien - a.bien),
    ensenanzasPorFirmar: casos.reduce((n, c) => n + c.propuestas.filter((p) => p.tipo === 'regla').length, 0),
    cuarentenas: casos.filter((c) => c.sandbox?.veredicto === 'cuarentena').length,
  }
}

const VEREDICTO_DICE: Readonly<Record<Veredicto, string>> = { resuelto: 'Lo resolvió', parcial: 'Lo resolvió en parte', incorrecto: 'Se equivocó', debio_no_lo_se: 'Debió decir «no lo sé»' }
export const veredictoDice = (v: Veredicto | null | undefined): string => (v ? VEREDICTO_DICE[v] : 'Sin veredicto todavía')

/** El export en Markdown: lo que el laboratorio pega en un PRP o lleva a `tools/conocimiento` para firmar. */
export function exportMarkdown(casos: readonly CasoMesa[], ahora: string): string {
  const a = agrega(casos)
  const l: string[] = [
    `# Mesa del experto · Soporte SAP — retroalimentación`, '',
    `Exportado el ${ahora}. ${a.casos} casos (${a.deExpertos} de expertos, ${a.dePrueba} de prueba). Datos sintéticos o escritos por el experto, filtrados: ninguna regla de aquí está firmada.`, '',
    '## En agregado', '',
    `- Veredictos: ${VEREDICTOS.map((v) => `${VEREDICTO_DICE[v]} ${a.porVeredicto[v]}`).join(' · ')} · sin veredicto ${a.porVeredicto.sin_veredicto}`,
    `- Lo que encontró: con regla ${a.porResultado.solucion} · regla sin grado suficiente ${a.porResultado.grado_insuficiente} · «no lo sé» ${a.porResultado.sin_solucion}`,
    `- Enseñanzas que esperan firma: ${a.ensenanzasPorFirmar} · casos en cuarentena: ${a.cuarentenas}`,
    `- Pasos marcados «mal», de más a menos: ${a.pasosMal.filter((p) => p.mal).map((p) => `${p.titulo} (${p.mal})`).join(', ') || 'ninguno'}`, '',
    '## Caso por caso', '',
  ]
  for (const c of casos) {
    const e = c.entrada
    l.push(`### ${c.id} · ${e.sistema} · ${e.modulo}${e.transaccion ? ` · ${e.transaccion}` : ''}${c.por.prueba ? ' · de prueba' : ''}`, '',
      `- Síntoma: ${e.sintoma}`, `- El agente: ${c.resultado.tipo === 'sin_solucion' ? '«no lo sé»' : `${c.resultado.titulo} (${c.resultado.regla}, grado ${c.resultado.grado})`}`,
      `- Veredicto del experto: ${veredictoDice(c.retro.veredicto?.valor)}${c.retro.veredicto?.solucion ? ` — solución correcta: ${c.retro.veredicto.solucion}` : ''}${c.retro.veredicto?.nota ? ` — nota: ${c.retro.veredicto.nota}` : ''}`)
    for (const p of c.pasos) {
      const r = c.retro.pasos[p.clave]
      if (r) l.push(`- Paso «${p.titulo}»: ${r.gesto === 'bien' ? 'bien' : 'mal'}${r.esperaba ? ` — esperaba: ${r.esperaba}` : ''}`)
    }
    for (const p of c.propuestas) l.push(`- Propuesta de ${p.tipo === 'cli' ? 'CLI' : 'regla'} (${p.estado}): ${p.detalle}`)
    l.push('')
  }
  return l.join('\n')
}
