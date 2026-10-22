#!/usr/bin/env node
/**
 * La evidencia de la propuesta sapstack × Soporte SAP, de solo lectura y determinista (dos corridas dan lo mismo):
 *
 *   node docs/goals/soporte-sap-sapstack-evidencia/mide.mjs [<copia-de-sapstack>]
 *
 * 1. el pin y lo que sapstack es, contado; 2. las afirmaciones de la transcripción contra su código; 3. el cruce con
 * Soporte SAP (triage, anonimizador, candidatos por módulo); 4. el grafo corrido (validación, motor y herencia).
 * Nunca corre un guion de sapstack. Usa los `dist/` de tools/ (`npm run prepara:gate`).
 */
import { afirmaciones } from './afirmaciones.mjs'
import { cruce } from './cruce.mjs'
import { grafo } from './grafo.mjs'
import { commitDe, inventario, revisadoPorCheckTcodes } from './sapstack.mjs'
import { readFileSync } from 'node:fs'

const FUENTE = JSON.parse(readFileSync(new URL('../../../src/features/soporte-sap/mesa/fuentes/sapstack/fuente.json', import.meta.url), 'utf8'))
const CLON = process.argv[2] ?? '/tmp/claude-1000/-home-gsore-code-template/6f6be038-77e6-4b53-9f05-997378bd0d3b/scratchpad/sapstack-src/repo'
const linea = (...xs) => console.log(xs.join(''))
const obj = (o) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(' · ')

function pinEInventario() {
  const sha = commitDe(CLON)
  if (sha !== FUENTE.sha) throw new Error(`la copia está en ${sha} y el pin es ${FUENTE.sha}`)
  const i = inventario(CLON)
  linea('## 1. sapstack, contado (', FUENTE.repo, '@', sha.slice(0, 12), ')')
  linea('- archivos ', i.archivos, ' · módulos ', i.modulos.length, ' (', i.modulos.join(', '), ') · SKILL.md ', i.skills, ' · agentes ', i.agentes, ' · comandos ', i.comandos, ' · escenarios ', i.escenarios, ' · guiones ', i.guiones, ' · flujos de CI ', i.flujosCi)
  linea('- T-codes: ', i.tcodes.lineasDeClave, ' líneas de clave, ', i.tcodes.unicos, ' únicos (README:', i.readmeDice.tcodes, ' dice 279); repetidas: ', i.tcodes.repetidas.map((r) => `${r.codigo} (${r.lineas.join(', ')})`).join(', ') || 'ninguna')
  linea('- T-codes por módulo: ', obj(i.tcodesPorModulo))
  linea('- T-codes por release: ', obj(i.tcodesPorRelease))
  linea('- SAP Notes: ', i.notas, ' (README:', i.readmeDice.notas, ' dice «50+») · por categoría: ', obj(i.notasPorCategoria))
  linea('- licencia: ', i.licencia, ' · los badges apuntan a BoxLogoDev/sapstack (README:', i.origen, ')')
  const r = revisadoPorCheckTcodes(CLON)
  linea('- check-tcodes.sh revisa ', r.revisadas, ' de las ', r.cuerpo, ' líneas de cuerpo de los ', r.skills, ' SKILL.md (', Math.round((100 * r.revisadas) / r.cuerpo), ' %): cada `---` vuelve a encender su filtro de frontmatter')
}

function tablaDeAfirmaciones() {
  linea('\n## 2. La transcripción, contra el código')
  linea('| # | Afirmación | Veredicto | Por qué | Evidencia |')
  linea('|---|---|---|---|---|')
  for (const a of afirmaciones(CLON)) linea(`| ${a.id} | ${a.dice} | **${a.veredicto}** | ${a.porque} | ${a.evidencia} |`)
}

function elCruce() {
  const c = cruce(CLON)
  linea('\n## 3. El cruce con Soporte SAP (medido con su dist)')
  linea('- triage (`transaccionDe`): reconoce ', c.triage.reconocidos, ' de ', c.triage.total, ' T-codes de sapstack: ', c.triage.cuales.join(', '))
  const a = c.anonimizador
  linea('- anonimizador: T-codes tapados como nombre o usuario (en 3 cajas) ', a.codigos.tapados, ' de ', a.codigos.total, a.codigos.ejemplos.length ? ` (${a.codigos.ejemplos.join(', ')})` : '')
  linea('- anonimizador: nombres de transacción tapados ', a.nombresDeTransaccion.tapados, ' de ', a.nombresDeTransaccion.total, '; p. ej.:')
  for (const e of a.nombresDeTransaccion.ejemplos) linea('  - ', e)
  linea('- anonimizador: títulos de SAP Note tapados ', a.titulosDeNota.tapados, ' de ', a.titulosDeNota.total)
  linea('- candidatos por módulo (primer módulo; entra = un módulo que Soporte SAP atiende):')
  for (const f of c.candidatos.tcodes) linea(`  - ${f.modulo}: entran ${f.entran}, no entran ${f.noEntran}`)
  linea('  - total T-codes: entran ', c.candidatos.totalTcodes.entran, ', no entran ', c.candidatos.totalTcodes.noEntran, ' · SAP Notes: entran ', c.candidatos.notas.entran, ', no entran ', c.candidatos.notas.noEntran)
}

function elGrafo() {
  const r = grafo()
  linea('\n## 4. El grafo, corrido (paquete de prueba ', r.candidato.version, ', sin registrar)')
  linea('- validaConocimiento: ok=', r.validacion.ok, ' · ', r.candidato.categorias, ' categorías y ', r.candidato.reglas, ' reglas · problemas: ', obj(r.validacion.problemas) || 'ninguno')
  linea('- contenciones sin cubrir (el gate las pediría declaradas): ', r.contencionesSinCubrir, ' · keywords que chocan con el catálogo real: ', r.chocaConElCatalogoReal.length)
  linea('| Escenario | Hoy (categoriza) | Con candidatos: categoría | Motivo | Destino | Razón |')
  linea('|---|---|---|---|---|---|')
  for (const e of r.escenarios) linea(`| ${e.id} | módulo ${e.hoy.modulo ?? '—'}, transacción ${e.hoy.transaccion ?? '—'} | ${e.conCandidatos.categoria ?? '—'} | ${e.conCandidatos.motivo} | ${e.conCandidatos.destino} | ${e.conCandidatos.razon} |`)
  for (const [k, h] of Object.entries(r.herencia)) linea(`- herencia (${k === 'sinDeclarar' ? 'choque global ↔ local sin declarar' : 'declarado: la global se cierra y la local la reemplaza'}): gate ${h.problemasDelGate.join(', ') || 'sin problemas'} · motor ${h.motor.motivo} → ${h.motor.destino}`)
}

try {
  pinEInventario(); tablaDeAfirmaciones(); elCruce(); elGrafo()
} catch (e) {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
}
