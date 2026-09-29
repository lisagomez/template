/**
 * Fotos: el nucleo no decodifica imagenes (eso lo hace el adaptador que normaliza, fuera del
 * nucleo). Aqui vive lo que se puede decidir con los BYTES, sin dependencias:
 *
 * - que es: JPEG, PNG o WebP por su firma. Un SVG no es una foto: es un documento con scripts,
 *   y servirlo como imagen es una puerta a XSS. Lo que no tenga firma de imagen se rechaza, diga
 *   lo que diga su nombre o su Content-Type.
 * - si un JPEG todavia trae EXIF, y si trae GPS: la prueba de que la normalizacion lo quito.
 * - su huella: SHA-256 del contenido. La misma foto no se guarda dos veces, y la cadena la cita.
 *
 * El almacen de fotos se INYECTA, como el de etiquetas: archivos por huella, o la tabla del ERP.
 */
import { comoHash, sha256 } from './sha256.js'

export type TipoImagen = 'jpeg' | 'png' | 'webp'

export const CONTENT_TYPE: Readonly<Record<TipoImagen, string>> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

/** El tipo por la firma de los primeros bytes; `undefined` si no es una de las tres. */
export function tipoDeImagen(b: Uint8Array): TipoImagen | undefined {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return 'png'
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'webp'
  return undefined
}

const ascii = (b: Uint8Array, i: number, f: number) => String.fromCharCode(...b.subarray(i, f))

/** Por que no se acepta, en lenguaje llano; `undefined` si es una imagen aceptable. */
export function rechazoDeImagen(b: Uint8Array, maximoBytes = 15 * 1024 * 1024): string | undefined {
  if (b.length === 0) return 'llegó vacía'
  if (b.length > maximoBytes) return `pesa ${(b.length / 1048576).toFixed(1)} MB y el máximo es ${Math.round(maximoBytes / 1048576)} MB`
  const cabeza = ascii(b, 0, Math.min(b.length, 256)).trimStart().toLowerCase()
  if (cabeza.startsWith('<svg') || cabeza.startsWith('<?xml') || cabeza.includes('<svg')) return 'es un SVG: un SVG no es una foto (puede llevar scripts) y no se acepta'
  if (!tipoDeImagen(b)) return 'no es una foto JPEG, PNG ni WebP'
  return undefined
}

/** Segmentos de un JPEG hasta el inicio de la imagen (SOS): marcador y contenido. */
function segmentosJpeg(b: Uint8Array): { marcador: number; datos: Uint8Array }[] {
  const s: { marcador: number; datos: Uint8Array }[] = []
  let i = 2
  while (i + 4 <= b.length && b[i] === 0xff) {
    const marcador = b[i + 1]!
    if (marcador === 0xda || marcador === 0xd9) break
    const largo = (b[i + 2]! << 8) | b[i + 3]!
    s.push({ marcador, datos: b.subarray(i + 4, i + 2 + largo) })
    i += 2 + largo
  }
  return s
}

/** ¿El JPEG trae un bloque EXIF (APP1 «Exif\0\0»)? ¿Y dentro, el puntero al GPS (etiqueta 0x8825)? */
export function metadatosDeJpeg(b: Uint8Array): { exif: boolean; gps: boolean } {
  if (tipoDeImagen(b) !== 'jpeg') return { exif: false, gps: false }
  const app1 = segmentosJpeg(b).filter((x) => x.marcador === 0xe1 && ascii(x.datos, 0, 6) === 'Exif\0\0')
  if (app1.length === 0) return { exif: false, gps: false }
  const gps = app1.some((x) => {
    for (let i = 6; i + 1 < x.datos.length; i++) {
      if ((x.datos[i] === 0x88 && x.datos[i + 1] === 0x25) || (x.datos[i] === 0x25 && x.datos[i + 1] === 0x88)) return true
    }
    return false
  })
  return { exif: true, gps }
}

/** `sha256:<hex>` del contenido. */
export const huellaDeBytes = (b: Uint8Array): string => comoHash(sha256(b))

/** Donde viven las fotos. Guardar es idempotente: la misma foto da la misma huella. */
export interface AlmacenFotos {
  guarda(bytes: Uint8Array, tipo: TipoImagen): Promise<string>
  lee(huella: string): Promise<{ readonly bytes: Uint8Array; readonly tipo: TipoImagen } | undefined>
  /** Borra las que ya nadie referencia (retencion). Devuelve cuantas borro. */
  poda?(vivas: ReadonlySet<string>, antesDe: Date): Promise<number>
}

/** Almacen en memoria (pruebas). */
export function fotosEnMemoria(): AlmacenFotos & { readonly tamano: () => number } {
  const m = new Map<string, { bytes: Uint8Array; tipo: TipoImagen }>()
  return {
    async guarda(bytes, tipo) { const h = huellaDeBytes(bytes); m.set(h, { bytes, tipo }); return h },
    async lee(h) { return m.get(h) },
    tamano: () => m.size,
  }
}
