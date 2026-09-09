/**
 * Adaptador de `MotorOcr` contra un servidor con API compatible con OpenAI.
 *
 * El caso de uso real: un vLLM autohospedado sirviendo PaddleOCR-VL o GLM-OCR. Habla por `fetch`
 * y no declara ni una dependencia — es el unico adaptador de motor que puede decir eso, y por eso
 * es el que permite montar la herramienta sin que el documento salga del perimetro.
 *
 * TRES REGLAS DE LA CASA QUE ESTE ARCHIVO TIENE QUE HONRAR, Y COMO:
 *
 * 1. **El modelo va PINEADO (C1).** `latest` y cualquier alias autoactualizable se rechazan al
 *    construir, no al usar: un motor que cambia de version sin diff cambia el comportamiento de
 *    todo lo que la herramienta extrae, y eso es exactamente un CDC sin gate.
 * 2. **La salida del modelo NO se confia.** Lo que vuelve se valida campo a campo antes de
 *    devolverlo. Un `confianza: "alta"` en texto, o una region sin `pagina`, se rechazan aqui y no
 *    doscientas lineas mas adelante, donde ya nadie sabe de donde salio.
 * 3. **Los secretos no se imprimen.** La clave no aparece en ningun mensaje de error, ni
 *    enmascarada: no se la menciona. Y el cuerpo de la respuesta tampoco se vuelca entero en el
 *    error, porque lleva el contenido del documento — que es justo el dato que se protege.
 *
 * SOBRE C4, y esto no es un detalle de implementacion: usar este adaptador contra un servidor
 * ajeno saca el documento del perimetro igual que una API comercial. «Autohospedado» describe
 * quien corre los pesos, no por donde viaja el byte. La decision de flujo de datos es del
 * proyecto que lo configura, no de la herramienta.
 */
import type { PaginaExtraida, CampoExtraido, LimitesDelMotor, Region } from '../tipos.js'
import type { MotorOcr, OpcionesDeExtraccion } from '../puertos.js'

/** Alias que se actualizan solos. Fijar el modelo es la mitad del control C1. */
const ALIAS_PROHIBIDOS = /(^|[-:@/])(latest|stable|current|default|head)$/i

export interface OpcionesDelMotorCompatible {
  /** Raiz del servidor, por ejemplo `http://localhost:8000/v1`. Sin barra final. */
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

function aBase64(bytes: Uint8Array): string {
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  return btoa(binario)
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/**
 * Valida una region. `pagina`, `x`, `y`, `ancho` y `alto` obligatorios y normalizados a [0,1].
 *
 * Una region fuera de rango no se recorta en silencio: se descarta el campo. Recortarla daria una
 * cita que apunta a un sitio que no es de donde salio el dato, que es peor que no citar nada.
 */
function validaRegion(crudo: unknown): Region | undefined {
  if (!esObjeto(crudo)) return undefined
  const { pagina, x, y, ancho, alto } = crudo
  const enRango = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1
  if (typeof pagina !== 'number' || !Number.isInteger(pagina) || pagina < 0) return undefined
  if (!enRango(x) || !enRango(y) || !enRango(ancho) || !enRango(alto)) return undefined
  return { pagina, x, y, ancho, alto }
}

function validaCampo(crudo: unknown): CampoExtraido | null {
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
 * Se exporta para poder probarla sola: es la barrera que separa «el modelo dijo algo» de «esto es
 * un dato». Los campos invalidos se descartan uno a uno; una pagina sin `markdown` utilizable
 * invalida la respuesta completa, porque a esas alturas ya no se sabe que se esta leyendo.
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

const INSTRUCCION =
  'Extrae el contenido del documento. Responde SOLO con JSON: ' +
  '{"paginas":[{"indice":0,"markdown":"...","campos":[{"clave":"...","valor":"...",' +
  '"confianza":0.0,"region":{"pagina":0,"x":0,"y":0,"ancho":0,"alto":0}}]}]}. ' +
  'La confianza es un numero entre 0 y 1. Las coordenadas van normalizadas entre 0 y 1.'

export function motorCompatible(opciones: OpcionesDelMotorCompatible): MotorOcr {
  const { base, modelo, clave } = opciones
  if (modelo.trim().length === 0) throw new Error('el modelo es obligatorio y va pineado (C1)')
  if (ALIAS_PROHIBIDOS.test(modelo)) {
    throw new Error(
      `modelo "${modelo}": los alias autoactualizables estan prohibidos (C1). Pinea la version exacta.`,
    )
  }
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

      const instruccion =
        extra?.esquemaDeAnotacion === undefined
          ? INSTRUCCION
          : `${INSTRUCCION} Ajusta \`campos\` a este esquema: ${JSON.stringify(extra.esquemaDeAnotacion)}`

      const cuerpo = {
        model: modelo,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: instruccion },
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

      const corte = AbortSignal.timeout(espera)
      const respuesta = await pedir(`${base.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: cabeceras,
        body: JSON.stringify(cuerpo),
        signal: corte,
      })
      if (!respuesta.ok) {
        // Solo el codigo: el cuerpo de un error puede repetir el documento enviado.
        throw new Error(`el motor respondio ${respuesta.status}`)
      }
      return validaPaginas(contenidoDe((await respuesta.json()) as unknown))
    },
  }
}
