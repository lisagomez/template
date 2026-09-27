/**
 * El central de anclas en un archivo JSON (Node). En una instalacion real vive en OTRA maquina:
 * la sucursal no tiene permiso de escritura sobre el; solo le envia anclas y testigos, y el
 * central decide si los acepta. Aqui es un archivo aparte del almacen del sitio, con la misma
 * escritura atomica.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { centralVacio, type EstadoCentral } from '../central.js'

export interface AlmacenCentral {
  lee(): Promise<EstadoCentral>
  transaccion<T>(cambia: (c: EstadoCentral) => { central: EstadoCentral; resultado: T }): Promise<T>
}

export function centralEnArchivo(ruta: string): AlmacenCentral {
  let cola: Promise<unknown> = Promise.resolve()
  const carga = async (): Promise<EstadoCentral> => {
    try {
      const c = JSON.parse(await readFile(ruta, 'utf8')) as EstadoCentral
      return { ...centralVacio(), ...c }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return centralVacio()
      throw e
    }
  }
  const guarda = async (c: EstadoCentral): Promise<void> => {
    await mkdir(dirname(ruta), { recursive: true })
    const temporal = join(dirname(ruta), `.${randomBytes(6).toString('hex')}.tmp`)
    await writeFile(temporal, JSON.stringify(c, null, 1), { mode: 0o600 })
    await rename(temporal, ruta)
  }
  return {
    async lee() { await cola; return carga() },
    transaccion(cambia) {
      const paso = cola.then(async () => {
        const r = cambia(await carga())
        await guarda(r.central)
        return r.resultado
      })
      cola = paso.catch(() => undefined)
      return paso
    },
  }
}
