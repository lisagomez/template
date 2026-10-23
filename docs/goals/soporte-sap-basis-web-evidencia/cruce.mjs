/**
 * El cruce con sapstack, medido sobre el catálogo web fijado: de los candidatos de BASIS/BC de sapstack, cuántos
 * CORROBORA una fuente que `politica-cita.mjs` admite (SAP Help, vía SAP-docs; o el número de una SAP Note en un registro
 * de SAP), cuántos CONTRADICE y cuántos NO ENCUENTRA, por módulo y por tipo. Solo lectura; dos corridas dan lo mismo.
 */
import { createHash } from 'node:crypto'
import { SAPSTACK, WEB } from './cobertura.mjs'

const POR_ID = new Map(SAPSTACK.map((c) => [c.id, c]))
const ESTADOS = ['corroborado', 'contradicho', 'no_encontrado']

/** El cruce entero, en un objeto ordenado (para que su huella sea estable). */
export function cruce() {
  const basis = Object.entries(WEB.corroboraciones).filter(([, x]) => x.basis).sort(([, a], [, b]) => (a.clave < b.clave ? -1 : 1))
  const porModulo = {}
  for (const [id, x] of basis) {
    for (const m of POR_ID.get(id).modulos.filter((y) => y === 'BASIS' || y === 'BC' || y === 'ABAP')) {
      porModulo[m] ??= { corroborado: 0, contradicho: 0, no_encontrado: 0 }
      porModulo[m][x.estado]++
    }
  }
  const porTipo = {}
  for (const [, x] of basis) { porTipo[x.tipo] ??= { corroborado: 0, contradicho: 0, no_encontrado: 0 }; porTipo[x.tipo][x.estado]++ }
  const lista = (e) => basis.filter(([, x]) => x.estado === e).map(([, x]) => ({ clave: x.clave, tipo: x.tipo, evidencias: x.evidencias.filter((v) => v.admitida).map((v) => `${v.guia} › ${v.pagina} (${v.cita?.url ?? v.url})`).slice(0, 2) }))
  const fuera = Object.values(WEB.corroboraciones).filter((x) => !x.basis).map((x) => `${x.clave}: ${x.estado}`)
  const total = Object.fromEntries(ESTADOS.map((e) => [e, basis.filter(([, x]) => x.estado === e).length]))
  const noAdmitidas = basis.filter(([, x]) => x.estado === 'no_encontrado' && x.evidencias.length).map(([, x]) => x.clave)
  return { total: basis.length, ...total, porModulo, porTipo, corroborados: lista('corroborado'), contradichos: lista('contradicho'), noEncontrados: lista('no_encontrado').map((x) => x.clave), soloEnNoAdmitidas: noAdmitidas, fueraDeBasis: fuera }
}

export const huellaDelCruce = (c) => `sha256:${createHash('sha256').update(JSON.stringify(c)).digest('hex').slice(0, 16)}`
