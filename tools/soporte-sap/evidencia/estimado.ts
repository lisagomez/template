/**
 * Mide en el laboratorio los insumos del estimado de consumo, declara los supuestos y escribe
 * `tools/soporte-sap/medicion/estimado.json` (lo leen el pricing y el dimensionamiento). Después
 * imprime el consumo mensual S/M/L de consultora y de cliente, y la máquina que pide cada tamaño.
 *
 * Uso: node tools/soporte-sap/evidencia/estimado.ts   (con las variables de Tesseract para medir el OCR)
 */
import { writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { evaluaSeguro } from '../../grafo-conocimiento/dist/index.js'
import { motorPorProceso } from '../../extractor-documental/dist/motores/proceso-local.js'
import { digitoVerificadorRfc, digitoVerificadorCurp } from '../../extractor-documental/dist/index.js'
import {
  categoriza, consultaMatriz, conocimientoDeMatriz, agrega, exportaTenant, generaCorpus, MATRIZ_LABORATORIO, consumoMensual,
  maquinaPara, celda, medida, supuesta, INCIDENCIAS_MES, type Insumos, type Consulta, type EventoIncidencia, type MotorReglas,
} from '../dist/index.js'
import { baseSoporte, cargaSintetica, ORG, SECRETO_RESPALDOS } from '../pruebas/_base.ts'
import { HERRAMIENTA, RAIZ } from '../pruebas/_ayuda.ts'

async function bdYExport(): Promise<{ bytesBd: number; bytesExport: number; n: number }> {
  const db = await baseSoporte()
  const tam = async () => (await db.query<{ b: number }>(`select sum(pg_total_relation_size(c.oid))::bigint as b from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname like 'ss\\_%'`)).rows[0]!.b
  const antes = Number(await tam())
  await cargaSintetica(db, ORG.CA, ORG.A1, INCIDENCIAS_MES.consultora.L)
  const n = (await db.query<{ n: number }>(`select count(*)::int as n from ss_incidencia where titulo like 'Incidencia sintética%'`)).rows[0]!.n
  const q: Consulta = async <T>(sql: string, p?: unknown[]) => (await db.query<T>(sql, p)).rows
  const e = await exportaTenant(q, ORG.CA, new Date().toISOString(), SECRETO_RESPALDOS)
  return { bytesBd: (Number(await tam()) - antes) / n, bytesExport: Buffer.byteLength(JSON.stringify(e)) / n, n }
}

function cpuPorIncidencia(): number {
  const conocimiento = conocimientoDeMatriz(MATRIZ_LABORATORIO, '2026-10-04')
  const motor: MotorReglas = (p) => evaluaSeguro(conocimiento, p) as ReturnType<MotorReglas>
  const muestra = generaCorpus({ rfc: digitoVerificadorRfc, curp: digitoVerificadorCurp }).incidencias.slice(0, 500)
  const t0 = process.cpuUsage()
  for (const i of muestra) {
    categoriza(i.descripcion)
    consultaMatriz(motor, MATRIZ_LABORATORIO, i.descripcion, i.sistema)
    let c: EventoIncidencia[] = []
    for (let s = 0; s < 6; s++) c = agrega(i.id, c, { fecha: i.creada, tipo: 'RECIBIDA', actor: 'agente:soporte-sap-a2a', datos: { s } })
  }
  const u = process.cpuUsage(t0)
  return (u.user + u.system) / 1000 / muestra.length
}

async function ocrPorPagina(): Promise<number | null> {
  const cmd = process.env['TESSERACT_CMD']
  if (!cmd) return null
  const entorno = Object.fromEntries(['LD_LIBRARY_PATH', 'TESSDATA_PREFIX', 'TESSERACT_CMD'].filter((n) => process.env[n]).map((n) => [n, process.env[n]!]))
  const version = execFileSync(cmd, ['--version'], { encoding: 'utf8' }).split('\n')[0]!.replace(/^tesseract\s+/, '').trim()
  const motor = motorPorProceso({ comando: 'python3', argumentos: [join(RAIZ, 'tools/extractor-documental/motores-locales/tesseract.py')], modelo: `tesseract-${version}-spa-zonal-1`, entorno: { ...entorno, EXTRACTOR_IDIOMA: 'spa' } })
  const { readFileSync } = await import('node:fs')
  const imagen = new Uint8Array(readFileSync(join(HERRAMIENTA, 'documentos/captura-migo.png')))
  const t0 = performance.now()
  for (let k = 0; k < 3; k++) await motor.extrae(imagen)
  return (performance.now() - t0) / 3 / 1000
}

const hoy = new Date().toISOString().slice(0, 10)
const { bytesBd, bytesExport, n } = await bdYExport()
const ocr = await ocrPorPagina()
const insumos: Insumos = {
  bytesBdPorIncidencia: medida(Math.round(bytesBd), 'bytes', `PGlite: tamaño de las tablas ss_* tras ${n} incidencias sintéticas con 6 eventos, adjunto y horas (evidencia/estimado.ts, ${hoy})`),
  documentosPorIncidencia: supuesta(1.2, 'documentos', 'SUPUESTO: una captura o un PDF por incidencia, a veces dos'),
  bytesPorDocumento: supuesta(250_000, 'bytes', `SUPUESTO: captura de pantalla completa; la sintética del laboratorio mide ${statSync(join(HERRAMIENTA, 'documentos/captura-migo.png')).size} bytes`),
  fraccionImagenes: supuesta(0.6, 'fracción', 'SUPUESTO: seis de cada diez adjuntos son imágenes (el resto, PDF con texto o XML)'),
  segundosOcrPorPagina: ocr === null ? { valor: null, unidad: 's/página', naturaleza: 'medida', fuente: 'no medido: falta Tesseract en esta máquina' } : medida(Math.round(ocr * 100) / 100, 's/página', `Tesseract por zonas, 3 lecturas de una captura sintética de 1400 px (CPU, sin GPU, ${hoy})`),
  tokensPorIncidencia: supuesta(9000, 'tokens', 'SUPUESTO: sin LLM real no hay medición (D7); triage y redacción de un plan'),
  msCpuPorIncidencia: medida(Math.round(cpuPorIncidencia() * 1000) / 1000, 'ms', `categorizador + matriz sobre el motor del grafo + 6 eventos de la cadena, 500 incidencias del corpus (${hoy})`),
  bytesExportPorIncidencia: medida(Math.round(bytesExport), 'bytes', `export por tenant de ${n} incidencias sintéticas (JSON) (${hoy})`),
  bytesEgresoPorIncidencia: supuesta(400_000, 'bytes', 'SUPUESTO: vistas del ticket y de los tableros por incidencia'),
  ramBaseMb: supuesta(768, 'MB', 'SUPUESTO: Next standalone y Node; no medido en un VPS'),
  ramPorTrabajadorOcrMb: supuesta(350, 'MB', 'SUPUESTO: un proceso de Tesseract por zonas con su Python'),
}
mkdirSync(join(HERRAMIENTA, 'medicion'), { recursive: true })
writeFileSync(join(HERRAMIENTA, 'medicion/estimado.json'), JSON.stringify({ medido: hoy, insumos }, null, 1) + '\n')

console.log('## Insumos\n\n| Insumo | Valor | Naturaleza | Fuente |\n|---|---|---|---|')
for (const [k, c] of Object.entries(insumos)) console.log(`| ${k} | ${c.valor ?? 'no medido'} ${c.unidad} | ${c.naturaleza} | ${c.fuente} |`)
for (const quien of ['consultora', 'cliente'] as const) {
  console.log(`\n## Consumo mensual por tamaño de ${quien}\n\n| Rubro | S | M | L |\n|---|---|---|---|`)
  const t = { S: consumoMensual(insumos, INCIDENCIAS_MES[quien].S), M: consumoMensual(insumos, INCIDENCIAS_MES[quien].M), L: consumoMensual(insumos, INCIDENCIAS_MES[quien].L) }
  for (const rubro of Object.keys(t.S) as Array<keyof typeof t.S>) console.log(`| ${rubro} | ${celda(t.S[rubro])} | ${celda(t.M[rubro])} | ${celda(t.L[rubro])} |`)
  const maq = { S: maquinaPara(insumos, t.S), M: maquinaPara(insumos, t.M), L: maquinaPara(insumos, t.L) }
  for (const k of ['vcpu', 'ramGb', 'discoGb'] as const) console.log(`| máquina: ${k} | ${celda(maq.S[k])} | ${celda(maq.M[k])} | ${celda(maq.L[k])} |`)
}
console.log(`\nFórmulas: ${consumoMensual(insumos, 1).bd.fuente} · ${consumoMensual(insumos, 1).cpuOcr.fuente} · escrito medicion/estimado.json`)
