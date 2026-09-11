/**
 * Lo que comparten todos los adaptadores de motor.
 *
 * Vive aparte por una razon concreta: la validacion de la salida del modelo es la barrera que
 * separa «el motor dijo algo» de «esto es un dato», y una barrera duplicada es una barrera que
 * diverge. El dia que un motor nuevo copie-pegue esta validacion y afloje un detalle, ese motor
 * pasara sus pruebas y metera campos que los demas rechazan.
 *
 * Cero dependencias, como el nucleo: aqui solo hay `fetch`, `btoa` y aritmetica.
 */
import type { CampoExtraido, PaginaExtraida, Region } from '../tipos.js'

/** Alias que se actualizan solos. Fijar el modelo es la mitad del control C1. */
const ALIAS_PROHIBIDOS = /(^|[-:@/])(latest|stable|current|default|head)$/i

/**
 * Exige que el identificador del modelo este pineado.
 *
 * Se comprueba al CONSTRUIR y no al usar: un motor que cambia de version sin diff cambia el
 * comportamiento de todo lo que la herramienta extrae despues, y eso es un CDC sin gate. Fallar
 * en el arranque lo convierte en un error de configuracion, que es cuando todavia es barato.
 */
export function exigeModeloPineado(modelo: string): string {
  if (modelo.trim().length === 0) throw new Error('el modelo es obligatorio y va pineado (C1)')
  if (ALIAS_PROHIBIDOS.test(modelo)) {
    throw new Error(`modelo "${modelo}": los alias autoactualizables estan prohibidos (C1). Pinea la version exacta.`)
  }
  return modelo
}

