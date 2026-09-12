/**
 * Adaptador de `MotorOcr` contra un servidor con API compatible con OpenAI.
 *
 * El caso de uso real: un vLLM autohospedado sirviendo PaddleOCR-VL o GLM-OCR. Habla por `fetch`
 * y no declara ni una dependencia — es el unico adaptador de motor que puede decir eso, y por eso
 * es el que permite montar la herramienta sin que el documento salga del perimetro. Hay una prueba
 * de contrato que falla si algun dia este archivo importa algo que no sea relativo.
 *
 * TRES REGLAS DE LA CASA QUE ESTE ARCHIVO HONRA, Y DONDE:
 *
 * 1. **El modelo va PINEADO (C1)** → `exigeModeloPineado`, al construir y no al usar.
 * 2. **La salida del modelo NO se confia** → `validaPaginas`, campo a campo.
 * 3. **Los secretos no se imprimen** → la clave no aparece en ningun error, ni enmascarada, y el
 *    cuerpo de la respuesta tampoco se vuelca: lleva el contenido del documento dentro.
 *
 * SOBRE C4, y esto no es un detalle de implementacion: usar este adaptador contra un servidor
 * ajeno saca el documento del perimetro igual que una API comercial. «Autohospedado» describe
 * quien corre los pesos, no por donde viaja el byte. La decision de flujo de datos es del
 * proyecto que lo configura, no de la herramienta.
 */
import type { PaginaExtraida, LimitesDelMotor, UsoDeTokens } from '../tipos.js'
import type { MotorOcr, OpcionesDeExtraccion } from '../puertos.js'
import {
  exigeModeloPineado, tipoMimeDe, aBase64, esObjeto, validaPaginas, instruccionCon, INSTRUCCION_TRANSCRIPCION, traduceElCorte,
} from './comun.js'

export { validaPaginas, tipoMimeDe } from './comun.js'

export interface OpcionesDelMotorCompatible {
  /** Raiz del servidor, por ejemplo `http://localhost:8000/v1`. La barra final sobra. */
  base: string
  /** Identificador PINEADO. `paddleocr-vl-0.9.1` vale; `paddleocr-vl:latest` se rechaza. */
  modelo: string
  /** Se manda como `Authorization: Bearer`. Nunca se imprime, ni al depurar. */
  clave?: string
  limites?: Partial<LimitesDelMotor>
  /** Inyectable para probar sin red. En produccion es el `fetch` del entorno. */
  fetch?: typeof fetch
  /** Corta la peticion. Sin esto, un servidor colgado cuelga la cola entera. */
  milisegundosDeEspera?: number
  /**
   * `campos` (por defecto): se pide JSON con transcripcion y campos, y se valida.
   * `transcripcion`: se pide SOLO el texto. Para motores de OCR puros, que no siguen instrucciones
   * de formato (ver `INSTRUCCION_TRANSCRIPCION`). Las paginas vuelven con `campos: []`.
   */
  modo?: 'campos' | 'transcripcion'
}

const LIMITES_POR_DEFECTO: LimitesDelMotor = {
  bytesMaximos: 20 * 1024 * 1024,
  paginasMaximas: 200,
  paginasPorAnotacion: 8,
}

/** Saca el texto del `content` de una respuesta con forma de OpenAI. */
function textoDe(respuesta: unknown): string {
  if (!esObjeto(respuesta) || !Array.isArray(respuesta.choices) || respuesta.choices.length === 0) {
    throw new Error('respuesta sin `choices`: el servidor no habla el dialecto esperado')
  }
  const primera: unknown = respuesta.choices[0]
  const mensaje = esObjeto(primera) ? primera.message : undefined
  const contenido = esObjeto(mensaje) ? mensaje.content : undefined
  if (typeof contenido !== 'string') throw new Error('el mensaje no trae contenido de texto')
  return contenido
}

/**
 * El `usage` que el servidor haya declarado, si lo declaro. `chat/completions` no es parte del
 * `content` que se valida contra el documento: es un dato del propio servidor sobre si mismo, y
 * por eso se lee aparte y nunca pasa por `validaPaginas`.
 *
 * Un `usage` a medias (falta `completion_tokens`, por ejemplo) se trata como ausente entero: un
 * total parcial que se presenta como el total real es peor que declarar que no se sabe.
 */
