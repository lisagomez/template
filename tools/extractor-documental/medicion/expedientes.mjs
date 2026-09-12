/**
 * Corrida de MEDICION sobre expedientes reales, con el flujo de la spec 009: codigos antes que OCR,
 * Tesseract local por zonas, respaldo opcional con un motor de vision, validadores y clases.
 *
 * IMPRIME FORMA, NUNCA VALORES. Los expedientes llevan datos de personas: aqui salen conteos por
 * documento (paginas, codigos por tipo, clases, acuerdos y discrepancias, identificadores validos,
 * invalidos y corregidos por clave, paginas al respaldo, segundos) y nada mas. Los valores quedan en
 * el JSON que se escribe en la carpeta de salida de ESTA maquina.
 *
 *   node medicion/expedientes.mjs --carpeta <ruta con pNNN.jpg por subcarpeta> --salida <ruta>
 *        [--respaldo glm-ocr:q8_0] [--deriva-sin-identificador | --deriva-bajo 0.6]
 *        [--omite carta_recomendacion,...] [--sin-codigos] [--sin-zonas]
 *
 * Cada subcarpeta es un expediente; sus paginas se leen como imagenes sueltas en orden.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { leeCorpus, declaraClases, diagnosticaRfc, diagnosticaCurp, diagnosticaNss } = await import(`${RAIZ}/dist/index.js`)
const { motorPorProceso } = await import(`${RAIZ}/dist/motores/proceso-local.js`)
const { motorCompatible } = await import(`${RAIZ}/dist/motores/openai-compat.js`)
const { lectorZxing } = await import(`${RAIZ}/dist/lectores/zxing.js`)

/**
 * `fetch` con dispatcher propio: Node corta a los 5 minutos por `headersTimeout` de undici, y
 * eso NO lo gobierna `milisegundosDeEspera` (ver `traduceElCorte` en el adaptador). Con varias
 * paginas en vuelo, las peticiones al motor de vision se encolan y pasan de 5 minutos con
 * facilidad: la primera corrida perdio 8 de 10 derivaciones asi. Medido, no supuesto.
 */
async function fetchSinTope() {
  const { Agent, fetch: fetchUndici } = await import('undici')
  const agente = new Agent({ headersTimeout: 0, bodyTimeout: 0 })
  return (entrada, init) => fetchUndici(entrada, { ...init, dispatcher: agente })
}

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(`--${nombre}`)
  return i === -1 ? porDefecto : process.argv[i + 1]
}
const bandera = (nombre) => process.argv.includes(`--${nombre}`)

const CARPETA = arg('carpeta', null)
const SALIDA = arg('salida', join(process.env.HOME ?? '.', 'extractor-salidas', `expedientes-${new Date().toISOString().slice(0, 10)}`))
if (CARPETA === null) { console.error('falta --carpeta'); process.exit(1) }
const RESPALDO = arg('respaldo', null)
const DERIVA_BAJO = arg('deriva-bajo', null)
const OMITE = new Set((arg('omite', '') || '').split(',').filter(Boolean))

const T = join(process.env.HOME ?? '', '.local', 'tesseract')
const ENTORNO = {
  LD_LIBRARY_PATH: join(T, 'usr/lib/x86_64-linux-gnu'),
  TESSDATA_PREFIX: join(T, 'usr/share/tesseract-ocr/5/tessdata'),
  TESSERACT_CMD: join(T, 'usr/bin/tesseract'),
}

