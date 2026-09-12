/**
 * Leer un corpus entero: cada documento por la via que le corresponde, y solo esa.
 *
 * La ruta se decide por lo que el documento ES —sus bytes—, no por su extension. Un PDF con capa
 * de texto se resuelve sin motor y sin coste. Un XML se lee exacto. Un escaneo va al motor como
 * IMAGEN, en el orden que dicte quien llama, con tantas peticiones en vuelo como el servidor
 * aguante. Y cada documento dice que via tomo, por que, y cuanto tardo.
 *
 * Lo que NO hace: no toca el sistema de archivos, no guarda nada, no decide umbrales. Recibe
 * bytes y un motor inyectado, y devuelve lecturas. Un documento que no se pudo leer se devuelve
 * con ruta `ninguna` y su motivo: nunca desaparece del resultado, que es la regla que sostiene
 * el recuento al final del lote.
 */
import type { CampoExtraido, PaginaExtraida } from './tipos.js'
import type { MotorOcr, LectorDeCodigos } from './puertos.js'
import type { ClaseDePagina, ClasificacionDePagina } from './clasifica-pagina.js'
import type { Cotejo } from './corroboracion.js'
import { leePagina, aplicaValidadores } from './lote-pagina.js'
import type { LecturaDePagina, Diagnosticador, IdentificadorInvalido, Corregido, CodigoLeido } from './lote-pagina.js'
import type { RegistroDeEsquemas } from './xml/registro.js'
import { leeCapaCero } from './capa-cero.js'
import { identidadDe } from './identidad.js'
import { imagenesDelPdf } from './pdf-flujos.js'
import { leeCfdi40, camposParaCotejo } from './xml/cfdi/comprobante-40.js'
import { registroDeEsquemas } from './xml/registro.js'
import { tipoMimeDe } from './archivos.js'
import { camposPorPatron } from './patrones.js'
import type { Patron } from './patrones.js'
import { cotejaContraTranscripcion } from './transcripcion.js'
import type { CotejoDeTranscripcion } from './transcripcion.js'

export type RutaDeLectura = 'capa-cero' | 'xml' | 'motor' | 'ninguna'

export interface ArchivoDelCorpus {
  readonly documentoId: string
  readonly nombre: string
  readonly tipoDocumento: string
  readonly bytes: Uint8Array
}

export interface OpcionesDeCorpus {
  /** Sin motor, los escaneos se declaran como no leidos. No es un error: es una decision del proyecto. */
  readonly motor?: MotorOcr
  readonly registro?: RegistroDeEsquemas
  /** Como se sacan campos del texto exacto de la capa 0. Sin patrones, la capa 0 da texto y cero campos. */
  readonly patrones?: readonly Patron[]
  readonly esquemaDeAnotacion?: unknown
  /**
   * Claves que el PROYECTO declara identificadores (un RFC, un folio fiscal). Se marcan en lo que
   * salga por cualquier via, porque un motor de vision no lo va a marcar solo y sin la marca la
   * inferencia del corpus no funda entidades: compara por parecido lo que debe compararse exacto.
   */
  readonly identificadores?: ReadonlySet<string>
  /** Peticiones al motor en vuelo a la vez. Es lo que se mide para saber si agrupar sirve. */
  readonly enVuelo?: number
  /** Reloj inyectable, para que las pruebas midan sin esperar. */
  readonly ahora?: () => number
  // --- Codigos antes que OCR, respaldo, clases y validadores (spec 009) ---
  /** Lee los QR y codigos de barras de cada pagina ANTES del motor. Sin lector, no se buscan. */
  readonly lectorDeCodigos?: LectorDeCodigos
  /** Un segundo motor, mas caro, al que solo se deriva por `derivaAlRespaldo`. */
  readonly motorDeRespaldo?: MotorOcr
  /** La regla del PROYECTO para derivar. Sin ella, el respaldo no se llama nunca. */
  readonly derivaAlRespaldo?: (pagina: PaginaExtraida, campos: readonly CampoExtraido[]) => boolean
  readonly clases?: readonly ClaseDePagina[]
  /** Clases cuyas paginas no aportan campos ni van al respaldo (una carta de recomendacion). */
  readonly omiteClases?: ReadonlySet<string>
  /** Por clave: `{ rfc: diagnosticaRfc }`. Se aplican a TODAS las vias; solo se corrige lo que vino del OCR. */
  readonly validadores?: Readonly<Record<string, Diagnosticador>>
}

export interface CodigoEnDocumento extends CodigoLeido {
  readonly pagina: number
}

