/**
 * Adaptador de `MotorOcr` contra la API de OCR de Mistral.
 *
 * DESVIACION DECLARADA respecto a la tabla §4 del SDD, que listaba `@mistralai/mistralai` como
 * peerDependency opcional: este adaptador habla por `fetch`. Tres razones, y la tercera es la que
 * decide:
 *   1. El SDK no aporta nada que `fetch` no haga en este flujo: una peticion, una respuesta.
 *   2. Sin dependencia no hay version que pinear, ni deriva de SDK que auditar.
 *   3. **TAR-15**: el empaquetador instala el tarball en un proyecto limpio e importa cada
 *      subpath. Un subpath que importa un peer ausente revienta ahi — que es justo el fallo que
 *      esa prueba existe para cazar. Con `fetch` el subpath se importa siempre.
 * Si algun dia se quiere el SDK, es un cambio de contrato del paquete y va con su entrada, no de
 * tapadillo.
 *
 * LO QUE ESTE ADAPTADOR HACE Y EL OTRO NO: trocear. La API topa en 50 MB, 1000 paginas y **8
 * paginas por peticion cuando se piden anotaciones**. Trocear mal no da error: parte el documento
 * por donde no toca y **pierde la correspondencia de pagina en silencio**. Por eso el plan de
 * envio es una funcion pura y probada aparte, y los indices se remapean al global al recomponer.
 *
 * C4: esto manda el documento a un tercero. Es una decision de flujo de datos del proyecto que lo
 * configura, no de la herramienta, y por eso convive con `openai-compat` en vez de sustituirlo.
 */
import type { PaginaExtraida, CampoExtraido, LimitesDelMotor } from '../tipos.js'
import type { MotorOcr, OpcionesDeExtraccion } from '../puertos.js'
import { exigeModeloPineado, tipoMimeDe, aBase64, esObjeto, validaCampo, traduceElCorte } from './comun.js'
import { troceaPaginas } from '../archivos.js'
import { cuentaPaginasPdf } from '../capa-cero.js'

/** Los topes publicados de la API. Se declaran porque cambian con el proveedor. */
export const LIMITES_MISTRAL: LimitesDelMotor = {
  bytesMaximos: 50 * 1024 * 1024,
  paginasMaximas: 1000,
  paginasPorAnotacion: 8,
}

export interface OpcionesDelMotorMistral {
  /** Identificador PINEADO, por ejemplo `mistral-ocr-2505`. Un alias se rechaza (C1). */
  modelo: string
  /** Clave de API. Nunca se imprime, ni enmascarada. */
  clave: string
  base?: string
  limites?: Partial<LimitesDelMotor>
  fetch?: typeof fetch
  milisegundosDeEspera?: number
}

export interface PlanDeEnvio {
  /** Un trozo por peticion. Vacio (`[]`) significa «manda el documento entero, sin listar paginas». */
  trozos: readonly (readonly number[])[]
  /** Paginas detectadas, o `null` si no se pudo saber. */
  paginas: number | null
  /** Por que se troceo. `null` cuando va en una sola peticion. */
  motivo: string | null
}

/**
 * Decide como se manda el documento ANTES de mandarlo. Pura, para poder probarla sin red.
 *
 * Lo que NO hace, y se dice en vez de fingirlo: **no trocea por tamano**. Partir los bytes de un
 * PDF exige reescribirlo, y eso pide un escritor de PDF que este paquete no tiene ni va a tener
 * por una linea de codigo. Un documento que pasa del tope se **rechaza aqui**, con el peso y el
 * limite en el mensaje, en vez de gastarse la llamada para que la API devuelva un 413.
 */
export function planificaEnvio(
  documento: Uint8Array,
  opciones: OpcionesDeExtraccion | undefined,
  limites: LimitesDelMotor,
): PlanDeEnvio {
  if (documento.byteLength > limites.bytesMaximos) {
    throw new Error(
      `el documento pesa ${documento.byteLength} y la API topa en ${limites.bytesMaximos}. ` +
        'Trocearlo exige reescribir el PDF y eso no es de este paquete: divide el fichero antes.',
    )
  }
  const paginas = cuentaPaginasPdf(documento)
  if (paginas !== null && paginas > limites.paginasMaximas) {
    throw new Error(`el documento trae ${paginas} paginas y la API topa en ${limites.paginasMaximas}`)
  }

  const pedidas = opciones?.paginas
  const conAnotacion = opciones?.esquemaDeAnotacion !== undefined
  const tope = limites.paginasPorAnotacion

  // Sin anotaciones no hay tope por peticion: va entero, y es una llamada en vez de N.
  if (!conAnotacion) {
    return { trozos: pedidas === undefined ? [[]] : [pedidas], paginas, motivo: null }
  }
  const lista = pedidas ?? (paginas === null ? null : Array.from({ length: paginas }, (_, i) => i))
  if (lista === null) {
    // No se sabe cuantas hay: mandar entero y dejar decidir a la API es lo correcto. Adivinar el
    // numero para trocear seria perder paginas sin que nadie se entere.
    return { trozos: [[]], paginas: null, motivo: 'no se pudo contar las paginas: va entero' }
  }
  if (lista.length <= tope) return { trozos: [lista], paginas, motivo: null }

  const trozos = troceaPaginas(lista.length, tope).map((t) => t.map((i) => lista[i]))
  return { trozos, paginas, motivo: `anotaciones con ${lista.length} paginas: la API topa en ${tope} por peticion` }
}

