/**
 * El catálogo de fuentes de BASIS y la matriz de cobertura (áreas × fuentes), contados sobre lo fijado: los candidatos
 * web generados, el cruce con sapstack y lo que el catálogo declara de cada fuente que no se captura. Solo lectura.
 */
import { readFileSync } from 'node:fs'

const RAIZ = new URL('../../../', import.meta.url)
const leeJson = (r) => JSON.parse(readFileSync(new URL(r, RAIZ), 'utf8'))
const { DOMINIOS_PROPIOS } = await import(new URL('tools/conocimiento/politica-cita.mjs', RAIZ).href)
const admite = (c) => Boolean(c) && DOMINIOS_PROPIOS['sap-soporte'].fuente({ fuente_url: c.url, fuente_cita: c.texto }) === null

export const CATALOGO = leeJson('src/features/soporte-sap/mesa/fuentes/web/catalogo.json')
export const WEB = leeJson('src/features/soporte-sap/mesa/fuentes/web/candidatos-web.json')
export const SAPSTACK = leeJson('src/features/soporte-sap/mesa/fuentes/sapstack/candidatos-sapstack.json').candidatos
const celda = (s) => String(s ?? '—').replaceAll('|', '\\|').replaceAll('\n', ' ')

/** El catálogo, como tabla: tipo, acceso, cómo se captura, términos, cadencia, última vista, si politica-cita la admite. */
export function tablaDeFuentes() {
  const l = ['| Fuente | Tipo | Acceso | Captura | Términos (URL) | Cadencia | Última vista | Aporta | Releases | ¿Cita admitida? |', '|---|---|---|---|---|---|---|---|---|---|']
  for (const f of CATALOGO.fuentes) {
    const cita = f.citaDeEjemplo ? (admite(f.citaDeEjemplo) ? 'sí' : 'no') : 'no (no da citas)'
    l.push(`| ${celda(f.nombre)} | ${f.tipo} | ${f.acceso} | ${f.captura}: ${celda(f.porQueAsi)} | ${celda(f.terminos.url)} (${celda(f.terminos.dice)}) | ${celda(f.cadencia)} | ${celda(f.ultimaVista)} | ${celda(f.aporta)} | ${celda(f.releases.join(', '))} | ${cita} |`)
  }
  return l.join('\n')
}

const textoDe = (c) => [c.clave, c.titulo, c.seguridad?.producto ?? '', ...(c.contexto ?? [])].join(' ')

/** Lo que cada fuente aporta a un área: candidatos por T-code del área o por producto/página que la nombra. */
function cuentaArea(a) {
  const re = new RegExp(a.productos, 'i')
  const deArea = (c) => a.tcodes.includes(c.clave) || (a.productos !== '^$' && re.test(textoDe(c)))
  const web = WEB.candidatos.filter((c) => c.enAlcance && deArea(c))
  const corroborados = Object.values(WEB.corroboraciones).filter((x) => x.estado === 'corroborado' && x.tipo === 'tcode' && a.tcodes.includes(x.clave))
  return {
    sapstack: SAPSTACK.filter((c) => c.modulos.some((m) => m === 'BASIS' || m === 'BC') && a.tcodes.includes(c.clave)).length,
    seguridad: web.filter((c) => c.seguridad).length,
    explotadas: web.filter((c) => c.seguridad?.explotada).length,
    sapDocs: web.filter((c) => !c.seguridad).length,
    corroborados: corroborados.map((x) => x.clave),
  }
}

const HUMANA = { seguridad: 'Patch Day (notas sin CVE)', ciclos: 'estrategia de mantenimiento', rise: 'SAP Help (RISE)' }
/** La matriz de cobertura: cada área con lo que dan las fuentes automáticas y citables, lo que queda a una persona y el hueco. */
export function matrizDeCobertura() {
  const l = ['| Área de BASIS | sapstack (hipótesis) | CVE List de SAP (+KEV) | SAP-docs | sapstack corroborado por SAP Help | Lectura humana (SAP Help…) | S-user | Estado |', '|---|---|---|---|---|---|---|---|']
  const huecos = []
  for (const a of CATALOGO.areas) {
    const c = cuentaArea(a)
    const citable = c.seguridad + c.sapDocs + c.corroborados.length
    const estado = citable === 0 ? '**hueco**' : c.seguridad + c.corroborados.length >= 3 ? 'cubierta en parte' : 'mínima'
    if (citable === 0) huecos.push(a.nombre)
    l.push(`| ${a.nombre} | ${c.sapstack} | ${c.seguridad}${c.explotadas ? ` (${c.explotadas} explotadas)` : ''} | ${c.sapDocs} | ${c.corroborados.length ? `${c.corroborados.length}: ${c.corroborados.join(', ')}` : '0'} | SAP Help${HUMANA[a.id] ? `; ${HUMANA[a.id]}` : ''} | ${a.id === 'ciclos' ? 'PAM' : 'contenido de las notas'} | ${estado} |`)
  }
  return { tabla: l.join('\n'), huecos }
}