// Las clases del expediente laboral mexicano, medidas sobre 84 paginas. Son del PROYECTO, no del nucleo.
const CLASES = declaraClases([
  { clase: 'contrato', titulo: /contrato\s+individual\s+de\s+trabajo/i },
  { clase: 'alta_imss', titulo: /aviso\s+de\s+inscripci[oó]n|alta\s+(?:en\s+el\s+)?imss|afiliaci[oó]n/i },
  { clase: 'ine', titulo: /instituto\s+nacional\s+electoral|credencial\s+para\s+votar/i },
  { clase: 'curp', titulo: /clave\s+[uú]nica\s+de\s+registro\s+de\s+poblaci[oó]n/i },
  { clase: 'acta_nacimiento', titulo: /acta\s+de\s+nacimiento/i },
  { clase: 'comprobante_domicilio', titulo: /comprobante\s+de\s+domicilio|recibo\s+de\s+(?:luz|agua|tel[eé]fono|cfe)/i },
  { clase: 'constancia_fiscal', titulo: /constancia\s+de\s+situaci[oó]n\s+fiscal/i },
  { clase: 'solicitud_empleo', titulo: /solicitud\s+de\s+empleo/i },
  { clase: 'aviso_privacidad', titulo: /aviso\s+de\s+privacidad/i },
  { clase: 'carta_recomendacion', titulo: /carta\s+de\s+recomendaci[oó]n/i },
  { clase: 'comprobante_estudios', titulo: /certificado\s+de\s+estudios|t[ií]tulo\s+profesional|c[eé]dula\s+profesional|constancia\s+de\s+estudios/i },
  { clase: 'examen_medico', titulo: /examen\s+m[eé]dico|certificado\s+m[eé]dico/i },
  { clase: 'renuncia_finiquito', titulo: /renuncia|finiquito|liquidaci[oó]n/i },
])

