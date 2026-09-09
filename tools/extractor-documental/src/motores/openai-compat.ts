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
import type { PaginaExtraida, LimitesDelMotor } from '../tipos.js'
import type { MotorOcr, OpcionesDeExtraccion } from '../puertos.js'
import { exigeModeloPineado, tipoMimeDe, aBase64, esObjeto, validaPaginas, instruccionCon } from './comun.js'

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
}

const LIMITES_POR_DEFECTO: LimitesDelMotor = {
  bytesMaximos: 20 * 1024 * 1024,
  paginasMaximas: 200,
  paginasPorAnotacion: 8,
}

/** Saca el JSON del `content` de una respuesta con forma de OpenAI. */
function contenidoDe(respuesta: unknown): unknown {
  if (!esObjeto(respuesta) || !Array.isArray(respuesta.choices) || respuesta.choices.length === 0) {
    throw new Error('respuesta sin `choices`: el servidor no habla el dialecto esperado')
  }
  const primera: unknown = respuesta.choices[0]
  const mensaje = esObjeto(primera) ? primera.message : undefined
  const contenido = esObjeto(mensaje) ? mensaje.content : undefined
  if (typeof contenido !== 'string') throw new Error('el mensaje no trae contenido de texto')
  try {
    return JSON.parse(contenido) as unknown
  } catch {
    // A proposito NO se incluye el contenido en el error: lleva el documento dentro.
    throw new Error('el contenido del mensaje no es JSON valido')
  }
}

export function motorCompatible(opciones: OpcionesDelMotorCompatible): MotorOcr {
  const { base, clave } = opciones
  const modelo = exigeModeloPineado(opciones.modelo)
  const pedir = opciones.fetch ?? globalThis.fetch
  const limites: LimitesDelMotor = { ...LIMITES_POR_DEFECTO, ...opciones.limites }
  const espera = opciones.milisegundosDeEspera ?? 120_000

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
              { type: 'text', text: instruccionCon(extra?.esquemaDeAnotacion) },
              {
                type: 'image_url',
                image_url: { url: `data:${tipoMimeDe(documento)};base64,${aBase64(documento)}` },
              },
            ],
          },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }

      const respuesta = await pedir(`${base.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: cabeceras,
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(espera),
      })
      if (!respuesta.ok) {
        // Solo el codigo: el cuerpo de un error puede repetir el documento enviado.
        throw new Error(`el motor respondio ${respuesta.status}`)
      }
      return validaPaginas(contenidoDe((await respuesta.json()) as unknown))
    },
  }
}