export interface LecturaDeDocumento {
  readonly documentoId: string
  readonly nombre: string
  readonly tipoDocumento: string
  readonly ruta: RutaDeLectura
  /** Por que esa ruta, o por que ninguna. */
  readonly motivo: string
  /** Los campos que ENTRAN al resultado. En la via del motor, solo los que pasaron el cotejo. */
  readonly campos: readonly CampoExtraido[]
  readonly paginas: readonly PaginaExtraida[]
  readonly milisegundos: number
  /** Solo en la via del motor: la segunda lectura. */
  readonly cotejo?: CotejoDeTranscripcion
  /**
   * Identidad por contenido (SHA-256), y de que documento anterior es copia byte a byte si lo es.
   * Un mismo fichero subido dos veces se lee igual —declarar, no descartar—, pero un duplicado que
   * entra a la inferencia como si fuera otro documento sostiene una dependencia con evidencia
   * falsa: quien infiere lo excluye con esta marca.
   */
  readonly identidad: string
  readonly duplicadoDe?: string
  // --- Declaraciones por pagina (spec 009). Vacias en `xml` y `capa-cero`. ---
  readonly clasesDePagina: readonly ClasificacionDePagina[]
  readonly codigos: readonly CodigoEnDocumento[]
  readonly cotejoDeCodigos?: Cotejo
  readonly cotejoDeRespaldo?: Cotejo
  readonly paginasAlRespaldo: readonly number[]
  readonly paginasOmitidas: readonly number[]
  /** Paginas identicas byte a byte a otra ya leida en el lote: se reutilizo la lectura. */
  readonly paginasReutilizadas: readonly number[]
  /** Identificadores que no pasaron su validador. NO estan en `campos`: van a revision. */
  readonly identificadoresInvalidos: readonly IdentificadorInvalido[]
  /** Corregidos por checksum en una posicion. Estan en `campos` con su confianza de OCR intacta. */
  readonly corregidos: readonly Corregido[]
  readonly milisegundosDeRespaldo: number
}

export interface ResultadoDeCorpus {
  readonly lecturas: readonly LecturaDeDocumento[]
  readonly porRuta: Readonly<Record<RutaDeLectura, number>>
  readonly milisegundos: number
  readonly paginasAlRespaldo: number
  readonly paginasOmitidas: number
  readonly paginasReutilizadas: number
  readonly milisegundosDeRespaldo: number
}

type Parcial = Omit<LecturaDeDocumento, 'documentoId' | 'nombre' | 'tipoDocumento' | 'milisegundos' | 'identidad' | 'duplicadoDe'>

const SIN_PAGINAS = {
  clasesDePagina: [], codigos: [], paginasAlRespaldo: [], paginasOmitidas: [], paginasReutilizadas: [],
  identificadoresInvalidos: [], corregidos: [], milisegundosDeRespaldo: 0,
} as const

const nada = (ruta: RutaDeLectura, motivo: string): Parcial => ({ ruta, motivo, campos: [], paginas: [], ...SIN_PAGINAS })

/** Las vias exactas (XML, capa 0) tambien pasan por los validadores; al no ser OCR, nada se corrige. */
function validaExactos(campos: readonly CampoExtraido[], opciones: OpcionesDeCorpus): { campos: CampoExtraido[]; identificadoresInvalidos: IdentificadorInvalido[] } {
  const { validos, invalidos } = aplicaValidadores(campos, opciones.validadores ?? {}, 0)
  return { campos: validos, identificadoresInvalidos: invalidos }
}

/** La lectura de una pagina identica a otra, con el indice de esta. */
function reindexa(previa: LecturaDePagina, indice: number): LecturaDePagina {
  const conPagina = (c: CampoExtraido): CampoExtraido => (c.region === undefined ? c : { ...c, region: { ...c.region, pagina: indice } })
  return {
    ...previa, indice, principal: { ...previa.principal, indice, campos: previa.principal.campos.map(conPagina) },
    campos: previa.campos.map(conPagina),
    invalidos: previa.invalidos.map((i) => ({ ...i, pagina: indice })),
    corregidos: previa.corregidos.map((c) => ({ ...c, pagina: indice })),
  }
}

const fundeCotejos = (cotejos: readonly (Cotejo | undefined)[]): Cotejo | undefined => {
  const presentes = cotejos.filter((c): c is Cotejo => c !== undefined)
  if (presentes.length === 0) return undefined
  return {
    acuerdos: presentes.flatMap((c) => c.acuerdos), discrepancias: presentes.flatMap((c) => c.discrepancias),
    soloOcr: presentes.flatMap((c) => c.soloOcr), soloCodigo: presentes.flatMap((c) => c.soloCodigo),
  }
}

