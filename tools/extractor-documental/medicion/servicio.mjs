#!/usr/bin/env node
/**
 * Medicion del SERVICIO (spec 010): latencia por documento y por etapa, rendimiento de lote,
 * evidencia por campo, CER y campos correctos contra la verdad sintetica, y la correlacion
 * confianza-error que decide si hay umbral o no.
 *
 * IMPRIME FORMA, NUNCA VALORES: rutas, clases, conteos, tiempos y metricas. Los valores quedan en
 * la carpeta de salida (`corpus/salida-servicio-*`, ignorada por git).
 *
 * Dos modos, y conviene medir los dos: en proceso (la logica sola) y por HTTP contra el servicio
 * corriendo (`--via http://127.0.0.1:8080`), que es lo que el cliente va a tener.
 *
 *   node medicion/servicio.mjs [--via URL] [--en-vuelo 2] [--filtro regex] [--sin-xml]
 *
 * Con menos de 100 paginas la cifra se marca NO CONCLUYENTE y se dice (RF-24).
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, basename, extname, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CORPUS = join(RAIZ, 'corpus')
const FIXTURES = join(RAIZ, 'pruebas', 'fixtures')
const arg = (nombre, porDefecto) => { const i = process.argv.indexOf(`--${nombre}`); return i === -1 ? porDefecto : process.argv[i + 1] }
const bandera = (nombre) => process.argv.includes(`--${nombre}`)
const VIA = arg('via', null)
const EN_VUELO = Number(arg('en-vuelo', '2'))
const FILTRO = arg('filtro', null)
const MINIMO_CONCLUYENTE = 100
const BASE_PAG_MIN = 197 // spec 009 TAR-9: Tesseract por zonas + QR + validadores, 84 paginas reales, 4 en vuelo

const { cer, precisionDeCampos, correlacionConfianzaError, curvaDeUmbral } = await import(join(RAIZ, 'dist', 'calibracion.js'))

// --- El corpus: sinteticos con verdad, XML de fixtures sin verdad ------------------------------
const verdad = new Map()
const archivos = []
for (const nombre of readdirSync(CORPUS).sort()) {
  const ext = extname(nombre)
  if (!['.png', '.jpg', '.pdf', '.xml'].includes(ext)) continue
  const v = existsSync(join(CORPUS, `${basename(nombre, ext)}.json`)) ? JSON.parse(readFileSync(join(CORPUS, `${basename(nombre, ext)}.json`), 'utf8')) : null
  if (v) verdad.set(nombre, v)
  archivos.push({ documentoId: nombre, nombre, tipoDocumento: v?.tipoDocumento ?? v?.tipo ?? 'documento', bytes: readFileSync(join(CORPUS, nombre)) })
}
if (!bandera('sin-xml')) {
  for (const nombre of readdirSync(FIXTURES).filter((n) => /^cfdi-40-.*\.xml$/.test(n)).sort()) {
    archivos.push({ documentoId: nombre, nombre, tipoDocumento: 'cfdi', bytes: readFileSync(join(FIXTURES, nombre)) })
  }
}
const seleccion = archivos.filter((a) => FILTRO === null || new RegExp(FILTRO).test(a.nombre))

// --- La corrida: en proceso o por HTTP ----------------------------------------------------------
let resultado
let hardware
const t0 = Date.now()
if (VIA === null) {
  const { configura } = await import(join(RAIZ, 'servicio', 'configuracion.mjs'))
  const { leeDocumentos } = await import(join(RAIZ, 'servicio', 'lectura.mjs'))
  const configuracion = await configura()
  hardware = { via: 'en proceso', ...configuracion.describe() }
  resultado = await leeDocumentos(seleccion.map((a) => ({ ...a, bytes: new Uint8Array(a.bytes) })), configuracion, EN_VUELO)
} else {
  hardware = { via: VIA }
  const r = await fetch(`${VIA.replace(/\/$/, '')}/lote`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enVuelo: EN_VUELO, documentos: seleccion.map((a) => ({ documentoId: a.documentoId, nombre: a.nombre, tipoDocumento: a.tipoDocumento, base64: a.bytes.toString('base64') })) }),
  })
  if (!r.ok) { console.error(`el servicio respondio ${r.status}`); process.exit(2) }
  resultado = await r.json()
}
const msReloj = Date.now() - t0
const { documentos, lote } = resultado
const { cpus, totalmem } = await import('node:os')
hardware.maquina = { hilos: cpus().length, ramGB: Math.round(totalmem() / 1e9), gpu: existsSync('/proc/driver/nvidia/version') ? 'presente' : 'ninguna' }

// --- Tabla por documento (forma) ----------------------------------------------------------------
const fila = (...c) => console.log(c.map((v, i) => String(v).padEnd([30, 8, 10, 18, 7, 26, 6, 8][i])).join(''))
console.log(`\ncorpus: ${documentos.length} documento(s) · ${lote.paginas} pagina(s) · ${EN_VUELO} en vuelo · ${hardware.via}\n`)
fila('documento', 'tipo', 'ruta', 'clase', 'campos', 'evidencia c/e/co/ch/m', 'rev', 'ms')
for (const d of documentos) {
  const e = d.evidencia
  fila(d.documentoId.slice(0, 28), d.tipoDocumento, d.ruta, d.estructura.clase, d.campos.length, `${e.codigo}/${e.exacto}/${e.corroboracion}/${e.checksum}/${e.motor}`, d.revisionHumana, d.tiempos.total)
}

// --- Rendimiento y latencia, separados ----------------------------------------------------------
const deMotor = documentos.filter((d) => d.ruta === 'motor')
const paginasMotor = deMotor.reduce((s, d) => s + d.paginas, 0)
const msMotor = deMotor.reduce((s, d) => s + d.tiempos.motor, 0)
const concluyente = lote.paginas >= MINIMO_CONCLUYENTE
console.log(`\n${concluyente ? '' : 'NO CONCLUYENTE (menos de 100 paginas): '}rendimiento de lote`)
console.log(`  por ruta: ${JSON.stringify(lote.porRuta)} · lote ${lote.milisegundos} ms de reloj · ${lote.paginasPorMinuto} pag/min (todas las vias)`)
console.log(`  via motor: ${paginasMotor} pagina(s) · ${(paginasMotor / (msMotor / 60000)).toFixed(1)} pag/min sumando tiempos de motor · ${(paginasMotor / (msReloj / 60000)).toFixed(1)} pag/min de reloj con ${EN_VUELO} en vuelo · base spec 009: ${BASE_PAG_MIN}`)
console.log(`latencia por documento (ms): p50 ${lote.latenciaPorDocumentoMs.p50} · p95 ${lote.latenciaPorDocumentoMs.p95}`)
for (const [etapa, v] of Object.entries(lote.porEtapaMs)) console.log(`  etapa ${etapa.padEnd(8)} p50 ${String(v.p50).padStart(6)} · p95 ${String(v.p95).padStart(6)}`)
const soloMotor = deMotor.map((d) => d.tiempos.total).sort((a, b) => a - b)
if (soloMotor.length > 0) console.log(`  solo via motor: p50 ${soloMotor[Math.ceil(soloMotor.length / 2) - 1]} · p95 ${soloMotor[Math.max(0, Math.ceil(0.95 * soloMotor.length) - 1)]}`)

// --- Evidencia ----------------------------------------------------------------------------------
const evidencia = { codigo: 0, exacto: 0, corroboracion: 0, checksum: 0, motor: 0 }
for (const d of documentos) for (const k of Object.keys(evidencia)) evidencia[k] += d.evidencia[k]
const totalCampos = Object.values(evidencia).reduce((a, b) => a + b, 0)
console.log(`\nevidencia de los ${totalCampos} campos: ${JSON.stringify(evidencia)} · a revision humana: ${documentos.reduce((s, d) => s + d.revisionHumana, 0)}`)
console.log(`estructura: ${documentos.filter((d) => !d.estructura.sinClase).length} con esquema · ${documentos.filter((d) => d.estructura.sinClase).length} sin clase declarada · faltantes obligatorias: ${documentos.reduce((s, d) => s + d.estructura.faltantes.length, 0)}`)

// --- Contra la verdad: CER, campos correctos, correlacion ---------------------------------------
const pliega = (t) => t.split('\n').map((l) => l.trim().replace(/\s+/g, ' ')).filter((l) => l.length > 0).join('\n')
const muestras = []
const muestrasConPagina = []
const cers = []
for (const d of documentos.filter((x) => verdad.has(x.documentoId))) {
  const v = verdad.get(d.documentoId)
  if (d.ruta === 'motor' && typeof v.texto === 'string') {
    const markdown = d.lectura.paginas.map((p) => p.markdown.split('\n[lecturas por zona]')[0]).join('\n')
    const c = cer(pliega(v.texto), pliega(markdown))
    if (c !== null) cers.push({ id: d.documentoId, cer: c })
  }
  const confianzaPagina = d.lectura.paginas[0]?.confianza ?? 0
  // Las verdades de alta/CURP sinteticas traen solo `campos` (y `tipo`), sin texto: sirven para campos, no para CER.
  for (const [clave, referencia] of Object.entries(v.campos ?? {})) {
    if (typeof referencia !== 'string') continue
    const campo = d.campos.find((c) => c.clave === clave)
    const base = { clave, referencia, obtenido: campo?.valor ?? '' }
    muestras.push({ ...base, confianza: campo?.confianza ?? 0 })
    if (d.ruta === 'motor') muestrasConPagina.push({ ...base, confianza: confianzaPagina })
  }
}
if (cers.length > 0) {
  const media = cers.reduce((s, c) => s + c.cer, 0) / cers.length
  console.log(`\nCER (espacio plegado) sobre ${cers.length} escaneo(s) sinteticos: medio ${media.toFixed(4)} · max ${Math.max(...cers.map((c) => c.cer)).toFixed(4)}`)
}
const precision = precisionDeCampos(muestras)
console.log(`campos correctos contra la verdad: ${precision === null ? 'sin muestras' : `${(precision * 100).toFixed(1)} % de ${muestras.length}`}`)
const porRuta = {}
for (const d of documentos.filter((x) => verdad.has(x.documentoId))) {
  const v = verdad.get(d.documentoId)
  const m = Object.entries(v.campos ?? {}).filter(([, r]) => typeof r === 'string').map(([clave, referencia]) => ({ clave, referencia, obtenido: d.campos.find((c) => c.clave === clave)?.valor ?? '', confianza: 0 }))
  const p = precisionDeCampos(m)
  porRuta[d.ruta] = porRuta[d.ruta] ?? []
  porRuta[d.ruta].push(p ?? 0)
}
for (const [ruta, ps] of Object.entries(porRuta)) console.log(`  ${ruta.padEnd(10)} ${(100 * ps.reduce((a, b) => a + b, 0) / ps.length).toFixed(1)} % (${ps.length} doc)`)

console.log('\ncorrelacion confianza-error (la medicion que decide el umbral):')
const c1 = correlacionConfianzaError(muestras)
console.log(`  con la confianza POR CAMPO que declara el flujo: r=${c1.r === null ? 'null' : c1.r.toFixed(3)} · aciertos ${c1.aciertos} · fallos ${c1.fallos} · ${c1.lectura}`)
const c2 = correlacionConfianzaError(muestrasConPagina)
console.log(`  con la confianza de PAGINA de Tesseract como proxy: r=${c2.r === null ? 'null' : c2.r.toFixed(3)} · aciertos ${c2.aciertos} · fallos ${c2.fallos} · media aciertos ${c2.confianzaMediaAciertos?.toFixed(3)} · fallos ${c2.confianzaMediaFallos?.toFixed(3)} · ${c2.lectura}`)
const conclusion = (c) => (c.r === null || Math.abs(c.r) < 0.3 ? 'SIN SENAL: no se fija umbral' : `hay senal (|r|>=0.3): la curva de umbral es la tabla que decide, y la decide una persona`)
console.log(`  conclusion campo: ${conclusion(c1)}`)
console.log(`  conclusion pagina: ${conclusion(c2)}`)
if (c2.r !== null && Math.abs(c2.r) >= 0.3) {
  console.log('  curva de umbral (pagina):')
  for (const p of curvaDeUmbral(muestrasConPagina, [0.5, 0.7, 0.8, 0.9, 0.95])) console.log(`    ${JSON.stringify(p)}`)
}

// --- Salida ---------------------------------------------------------------------------------------
const SALIDA = join(CORPUS, `salida-servicio-${VIA === null ? 'proceso' : 'http'}-v${EN_VUELO}`)
mkdirSync(SALIDA, { recursive: true })
for (const d of documentos) writeFileSync(join(SALIDA, `${d.documentoId}.json`), JSON.stringify(d.lectura, null, 1))
const resumen = {
  fecha: new Date().toISOString(), hardware, enVuelo: EN_VUELO, concluyente, minimoConcluyente: MINIMO_CONCLUYENTE,
  lote: { ...lote, msReloj }, viaMotor: { paginas: paginasMotor, msMotor, pagMinSumando: paginasMotor / (msMotor / 60000), pagMinReloj: paginasMotor / (msReloj / 60000), base: BASE_PAG_MIN },
  evidencia, cers, camposCorrectos: precision, correlacionPorCampo: c1, correlacionPorPagina: c2,
  conclusion: { porCampo: conclusion(c1), porPagina: conclusion(c2) },
}
writeFileSync(join(SALIDA, 'resumen.json'), JSON.stringify(resumen, null, 1))
console.log(`\nescrito en ${SALIDA.replace(RAIZ, '.')} (fuera de git)${concluyente ? '' : ' · NO CONCLUYENTE: hacen falta 100 paginas y hay ' + lote.paginas}`)
