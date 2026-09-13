/**
 * Configuracion del servicio, desde el entorno y un JSON de PROYECTO. Nada viene puesto en el
 * nucleo: clases, patrones, esquemas e identificadores esperados son del cliente.
 *
 * Reglas que este archivo honra:
 *   - El motor va PINEADO (C1): el identificador de Tesseract sale de la version del binario
 *     instalado; el del respaldo lo declara el entorno y un alias se rechaza al construir.
 *   - Mistral esta APAGADO por defecto (C4). Solo entra si existe la decision de flujo de datos
 *     escrita en `EXTRACTOR_DECISION_C4` (un archivo con una linea `firma:`). Sin ella se declara
 *     «no disponible: requiere decision C4», y no hay bandera que lo salte.
 *   - Ningun valor de secreto se imprime: `describe()` enmascara.
 */
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = resolve(AQUI, '..')
const DIST = join(RAIZ, 'dist')

const nucleo = await import(join(DIST, 'index.js'))
const { motorPorProceso } = await import(join(DIST, 'motores', 'proceso-local.js'))
const { motorCompatible } = await import(join(DIST, 'motores', 'openai-compat.js'))
const { motorMistral } = await import(join(DIST, 'motores', 'mistral.js'))
const xml = await import(join(DIST, 'xml', 'index.js'))

const env = (nombre, porDefecto) => (process.env[nombre] === undefined || process.env[nombre] === '' ? porDefecto : process.env[nombre])

/** Un `fetch` sin el tope de 5 minutos de undici: el respaldo en CPU lo pasa (ver `traduceElCorte`). */
async function fetchSinTope() {
  const { Agent, fetch: fetchUndici } = await import('undici')
  const agente = new Agent({ headersTimeout: 0, bodyTimeout: 0 })
  return (url, init) => fetchUndici(url, { ...init, dispatcher: agente })
}

function versionDeTesseract(comando, entorno) {
  try {
    const salida = execFileSync(comando, ['--version'], { encoding: 'utf8', env: { ...process.env, ...entorno }, stdio: ['ignore', 'pipe', 'pipe'] })
    const m = /tesseract\s+v?(\d+\.\d+\.\d+)/i.exec(salida)
    return m === null ? null : m[1]
  } catch {
    return null
  }
}

const VALIDADORES = { rfc: nucleo.diagnosticaRfc, curp: nucleo.diagnosticaCurp, nss: nucleo.diagnosticaNss }

/**
 * Un validador se declara por nombre (`"rfc"`) o con opciones (`{ "tipo": "rfc", "admiteGenericos": true }`).
 * `XAXX010101000` (publico en general) tiene el digito mal A PROPOSITO: una factura al publico lo
 * lleva siempre, y un proyecto que lee facturas tiene que admitirlo. Es decision del proyecto.
 */
function validadorDe(clave, declaracion) {
  const tipo = typeof declaracion === 'string' ? declaracion : declaracion?.tipo
  const base = VALIDADORES[tipo]
  if (base === undefined) throw new Error(`validador desconocido "${String(tipo)}" para "${clave}"`)
  if (tipo === 'rfc' && typeof declaracion === 'object' && declaracion.admiteGenericos === true) return (valor) => base(valor, { admiteGenericos: true })
  return base
}

function leeProyecto(ruta) {
  const crudo = JSON.parse(readFileSync(ruta, 'utf8'))
  const regex = (p) => new RegExp(p.expresion ?? p.titulo, p.flags ?? 'i')
  const validadores = {}
  for (const [clave, declaracion] of Object.entries(crudo.validadores ?? {})) validadores[clave] = validadorDe(clave, declaracion)
  return {
    idioma: crudo.idioma ?? 'spa',
    clases: nucleo.declaraClases((crudo.clases ?? []).map((c) => ({ clase: c.clase, titulo: regex(c) }))),
    omiteClases: new Set(crudo.omiteClases ?? []),
    patrones: (crudo.patrones ?? []).map((p) => ({ clave: p.clave, expresion: new RegExp(p.expresion, p.flags ?? ''), ...(p.formato ? { formato: p.formato } : {}) })),
    esquemas: nucleo.declaraEsquemas(crudo.esquemas ?? []),
    identificadoresEsperados: crudo.identificadoresEsperados ?? {},
    identificadores: new Set(crudo.identificadores ?? []),
    validadores,
  }
}

function decisionC4() {
  const ruta = env('EXTRACTOR_DECISION_C4', null)
  if (ruta === null) return { hay: false, motivo: 'no disponible: requiere decision C4 (EXTRACTOR_DECISION_C4 sin definir)' }
  if (!existsSync(ruta)) return { hay: false, motivo: 'no disponible: requiere decision C4 (el archivo declarado no existe)' }
  const texto = readFileSync(ruta, 'utf8')
  if (!/^\s*firma\s*:\s*\S/m.test(texto)) return { hay: false, motivo: 'no disponible: requiere decision C4 (la decision no lleva firma)' }
  return { hay: true, motivo: `decision C4 leida de ${ruta}` }
}

