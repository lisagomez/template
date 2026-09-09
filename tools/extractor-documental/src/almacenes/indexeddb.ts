/**
 * Adaptador de `AlmacenLocal` sobre IndexedDB (TAR-33). Es lo que sostiene la cola sin conexion.
 *
 * POR QUE INDEXEDDB Y NO `localStorage`: `localStorage` es sincrono —bloquea el hilo de la UI
 * justo cuando el operario esta escaneando en rafaga— y tiene un tope de unos 5 MB compartido con
 * todo lo demas del origen. Una jornada de lecturas sin cobertura lo desborda, y desbordarlo lanza
 * una excepcion **al escribir**: se pierde la lectura que se acaba de hacer, que es la peor de
 * todas porque es la unica que el operario cree tener.
 *
 * LO QUE ESTE ADAPTADOR NO PUEDE ARREGLAR, y por eso lo dice en vez de callarlo: el navegador
 * **puede purgar** el almacenamiento de un sitio no instalado cuando le falta espacio, sin avisar
 * y sin preguntar. `estimaPurga()` existe para que la app avise ANTES (§2.13, RF-53), no para
 * prevenirlo — prevenirlo no esta en manos de este codigo. La PWA instalada es lo que cambia esa
 * politica, y por eso el aviso empuja a instalarla.
 *
 * Cero dependencias: IndexedDB es API del navegador. `pruebas/indexeddb.ts` lo ejercita con una
 * implementacion de mentira que respeta la misma forma, asi que la logica se prueba sin navegador
 * — que es la condicion que el resto del paquete cumple y esta no iba a romper.
 */
import type { AlmacenLocal, EntradaEnCola } from '../cola.js'

/**
 * La forma MINIMA de IndexedDB que este adaptador usa. Se declara entera —en vez de tirar de
 * `lib.dom`— por dos motivos: se ve el alcance de un vistazo, y se puede inyectar una
 * implementacion de mentira en las pruebas sin montar un navegador.
 */
export interface PeticionIdb<T> {
  result: T
  error: { message: string } | null
  onsuccess: (() => void) | null
  onerror: (() => void) | null
}

export interface AlmacenIdb {
  put(valor: unknown): PeticionIdb<unknown>
  get(clave: string): PeticionIdb<unknown>
  getAll(): PeticionIdb<unknown[]>
  count(): PeticionIdb<number>
}

export interface TransaccionIdb {
  objectStore(nombre: string): AlmacenIdb
}

export interface BaseIdb {
  transaction(nombre: string, modo: 'readonly' | 'readwrite'): TransaccionIdb
}

export interface OpcionesDeCola {
  base: BaseIdb
  /** Nombre del object store. Por defecto `cola_de_lecturas`. */
  almacen?: string
  /**
   * `navigator.storage.estimate` y `persisted`, inyectables. Ausentes en Safari viejo y en
   * cualquier contexto no seguro, y ahi la respuesta honrada es «no se sabe», no «todo bien».
   */
  estimacion?: () => Promise<{ usage?: number; quota?: number }>
  persistido?: () => Promise<boolean>
}

/** Envuelve una peticion de IndexedDB en una promesa. Es todo el pegamento que hace falta. */
function promesa<T>(peticion: PeticionIdb<T>): Promise<T> {
  return new Promise<T>((resuelve, rechaza) => {
    peticion.onsuccess = () => resuelve(peticion.result)
    peticion.onerror = () => rechaza(new Error(peticion.error?.message ?? 'IndexedDB fallo sin mensaje'))
  })
}

/**
 * Valida una entrada leida del almacen local.
 *
 * No es paranoia sobre datos propios: lo que hay en IndexedDB lo escribio una version anterior de
 * la app que quiza no se ha recargado, y devolver una entrada a medias hace que la cola intente
 * enviar algo que el servidor rechazara para siempre. Una entrada irreconocible se DESCARTA de la
 * lista, no se repara a medias.
 */
export function validaEntrada(crudo: unknown): EntradaEnCola | null {
  if (typeof crudo !== 'object' || crudo === null) return null
  const e = crudo as Record<string, unknown>
  if (typeof e.id !== 'string' || e.id.length === 0) return null
  if (typeof e.estado !== 'string') return null
  if (typeof e.intentos !== 'number' || !Number.isInteger(e.intentos) || e.intentos < 0) return null
  if (typeof e.lectura !== 'object' || e.lectura === null) return null
  const instante = e.instanteServidor
  if (instante !== null && typeof instante !== 'string') return null
  return crudo as unknown as EntradaEnCola
}

export interface RiesgoDePurga {
  /** `null` cuando el navegador no sabe decirlo. NUNCA se rellena con un cero optimista. */
  usadoBytes: number | null
  cuotaBytes: number | null
  /** `true` si el navegador prometio no purgar. `false` es lo normal sin instalar la app. */
  persistido: boolean
  /** Lo que hay que enseñar. Cuando no se sabe, se dice que no se sabe. */
  mensaje: string
}

export function almacenDeCola(opciones: OpcionesDeCola): AlmacenLocal & { estimaPurga(): Promise<RiesgoDePurga> } {
  const nombre = opciones.almacen ?? 'cola_de_lecturas'
  const store = (modo: 'readonly' | 'readwrite') => opciones.base.transaction(nombre, modo).objectStore(nombre)

  return {
    async guarda(entrada: EntradaEnCola): Promise<void> {
      await promesa(store('readwrite').put(entrada))
    },

    async lee(id: string): Promise<EntradaEnCola | null> {
      const crudo = await promesa(store('readonly').get(id))
      return crudo === undefined || crudo === null ? null : validaEntrada(crudo)
    },

    async listaPendientes(): Promise<readonly EntradaEnCola[]> {
      const todas = await promesa(store('readonly').getAll())
      return todas
        .map(validaEntrada)
        .filter((e): e is EntradaEnCola => e !== null && e.estado !== 'sincronizada')
    },

    async cuenta(): Promise<number> {
      return promesa(store('readonly').count())
    },

    /**
     * Estima el riesgo de purga. Devuelve `null` en las cifras cuando el navegador no las da, y
     * lo DICE en el mensaje: un cero inventado aqui se leeria como «hay sitio de sobra», que es
     * exactamente la conclusion contraria a la verdadera.
     */
    async estimaPurga(): Promise<RiesgoDePurga> {
      const persistido = opciones.persistido ? await opciones.persistido().catch(() => false) : false
      const vacia: { usage?: number; quota?: number } = {}
      const medida: { usage?: number; quota?: number } = opciones.estimacion
        ? await opciones.estimacion().catch(() => vacia)
        : vacia
      const usadoBytes = typeof medida.usage === 'number' ? medida.usage : null
      const cuotaBytes = typeof medida.quota === 'number' ? medida.quota : null

      if (persistido) {
        return { usadoBytes, cuotaBytes, persistido, mensaje: 'El almacenamiento es persistente: el navegador no lo purgara.' }
      }
      if (usadoBytes === null || cuotaBytes === null || cuotaBytes === 0) {
        return {
          usadoBytes,
          cuotaBytes,
          persistido,
          mensaje: 'No se puede saber cuanto espacio queda en este navegador. Instala la aplicacion para que la cola no se pueda purgar.',
        }
      }
      const porcentaje = Math.round((usadoBytes / cuotaBytes) * 100)
      return {
        usadoBytes,
        cuotaBytes,
        persistido,
        mensaje: `Almacenamiento al ${porcentaje} % y sin instalar: el navegador puede borrar la cola para hacer sitio.`,
      }
    },
  }
}
