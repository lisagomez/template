/**
 * El modelo de pricing con datos del laboratorio: variables de cada N3 → tier, el costo por tamaño
 * (consumo con su naturaleza × precio unitario por decidir), la tabla de precios por decidir y la
 * demo del control de costos (aviso al 80 %; al tope, P1/P2 a una persona).
 * Uso: node tools/soporte-sap/evidencia/pricing.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { guardiaPresupuesto } from '../../sala-a2a/dist/index.js'
import {
  tierDe, costoDelTier, accionAnteElPresupuesto, pide24x7, insumosPricing, leeMetrica, contratoDeLaboratorio, celda, TABLA_DE_PRECIOS, UMBRALES_TIER, CLIENTES,
  type Corte, type Insumos,
} from '../dist/index.js'
import { HERRAMIENTA } from '../pruebas/_ayuda.ts'

const corte: Corte = JSON.parse(readFileSync(join(HERRAMIENTA, 'semantica', 'corte.json'), 'utf8'))
const insumos: Insumos = JSON.parse(readFileSync(join(HERRAMIENTA, 'medicion', 'estimado.json'), 'utf8')).insumos
const P = '2026-09'

console.log(`Variables de cada N3 (${P}, del corte semántico y del contrato) → tier\n| N3 | tamaño | volumen | proporción crítica | proporción compleja | 24×7 | tier | por qué |\n|---|---|---|---|---|---|---|---|`)
for (const c of CLIENTES) {
  const v = insumosPricing(corte, { nivel: 'N2', consultora: c.consultora }, c.consultora, P, c.id)
  const variables = { tamano: c.tamano, volumenMes: v.volumen.valor, proporcionCritica: v.proporcionCritica.valor, proporcionCompleja: v.proporcionCompleja.valor, respuesta24x7: pide24x7(contratoDeLaboratorio(c.consultora, c.id, c.alta)) }
  const t = tierDe(variables)
  console.log(`| ${c.nombre} | ${c.tamano} | ${variables.volumenMes} | ${variables.proporcionCritica} | ${variables.proporcionCompleja} | ${variables.respuesta24x7 ? 'sí' : 'no'} | **${t.tier}** | ${t.razones.join('; ')} |`)
}
console.log(`Umbrales: ${Object.values(UMBRALES_TIER).map((u) => `${u.valor} (${u.naturaleza})`).join(' · ')} — por confirmar por el laboratorio (D11)\n`)

for (const tamano of ['S', 'M', 'L'] as const) {
  const horas = leeMetrica(corte, { nivel: 'N1' }, { metrica: 'horas_por_ticket', periodo: P, alcance: 'tamano', tamano })
  console.log(`Costo mensual de un N3 ${tamano} (horas por incidencia del corte: ${horas.valor})\n| rubro | consumo | precio unitario | costo |\n|---|---|---|---|`)
  for (const l of costoDelTier(insumos, tamano, horas.valor)) console.log(`| ${l.rubro} | ${celda(l.consumo)} | ${l.precioUnitario.valor ?? `por decidir (${l.precioUnitario.quienDecide})`} | ${celda(l.costo)} |`)
  console.log('')
}
console.log(`Tabla de precios\n| tier | tamaños | precio | modelo de cobro |\n|---|---|---|---|`)
for (const f of TABLA_DE_PRECIOS) console.log(`| ${f.tier} | ${f.tamanos.join(', ')} | ${f.precio.valor ?? `por decidir (${f.precio.quienDecide})`} | ${f.modeloDeCobro.valor ?? 'por decidir'} |`)

const filas = [{ tenant: 'andina', claseTarea: 'triage', tope: 100_000, gastado: 70_000 }]
console.log('\nControl de costos (presupuesto de tokens de triage de Andina: tope 100 000, gastado 70 000)')
for (const [costo, prioridad] of [[5_000, 'P3'], [15_000, 'P3'], [40_000, 'P1'], [40_000, 'P2'], [40_000, 'P4']] as const) {
  const v = guardiaPresupuesto(filas, 'andina', 'triage', costo)
  const a = accionAnteElPresupuesto(v, prioridad)
  console.log(`  ${prioridad} que cuesta ${costo.toLocaleString('es-MX')}: ${a.accion}${a.aviso ? ` — ${a.aviso}` : ''}`)
}
const sinFila = accionAnteElPresupuesto(guardiaPresupuesto([], 'boreal', 'triage', 1), 'P1')
console.log(`  sin fila de presupuesto (Boreal), P1: ${sinFila.accion} — ${sinFila.aviso}`)