/**
 * Traduce la respuesta nativa de la API (`pages[].index/markdown`) a `PaginaExtraida`.
 *
 * `trozo` son los indices GLOBALES que se pidieron. La API numera desde 0 dentro de cada peticion,
 * asi que sin este remapeo la pagina 9 del documento vuelve como pagina 1 y la cita queda
 * apuntando al sitio equivocado — el fallo silencioso que hace peligroso trocear.
 */
export function traduceRespuesta(crudo: unknown, trozo: readonly number[]): PaginaExtraida[] {
  if (!esObjeto(crudo) || !Array.isArray(crudo.pages)) {
    throw new Error('la respuesta no trae `pages`: no se puede usar')
  }
  const anotacion = leeAnotacion(crudo.document_annotation)
  return crudo.pages.map((pagina: unknown, posicion: number): PaginaExtraida => {
    if (!esObjeto(pagina)) throw new Error(`pagina ${posicion}: no es un objeto`)
    if (typeof pagina.markdown !== 'string') throw new Error(`pagina ${posicion}: \`markdown\` no es texto`)
    const local = typeof pagina.index === 'number' && Number.isInteger(pagina.index) ? pagina.index : posicion
    const global = trozo.length > 0 ? (trozo[local] ?? trozo[posicion] ?? local) : local
    const campos = posicion === 0 ? anotacion : []
    return { indice: global, markdown: pagina.markdown, campos: campos.map((c) => reubica(c, global)) }
  })
}

/** La region viene con la pagina local del trozo; se reescribe a la global por lo mismo de arriba. */
function reubica(campo: CampoExtraido, pagina: number): CampoExtraido {
  return campo.region === undefined ? campo : { ...campo, region: { ...campo.region, pagina } }
}

/**
 * Lee la anotacion de documento, que llega como cadena JSON.
 *
 * EL DETALLE QUE NO SE PUEDE INVENTAR: la anotacion de Mistral **no trae confianza por campo**.
 * Un campo sin confianza se emite con `confianza: 0`, y eso no significa «seguro que esta mal»
 * sino «el motor no dijo nada». Cero es el unico valor que garantiza que el campo caiga por
 * debajo de CUALQUIER umbral y pase por revision humana. Ponerle 1 —que es la tentacion, porque
 * «lo dijo el modelo estructurado»— lo saltaria la cola entera, que es justo el control.
 */
function leeAnotacion(crudo: unknown): CampoExtraido[] {
  if (typeof crudo !== 'string' || crudo.trim().length === 0) return []
  let datos: unknown
  try {
    datos = JSON.parse(crudo) as unknown
  } catch {
    return []
  }
  if (!esObjeto(datos)) return []
  const salida: CampoExtraido[] = []
  for (const [clave, valor] of Object.entries(datos)) {
    // Si el esquema pidio confianza y el modelo la dio, se valida como cualquier otra.
    const comoCampo = validaCampo(esObjeto(valor) ? { clave, ...valor } : null)
    if (comoCampo !== null) {
      salida.push(comoCampo)
      continue
    }
    if (typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean') {
      salida.push({ clave, valor: String(valor), confianza: 0, procedencia: 'ocr' })
    }
  }
  return salida
}

export function motorMistral(opciones: OpcionesDelMotorMistral): MotorOcr {
  const modelo = exigeModeloPineado(opciones.modelo)
  if (opciones.clave.trim().length === 0) throw new Error('la clave de la API es obligatoria')
  const base = (opciones.base ?? 'https://api.mistral.ai/v1').replace(/\/$/, '')
  const pedir = opciones.fetch ?? globalThis.fetch
  const limites: LimitesDelMotor = { ...LIMITES_MISTRAL, ...opciones.limites }
  const espera = opciones.milisegundosDeEspera ?? 180_000

  return {
    modelo,
    limites,
    async extrae(documento: Uint8Array, extra?: OpcionesDeExtraccion): Promise<PaginaExtraida[]> {
      const plan = planificaEnvio(documento, extra, limites)
      const url = `data:${tipoMimeDe(documento)};base64,${aBase64(documento)}`
      const salida: PaginaExtraida[] = []

      for (const trozo of plan.trozos) {
        const cuerpo: Record<string, unknown> = {
          model: modelo,
          document: { type: 'document_url', document_url: url },
        }
        if (trozo.length > 0) cuerpo.pages = trozo
        if (extra?.esquemaDeAnotacion !== undefined) cuerpo.document_annotation_format = extra.esquemaDeAnotacion

        let respuesta: Response
        try {
          respuesta = await pedir(`${base}/ocr`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${opciones.clave}` },
            body: JSON.stringify(cuerpo),
            signal: AbortSignal.timeout(espera),
          })
        } catch (error) {
          // El mismo tope de Node que en el adaptador autohospedado. Aqui muerde menos —una API
          // remota responde rapido— pero un documento grande troceado lo puede alcanzar.
          throw traduceElCorte(error, espera)
        }
        if (!respuesta.ok) {
          // Solo el codigo. El cuerpo de un error de esta API repite el documento enviado.
          throw new Error(`la API respondio ${respuesta.status}`)
        }
        salida.push(...traduceRespuesta((await respuesta.json()) as unknown, trozo))
      }
      return salida.sort((a, b) => a.indice - b.indice)
    },
  }
}