const esXml = (bytes: Uint8Array): boolean => {
  let i = 0
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x0a || bytes[i] === 0x0d || bytes[i] === 0x09)) i++
  return bytes[i] === 0x3c
}

function leeXml(bytes: Uint8Array, registro: RegistroDeEsquemas, opciones: OpcionesDeCorpus): Parcial {
  const lectura = leeCfdi40(bytes, registro)
  if (!lectura.esCfdi) return nada('ninguna', `XML que no es un CFDI 4.0: ${lectura.motivo ?? 'sin motivo'}`)
  const sinLector = lectura.complementos.sinLector.length
  const motivo = sinLector > 0 ? `CFDI 4.0 leido; ${sinLector} complemento(s) sin lector, declarados` : 'CFDI 4.0 leido exacto, sin motor'
  return { ruta: 'xml', motivo, paginas: [], ...SIN_PAGINAS, ...validaExactos(camposParaCotejo(lectura), opciones) }
}

/** Lecturas de pagina ya hechas en este lote, por identidad de la imagen: la misma hoja no se lee dos veces. */
type Reutiliza = Map<string, LecturaDePagina>

async function leePorMotor(
  imagenes: readonly Uint8Array[],
  opciones: OpcionesDeCorpus,
  motivo: string,
  reutiliza: Reutiliza,
): Promise<Parcial> {
  const motor = opciones.motor
  if (motor === undefined) return nada('ninguna', `${motivo}, pero no hay motor inyectado`)
  const lecturas: LecturaDePagina[] = []
  const paginasReutilizadas: number[] = []
  for (const [indice, imagen] of imagenes.entries()) {
    const identidad = await identidadDe(imagen)
    const previa = reutiliza.get(identidad)
    if (previa !== undefined) {
      lecturas.push(reindexa(previa, indice))
      paginasReutilizadas.push(indice)
      continue
    }
    const lectura = await leePagina(imagen, indice, {
      motor, motorDeRespaldo: opciones.motorDeRespaldo, derivaAlRespaldo: opciones.derivaAlRespaldo,
      lectorDeCodigos: opciones.lectorDeCodigos, clases: opciones.clases, omiteClases: opciones.omiteClases,
      patrones: opciones.patrones, validadores: opciones.validadores, esquemaDeAnotacion: opciones.esquemaDeAnotacion, ahora: opciones.ahora,
    })
    reutiliza.set(identidad, lectura)
    lecturas.push(lectura)
  }
  const paginas = lecturas.map((l) => l.principal)
  const directos = paginas.some((p) => p.campos.length > 0)
  const cotejo = directos ? cotejaContraTranscripcion(paginas) : undefined
  const cotejoDeCodigos = fundeCotejos(lecturas.map((l) => l.cotejoDeCodigos))
  const cotejoDeRespaldo = fundeCotejos(lecturas.map((l) => l.cotejoDeRespaldo))
  const avisos = lecturas.flatMap((l) => l.avisos)
  const detalle = directos ? '' : opciones.patrones === undefined ? '; sin campos directos ni patrones' : '; transcripcion y campos por patron, sin confianza declarada'
  return {
    ruta: 'motor',
    motivo: `${motivo}${detalle}${avisos.length > 0 ? `; avisos: ${avisos.join(' · ')}` : ''}`,
    campos: lecturas.flatMap((l) => l.campos),
    paginas,
    ...(cotejo === undefined ? {} : { cotejo }),
    clasesDePagina: lecturas.map((l) => l.clase ?? { clase: 'sin_clasificar', evidencia: null }),
    codigos: lecturas.flatMap((l) => l.codigos.map((c) => ({ ...c, pagina: l.indice }))),
    ...(cotejoDeCodigos === undefined ? {} : { cotejoDeCodigos }),
    ...(cotejoDeRespaldo === undefined ? {} : { cotejoDeRespaldo }),
    paginasAlRespaldo: lecturas.filter((l) => l.respaldo !== undefined).map((l) => l.indice),
    paginasOmitidas: lecturas.filter((l) => l.omitida).map((l) => l.indice),
    paginasReutilizadas,
    identificadoresInvalidos: lecturas.flatMap((l) => l.invalidos),
    corregidos: lecturas.flatMap((l) => l.corregidos),
    milisegundosDeRespaldo: lecturas.reduce((s, l) => s + l.milisegundosDeRespaldo, 0),
  }
}

