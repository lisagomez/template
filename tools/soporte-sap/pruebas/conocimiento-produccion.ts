/**
 * H-20: el candado del conocimiento de producción. Con incidencias reales, los veredictos salen de
 * `@tu-scope/conocimiento` (versión exacta, registrada, con la huella de cada regla y su dominio), nunca de la matriz
 * sintética; y el código de la matriz no puede subir un veredicto. Aquí no se siembra nada en `tools/conocimiento`: el
 * control positivo usa el paquete real con un dominio existente renombrado.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { seleccionaDominios, evaluaSeguro, validaConocimiento } from '../../grafo-conocimiento/dist/index.js'
import { huellas } from '../../grafo-conocimiento/dist/gate-entrada.js'
import { conocimientoDeProduccion, ConocimientoNoAdmitido, DOMINIO_SOPORTE_SAP, conocimientoDeMatriz, consultaMatriz, MATRIZ_LABORATORIO, type MotorReglas } from '../dist/index.js'
import { RAIZ } from './_ayuda.ts'

type Paquete = Parameters<typeof seleccionaDominios>[0]
/** El paquete se valida siempre antes de usarlo (su README): así lo usa también el producto. */
const PAQUETE = validaConocimiento(JSON.parse(readFileSync(join(RAIZ, 'tools', 'conocimiento', 'dist', 'conocimiento.json'), 'utf8'))).conocimiento!
const REGISTRO = JSON.parse(readFileSync(join(RAIZ, 'tools', 'conocimiento', 'versiones.json'), 'utf8'))
const GRAFO = { seleccionaDominios, huellas }
const VERSION = PAQUETE.version
/** El paquete real con un dominio existente renombrado a `sap-soporte`: sus reglas conservan la huella registrada. */
const conDominio = (origen: string): Paquete => ({ ...PAQUETE, dominios: PAQUETE.dominios.map((d) => (d.clave === origen ? { ...d, clave: DOMINIO_SOPORTE_SAP } : d)) })

test('H-20 · hoy el paquete no trae el dominio de Soporte SAP: el producto no arranca con incidencias reales, y lo dice', () => {
  assert.throws(() => conocimientoDeProduccion(PAQUETE, VERSION, REGISTRO, GRAFO), (e: Error) => e instanceof ConocimientoNoAdmitido
    && /no trae el dominio sap-soporte: sus reglas entran con la primera incidencia real, firmadas por el laboratorio/.test(e.message))
})

test('H-20 · el conocimiento de producción va en su versión exacta y registrada, y con la huella registrada de cada regla', () => {
  const p = conDominio('mx-drones-de-reparto')
  const propio = conocimientoDeProduccion(p, VERSION, REGISTRO, GRAFO)
  assert.deepEqual(propio.dominios.map((d) => d.clave), [DOMINIO_SOPORTE_SAP], 'control: con el dominio, pasa, y solo ese')
  assert.ok(propio.reglas.length > 0)
  assert.throws(() => conocimientoDeProduccion(p, `^${VERSION}`, REGISTRO, GRAFO), /va exacta/)
  assert.throws(() => conocimientoDeProduccion(p, '0.0.1', REGISTRO, GRAFO), /el producto fijó la 0\.0\.1/)
  assert.throws(() => conocimientoDeProduccion({ ...p, version: '9.9.9' }, '9.9.9', REGISTRO, GRAFO), /no está registrada: no pasó el gate de siembra/)
  const editada = propio.reglas[0]!.clave
  const tocado: Paquete = { ...p, reglas: p.reglas.map((r) => (r.clave === editada ? { ...r, texto_resumen: `${r.texto_resumen} (editada en su sitio)` } : r)) }
  assert.throws(() => conocimientoDeProduccion(tocado, VERSION, REGISTRO, GRAFO), new RegExp(`${editada}: no tienen la huella registrada`), 'una regla editada sin registrar no pasa')
})

