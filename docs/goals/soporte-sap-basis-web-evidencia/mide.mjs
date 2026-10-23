#!/usr/bin/env node
/**
 * La evidencia de SAP BASIS desde la web, de solo lectura y determinista (dos corridas dan lo mismo):
 *
 *   node docs/goals/soporte-sap-basis-web-evidencia/mide.mjs <carpeta-de-captura>
 *
 * 1. el catálogo de fuentes; 2. la matriz de cobertura con sus huecos; 3. la extracción, dos veces con la misma huella, y
 * negándose ante una captura alterada (sobre una COPIA de la captura en un temporal); 4. el cruce con sapstack;
 * 5. el grafo corrido; 6. la revisión de vigencia simulada sin red (sobre una copia del pin). La revisión con red es
 * `vigencia.mjs`. Usa los `dist/` de tools/ (`npm run prepara:gate`). No escribe en el repo.
 */
import { cpSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CATALOGO, SAPSTACK, WEB, matrizDeCobertura, tablaDeFuentes } from './cobertura.mjs'
import { cruce, huellaDelCruce } from './cruce.mjs'
import { grafo } from './grafo.mjs'

const RAIZ = new URL('../../../', import.meta.url)
const FUENTES = 'src/features/soporte-sap/mesa/fuentes/web'
const { catalogoWebDe } = await import(new URL(`${FUENTES}/generador.mjs`, RAIZ).href)
const { revisaWeb, sinRed, FIJADO } = await import(new URL(`${FUENTES}/revisa.mjs`, RAIZ).href)
const PIN = JSON.parse(readFileSync(new URL(`${FUENTES}/pin.json`, RAIZ), 'utf8'))
const CAPTURA = process.argv[2]
const linea = (...xs) => console.log(xs.join(''))
const obj = (o) => Object.entries(o).map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')

function fuentesYCobertura() {
  linea('## 1. Catálogo de fuentes (', CATALOGO.fuentes.length, ' fuentes, revisado el ', CATALOGO.revisado, ')\n')
  linea(tablaDeFuentes())
  const m = matrizDeCobertura()
  linea('\n## 2. Matriz de cobertura de BASIS (', CATALOGO.areas.length, ' áreas)\n')
  linea(m.tabla)
  linea('\nHuecos declarados (sin una fuente automática y citable): ', m.huecos.length, ': ', m.huecos.join('; '))
}

function extraccion() {
  linea('\n## 3. La extracción, dos veces, y con una captura alterada')
  if (!CAPTURA) throw new Error('falta la carpeta de captura')
  const a = catalogoWebDe(CAPTURA, PIN, CATALOGO, SAPSTACK), b = catalogoWebDe(CAPTURA, PIN, CATALOGO, SAPSTACK)
  linea('- corrida 1: ', a.candidatos.length, ' candidatos · ', a.huella)
  linea('- corrida 2: ', b.candidatos.length, ' candidatos · ', b.huella)
  linea('- la del repo (candidatos-web.json): ', WEB.huella, ' → ', a.huella === b.huella && a.huella === WEB.huella ? 'las tres iguales' : '**DISTINTAS**')
  const copia = mkdtempSync(join(tmpdir(), 'captura-alterada-'))
  try {
    cpSync(CAPTURA, copia, { recursive: true })
    const r = join(copia, 'cvelist', 'cves/2026/89xxx/CVE-2026-89110.json')
    writeFileSync(r, readFileSync(r, 'utf8').replace('"baseScore": 9.9', '"baseScore": 4.2'))
    try { catalogoWebDe(copia, PIN, CATALOGO, SAPSTACK); linea('- captura alterada: **SE EXTRAJO** (mal)') } catch (e) { linea('- captura alterada (CVSS de la 3797111 cambiado a 4.2 en una copia): se niega → «', e.message, '»') }
  } finally { rmSync(copia, { recursive: true, force: true }) }
  const r = a.resumen
  linea('- registros leídos ', r.registros, ' (de SAP ', r.deSap, ', sin número de nota ', r.sinNota, ') · notas de seguridad ', r.notasDeSeguridad, ' (fuera del alcance ', r.fueraDeAlcance, ') · explotadas (KEV ', r.kev, ') ', r.explotadas, ' · páginas de SAP-docs ', r.paginas)
  linea('- candidatos: ', obj(r.candidatos))
}

