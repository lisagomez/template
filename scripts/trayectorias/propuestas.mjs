#!/usr/bin/env node
/**
 * Propuestas de mejora derivadas de la evidencia (spec 011, RF-14 y RF-15). Lee el ultimo informe
 * y las evaluaciones, y redacta `trayectorias/propuestas/<fecha>.md`: cada propuesta con la
 * senal, las trayectorias que la sostienen, el destino (skill via autoresearch, aprendizaje,
 * routing, herramienta) y el CDC que haria falta.
 *
 * LO QUE NO HACE, Y ES LO QUE IMPORTA: no toca AGENTS.md, ningun skill, prompt, routing,
 * settings ni .mcp.json. Redacta; aplicar es de la duena (C1). Automejorado no es autoaprobado.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { leeTrayectorias, evaluaEstructural } from './evalua.mjs'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const INFORMES = join(raiz, 'trayectorias', 'informes')
const EVAL = join(raiz, 'trayectorias', 'evaluaciones')
const PROPUESTAS = join(raiz, 'trayectorias', 'propuestas')
const criterios = JSON.parse(readFileSync(join(raiz, 'trayectorias', 'criterios.json'), 'utf8'))

const trayectorias = leeTrayectorias()
const estructural = evaluaEstructural(trayectorias)
let juicio = null
if (existsSync(EVAL)) { const u = readdirSync(EVAL).filter((n) => n.endsWith('-juicio.json')).sort().pop(); if (u) juicio = JSON.parse(readFileSync(join(EVAL, u), 'utf8')) }
const ultimoInforme = existsSync(INFORMES) ? readdirSync(INFORMES).filter((n) => n.endsWith('.json')).sort().pop() : null
const informe = ultimoInforme ? JSON.parse(readFileSync(join(INFORMES, ultimoInforme), 'utf8')) : { hallazgos: [] }

const propuestas = []
// 1) Criterio que falla repetido: por linea y criterio, si falla en >= 40 % de las trayectorias y en >= 3.
const porCriterio = {}
for (const t of trayectorias) {
  const ev = { ...estructural[t.id], ...(juicio?.veredictos?.[t.id] ?? {}) }
  for (const [c, ok] of Object.entries(ev)) {
    const k = (porCriterio[`${t.linea}:${c}`] ??= { linea: t.linea, criterio: c, si: 0, no: [], total: 0 })
    k.total++
    if (ok) k.si++; else k.no.push(t.id)
  }
}
for (const k of Object.values(porCriterio)) {
  if (k.no.length >= 3 && k.no.length / k.total >= 0.4) {
    const descripcion = criterios[k.linea]?.estructurales?.[k.criterio] ?? criterios[k.linea]?.de_juicio?.[k.criterio] ?? k.criterio
    const destino = k.linea === 'fabrica' ? 'skill o regla del arnes (autoresearch como motor de mutacion si es de un skill; aprendizaje en .claude/rules si es de conducta)' : k.linea === 'aplicacion' ? 'routing-modelos.json o la feature' : 'la herramienta y su medicion'
    propuestas.push({ senal: `criterio «${k.criterio}» falla en ${k.no.length} de ${k.total} trayectorias de ${k.linea}`, que: descripcion, destino, fuente: k.no, cdc: k.linea === 'fabrica' || k.linea === 'aplicacion' ? 'si: cambia un skill, una regla o el routing (C1)' : 'no si solo toca la herramienta; si, si toca su skill' })
  }
}
// 2) Regresiones del informe.
for (const h of informe.hallazgos.filter((x) => x.peor)) {
  propuestas.push({ senal: `regresion de ${h.metrica} en ${h.grupo}: ${(h.delta * 100).toFixed(0)} % a peor entre periodos`, que: 'buscar el cambio entre los dos periodos que la explica (commits, modelo, corpus) antes de tocar nada', destino: h.grupo.startsWith('fabrica') ? 'skill o arnes' : h.grupo.startsWith('aplicacion') ? 'feature o routing' : 'herramienta', fuente: h.fuente, cdc: 'depende de lo que se toque; redactado, no aplicado' })
}

mkdirSync(PROPUESTAS, { recursive: true })
const fecha = new Date().toISOString().slice(0, 10)
const lineas = [`# Propuestas derivadas de trayectorias — ${fecha}`, '', '> Redactadas por `scripts/trayectorias/propuestas.mjs` a partir de las evaluaciones y del informe. **Ninguna esta aplicada.** Cada una que toque un skill, una regla, un prompt, el routing o el arnes es un CDC (C1): diff, regresion y firma de la duena. Automejorado no es autoaprobado.', '']
if (propuestas.length === 0) lineas.push('- Sin senal suficiente todavia: ningun criterio falla en 3 o mas trayectorias con el 40 % de fallo, y el informe no marca regresiones.')
propuestas.forEach((p, i) => {
  lineas.push(`## P${i + 1} · ${p.senal}`, '', `- **Que dice el criterio**: ${p.que}`, `- **Destino**: ${p.destino}`, `- **Exige CDC**: ${p.cdc}`, `- **Fuente**: ${p.fuente.slice(0, 8).map((id) => `\`${id}\``).join(', ')}${p.fuente.length > 8 ? ` y ${p.fuente.length - 8} mas` : ''}`, `- **Estado**: PROPUESTA, sin aplicar. Aprobacion: pendiente.`, '')
})
writeFileSync(join(PROPUESTAS, `${fecha}.md`), lineas.join('\n'))
console.log(lineas.join('\n'))
console.log(`\nescrito en trayectorias/propuestas/${fecha}.md · nada aplicado`)
