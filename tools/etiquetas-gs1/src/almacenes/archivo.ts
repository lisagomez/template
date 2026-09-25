/**
 * Almacen en un archivo JSON (Node). Para una instalacion local o de sitio: sin base de datos.
 *
 * Escritura atomica (archivo temporal + rename en el mismo directorio) y transacciones
 * serializadas dentro del proceso: un corte a media escritura deja el archivo anterior entero,
 * nunca uno a medias. NO es para varios procesos escribiendo a la vez: para eso esta la
 * propuesta de tablas (`migraciones/`).
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { estadoVacio, type AlmacenEtiquetas } from '../almacen.js'
import type { EstadoAlmacen } from '../modelo.js'

export function almacenEnArchivo(ruta: string, inicial: () => EstadoAlmacen = () => estadoVacio()): AlmacenEtiquetas {
  let cola: Promise<unknown> = Promise.resolve()

  const carga = async (): Promise<EstadoAlmacen> => {
    try {
      return JSON.parse(await readFile(ruta, 'utf8')) as EstadoAlmacen
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return inicial()
      throw e
    }
  }

  const guarda = async (estado: EstadoAlmacen): Promise<void> => {
    await mkdir(dirname(ruta), { recursive: true })
    const temporal = join(dirname(ruta), `.${randomBytes(6).toString('hex')}.tmp`)
    await writeFile(temporal, JSON.stringify(estado, null, 1), { mode: 0o600 })
    await rename(temporal, ruta)
  }

  return {
    async lee() { await cola; return carga() },
    transaccion(cambia) {
      const paso = cola.then(async () => {
        const r = cambia(await carga())
        await guarda(r.estado)
        return r.resultado
      })
      cola = paso.catch(() => undefined)
      return paso
    },
  }
}
