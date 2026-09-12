/**
 * Una pagina, de punta a punta: codigos antes que OCR, clase, respaldo, cotejo y validacion.
 *
 * El orden es la decision. (a) Los CODIGOS van primero porque un QR decodifica exacto en
 * milisegundos y las hojas oficiales del expediente lo traen. (b) El motor principal lee la
 * pagina. (c) La CLASE se decide con ese texto, y una clase que el proyecto omite no gasta mas.
 * (d) Se COTEJA lo que dijo el OCR contra lo que dijo el codigo. (e) Solo si el proyecto lo pide,
 * la pagina va a un motor de RESPALDO mas caro, y se coteja tambien. (f) Los VALIDADORES pasan por
 * los identificadores: lo que no pasa no entra al resultado, y lo que se corrige se declara.
 *
 * Dos reglas que no se negocian. No hay ningun umbral aqui: derivar al respaldo es una regla del
 * PROYECTO, y sin ella no se deriva nunca. Y un identificador corregido por checksum NUNCA se
 * auto-valida: conserva la confianza del OCR, porque un checksum puede «arreglar» un RFC hacia el
 * de otra persona, y eso solo lo cierra el QR o una persona (C4).
 */
import type { CampoExtraido, PaginaExtraida, Procedencia } from './tipos.js'
import type { MotorOcr, LectorDeCodigos } from './puertos.js'
import type { Patron } from './patrones.js'
import type { ClaseDePagina, ClasificacionDePagina } from './clasifica-pagina.js'
import type { DiagnosticoDeIdentificador } from './identificadores-mx.js'
import type { Cotejo } from './corroboracion.js'
import type { TipoDeCarga } from './codigos.js'
import { analizaCarga, camposDeCodigo } from './codigos.js'
import { clasePorTitulo } from './clasifica-pagina.js'
import { corrobora } from './corroboracion.js'
import { camposPorPatron } from './patrones.js'
import { corrigePorChecksum } from './identificadores-mx.js'
import { cotejaContraTranscripcion } from './transcripcion.js'

/** `diagnosticaRfc`, `diagnosticaCurp`, `diagnosticaNss`... o uno propio del proyecto. */
export type Diagnosticador = (valor: string) => DiagnosticoDeIdentificador

export interface OpcionesDePagina {
  readonly motor: MotorOcr
  readonly motorDeRespaldo?: MotorOcr
  /**
   * SIN valor por defecto: sin regla del proyecto, la pagina no se deriva nunca. `campos` trae lo
   * que ya dieron los codigos Y el OCR: medido, una regla que solo miraba el OCR mando al motor
   * caro una hoja cuya CURP ya habia dado el QR.
   */
  readonly derivaAlRespaldo?: (pagina: PaginaExtraida, campos: readonly CampoExtraido[]) => boolean
  readonly lectorDeCodigos?: LectorDeCodigos
  readonly clases?: readonly ClaseDePagina[]
  readonly omiteClases?: ReadonlySet<string>
  readonly patrones?: readonly Patron[]
  /** Por clave: `{ rfc: diagnosticaRfc, curp: diagnosticaCurp }`. Solo se corrige lo que vino del OCR. */
  readonly validadores?: Readonly<Record<string, Diagnosticador>>
  readonly esquemaDeAnotacion?: unknown
  readonly ahora?: () => number
}

export interface IdentificadorInvalido {
  readonly clave: string
  readonly valor: string
  readonly procedencia: Procedencia
  readonly pagina: number
  /** El motivo del diagnostico, o `ambiguo` si habia mas de una correccion posible. */
  readonly motivo: string
}

export interface Corregido {
  readonly clave: string
  readonly original: string
  readonly valor: string
  readonly pagina: number
}

export interface CodigoLeido {
  readonly tipo: TipoDeCarga
  /** Largo de la carga, no la carga: un QR de otro tipo puede llevar datos que no son de aqui. */
  readonly caracteres: number
}

export interface LecturaDePagina {
  readonly indice: number
  readonly principal: PaginaExtraida
  readonly clase: ClasificacionDePagina | null
  readonly omitida: boolean
  readonly codigos: readonly CodigoLeido[]
  readonly camposDeCodigo: readonly CampoExtraido[]
  readonly respaldo?: readonly PaginaExtraida[]
  readonly cotejoDeCodigos?: Cotejo
  readonly cotejoDeRespaldo?: Cotejo
  readonly milisegundosDeRespaldo: number
  /** Lo que ENTRA: codigos, OCR cotejado y respaldo, fundidos y validados. */
  readonly campos: readonly CampoExtraido[]
  readonly invalidos: readonly IdentificadorInvalido[]
  readonly corregidos: readonly Corregido[]
  /** Fallos que no tumban la pagina (el lector de codigos, el respaldo): se declaran aqui. */
  readonly avisos: readonly string[]
}

// Lo que confirmo una persona manda; despues el codigo (exacto), el XML (exacto) y el OCR (estimado).
const RANGO: Readonly<Record<Procedencia, number>> = { humano: 0, codigo: 1, xml: 2, ocr: 3 }
const comparable = (valor: string): string => valor.trim().toUpperCase().replace(/\s+/g, '')

