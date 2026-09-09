/**
 * Adaptador de `AlmacenDeOriginales` sobre Supabase Storage (TAR-43).
 *
 * El original es la EVIDENCIA: lo que permite auditar de donde salio un dato seis meses despues.
 * Dos decisiones que no son de comodidad:
 *
 * 1. **El bucket es privado y la lectura va por URL firmada con caducidad.** Un bucket publico con
 *    facturas dentro es una fuga con enlace permanente, y no hace falta que nadie lo ataque: basta
 *    con que una URL acabe en un correo reenviado.
 * 2. **`borra()` solo se llama explicitamente.** Vencer la retencion NO borra nada por su cuenta
 *    (RF-63): produce una lista de candidatos que una persona confirma. Un borrado automatico por
 *    fecha es irreversible y se dispara sin que nadie mire.
 *
 * Ojo con el respaldo, que esta escrito en el puerto y se repite aqui porque es donde muerde: los
 * bytes viven FUERA de Postgres, asi que `pg_dump` no los incluye. Un respaldo de base en verde
 * deja fuera todas las evidencias — y eso es peor que no tenerlas respaldadas, porque parece que
 * estan (§2.15 del SDD, TAR-44).
 *
 * Como los demas adaptadores, el cliente entra INYECTADO: cero dependencias, y este codigo no
 * puede fabricarse una llave con mas privilegio del que le den (C7).
 */
import type { AlmacenDeOriginales } from '../puertos.js'

export interface RespuestaStorage {
  data: unknown
  error: { message: string } | null
}

/** La forma minima del cliente de Storage que este adaptador usa. */
export interface ClienteStorage {
  storage: {
    from(bucket: string): {
      upload(ruta: string, contenido: Uint8Array, opciones?: { contentType?: string; upsert?: boolean }): PromiseLike<RespuestaStorage>
      createSignedUrl(ruta: string, segundos: number): PromiseLike<RespuestaStorage>
      remove(rutas: string[]): PromiseLike<RespuestaStorage>
    }
  }
}

export interface OpcionesDeOriginales {
  cliente: ClienteStorage
  /** Por defecto `originales`, que es el que crea la migracion como PRIVADO. */
  bucket?: string
  /** Tope de caducidad de una URL firmada. Una URL sin caducar es un bucket publico con pasos. */
  segundosMaximos?: number
}

/** Una hora. Suficiente para revisar un documento, corto para que un reenvio no sirva de mucho. */
const CADUCIDAD_MAXIMA_POR_DEFECTO = 3600

export function almacenDeOriginales(opciones: OpcionesDeOriginales): AlmacenDeOriginales {
  const bucket = opciones.bucket ?? 'originales'
  const tope = opciones.segundosMaximos ?? CADUCIDAD_MAXIMA_POR_DEFECTO
  const almacen = () => opciones.cliente.storage.from(bucket)

  return {
    async guarda(ruta: string, contenido: Uint8Array, tipoMime: string): Promise<void> {
      // `upsert: false` a proposito: la ruta lleva la identidad por contenido, asi que dos subidas
      // a la misma ruta son el mismo fichero. Sobrescribir solo podria empeorarlo.
      const { error } = await almacen().upload(ruta, contenido, { contentType: tipoMime, upsert: false })
      if (error !== null) throw new Error(`no se pudo guardar el original en ${ruta}: ${error.message}`)
    },

    async urlFirmada(ruta: string, segundos: number): Promise<string> {
      if (segundos <= 0) throw new RangeError('la caducidad tiene que ser positiva')
      // Se acota en vez de obedecer: quien pida 30 dias probablemente no ha pensado en que una
      // URL firmada larga circula por correo y sobrevive al permiso que la justifico.
      const caducidad = Math.min(segundos, tope)
      const { data, error } = await almacen().createSignedUrl(ruta, caducidad)
      if (error !== null) throw new Error(`no se pudo firmar ${ruta}: ${error.message}`)
      const url = typeof data === 'object' && data !== null ? (data as Record<string, unknown>).signedUrl : null
      if (typeof url !== 'string' || url.length === 0) {
        throw new Error(`Storage no devolvio una URL firmada para ${ruta}`)
      }
      return url
    },

    async borra(ruta: string): Promise<void> {
      const { error } = await almacen().remove([ruta])
      if (error !== null) throw new Error(`no se pudo borrar ${ruta}: ${error.message}`)
    },
  }
}