/** Detecta el tipo por los bytes y no por el nombre: un `.pdf` renombrado sigue siendo lo que es. */
export function tipoMimeDe(bytes: Uint8Array): string {
  const empieza = (...b: number[]) => b.every((v, i) => bytes[i] === v)
  if (empieza(0x25, 0x50, 0x44, 0x46)) return 'application/pdf'
  if (empieza(0x89, 0x50, 0x4e, 0x47)) return 'image/png'
  if (empieza(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (empieza(0x47, 0x49, 0x46, 0x38)) return 'image/gif'
  if (empieza(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57) return 'image/webp'
  return 'application/octet-stream'
}

export function aBase64(bytes: Uint8Array): string {
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  return btoa(binario)
}

export const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/**
 * Valida una region. `pagina`, `x`, `y`, `ancho` y `alto` obligatorios y normalizados a [0,1].
 *
 * Una region fuera de rango no se recorta en silencio: se descarta. Recortarla daria una cita que
 * apunta a un sitio que no es de donde salio el dato, que es peor que no citar nada.
 */
export function validaRegion(crudo: unknown): Region | undefined {
  if (!esObjeto(crudo)) return undefined
  const { pagina, x, y, ancho, alto } = crudo
  const enRango = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1
  if (typeof pagina !== 'number' || !Number.isInteger(pagina) || pagina < 0) return undefined
  if (!enRango(x) || !enRango(y) || !enRango(ancho) || !enRango(alto)) return undefined
  return { pagina, x, y, ancho, alto }
}

export function validaCampo(crudo: unknown): CampoExtraido | null {
  if (!esObjeto(crudo)) return null
  const { clave, valor, confianza, formato } = crudo
  if (typeof clave !== 'string' || clave.length === 0) return null
  if (typeof valor !== 'string') return null
  // La confianza tiene que ser un numero en [0,1]. Un "alta" en texto, o un 95 en vez de 0.95,
  // rompen la comparacion contra el umbral sin dar error: el campo se descarta.
  if (typeof confianza !== 'number' || !Number.isFinite(confianza) || confianza < 0 || confianza > 1) return null
  const campo: CampoExtraido = { clave, valor, confianza, procedencia: 'ocr' }
  if (formato === 'identificador' || formato === 'texto') campo.formato = formato
  const region = validaRegion(crudo.region)
  if (region !== undefined) campo.region = region
  return campo
}

/**
 * Valida la respuesta entera. Devuelve las paginas o lanza.
 *
 * Los campos invalidos se descartan uno a uno; una pagina sin `markdown` invalida la respuesta
 * completa, porque a esas alturas ya no se sabe que se esta leyendo.
 */
export function validaPaginas(crudo: unknown): PaginaExtraida[] {
  if (!esObjeto(crudo) || !Array.isArray(crudo.paginas)) {
    throw new Error('el motor no devolvio `paginas`: la respuesta no se puede usar')
  }
  return crudo.paginas.map((pagina: unknown, posicion: number): PaginaExtraida => {
    if (!esObjeto(pagina)) throw new Error(`pagina ${posicion}: no es un objeto`)
    const { indice, markdown, campos } = pagina
    if (typeof markdown !== 'string') throw new Error(`pagina ${posicion}: \`markdown\` no es texto`)
    const camposValidos = Array.isArray(campos)
      ? campos.map(validaCampo).filter((c): c is CampoExtraido => c !== null)
      : []
    return {
      indice: typeof indice === 'number' && Number.isInteger(indice) && indice >= 0 ? indice : posicion,
      markdown,
      campos: camposValidos,
    }
  })
}

/**
 * La instruccion que fija el formato de salida. Compartida para que los motores sean comparables.
 *
 * LOS HUECOS SE DESCRIBEN, NO SE DIBUJAN CON PUNTOS SUSPENSIVOS. Costo un fallo real, y de los
 * que no se ven venir: la version anterior enseñaba la forma con `"markdown":"..."` y
 * `"clave":"..."`, y un modelo pequeño devolvio EXACTAMENTE eso — un campo con clave `...`, valor
 * `...` y confianza 0. Copio la plantilla en vez de rellenarla.
 *
 * Un modelo grande entiende que esos puntos son un hueco. Uno pequeno los toma por la respuesta, y
 * el resultado no parece un fallo: parece un documento del que no se pudo sacar nada. Medido el
 * 2026-09-10 contra un motor autohospedado leyendo un escaneo que SI era legible — el mismo
 * modelo, preguntado sin esta plantilla, devolvio 1514 caracteres de texto correcto.
 *
 * Por eso cada hueco va entre `<>` y DESCRITO, con una linea final que dice que no se copien. Es
 * mas largo de leer y funciona con motores que no son los caros.
 */
export const INSTRUCCION =
  'Extrae el contenido del documento. Responde SOLO con JSON con esta forma exacta: ' +
  '{"paginas":[{"indice":0,"markdown":<todo el texto de la pagina, en markdown>,' +
  '"campos":[{"clave":<nombre corto del dato>,"valor":<lo que dice el documento>,' +
  '"confianza":<numero entre 0 y 1>,' +
  '"region":{"pagina":0,"x":<0 a 1>,"y":<0 a 1>,"ancho":<0 a 1>,"alto":<0 a 1>}}]}]}. ' +
  'Sustituye cada <...> por lo que veas en el documento. ' +
  'NO copies los textos entre <>: son descripciones de que poner, no contenido. ' +
  'Las coordenadas van normalizadas entre 0 y 1.'

export function instruccionCon(esquema: unknown): string {
  return esquema === undefined ? INSTRUCCION : `${INSTRUCCION} Ajusta \`campos\` a este esquema: ${JSON.stringify(esquema)}`
}

/**
 * Traduce el corte de Node a algo sobre lo que se pueda actuar.
 *
 * EL PROBLEMA, y no es teorico. `AbortSignal.timeout(...)` NO gobierna cuanto espera Node por la
 * primera respuesta: undici tiene su propio `headersTimeout` de cinco minutos y corta la peticion
 * aunque se le hayan pedido treinta. `milisegundosDeEspera` no lo puede subir.
 *
 * Muerde justo en el caso que esta herramienta existe para permitir: un motor AUTOHOSPEDADO sin
 * GPU, que es la unica via cuando el documento lleva datos de terceros. Medido el 2026-09-10 sobre
 * un escaneo de una pagina: 337 segundos, y creciendo con el tamano del documento. El error que
 * sale de undici —`UND_ERR_HEADERS_TIMEOUT`— no menciona nada de esto, asi que quien lo ve
 * concluye que su motor esta roto.
 *
 * En el NAVEGADOR no ocurre: ese tope es de Node. Por eso el arreglo no es un numero mas grande
 * aqui, sino inyectar un `fetch` con dispatcher propio — que es justo lo que la opcion `fetch` de
 * estos adaptadores ya permite, y por lo que existe.
 */
export function traduceElCorte(error: unknown, espera: number): Error {
  const causa = (error as { cause?: { code?: unknown } } | null)?.cause
  const codigo = typeof causa?.code === 'string' ? causa.code : ''
  if (codigo === 'UND_ERR_HEADERS_TIMEOUT') {
    return new Error(
      'Node corto la peticion a los 5 minutos, aunque se pidieron ' +
        `${Math.round(espera / 1000)} s. Ese tope es de Node (undici, headersTimeout) y NO lo ` +
        'gobierna `milisegundosDeEspera`. Un motor autohospedado sin GPU lo pasa con facilidad: ' +
        'inyecta un `fetch` con dispatcher propio por la opcion `fetch`, o pide streaming. ' +
        'En el navegador esto no pasa.',
    )
  }
  return error instanceof Error ? error : new Error(String(error))
}
