/**
 * Corrida de medicion sobre un corpus: cada documento por su via, el motor autohospedado para los
 * escaneos, cotejo de segunda lectura, metricas contra la verdad conocida, e inferencia del modelo.
 *
 * NO IMPRIME VALORES DE NINGUN DOCUMENTO. Imprime forma: rutas, conteos, claves, tiempos y
 * metricas. Los documentos sinteticos tienen su verdad en un `.json` al lado; los reales (los que
 * se pasan por `--extra`) no tienen verdad y solo aportan tiempo y conteos.
 *
 * El corpus vive en `corpus/`, que git ignora. Nada de lo que hay ahi entra al repositorio.
 *
 *   node medicion/corpus.mjs --modelo qwen2.5vl:7b [--en-vuelo 1] [--solo motor] [--extra /ruta/real.pdf]
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, basename, extname } from 'node:path'

const RAIZ = new URL('..', import.meta.url).pathname
const CORPUS = join(RAIZ, 'corpus')
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(`--${nombre}`)
  return i === -1 ? porDefecto : process.argv[i + 1]
}
const MODELO = arg('modelo', 'qwen2.5vl:7b')
const BASE = arg('base', 'http://127.0.0.1:11434/v1')
const EN_VUELO = Number(arg('en-vuelo', '1'))
const SOLO = arg('solo', 'todo')
const FILTRO = arg('filtro', null) // regex sobre el nombre, para repetir una parte del corpus
const MODO = arg('modo', 'campos') // 'transcripcion' para motores de OCR puros (GLM-OCR)
const EXTRA = process.argv.flatMap((a, i) => (a === '--extra' ? [process.argv[i + 1]] : []))
const SALIDA = join(CORPUS, `salida-${MODELO.replace(/[^a-z0-9.]+/gi, '-')}-${MODO}-v${EN_VUELO}${FILTRO === null ? '' : '-parcial'}`)

const { leeCorpus } = await import(join(RAIZ, 'dist/lote-corpus.js'))
const { infiereModelo } = await import(join(RAIZ, 'dist/corpus.js'))
const { revisaSql } = await import(join(RAIZ, 'dist/modelo.js'))
const { cer, precisionDeCampos, correlacionConfianzaError } = await import(join(RAIZ, 'dist/calibracion.js'))
const { registroDeEsquemas, lectorDeTimbre11, lectorDePagos20 } = await import(join(RAIZ, 'dist/xml/index.js'))
const { motorCompatible } = await import(join(RAIZ, 'dist/motores/openai-compat.js'))

// Node corta a los 5 min por headersTimeout aunque se pidan 30 (ver traduceElCorte). Un motor sin
// GPU tarda mas: se inyecta un fetch con dispatcher propio, que es para lo que existe la opcion.
const { Agent, fetch: fetchUndici } = await import('/home/gsore/code/a2aboths/node_modules/undici/index.js')
const agente = new Agent({ headersTimeout: 0, bodyTimeout: 0 })
const pedir = (url, init) => fetchUndici(url, { ...init, dispatcher: agente })

const IDENTIFICADORES = new Set(['rfc_emisor', 'rfc_receptor', 'uuid', 'folio'])
const ESQUEMAS = {
  factura: ['folio', 'fecha', 'nombre_emisor', 'rfc_emisor', 'regimen_fiscal', 'rfc_receptor', 'subtotal', 'iva', 'total', 'uuid'],
  minuta: ['fecha', 'asistentes', 'responsable', 'rfc_emisor'],
}
const PATRONES = [
  { clave: 'folio', expresion: /Folio:\s*(F-\d+)/, formato: 'identificador' },
  { clave: 'fecha', expresion: /Fecha:\s*(\d{4}-\d{2}-\d{2})/ },
  { clave: 'nombre_emisor', expresion: /Emisor:\s*(.+)/ },
  { clave: 'rfc_emisor', expresion: /RFC emisor:\s*([A-Z0-9]{12,13})/, formato: 'identificador' },
  { clave: 'regimen_fiscal', expresion: /Regimen fiscal:\s*(\d{3})/ },
  { clave: 'rfc_receptor', expresion: /RFC receptor:\s*([A-Z0-9]{12,13})/, formato: 'identificador' },
  { clave: 'subtotal', expresion: /Subtotal:\s*([\d.]+)/ },
  { clave: 'iva', expresion: /IVA 16%:\s*([\d.]+)/ },
  { clave: 'total', expresion: /Total:\s*([\d.]+)/ },
  { clave: 'uuid', expresion: /Folio fiscal:\s*([0-9a-f-]{36})/, formato: 'identificador' },
  // Minutas: el RFC va entre parentesis y hay dos campos propios. La primera corrida no los tenia
  // y dio 0 % de campos correctos en las minutas: era el script, no el motor.
  { clave: 'rfc_emisor', expresion: /\(RFC\s+([A-Z0-9]{12,13})\)/, formato: 'identificador' },
  { clave: 'asistentes', expresion: /Asistentes:\s*(\d+)/ },
  { clave: 'responsable', expresion: /Responsable:\s*(.+)/ },
]

// --- El corpus -------------------------------------------------------------------------------
const verdad = new Map()
const archivos = []
for (const nombre of readdirSync(CORPUS).sort()) {
  const ext = extname(nombre)
  if (!['.png', '.jpg', '.pdf', '.xml'].includes(ext)) continue
  // El id lleva la extension: `x.pdf` y `x.png` son dos documentos distintos (la barrera de
  // `infiereModelo` lo cazo en la primera corrida: documentoId repetido).
  const id = nombre
  const rutaVerdad = join(CORPUS, `${basename(nombre, ext)}.json`)
  const v = existsSync(rutaVerdad) ? JSON.parse(readFileSync(rutaVerdad, 'utf8')) : null
  if (v) verdad.set(id, v)
  archivos.push({ documentoId: id, nombre, tipoDocumento: v?.tipoDocumento ?? 'documento', bytes: new Uint8Array(readFileSync(join(CORPUS, nombre))) })
}
const FIXTURES = join(RAIZ, 'pruebas', 'fixtures')
for (const nombre of readdirSync(FIXTURES).filter((n) => /^cfdi-40-.*\.xml$/.test(n)).sort()) {
  archivos.push({ documentoId: basename(nombre, '.xml'), nombre, tipoDocumento: 'cfdi', bytes: new Uint8Array(readFileSync(join(FIXTURES, nombre))) })
}
for (const ruta of EXTRA) {
  archivos.push({ documentoId: `real-${archivos.length}`, nombre: `(real) ${basename(ruta).replace(/[^.]/g, '*')}`, tipoDocumento: 'minuta', bytes: new Uint8Array(readFileSync(ruta)) })
}
const esDeMotor = (a) => /\.(png|jpg)$/.test(a.nombre) || /escaneada-1\.pdf$/.test(a.nombre) || a.documentoId.startsWith('real-')
const seleccion = (SOLO === 'motor' ? archivos.filter(esDeMotor) : archivos).filter((a) => FILTRO === null || new RegExp(FILTRO).test(a.nombre))

// --- La corrida ------------------------------------------------------------------------------
const motor = motorCompatible({ base: BASE, modelo: MODELO, milisegundosDeEspera: 3_600_000, fetch: pedir, modo: MODO })
const registro = registroDeEsquemas([lectorDeTimbre11, lectorDePagos20])
console.log(`corpus: ${seleccion.length} documento(s) · motor ${MODELO} (modo ${MODO}) en ${BASE} · ${EN_VUELO} en vuelo\n`)

const lecturas = []
let msMotor = 0
const t0 = Date.now()
for (const [tipo, claves] of [...Object.entries(ESQUEMAS), ['cfdi', null], ['documento', null]]) {
  const grupo = seleccion.filter((a) => a.tipoDocumento === tipo)
  if (grupo.length === 0) continue
  const esquema = claves === null ? undefined : { campos: claves }
  const r = await leeCorpus(grupo, { motor, registro, patrones: PATRONES, esquemaDeAnotacion: esquema, identificadores: IDENTIFICADORES, enVuelo: EN_VUELO })
  for (const l of r.lecturas) { lecturas.push(l); if (l.ruta === 'motor') msMotor += l.milisegundos }
}
const msTotal = Date.now() - t0

// --- Tabla por documento (forma, no contenido) ----------------------------------------------
const fila = (...c) => console.log(c.map((v, i) => String(v).padEnd([34, 9, 10, 7, 14, 9][i])).join(''))
fila('documento', 'tipo', 'ruta', 'campos', 'cotejo ok/no', 'segundos')
for (const l of lecturas) {
  const cotejo = l.cotejo ? `${l.cotejo.coinciden.length}/${l.cotejo.noCoinciden.length}` : '-'
  fila(l.documentoId.slice(0, 32), l.tipoDocumento, l.ruta, l.campos.length, cotejo, (l.milisegundos / 1000).toFixed(1))
}
const porRuta = {}
for (const l of lecturas) porRuta[l.ruta] = (porRuta[l.ruta] ?? 0) + 1
console.log(`\npor ruta: ${JSON.stringify(porRuta)} · total ${(msTotal / 1000).toFixed(0)} s`)
for (const l of lecturas.filter((x) => x.ruta === 'ninguna')) console.log(`  ninguna: ${l.documentoId} — ${l.motivo}`)
const paginasMotor = lecturas.filter((l) => l.ruta === 'motor').reduce((n, l) => n + Math.max(1, l.paginas.length), 0)
if (paginasMotor > 0) {
  const tiempoDeMuro = lecturas.filter((l) => l.ruta === 'motor').length > 0 ? msTotal : 0
  console.log(`motor: ${paginasMotor} pagina(s) · ${(paginasMotor / (msMotor / 60000)).toFixed(2)} pag/min sumando tiempos · ${(paginasMotor / (tiempoDeMuro / 60000)).toFixed(2)} pag/min de reloj (con ${EN_VUELO} en vuelo)`)
}

// --- Salida JSON por documento, ANTES de nada que pueda fallar --------------------------------
mkdirSync(SALIDA, { recursive: true })
for (const l of lecturas) writeFileSync(join(SALIDA, `${l.documentoId}.json`), JSON.stringify(l, null, 2))

// --- Metricas contra la verdad (solo documentos sinteticos, solo via motor) -----------------
console.log('\nCER por documento sintetico (via motor):')
// El CER crudo cuenta cada espacio: la verdad lleva columnas rellenas con espacios y lineas en
// blanco, que ningun OCR reproduce. Se dan los dos: crudo, y con el espacio en blanco plegado
// (que es el que mide CONTENIDO). El de campos correctos no depende de eso.
const pliega = (t) => t.split('\n').map((l) => l.trim().replace(/\s+/g, ' ')).filter((l) => l.length > 0).join('\n')
const muestras = []
const cers = []
const cersCrudos = []
for (const l of lecturas.filter((x) => x.ruta === 'motor' && verdad.has(x.documentoId))) {
  const v = verdad.get(l.documentoId)
  const markdown = l.paginas.map((p) => p.markdown).join('\n')
  const crudo = cer(v.texto, markdown)
  const c = cer(pliega(v.texto), pliega(markdown))
  if (c !== null) { cers.push(c); cersCrudos.push(crudo) }
  console.log(`  ${l.documentoId.padEnd(28)} CER ${(c * 100).toFixed(1).padStart(6)} % (crudo ${(crudo * 100).toFixed(1)} %) · transcripcion ${markdown.length} chars, verdad ${v.texto.length}`)
  // En modo campos, los campos crudos del motor estan en las paginas; en modo transcripcion, en
  // `campos` (por patron). Se mide lo que el motor dio, no lo que paso el cotejo.
  const directos = l.paginas.flatMap((p) => p.campos)
  const todos = directos.length > 0 ? directos : l.campos
  for (const [clave, referencia] of Object.entries(v.campos)) {
    const campo = todos.find((x) => x.clave === clave)
    muestras.push({ clave, obtenido: campo?.valor ?? '', referencia, confianza: campo?.confianza ?? 0 })
  }
}
if (muestras.length > 0) {
  const media = cers.reduce((a, b) => a + b, 0) / cers.length
  const mediaCruda = cersCrudos.reduce((a, b) => a + b, 0) / cersCrudos.length
  console.log(`\ncontra la verdad (${cers.length} documento(s) sinteticos, ${muestras.length} campos):`)
  console.log(`  CER medio de la transcripcion: ${(media * 100).toFixed(1)} % con el espacio plegado (min ${(Math.min(...cers) * 100).toFixed(1)} · max ${(Math.max(...cers) * 100).toFixed(1)}) · ${(mediaCruda * 100).toFixed(1)} % crudo`)
  console.log(`  campos correctos: ${(precisionDeCampos(muestras) * 100).toFixed(1)} %`)
  // La correlacion se mide SOLO sobre campos que el motor devolvio: un campo ausente no lleva
  // confianza declarada, y meterlo con 0 fabrica una correlacion perfecta que no existe (paso en
  // la corrida de qwen2.5vl:3b: r = 1.00 con un unico "fallo" que era un campo que faltaba).
  const devueltos = muestras.filter((m) => m.obtenido !== '')
  console.log(`  campos ausentes (el motor no los devolvio): ${muestras.length - devueltos.length} de ${muestras.length}`)
  const corr = correlacionConfianzaError(devueltos)
  console.log(`  correlacion confianza-error sobre ${devueltos.length} campos devueltos: r=${corr.r === null ? 'no calculable' : corr.r.toFixed(3)} · aciertos ${corr.aciertos} (conf. media ${corr.confianzaMediaAciertos?.toFixed(3)}) · fallos ${corr.fallos} (conf. media ${corr.confianzaMediaFallos?.toFixed(3)})`)
  console.log(`  lectura: ${corr.lectura}`)
  const confianzas = new Set(muestras.filter((m) => m.obtenido !== '').map((m) => m.confianza.toFixed(2)))
  console.log(`  valores distintos de confianza que declaro el motor: ${[...confianzas].join(', ') || 'ninguno'}`)
}

// --- Inferencia del modelo -------------------------------------------------------------------
const duplicados = lecturas.filter((l) => l.duplicadoDe !== undefined)
if (duplicados.length > 0) console.log(`\nduplicados por contenido (leidos, excluidos de la inferencia): ${duplicados.map((l) => `${l.documentoId} = ${l.duplicadoDe}`).join(', ')}`)
// `uuid` identifica al DOCUMENTO: el mismo CFDI como XML y como PDF, o el mismo escaneo como PNG y
// como PDF, se funden antes de inferir. Sin esto, la primera corrida saco `uuid` y `folio` como
// entidades con 12 de 15 valores vistos una sola vez.
const inferencia = infiereModelo(
  lecturas.filter((l) => l.duplicadoDe === undefined).map((l) => ({ documentoId: l.documentoId, tipoDocumento: l.tipoDocumento, campos: l.campos })),
  { version: '1', tablas: [] },
  { claveDeDocumento: 'uuid' },
)
if (inferencia.fusiones.length > 0) console.log(`  copias fundidas por uuid: ${inferencia.fusiones.map((f) => `${f.documentoId} ← ${f.copias.join(', ')}`).join(' · ')}`)
console.log(`\nmodelo inferido de ${inferencia.documentos.length} documento(s):`)
for (const e of inferencia.entidades) {
  console.log(`  entidad ${e.tabla} (clave ${e.clave}${e.equivalentes.length > 0 ? ` ≡ ${e.equivalentes.join(', ')}` : ''}) · en ${e.documentos} documento(s), ${e.distintos} distinto(s), ${e.unicos} visto(s) una sola vez · desde ${e.desde.join(', ')}`)
  for (const a of e.atributos) console.log(`    atributo ${a.columna} ${a.tipo} · comprobado en ${a.grupos} grupo(s)`)
}
for (const r of inferencia.propuesta.relaciones) console.log(`  relacion ${r.desde}.${r.columna} → ${r.hacia}.${r.hastaColumna} (${r.cardinalidad === '*' ? 'N:1' : '1:1'}${r.haciaPreexistente ? ', preexistente' : ''})`)
for (const t of inferencia.propuesta.entidades) console.log(`  tabla ${t.tabla}: ${t.columnas.map((c) => `${c.nombre} ${c.tipo}${c.nulable ? '' : ' NOT NULL'}`).join(', ')}`)
console.log(`  dudas (${inferencia.dudas.length}):`)
for (const d of inferencia.dudas) console.log(`    [${d.sobre}] ${d.motivo} · docs: ${d.documentos.slice(0, 6).join(', ')}${d.documentos.length > 6 ? '…' : ''}`)
console.log(`  avisos (${inferencia.propuesta.avisos.length}):`)
for (const a of inferencia.propuesta.avisos) console.log(`    ${a}`)
console.log('\n--- SQL propuesto ---')
console.log(inferencia.propuesta.sql)
try {
  revisaSql(inferencia.propuesta.sql, { version: '1', tablas: [] }, new Set(inferencia.propuesta.entidades.map((e) => e.tabla)))
  console.log('revisaSql: la propuesta no toca nada preexistente (sin excepcion)')
} catch (e) {
  console.log(`revisaSql LANZO: ${e.message}`)
}

// --- Propuesta y resumen, alineados con los tipos del extractor -----------------------------
writeFileSync(join(SALIDA, 'propuesta.json'), JSON.stringify(inferencia, null, 2))
writeFileSync(join(SALIDA, 'resumen.json'), JSON.stringify({ modelo: MODELO, modo: MODO, enVuelo: EN_VUELO, msTotal, msMotor, paginasMotor, porRuta, muestras: muestras.length, cers }, null, 2))
console.log(`\nJSON escrito en ${SALIDA} (${lecturas.length} documentos + propuesta.json + resumen.json)`)
