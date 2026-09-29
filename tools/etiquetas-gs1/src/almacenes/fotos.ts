/**
 * Fotos en una carpeta (Node): un archivo por huella, `<carpeta>/<2 primeras cifras>/<hex>.<ext>`.
 * Guardar es idempotente (misma foto, misma huella, mismo archivo) y atomico (temporal + rename).
 * Solo se leen huellas bien formadas: una ruta con `..` nunca llega al disco.
 *
 * Las rutas llevan `turbopackIgnore`: la carpeta se decide en tiempo de ejecucion y, sin la marca,
 * el empaquetador de Next rastrea el disco entero como assets (aprendizaje del 2026-09-20).
 *
 * Retencion (`poda`): borra lo que ya NADIE referencia (ni una ficha de articulo ni un evento de
 * la cadena) y es mas viejo que la fecha dada. La evidencia de la cadena no se poda mientras el
 * evento exista: la foto de una recepcion vive lo que vive el expediente.
 */
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { huellaDeBytes, tipoDeImagen, type AlmacenFotos, type TipoImagen } from '../fotos.js'

const EXT: Readonly<Record<TipoImagen, string>> = { jpeg: 'jpg', png: 'png', webp: 'webp' }
const hexDe = (huella: string): string | undefined => /^sha256:([0-9a-f]{64})$/.exec(huella)?.[1]

export function fotosEnCarpeta(carpeta: string): AlmacenFotos {
  const ruta = (hex: string, tipo: TipoImagen) => join(/*turbopackIgnore: true*/ carpeta, hex.slice(0, 2), `${hex}.${EXT[tipo]}`)
  return {
    async guarda(bytes, tipo) {
      if (tipoDeImagen(bytes) !== tipo) throw new Error('el contenido no es del tipo declarado')
      const huella = huellaDeBytes(bytes)
      const destino = ruta(hexDe(huella)!, tipo)
      try { await stat(/*turbopackIgnore: true*/ destino); return huella } catch { /* no existe: se escribe */ }
      await mkdir(join(/*turbopackIgnore: true*/ carpeta, huella.slice(7, 9)), { recursive: true })
      const temporal = `${destino}.${randomBytes(6).toString('hex')}.tmp`
      await writeFile(/*turbopackIgnore: true*/ temporal, bytes, { mode: 0o600 })
      await rename(/*turbopackIgnore: true*/ temporal, destino)
      return huella
    },
    async lee(huella) {
      const hex = hexDe(huella)
      if (!hex) return undefined
      for (const tipo of ['jpeg', 'png', 'webp'] as const) {
        try {
          const bytes = new Uint8Array(await readFile(/*turbopackIgnore: true*/ ruta(hex, tipo)))
          return huellaDeBytes(bytes) === huella ? { bytes, tipo } : undefined
        } catch { /* probar la siguiente extension */ }
      }
      return undefined
    },
    async poda(vivas, antesDe) {
      let n = 0
      for (const sub of await readdir(/*turbopackIgnore: true*/ carpeta).catch(() => [] as string[])) {
        for (const nombre of await readdir(join(/*turbopackIgnore: true*/ carpeta, sub)).catch(() => [] as string[])) {
          const hex = /^([0-9a-f]{64})\.(jpg|png|webp)$/.exec(nombre)?.[1]
          if (!hex || vivas.has(`sha256:${hex}`)) continue
          const archivo = join(/*turbopackIgnore: true*/ carpeta, sub, nombre)
          if ((await stat(/*turbopackIgnore: true*/ archivo)).mtime < antesDe) { await rm(/*turbopackIgnore: true*/ archivo); n++ }
        }
      }
      return n
    },
  }
}
