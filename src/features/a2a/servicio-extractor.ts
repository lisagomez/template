/**
 * El cliente del servicio OCR, visto desde el puente. Una llamada HTTP y la validacion de la
 * frontera. NO tiene credenciales: el servicio vive en la red interna y el motor es un proceso
 * local. Y un fallo aqui se traduce a una razon en espanol SIN la URL, sin el codigo de red y sin
 * el cuerpo de la respuesta (spec 005 RF-6, RF-7).
 */
import { documentoDelServicio, aResultado, motivoPublico, type ResultadoDeExtraccion } from './esquema.ts'

/** Un fallo de la capacidad, con razon legible y NADA del interior. */
export class FalloDeCapacidad extends Error {
  constructor(razon: string) {
    super(razon)
    this.name = 'FalloDeCapacidad'
  }
}

const BYTES_MAXIMOS = 20 * 1024 * 1024

export interface DocumentoEntrante {
  readonly bytes: Uint8Array
  readonly nombre: string
  readonly tipoMime: string
}

/** Se lee en cada llamada, no al cargar el modulo: asi la prueba de fail-safe apaga la capacidad cambiando el entorno. */
const urlDelServicio = (): string => (process.env.EXTRACTOR_SERVICIO_URL ?? 'http://ocr:8080').replace(/\/$/, '')

/** Lo que la Card declara como entrada, mas octet-stream: ahi el servicio decide por los bytes. */
const TIPOS_ADMITIDOS = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/xml', 'text/xml', 'application/octet-stream'])

export async function extraeConElServicio(documento: DocumentoEntrante, pedir: typeof fetch = fetch): Promise<ResultadoDeExtraccion> {
  if (!TIPOS_ADMITIDOS.has(documento.tipoMime)) throw new FalloDeCapacidad('tipo de documento no admitido: PDF, imagen (png, jpeg, webp) o XML')
  if (documento.bytes.byteLength === 0) throw new FalloDeCapacidad('el documento llego vacio')
  if (documento.bytes.byteLength > BYTES_MAXIMOS) throw new FalloDeCapacidad('el documento supera el tamano maximo admitido')
  let respuesta: Response
  try {
    respuesta = await pedir(`${urlDelServicio()}/extraer`, {
      method: 'POST',
      headers: { 'content-type': documento.tipoMime, 'x-nombre': encodeURIComponent(documento.nombre) },
      // Copia exacta a ArrayBuffer: el tipo Uint8Array<ArrayBufferLike> no entra como BodyInit en TS 5.9.
      body: documento.bytes.slice().buffer,
      signal: AbortSignal.timeout(Number(process.env.EXTRACTOR_ESPERA_MS ?? '300000')),
    })
  } catch {
    throw new FalloDeCapacidad('la capacidad de extraccion no esta disponible ahora mismo')
  }
  if (respuesta.status === 413) throw new FalloDeCapacidad('el documento supera el tamano maximo admitido')
  if (!respuesta.ok) throw new FalloDeCapacidad('la capacidad de extraccion no pudo leer el documento')
  let crudo: unknown
  try {
    crudo = await respuesta.json()
  } catch {
    throw new FalloDeCapacidad('la capacidad de extraccion devolvio una respuesta ilegible')
  }
  const documentoLeido = typeof crudo === 'object' && crudo !== null && 'documento' in crudo ? (crudo as { documento: unknown }).documento : undefined
  const validado = documentoDelServicio.safeParse(documentoLeido)
  if (!validado.success) throw new FalloDeCapacidad('la capacidad de extraccion devolvio una respuesta que no encaja en el contrato')
  if (validado.data.ruta === 'ninguna') throw new FalloDeCapacidad(motivoPublico(validado.data.motivo, 'ninguna'))
  return aResultado(validado.data)
}