function elCruce() {
  const c1 = cruce(), c2 = cruce()
  linea('\n## 4. El cruce con sapstack (', c1.total, ' candidatos de BASIS/BC)')
  linea('- corroborados ', c1.corroborado, ' · contradichos ', c1.contradicho, ' · no encontrados ', c1.no_encontrado, ' · huella ', huellaDelCruce(c1), ' (otra corrida: ', huellaDelCruce(c2), ')')
  for (const [m, x] of Object.entries(c1.porModulo)) linea(`  - ${m}: corroborados ${x.corroborado}, contradichos ${x.contradicho}, no encontrados ${x.no_encontrado}`)
  for (const [t, x] of Object.entries(c1.porTipo)) linea(`  - ${t === 'tcode' ? 'T-codes' : 'SAP Notes'}: corroborados ${x.corroborado}, contradichos ${x.contradicho}, no encontrados ${x.no_encontrado}`)
  for (const x of c1.corroborados) linea(`  - ✓ ${x.clave}: ${x.evidencias.join(' | ')}`)
  for (const x of c1.contradichos) linea(`  - ✗ ${x.clave}: ${x.evidencias.join(' | ')}`)
  linea('  - no encontrados: ', c1.noEncontrados.join(', '))
  linea('  - mencionados solo en una fuente que politica-cita no admite: ', c1.soloEnNoAdmitidas.join(', ') || 'ninguno')
  linea('  - fuera de BASIS/BC, con evidencia: ', c1.fueraDeBasis.join(', ') || 'ninguno')
}

function elGrafo() {
  const r = grafo()
  linea('\n## 5. El grafo, corrido (paquete de prueba ', r.candidato.version, ', sin registrar)')
  linea('- validaConocimiento: ok=', r.validacion.ok, ' · ', r.candidato.categorias, ' categorías y ', r.candidato.reglas, ' reglas · grados: ', obj(r.candidato.grados), ' · problemas: ', obj(r.validacion.problemas) || 'ninguno')
  for (const e of r.validacion.ejemplos) linea('  - ', e)
  linea('- politica-cita (sap-soporte): ', r.cita.problemas, ' problemas · ', obj(r.cita.porMotivo))
  linea('| Escenario | Hoy (categoriza) | Con candidatos: categoría | Motivo | Grado | Destino | Cita |')
  linea('|---|---|---|---|---|---|---|')
  for (const e of r.escenarios) linea(`| ${e.id} | módulo ${e.hoy.modulo ?? '—'}, transacción ${e.hoy.transaccion ?? '—'} | ${e.conCandidatos.categoria ?? '—'} | ${e.conCandidatos.motivo} | ${e.conCandidatos.grado ?? '—'} | ${e.conCandidatos.destino} | ${e.conCandidatos.cita ?? '—'} |`)
}

async function vigenciaSimulada() {
  linea('\n## 6. La revisión de vigencia, sin red, sobre una copia del pin')
  const dir = mkdtempSync(join(tmpdir(), 'pin-'))
  try {
    const ruta = join(dir, 'pin.json')
    copyFileSync(new URL(`${FUENTES}/pin.json`, RAIZ), ruta)
    for (const hoy of ['2026-10-23', '2026-11-11']) {
      const r = await revisaWeb(ruta, { hoy, remoto: sinRed })
      linea(`- hoy ${hoy}: ${r.estado === 'al_dia' ? 'al día' : 'HAY VERSIÓN NUEVA'} · próximo Patch Day ${r.proximoPatchDay}${r.avisos.length ? ` · ${r.avisos.join(' · ')}` : ''}`)
    }
    const despues = JSON.parse(readFileSync(ruta, 'utf8'))
    const movidos = FIJADO.filter((k) => JSON.stringify(despues[k]) !== JSON.stringify(PIN[k]))
    linea('- lo fijado (', FIJADO.join(', '), ') tras las dos revisiones: ', movidos.length ? `**CAMBIÓ ${movidos.join(', ')}**` : 'igual: avisa y no mueve')
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

try {
  fuentesYCobertura(); extraccion(); elCruce(); elGrafo(); await vigenciaSimulada()
} catch (e) {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
}