/**
 * Ante varios valores para una misma clave (dos `rfc` en una pagina: empleado y patron), elige el
 * que coincide con la referencia; el resto se aparta. Sin esto `corrobora` se quedaria con uno al
 * azar y contaria una discrepancia que no existe.
 */
export function emparejaPorClave(candidatos: readonly CampoExtraido[], referencia: readonly CampoExtraido[]): readonly CampoExtraido[] {
  const valoresDeReferencia = new Map<string, Set<string>>()
  for (const r of referencia) valoresDeReferencia.set(r.clave, (valoresDeReferencia.get(r.clave) ?? new Set()).add(comparable(r.valor)))
  const coincide = (c: CampoExtraido): boolean => valoresDeReferencia.get(c.clave)?.has(comparable(c.valor)) ?? false
  const elegidos = new Map<string, CampoExtraido>()
  for (const c of candidatos) {
    const previo = elegidos.get(c.clave)
    if (previo === undefined || (coincide(c) && !coincide(previo))) elegidos.set(c.clave, c)
  }
  return [...elegidos.values()]
}

/** Dedupe por (clave, valor), quedandose con la procedencia mas fiable: humano > codigo > xml > ocr. */
export function fusionaCampos(...grupos: readonly (readonly CampoExtraido[])[]): CampoExtraido[] {
  const porClaveYValor = new Map<string, CampoExtraido>()
  for (const grupo of grupos) {
    for (const campo of grupo) {
      const clave = `${campo.clave} ${comparable(campo.valor)}`
      const previo = porClaveYValor.get(clave)
      if (previo === undefined || RANGO[campo.procedencia] < RANGO[previo.procedencia]) porClaveYValor.set(clave, campo)
    }
  }
  return [...porClaveYValor.values()]
}

export interface CamposValidados {
  readonly validos: CampoExtraido[]
  readonly invalidos: IdentificadorInvalido[]
  readonly corregidos: Corregido[]
}

/**
 * Pasa los validadores. Un campo `ocr` que no pasa intenta UNA correccion por checksum; uno que
 * vino de un codigo o de un XML no se corrige: si no pasa, es senal de sustitucion o de documento
 * inventado, y va a invalidos con su procedencia a la vista.
 *
 * UN CORREGIDO NO ENTRA A `validos`: se propone en `corregidos` y lo confirma una persona o un
 * codigo. Medido el 2026-09-11 en un expediente real: la unica CURP corregida que se pudo cotejar
 * contra el QR del mismo expediente era DISTINTA — el checksum habia «arreglado» hacia la clave de
 * otra persona. Un digito verificador de modulo 10 deja pasar una de cada diez sustituciones, y
 * eso no es una confianza con la que fundar un identificador (C4).
 */
export function aplicaValidadores(campos: readonly CampoExtraido[], validadores: Readonly<Record<string, Diagnosticador>>, pagina: number): CamposValidados {
  const validos: CampoExtraido[] = []
  const invalidos: IdentificadorInvalido[] = []
  const corregidos: Corregido[] = []
  for (const campo of campos) {
    const diagnostica = validadores[campo.clave]
    if (diagnostica === undefined) { validos.push(campo); continue }
    const diagnostico = diagnostica(campo.valor)
    if (diagnostico.valido) { validos.push(campo); continue }
    if (campo.procedencia !== 'ocr') {
      invalidos.push({ clave: campo.clave, valor: campo.valor, procedencia: campo.procedencia, pagina, motivo: diagnostico.motivo ?? 'invalido' })
      continue
    }
    const correccion = corrigePorChecksum(campo.valor, (v) => diagnostica(v).valido)
    if (correccion.corregido) {
      corregidos.push({ clave: campo.clave, original: correccion.original, valor: correccion.valor, pagina })
    } else {
      invalidos.push({ clave: campo.clave, valor: campo.valor, procedencia: 'ocr', pagina, motivo: correccion.motivo === 'ambiguo' ? 'ambiguo' : (diagnostico.motivo ?? 'invalido') })
    }
  }
  return { validos, invalidos, corregidos }
}

function conPagina(paginas: readonly PaginaExtraida[], indice: number): PaginaExtraida {
  const campos = paginas.flatMap((p) => p.campos).map((c) => (c.region === undefined ? c : { ...c, region: { ...c.region, pagina: indice } }))
  const confianza = paginas[0]?.confianza
  return { indice, markdown: paginas.map((p) => p.markdown).join('\n'), campos, ...(confianza === undefined ? {} : { confianza }) }
}

/**
 * Campos de una lectura: los directos del motor (cotejados contra su propio texto) Y los que den
 * los patrones sobre la transcripcion. Antes era «o»: con un motor por zonas que devuelve un RFC,
 * la CURP que estaba limpia en la prosa se perdia (medido en constancias de RENAPO). Se funden
 * por (clave, valor); un valor que sale por las dos vias queda con la confianza del motor.
 */