function usoDe(respuesta: unknown): UsoDeTokens | null {
  if (!esObjeto(respuesta) || !esObjeto(respuesta.usage)) return null
  const { prompt_tokens: entrada, completion_tokens: salida, total_tokens: total } = respuesta.usage
  if (typeof entrada !== 'number' || typeof salida !== 'number') return null
  // Medido el 2026-09-11 con Ollama y GLM-OCR sobre imagen: declara `usage` con todo ceros. Un cero
  // declarado es tan poco dato como ninguno, y sumarlo haria parecer que la corrida no costo nada.
  if (entrada === 0 && salida === 0) return null
  return {
    tokensDeEntrada: entrada,
    tokensDeSalida: salida,
    tokensTotal: typeof total === 'number' ? total : entrada + salida,
  }
}

/** Y el JSON de ese texto, cuando el modo lo pide. */
function contenidoDe(respuesta: unknown): unknown {
  const contenido = textoDe(respuesta)
  try {
    return JSON.parse(contenido) as unknown
  } catch {
    // A proposito NO se incluye el contenido en el error: lleva el documento dentro.
    throw new Error('el contenido del mensaje no es JSON valido')
  }
}

/**
 * Un motor de OCR puro puede devolver la transcripcion DOS veces: el texto y, detras, el mismo
 * texto dentro de una valla ```markdown. Medido con GLM-OCR el 2026-09-11 sobre dos minutas
 * sinteticas: CER del 107 % con una transcripcion perfecta, porque estaba duplicada. Una copia
 * exacta no aporta informacion: se quita, y solo si es exacta. Un texto que no se repite pasa tal cual.
 */
export function sinTranscripcionRepetida(texto: string): string {
  const limpio = texto.replace(/```[a-z]*\n?/g, '').trim()
  const mitad = Math.floor(limpio.length / 2)
  const primera = limpio.slice(0, mitad).trim()
  const segunda = limpio.slice(mitad).trim()
  return primera.length > 0 && comparable(primera) === comparable(segunda) ? primera : limpio
}

/**
 * Las dos copias se comparan sin acentos ni caso: la segunda corrida trajo «dias» en una y «días»
 * en la otra, y una repeticion con un acento de diferencia sigue siendo una repeticion. Se
 * conserva la PRIMERA tal cual: no se toca el texto, solo se decide si la segunda sobra.
 */
function comparable(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ')
}

export function motorCompatible(opciones: OpcionesDelMotorCompatible): MotorOcr {
  const { base, clave } = opciones
  const modelo = exigeModeloPineado(opciones.modelo)
  const pedir = opciones.fetch ?? globalThis.fetch
  const limites: LimitesDelMotor = { ...LIMITES_POR_DEFECTO, ...opciones.limites }
  const espera = opciones.milisegundosDeEspera ?? 120_000
  const transcribe = opciones.modo === 'transcripcion'

  return {
    modelo,
    limites,
    async extrae(documento: Uint8Array, extra?: OpcionesDeExtraccion): Promise<PaginaExtraida[]> {
      if (documento.byteLength > limites.bytesMaximos) {
        throw new Error(`el documento pesa ${documento.byteLength} y el motor topa en ${limites.bytesMaximos}`)
      }
      const cabeceras: Record<string, string> = { 'content-type': 'application/json' }
      if (clave !== undefined && clave.length > 0) cabeceras.authorization = `Bearer ${clave}`

      const cuerpo = {
        model: modelo,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: transcribe ? INSTRUCCION_TRANSCRIPCION : instruccionCon(extra?.esquemaDeAnotacion) },
              {
                type: 'image_url',
                image_url: { url: `data:${tipoMimeDe(documento)};base64,${aBase64(documento)}` },
              },
            ],
          },
        ],
        temperature: 0,
        ...(transcribe ? {} : { response_format: { type: 'json_object' } }),
      }

      let respuesta: Response
      try {
        respuesta = await pedir(`${base.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: cabeceras,
          body: JSON.stringify(cuerpo),
          signal: AbortSignal.timeout(espera),
        })
      } catch (error) {
        // Ver `traduceElCorte`: el tope de Node no lo gobierna `milisegundosDeEspera`, y su error
        // no lo dice. Sin esto, quien lo ve concluye que su motor esta roto.
        throw traduceElCorte(error, espera)
      }
      if (!respuesta.ok) {
        // Solo el codigo: el cuerpo de un error puede repetir el documento enviado.
        throw new Error(`el motor respondio ${respuesta.status}`)
      }
      const cruda: unknown = await respuesta.json()
      extra?.alConsumirTokens?.(usoDe(cruda))
      if (transcribe) return [{ indice: 0, markdown: sinTranscripcionRepetida(textoDe(cruda)), campos: [] }]
      return validaPaginas(contenidoDe(cruda))
    },
  }
}
