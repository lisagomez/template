/**
 * Impactos en MXN, accionables, el antes y el después de cambiar un parámetro y el FODA del N3.
 * Uso: node tools/soporte-sap/evidencia/impactos.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { accionables, recalcula, foda, PARAMETROS_LABORATORIO, type Corte, type Rango } from '../dist/index.js'
import { HERRAMIENTA } from '../pruebas/_ayuda.ts'

const corte: Corte = JSON.parse(readFileSync(join(HERRAMIENTA, 'semantica', 'corte.json'), 'utf8'))
const P = '2026-09', C = 'andina', K = 'alimentos-del-bajio'
const $ = (n: number) => `$${n.toLocaleString('es-MX')}`
const r = (x: Rango) => `${$(x.bajo)} · **${$(x.central)}** · ${$(x.alto)}`

console.log(`Parámetros (D15: SUPUESTOS hasta que la consultora los capture)\n| parámetro | bajo · central · alto | naturaleza | fuente |\n|---|---|---|---|`)
for (const p of Object.values(PARAMETROS_LABORATORIO)) console.log(`| ${p.nombre} | ${p.rango.bajo} · ${p.rango.central} · ${p.rango.alto} ${p.unidad} | ${p.naturaleza} | ${p.fuente} |`)

console.log(`\nAccionables de Alimentos del Bajío (${P})\n| para | accionable | evidencia (capa semántica) | fórmula | impacto MXN/mes (bajo · central · alto) | confianza | responsable |\n|---|---|---|---|---|---|---|`)
for (const a of accionables(corte, C, K, P)) {
  console.log(`| ${a.para} | ${a.titulo} | ${a.evidencia.map((e) => `${e.metrica} = ${e.valor}`).join('; ')} | ${a.formula} | ${r(a.impactoMxn)} | ${a.confianza} | ${a.responsable} |`)
}
console.log('Cada fila: «Proyección con supuestos, no una promesa: cambia si cambian los parámetros.»')

const c = recalcula(corte, C, K, P, 'costoHoraConsultor', { bajo: 400, central: 500, alto: 600 })
console.log(`\nLa consultora captura su costo hora (400 · 500 · 600 MXN/h en vez de ${Object.values(PARAMETROS_LABORATORIO.costoHoraConsultor!.rango).join(' · ')}):\n| accionable | antes | después |\n|---|---|---|`)
for (const x of c.cambios) console.log(`| ${x.id} | ${r(x.antes)} | ${r(x.despues)} |`)

const f = foda(corte, C, K, P)
console.log(`\nFODA que ve el N3 (cada punto con su dato y su criterio)`)
for (const [nombre, puntos] of [['Fortalezas', f.fortalezas], ['Debilidades', f.debilidades], ['Oportunidades', f.oportunidades], ['Amenazas', f.amenazas]] as const) {
  console.log(`- ${nombre}:${puntos.length ? '' : ' —'}`)
  for (const p of puntos) console.log(`  · ${p.texto} — dato: ${p.datos.map((d) => `${d.metrica} = ${d.valor} (${d.fuente.split(' · ').slice(2, 4).join(' · ')})`).join('; ')} — criterio: ${p.criterio.slice(0, 90)}…`)
}