// Patrones sobre la transcripcion, para lo que las zonas no cubren (y para el respaldo, que solo transcribe).
const PATRONES = [
  { clave: 'rfc', expresion: /\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/g, formato: 'identificador' },
  { clave: 'curp', expresion: /\b([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d)\b/g, formato: 'identificador' },
  { clave: 'nss', expresion: /\b(?:NSS|Seguro\s+Social|Seguridad\s+Social|IMSS|afiliaci[oó]n)[^\d]{0,40}(\d{2}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{4}[\s-]?\d)\b/gi, formato: 'identificador' },
]
const CLAVES_ESPERADAS = { curp: ['curp'], constancia_fiscal: ['rfc'], alta_imss: ['nss'], ine: ['curp'] }

const motor = motorPorProceso({
  comando: 'python3', argumentos: [join(RAIZ, 'motores-locales', 'tesseract.py')],
  modelo: 'tesseract-5.5.0-spa-zonal-1', entorno: ENTORNO, milisegundosDeEspera: 120_000,
})
const EN_VUELO = Number(arg('en-vuelo', '4'))
const motorDeRespaldo = RESPALDO === null ? undefined : motorCompatible({ base: 'http://127.0.0.1:11434/v1', modelo: RESPALDO, modo: 'transcripcion', milisegundosDeEspera: 3_600_000, fetch: await fetchSinTope() })

/** Las dos reglas de derivacion que se comparan. Ninguna viene puesta: las pasa el operador. */
const derivaAlRespaldo = DERIVA_BAJO !== null
  ? (pagina) => (pagina.confianza ?? 0) < Number(DERIVA_BAJO)
  : bandera('deriva-sin-identificador')
    ? (pagina, campos) => {
        const clase = CLASES.find((c) => c.titulo.test(pagina.markdown))?.clase
        const esperadas = clase === undefined ? [] : (CLAVES_ESPERADAS[clase] ?? [])
        return esperadas.length > 0 && !esperadas.some((k) => campos.some((c) => c.clave === k))
      }
    : undefined

const validadores = { rfc: diagnosticaRfc, curp: diagnosticaCurp, nss: diagnosticaNss }

const archivos = []
for (const carpeta of readdirSync(CARPETA).sort()) {
  const paginas = readdirSync(join(CARPETA, carpeta)).filter((f) => /^p\d+\.(jpg|png)$/.test(f)).sort()
  for (const p of paginas) archivos.push({ documentoId: `${carpeta}/${p}`, nombre: p, tipoDocumento: carpeta, bytes: new Uint8Array(readFileSync(join(CARPETA, carpeta, p))) })
}
console.log(`${archivos.length} pagina(s) de ${new Set(archivos.map((a) => a.tipoDocumento)).size} expediente(s) · motor tesseract zonal · codigos ${bandera('sin-codigos') ? 'NO' : 'si'} · respaldo ${RESPALDO ?? 'ninguno'} · regla ${DERIVA_BAJO !== null ? `confianza<${DERIVA_BAJO}` : bandera('deriva-sin-identificador') ? 'clase sin identificador' : 'ninguna'} · omite ${[...OMITE].join(',') || 'nada'}`)

const t0 = Date.now()
const resultado = await leeCorpus(archivos, {
  motor, motorDeRespaldo, derivaAlRespaldo, patrones: PATRONES, clases: CLASES, omiteClases: OMITE, validadores,
  lectorDeCodigos: bandera('sin-codigos') ? undefined : lectorZxing(),
  enVuelo: EN_VUELO,
})
const segundos = (Date.now() - t0) / 1000

mkdirSync(SALIDA, { recursive: true })
writeFileSync(join(SALIDA, 'lecturas.json'), JSON.stringify(resultado, null, 1))

// --- Solo forma -------------------------------------------------------------------------------
const porExpediente = new Map()
for (const l of resultado.lecturas) {
  const e = porExpediente.get(l.tipoDocumento) ?? { paginas: 0, codigos: {}, clases: {}, acuerdos: 0, discrepancias: 0, validos: {}, invalidos: {}, corregidos: {}, respaldo: 0, omitidas: 0, reutilizadas: 0, ms: 0, msRespaldo: 0 }
  e.paginas++
  for (const c of l.codigos) e.codigos[c.tipo] = (e.codigos[c.tipo] ?? 0) + 1
  for (const c of l.clasesDePagina) e.clases[c.clase] = (e.clases[c.clase] ?? 0) + 1
  e.acuerdos += l.cotejoDeCodigos?.acuerdos.length ?? 0
  e.discrepancias += l.cotejoDeCodigos?.discrepancias.length ?? 0
  for (const c of l.campos) if (validadores[c.clave]) e.validos[c.clave] = (e.validos[c.clave] ?? new Set()).add(`${c.valor}`)
  for (const i of l.identificadoresInvalidos) e.invalidos[i.clave] = (e.invalidos[i.clave] ?? 0) + 1
  for (const c of l.corregidos) e.corregidos[c.clave] = (e.corregidos[c.clave] ?? 0) + 1
  e.respaldo += l.paginasAlRespaldo.length
  e.omitidas += l.paginasOmitidas.length
  e.reutilizadas += l.paginasReutilizadas.length
  e.ms += l.milisegundos
  e.msRespaldo += l.milisegundosDeRespaldo
  porExpediente.set(l.tipoDocumento, e)
}
const fmt = (o) => Object.entries(o).map(([k, v]) => `${k}=${v instanceof Set ? v.size : v}`).join(' ') || '-'
console.log('\nexpediente · paginas · codigos por tipo · acuerdos/discrepancias QR↔OCR · identificadores validos DISTINTOS · invalidos · corregidos · al respaldo · omitidas · s')
for (const [id, e] of porExpediente) {
  console.log(`  ${id} · ${e.paginas} · ${fmt(e.codigos)} · ${e.acuerdos}/${e.discrepancias} · ${fmt(e.validos)} · ${fmt(e.invalidos)} · ${fmt(e.corregidos)} · ${e.respaldo} · ${e.omitidas} · ${(e.ms / 1000).toFixed(0)}${e.msRespaldo > 0 ? ` (respaldo ${(e.msRespaldo / 1000).toFixed(0)})` : ''}`)
}
const clasesTotal = {}
for (const e of porExpediente.values()) for (const [k, v] of Object.entries(e.clases)) clasesTotal[k] = (clasesTotal[k] ?? 0) + v
console.log(`\nclases de pagina: ${fmt(clasesTotal)}`)
console.log(`totales: ${resultado.lecturas.length} paginas en ${segundos.toFixed(0)} s (${(resultado.lecturas.length / (segundos / 60)).toFixed(1)} pag/min) · al respaldo ${resultado.paginasAlRespaldo} (${(resultado.milisegundosDeRespaldo / 1000).toFixed(0)} s) · omitidas ${resultado.paginasOmitidas} · reutilizadas ${resultado.paginasReutilizadas}`)
const avisos = resultado.lecturas.filter((l) => /avisos:/.test(l.motivo)).length
if (avisos > 0) console.log(`paginas con avisos (lector o respaldo): ${avisos}`)
console.log(`salida (con valores, solo en esta maquina): ${SALIDA}`)