async function leePdf(bytes: Uint8Array, opciones: OpcionesDeCorpus, reutiliza: Reutiliza): Promise<Parcial> {
  const capa = await leeCapaCero(bytes)
  if (capa.hayTexto) {
    const texto = capa.paginas.join('\n')
    const campos = camposPorPatron(texto, opciones.patrones ?? [])
    const paginas = capa.paginas.map((markdown, indice) => ({ indice, markdown, campos: [] }))
    const motivo = opciones.patrones === undefined ? 'PDF con capa de texto; sin patrones, texto y cero campos' : 'PDF con capa de texto, sin motor'
    return { ruta: 'capa-cero', motivo, paginas, ...SIN_PAGINAS, ...validaExactos(campos, opciones) }
  }
  const imagenes = await imagenesDelPdf(bytes)
  if (imagenes.length === 0) return nada('ninguna', `PDF sin capa de texto (${capa.motivo ?? 'sin motivo'}) y sin imagen extraible`)
  return leePorMotor(imagenes.map((i) => i.bytes), opciones, `PDF escaneado: ${imagenes.length} imagen(es) al motor`, reutiliza)
}

async function leeUno(archivo: ArchivoDelCorpus, opciones: OpcionesDeCorpus, registro: RegistroDeEsquemas, reutiliza: Reutiliza): Promise<Parcial> {
  const mime = tipoMimeDe(archivo.bytes)
  if (mime === 'application/pdf') return leePdf(archivo.bytes, opciones, reutiliza)
  if (mime.startsWith('image/')) return leePorMotor([archivo.bytes], opciones, `imagen ${mime} al motor`, reutiliza)
  if (esXml(archivo.bytes)) return leeXml(archivo.bytes, registro, opciones)
  return nada('ninguna', 'los bytes no son PDF, imagen ni XML')
}

function marcaIdentificadores(campos: readonly CampoExtraido[], claves?: ReadonlySet<string>): readonly CampoExtraido[] {
  if (claves === undefined) return campos
  return campos.map((c) => (claves.has(c.clave) && c.formato === undefined ? { ...c, formato: 'identificador' as const } : c))
}

/**
 * Lee el corpus con `enVuelo` documentos a la vez. El orden de salida es el de entrada, pase lo
 * que pase con los tiempos. Un fallo del motor en un documento se declara EN ESE documento y el
 * lote sigue: parar el lote por uno seria perder los demas.
 */
export async function leeCorpus(archivos: readonly ArchivoDelCorpus[], opciones: OpcionesDeCorpus = {}): Promise<ResultadoDeCorpus> {
  const ahora = opciones.ahora ?? (() => Date.now())
  const registro = opciones.registro ?? registroDeEsquemas([])
  const enVuelo = Math.max(1, opciones.enVuelo ?? 1)
  const arranque = ahora()
  const lecturas: LecturaDeDocumento[] = new Array<LecturaDeDocumento>(archivos.length)
  const identidades = await Promise.all(archivos.map((a) => identidadDe(a.bytes)))
  const primeroCon = new Map<string, string>()
  const duplicadoDe = archivos.map((a, i) => {
    const previo = primeroCon.get(identidades[i])
    if (previo === undefined) primeroCon.set(identidades[i], a.documentoId)
    return previo
  })
  const reutiliza: Reutiliza = new Map()
  let siguiente = 0
  const trabajador = async (): Promise<void> => {
    while (siguiente < archivos.length) {
      const posicion = siguiente++
      const archivo = archivos[posicion]
      const inicio = ahora()
      let parcial: Parcial
      try {
        parcial = await leeUno(archivo, opciones, registro, reutiliza)
      } catch (error) {
        parcial = nada('ninguna', `fallo al leer: ${error instanceof Error ? error.message : String(error)}`)
      }
      const { documentoId, nombre, tipoDocumento } = archivo
      const campos = marcaIdentificadores(parcial.campos, opciones.identificadores)
      const copia = duplicadoDe[posicion]
      lecturas[posicion] = {
        documentoId, nombre, tipoDocumento, ...parcial, campos, milisegundos: ahora() - inicio,
        identidad: identidades[posicion],
        ...(copia === undefined ? {} : { duplicadoDe: copia }),
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(enVuelo, archivos.length) }, trabajador))
  const porRuta: Record<RutaDeLectura, number> = { 'capa-cero': 0, xml: 0, motor: 0, ninguna: 0 }
  for (const lectura of lecturas) porRuta[lectura.ruta]++
  const suma = (f: (l: LecturaDeDocumento) => number): number => lecturas.reduce((s, l) => s + f(l), 0)
  return {
    lecturas, porRuta, milisegundos: ahora() - arranque,
    paginasAlRespaldo: suma((l) => l.paginasAlRespaldo.length),
    paginasOmitidas: suma((l) => l.paginasOmitidas.length),
    paginasReutilizadas: suma((l) => l.paginasReutilizadas.length),
    milisegundosDeRespaldo: suma((l) => l.milisegundosDeRespaldo),
  }
}
