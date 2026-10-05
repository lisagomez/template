/**
 * La cadena sha256 de una incidencia: verde intacta y roja con cada manipulación.
 * Uso: node tools/soporte-sap/evidencia/cadena.ts   · Exit 1 si una manipulación no se detecta.
 */
import { agrega, verificaCadena, nuevoEvento, type EventoIncidencia, type Verificacion } from '../dist/index.js'

const INC = 'alimentos-del-bajio-0042'
let c: EventoIncidencia[] = []
const pasos: Array<[EventoIncidencia['tipo'], string, Record<string, string>]> = [
  ['RECIBIDA', 'usr-1a2b3c4d5e6f', { canal: 'portal', adjuntos: '2' }],
  ['ADJUNTO_LEIDO', 'ingesta:extractor', { via: 'xml', campos: '6' }],
  ['CATEGORIZADA', 'agente:soporte-sap-a2a', { prioridad: 'P2', categoria: 'CFDI_RFC_FUERA_LCO' }],
  ['PLAN_PREPARADO', 'agente:soporte-sap-a2a', { sha256: 'ab'.repeat(32) }],
  ['APROBADA', 'usr-9f8e7d6c5b4a', { taskId: 'tarea-42' }],
  ['APLICADA_EN_SIMULADOR', 'agente:soporte-sap-a2a', { despues: 'CFDI timbrado' }],
]
pasos.forEach(([tipo, actor, datos], i) => { c = agrega(INC, c, { fecha: `2026-10-04T10:0${i}:00Z`, tipo, actor, datos }) })

const describe = (v: Verificacion): string => (v.ok ? `verde · ${v.n} eventos · cabeza ${v.cabeza.slice(0, 12)}…` : `ROJO · evento ${v.rotura.seq}: ${v.rotura.motivo} (${v.rotura.detalle})`)
const casos: Array<[string, EventoIncidencia[], boolean]> = []
casos.push(['cadena intacta', c, true])
const alterada = [...c]; alterada[4] = { ...alterada[4]!, actor: 'usr-000000000000' }
casos.push(['se altera el actor de la aprobación (evento 5)', alterada, false])
const borrada = [...c]; borrada.splice(3, 1)
casos.push(['se borra el plan preparado (evento 4)', borrada, false])
const reordenada = [...c]; [reordenada[1], reordenada[2]] = [reordenada[2]!, reordenada[1]!]
casos.push(['se reordenan la lectura y la categorización (eventos 2 y 3)', reordenada, false])
const recalculada = [...c]; recalculada[2] = nuevoEvento(INC, c.slice(0, 2), { fecha: c[2]!.fecha, tipo: 'CATEGORIZADA', actor: c[2]!.actor, datos: { prioridad: 'P4' } })
casos.push(['se cambia la prioridad y se recalcula su hash (evento 3)', recalculada, false])

let malo = false
console.log(`| Caso | Esperado | Verificación |\n|---|---|---|`)
for (const [que, cadena, debeSerOk] of casos) {
  const v = verificaCadena(INC, cadena)
  if (v.ok !== debeSerOk) malo = true
  console.log(`| ${que} | ${debeSerOk ? 'verde' : 'rojo'} | ${describe(v)} ${v.ok === debeSerOk ? '✓' : '✗'} |`)
}
console.log(malo ? '\n✗ una manipulación pasó sin detectarse' : `\n✓ ${casos.length}/${casos.length}: intacta en verde y las cuatro manipulaciones en rojo`)
process.exit(malo ? 1 : 0)
