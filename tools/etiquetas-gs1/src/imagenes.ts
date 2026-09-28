/**
 * Preparar las fotos (Node, con `sharp` INYECTADO: el nucleo no decodifica imagenes).
 *
 * - `normaliza`: orienta segun el EXIF y lo QUITA todo (GPS incluido: sharp no copia metadatos
 *   si no se le pide), reduce a 2000 px por lado y re-codifica en JPEG. La huella es la de ESTA
 *   foto, no la del archivo que llego: dos subidas del mismo archivo dan la misma huella.
 * - `miniatura`: 320 px de ancho, para listas y fichas.
 * - `recorta`: la zona de la guia de encuadre (coordenadas 0..1 sobre la foto normalizada), en
 *   PNG para no sumar artefactos de compresion, y ampliada si quedo baja: el motor lee mal
 *   caracteres de menos de ~40 px de alto (medido con las miniaturas del corpus real).
 *
 * La misma funcion la usan la app y el banco de medicion: lo que se mide es lo que se usa.
 */
import { rechazoDeImagen, tipoDeImagen } from './fotos.js'

export interface CanalImagen {
  rotate(): CanalImagen
  resize(o: { width?: number; height?: number; fit?: 'inside'; withoutEnlargement?: boolean; kernel?: 'lanczos3' }): CanalImagen
  extract(o: { left: number; top: number; width: number; height: number }): CanalImagen
  jpeg(o: { quality: number; mozjpeg?: boolean }): CanalImagen
  png(): CanalImagen
  toBuffer(o: { resolveWithObject: true }): Promise<{ data: Uint8Array; info: { width: number; height: number } }>
}

/** Lo que se usa de `sharp`: `(entrada, opciones) => canal`. Se inyecta `sharp` tal cual. */
export type FabricaImagen = (entrada: Uint8Array, opciones?: { failOn?: 'error'; limitInputPixels?: number }) => CanalImagen

export interface FotoNormalizada {
  readonly jpeg: Uint8Array
  readonly ancho: number
  readonly alto: number
  readonly miniatura: Uint8Array
}

/** Rectangulo en fraccion de la foto (0..1): lo que marca la guia de encuadre en pantalla. */
export interface Rectangulo { readonly x: number; readonly y: number; readonly ancho: number; readonly alto: number }

export const LADO_MAXIMO = 2000
export const ALTO_MINIMO_RECORTE = 160
const MAXIMO_PIXELES = 60_000_000

export function preparaImagenes(sharp: FabricaImagen) {
  const abre = (b: Uint8Array) => sharp(b, { failOn: 'error', limitInputPixels: MAXIMO_PIXELES })
  return {
    async normaliza(bytes: Uint8Array): Promise<FotoNormalizada> {
      const rechazo = rechazoDeImagen(bytes)
      if (rechazo) throw new Error(rechazo)
      const r = await abre(bytes).rotate().resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }).toBuffer({ resolveWithObject: true })
      const mini = await abre(r.data).resize({ width: 320, withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toBuffer({ resolveWithObject: true })
      return { jpeg: new Uint8Array(r.data), ancho: r.info.width, alto: r.info.height, miniatura: new Uint8Array(mini.data) }
    },
    async recorta(fotoNormalizada: Uint8Array, zona: Rectangulo, dims: { readonly ancho: number; readonly alto: number }): Promise<Uint8Array> {
      if (!tipoDeImagen(fotoNormalizada)) throw new Error('no es una imagen')
      const px = rectanguloEnPixeles(zona, dims)
      const escala = Math.min(4, Math.max(1, Math.ceil(ALTO_MINIMO_RECORTE / px.height)))
      let canal = abre(fotoNormalizada).extract(px)
      if (escala > 1) canal = canal.resize({ width: px.width * escala, kernel: 'lanczos3' })
      const r = await canal.png().toBuffer({ resolveWithObject: true })
      return new Uint8Array(r.data)
    },
  }
}

/** La zona en pixeles enteros, dentro de la foto y de al menos 8×8. */
export function rectanguloEnPixeles(z: Rectangulo, dims: { readonly ancho: number; readonly alto: number }): { left: number; top: number; width: number; height: number } {
  const acota = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0))
  const left = Math.floor(acota(z.x) * dims.ancho)
  const top = Math.floor(acota(z.y) * dims.alto)
  const width = Math.max(8, Math.min(dims.ancho - left, Math.round(acota(z.ancho) * dims.ancho)))
  const height = Math.max(8, Math.min(dims.alto - top, Math.round(acota(z.alto) * dims.alto)))
  return { left: Math.min(left, dims.ancho - 8), top: Math.min(top, dims.alto - 8), width, height }
}