test('H-20 · la matriz sintética del laboratorio no pasa como conocimiento de producción, aunque diga una versión registrada', () => {
  const sintetica = conocimientoDeMatriz(MATRIZ_LABORATORIO, '2026-10-04', '0.1.0') as unknown as Paquete
  assert.ok(REGISTRO.versiones.some((v: { version: string }) => v.version === '0.1.0'), 'la 0.1.0 sí está registrada')
  assert.throws(() => conocimientoDeProduccion(sintetica, '0.1.0', REGISTRO, GRAFO), /el conocimiento sintético del laboratorio no resuelve incidencias reales/)
})

test('H-20 · el código de la matriz no sube un veredicto: si la regla dice «al experto», la entrada no lo vuelve solución', () => {
  const caso = MATRIZ_LABORATORIO.find((e) => e.regla === 'SS-MM-PERIODO')!
  assert.equal(caso.grado, 'validada', 'en el código el caso está validado')
  const conocimiento = validaConocimiento(conocimientoDeMatriz(MATRIZ_LABORATORIO.map((e) => (e.regla === caso.regla ? { ...e, grado: 'experimental' as const } : e)), '2026-10-04')).conocimiento!
  const motor: MotorReglas = (q) => evaluaSeguro(conocimiento, q, { hoy: '2026-10-04' }) as ReturnType<MotorReglas>
  const r = consultaMatriz(motor, MATRIZ_LABORATORIO, 'MIGO marca M7 053: el periodo de MM está cerrado en sociedad 1000, periodo 2026/10', 'S4HANA')
  assert.equal(r.tipo, 'grado_insuficiente', 'manda la regla, no la entrada de código')
})

/** Quién importa la matriz sintética. Solo el laboratorio: su runtime, sus CLI, su evidencia, sus semillas, las pruebas y la matriz de firmas (que la nombra en un sabotaje). */
const PERMITIDOS = [/^src\/features\/soporte-sap\/services\/runtime\.ts$/, /^tools\/soporte-sap\/(clis|evidencia|pruebas|firmas)\//,
  /^tools\/soporte-sap\/src\/(laboratorio\/|index\.ts$|matriz\.ts$)/, /^tools\/soporte-sap\/semantica\/semillas\.ts$/]
const USA_LA_SINTETICA = /\bMATRIZ_LABORATORIO\b|\bconocimientoDeMatriz\b/
export function quienUsaLaSintetica(archivos: ReadonlyArray<{ ruta: string; codigo: string }>): string[] {
  return archivos.filter((a) => USA_LA_SINTETICA.test(a.codigo) && !PERMITIDOS.some((p) => p.test(a.ruta))).map((a) => a.ruta)
}
function codigoDe(dir: string): Array<{ ruta: string; codigo: string }> {
  const salida: Array<{ ruta: string; codigo: string }> = []
  const recorre = (d: string): void => {
    for (const n of readdirSync(d)) {
      const ruta = join(d, n)
      if (/node_modules|dist|\.next/.test(n)) continue
      if (statSync(ruta).isDirectory()) recorre(ruta)
      else if (/\.(ts|tsx|mjs|js)$/.test(n)) salida.push({ ruta: relative(RAIZ, ruta), codigo: readFileSync(ruta, 'utf8') })
    }
  }
  recorre(join(RAIZ, dir))
  return salida
}

test('H-20 · la matriz sintética solo la importa el laboratorio; un archivo de producción que la importe se caza', () => {
  const archivos = [...codigoDe('src'), ...codigoDe('tools/soporte-sap')]
  assert.ok(archivos.length > 50, `${archivos.length} archivos revisados`)
  assert.deepEqual(quienUsaLaSintetica(archivos), [])
  const plantado = { ruta: 'tools/soporte-sap/src/job-de-produccion.ts', codigo: "import { MATRIZ_LABORATORIO } from './laboratorio/matriz.js'" }
  assert.deepEqual(quienUsaLaSintetica([...archivos, plantado]), ['tools/soporte-sap/src/job-de-produccion.ts'], 'control: el barrido caza un import plantado')
})