function camposDeLectura(pagina: PaginaExtraida, patrones: readonly Patron[] | undefined): readonly CampoExtraido[] {
  const directos = pagina.campos.length > 0 ? cotejaContraTranscripcion([pagina]).coinciden : []
  const porPatron = patrones === undefined ? [] : camposPorPatron(pagina.markdown, patrones, { procedencia: 'ocr', confianza: 0 })
  return fusionaCampos(directos, porPatron)
}

const clavesEnDiscrepancia = (cotejos: readonly (Cotejo | undefined)[]): Set<string> =>
  new Set(cotejos.flatMap((c) => c?.discrepancias.map((d) => d.clave) ?? []))

export async function leePagina(imagen: Uint8Array, indice: number, opciones: OpcionesDePagina): Promise<LecturaDePagina> {
  const ahora = opciones.ahora ?? (() => Date.now())
  const avisos: string[] = []

  // (a) Codigos, antes que nada.
  const codigos: CodigoLeido[] = []
  const deCodigo: CampoExtraido[] = []
  if (opciones.lectorDeCodigos !== undefined) {
    try {
      for (const cruda of await opciones.lectorDeCodigos.lee(imagen)) {
        const carga = analizaCarga(cruda)
        codigos.push({ tipo: carga.tipo, caracteres: cruda.length })
        deCodigo.push(...camposDeCodigo(carga))
      }
    } catch (error) {
      avisos.push(`lector de codigos: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // (b) Motor principal, y (c) clase.
  const principal = conPagina(await opciones.motor.extrae(imagen, { esquemaDeAnotacion: opciones.esquemaDeAnotacion }), indice)
  const clase = opciones.clases === undefined ? null : clasePorTitulo(principal.markdown, opciones.clases)
  const base = { indice, principal, clase, codigos, camposDeCodigo: deCodigo, milisegundosDeRespaldo: 0, invalidos: [], corregidos: [], avisos }
  if (clase !== null && opciones.omiteClases?.has(clase.clase) === true) {
    return { ...base, omitida: true, campos: [] }
  }

  // (d) Validadores ANTES del cotejo: un valor de OCR que no pasa (y no se corrige) no es una
  // lectura con la que discutir, es un descarte. Si entrara al cotejo, un RFC exacto del QR
  // quedaria en «discrepancia» frente a una lectura que ya se sabia mala (medido).
  const validadores = opciones.validadores ?? {}
  const ocrValidado = aplicaValidadores(camposDeLectura(principal, opciones.patrones), validadores, indice)
  const codigoValidado = aplicaValidadores(deCodigo, validadores, indice)
  const deOcr = ocrValidado.validos
  const cotejoDeCodigos = codigoValidado.validos.length > 0 && deOcr.length > 0 ? corrobora(emparejaPorClave(deOcr, codigoValidado.validos), codigoValidado.validos) : undefined

  // (e) Respaldo, solo por regla del proyecto.
  let respaldo: readonly PaginaExtraida[] | undefined
  let respaldoValidado: CamposValidados = { validos: [], invalidos: [], corregidos: [] }
  let cotejoDeRespaldo: Cotejo | undefined
  let milisegundosDeRespaldo = 0
  if (opciones.motorDeRespaldo !== undefined && opciones.derivaAlRespaldo?.(principal, [...codigoValidado.validos, ...deOcr]) === true) {
    const inicio = ahora()
    try {
      respaldo = await opciones.motorDeRespaldo.extrae(imagen, { esquemaDeAnotacion: opciones.esquemaDeAnotacion })
      respaldoValidado = aplicaValidadores(camposDeLectura(conPagina(respaldo, indice), opciones.patrones), validadores, indice)
      if (deOcr.length > 0 && respaldoValidado.validos.length > 0) cotejoDeRespaldo = corrobora(emparejaPorClave(deOcr, respaldoValidado.validos), respaldoValidado.validos)
    } catch (error) {
      avisos.push(`motor de respaldo: ${error instanceof Error ? error.message : String(error)}`)
    }
    milisegundosDeRespaldo = ahora() - inicio
  }

  // (f) Lo que entra: sin las claves en discrepancia (esas van a revision), fundido.
  const enDisputa = clavesEnDiscrepancia([cotejoDeCodigos, cotejoDeRespaldo])
  const sinDisputa = (campos: readonly CampoExtraido[]): CampoExtraido[] => campos.filter((c) => !enDisputa.has(c.clave))
  const validos = fusionaCampos(sinDisputa(codigoValidado.validos), sinDisputa(deOcr), sinDisputa(respaldoValidado.validos))
  const invalidos = [...codigoValidado.invalidos, ...ocrValidado.invalidos, ...respaldoValidado.invalidos]
  const corregidos = [...ocrValidado.corregidos, ...respaldoValidado.corregidos]

  return {
    ...base, omitida: false, campos: validos, invalidos, corregidos, milisegundosDeRespaldo,
    ...(respaldo === undefined ? {} : { respaldo }),
    ...(cotejoDeCodigos === undefined ? {} : { cotejoDeCodigos }),
    ...(cotejoDeRespaldo === undefined ? {} : { cotejoDeRespaldo }),
  }
}