function motorPrincipal(proyecto) {
  const comando = env('TESSERACT_CMD', 'tesseract')
  const entorno = {}
  for (const nombre of ['LD_LIBRARY_PATH', 'TESSDATA_PREFIX', 'TESSERACT_CMD']) if (process.env[nombre]) entorno[nombre] = process.env[nombre]
  entorno.EXTRACTOR_IDIOMA = proyecto.idioma
  const version = versionDeTesseract(comando, entorno)
  if (version === null) throw new Error('no se pudo leer la version de Tesseract: el motor principal no arranca sin binario')
  const modelo = `tesseract-${version}-${proyecto.idioma}-zonal-1`
  const motor = motorPorProceso({
    comando: env('EXTRACTOR_PYTHON', 'python3'), argumentos: [join(RAIZ, 'motores-locales', 'tesseract.py')],
    modelo, entorno, milisegundosDeEspera: Number(env('EXTRACTOR_ESPERA_MS', '120000')),
    limites: { bytesMaximos: Number(env('EXTRACTOR_BYTES_MAXIMOS', String(20 * 1024 * 1024))) },
  })
  return { motor, modelo }
}

async function motorDeRespaldo() {
  const tipo = env('EXTRACTOR_RESPALDO', 'ninguno')
  if (tipo === 'ninguno') return { motor: undefined, estado: 'sin respaldo configurado (EXTRACTOR_RESPALDO=ninguno)' }
  if (tipo === 'compatible') {
    const base = env('EXTRACTOR_RESPALDO_BASE', null)
    const modelo = env('EXTRACTOR_RESPALDO_MODELO', null)
    if (base === null || modelo === null) return { motor: undefined, estado: 'no disponible: EXTRACTOR_RESPALDO_BASE y EXTRACTOR_RESPALDO_MODELO son obligatorios' }
    const motor = motorCompatible({
      base, modelo, modo: env('EXTRACTOR_RESPALDO_MODO', 'transcripcion'), fetch: await fetchSinTope(),
      milisegundosDeEspera: Number(env('EXTRACTOR_RESPALDO_ESPERA_MS', '3600000')), clave: env('EXTRACTOR_RESPALDO_CLAVE', undefined),
    })
    return { motor, estado: `compatible: ${modelo} en ${base}` }
  }
  if (tipo === 'mistral') {
    const decision = decisionC4()
    if (!decision.hay) return { motor: undefined, estado: `mistral ${decision.motivo}` }
    const clave = env('MISTRAL_API_KEY', null)
    const modelo = env('EXTRACTOR_MISTRAL_MODELO', null)
    if (clave === null || modelo === null) return { motor: undefined, estado: 'mistral no disponible: faltan MISTRAL_API_KEY o EXTRACTOR_MISTRAL_MODELO' }
    return { motor: motorMistral({ modelo, clave, fetch: await fetchSinTope() }), estado: `mistral: ${modelo} (${decision.motivo}); el documento SALE del perimetro` }
  }
  return { motor: undefined, estado: `no disponible: EXTRACTOR_RESPALDO="${tipo}" no es ninguno|compatible|mistral` }
}

async function lectorDeCodigos() {
  try {
    const { lectorZxing } = await import(join(DIST, 'lectores', 'zxing.js'))
    const lector = lectorZxing()
    await lector.lee(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])).catch(() => [])
    return { lector, estado: lector.cargado() ? 'zxing-wasm cargado del paquete' : 'zxing-wasm no cargo: sin lectura de codigos' }
  } catch (error) {
    return { lector: undefined, estado: `sin lector de codigos (${error instanceof Error ? error.constructor.name : 'error'})` }
  }
}

export async function configura() {
  const proyecto = leeProyecto(env('EXTRACTOR_PROYECTO', join(AQUI, 'proyecto-ejemplo.json')))
  const principal = motorPrincipal(proyecto)
  const respaldo = await motorDeRespaldo()
  const codigos = await lectorDeCodigos()
  const registro = xml.registroDeEsquemas([
    xml.lectorDeTimbre11, xml.lectorDePagos20, xml.lectorDeComercioExterior20, xml.lectorDeCartaPorte31,
    xml.lectorDeImpuestosLocales10, xml.lectorDeLeyendasFiscales10, xml.lectorDeDonatarias11,
  ])
  return {
    proyecto,
    opcionesDeCorpus: {
      motor: principal.motor, motorDeRespaldo: respaldo.motor,
      derivaAlRespaldo: respaldo.motor === undefined ? undefined : nucleo.reglaFaltaIdentificador(proyecto.identificadoresEsperados),
      lectorDeCodigos: codigos.lector, registro, patrones: proyecto.patrones, clases: proyecto.clases,
      omiteClases: proyecto.omiteClases, validadores: proyecto.validadores, identificadores: proyecto.identificadores,
    },
    enVuelo: Number(env('EXTRACTOR_EN_VUELO', '2')),
    bytesMaximos: Number(env('EXTRACTOR_BYTES_MAXIMOS', String(20 * 1024 * 1024))),
    describe() {
      // Solo forma. Ninguna clave, ninguna URL con credenciales.
      return {
        motorPrincipal: principal.modelo,
        respaldo: respaldo.estado.replace(/\/\/[^@/]+@/g, '//***@'),
        codigos: codigos.estado,
        mistral: env('EXTRACTOR_RESPALDO', 'ninguno') === 'mistral' ? respaldo.estado : `apagado (${decisionC4().motivo})`,
        clases: proyecto.clases.length, esquemas: proyecto.esquemas.length, patrones: proyecto.patrones.length,
        claveMistral: process.env.MISTRAL_API_KEY ? `presente (largo ${process.env.MISTRAL_API_KEY.length})` : 'ausente',
      }
    },
  }
}
