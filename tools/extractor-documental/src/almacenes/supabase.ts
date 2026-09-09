/**
 * Adaptador de `AlmacenDocumentos` y `AlmacenPlantillas` sobre Supabase (TAR-14).
 *
 * NO importa `@supabase/supabase-js`, y no es descuido: el cliente entra INYECTADO con la forma
 * minima que este adaptador usa, declarada abajo. Tres cosas se ganan con eso, y la tercera es la
 * que decide:
 *   1. El paquete sigue con cero dependencias, asi que el subpath se importa en un proyecto limpio
 *      (que es lo que mide `npm run empaqueta`).
 *   2. La version del SDK la pinea el proyecto que instala, no la herramienta.
 *   3. **El adaptador no puede fabricarse un cliente con `service_role` aunque quisiera.** Recibe
 *      el que le den. La eleccion de con que llave se opera es del proyecto, y eso es exactamente
 *      lo que C7 pide: la superficie de negocio usa el cliente autenticado del usuario, y el
 *      aislamiento lo deciden las policies, no el codigo de esta herramienta.
 *
 * El esquema lo aporta `migraciones/001-extractor-documental.sql`, que viaja en el paquete. Las
 * listas de valores permitidas de este archivo son **espejo exacto** de los `CHECK` de esa
 * migracion, y `pruebas/persistencia.ts` falla si divergen: una lista copiada a mano diverge sola.
 */
import type { PaginaExtraida } from '../tipos.js'
import type { AlmacenDocumentos, AlmacenPlantillas } from '../puertos.js'

/** Respuesta de PostgREST. `data` y `error` nunca vienen los dos a la vez. */
export interface RespuestaSupabase {
  data: unknown
  error: { message: string } | null
}

/**
 * La forma MINIMA del cliente que este adaptador usa. Se declara entera para que se vea el
 * alcance: no hay `rpc`, no hay `auth.admin`, no hay nada con privilegio.
 */
export interface ConsultaSupabase extends PromiseLike<RespuestaSupabase> {
  select(columnas?: string): ConsultaSupabase
  insert(filas: unknown): ConsultaSupabase
  upsert(filas: unknown, opciones?: { onConflict?: string }): ConsultaSupabase
  eq(columna: string, valor: string): ConsultaSupabase
  order(columna: string, opciones?: { ascending?: boolean }): ConsultaSupabase
  maybeSingle(): PromiseLike<RespuestaSupabase>
}

export interface ClienteSupabase {
  from(tabla: string): ConsultaSupabase
}

// --- Espejos de los CHECK de la migracion -------------------------------------------------------
// Cambiar uno sin cambiar el otro rompe `pruebas/persistencia.ts`, que es el punto.

export const ESTADOS_EN_BASE = [
  'pendiente',
  'en_cola',
  'procesando',
  'extraido',
  'en_revision',
  'revision_humana',
  'validado',
  'rechazado',
  'fallido',
] as const

export const CLASES_EN_BASE = ['documento', 'etiqueta', 'evento'] as const
export const ROLES_EN_BASE = ['operario', 'revisor', 'consulta'] as const
export const TIPOS_DE_TRABAJO_EN_BASE = ['facturas', 'inventario', 'trazabilidad'] as const
export const ESTADOS_DE_LOTE_EN_BASE = ['abierto', 'cerrado'] as const

export interface OpcionesDelAlmacen {
  cliente: ClienteSupabase
  /** Toda fila se acota a una organizacion: es la unidad de aislamiento (§2.16). */
  organizacionId: string
}

function exigeSinError(respuesta: RespuestaSupabase, que: string): unknown {
  if (respuesta.error !== null) throw new Error(`${que}: ${respuesta.error.message}`)
  return respuesta.data
}

/**
 * Valida lo que vuelve de la base antes de devolverlo.
 *
 * Parece paranoia sobre datos propios y no lo es: la columna es `jsonb`, asi que la base acepta
 * cualquier forma. Lo que hay dentro lo escribio una version anterior de esta herramienta, y
 * confiar en que coincide con la de hoy es como se leen campos que ya no existen.
 */
export function validaPaginasGuardadas(crudo: unknown): PaginaExtraida[] {
  if (!Array.isArray(crudo)) return []
  const salida: PaginaExtraida[] = []
  for (const pagina of crudo) {
    if (typeof pagina !== 'object' || pagina === null) continue
    const p = pagina as Record<string, unknown>
    if (typeof p.markdown !== 'string') continue
    salida.push({
      indice: typeof p.indice === 'number' ? p.indice : salida.length,
      markdown: p.markdown,
      campos: Array.isArray(p.campos) ? (p.campos as PaginaExtraida['campos']) : [],
    })
  }
  return salida
}

export function almacenDeDocumentos(opciones: OpcionesDelAlmacen): AlmacenDocumentos {
  const { cliente, organizacionId } = opciones
  return {
    async guarda(id: string, paginas: readonly PaginaExtraida[]): Promise<void> {
      const respuesta = await cliente.from('documentos').upsert(
        { identidad: id, organizacion_id: organizacionId, paginas, clase_de_fuente: 'documento' },
        { onConflict: 'organizacion_id,identidad,clase_de_fuente' },
      )
      exigeSinError(respuesta, `no se pudo guardar el documento ${id}`)
    },

    async lee(id: string): Promise<PaginaExtraida[] | null> {
      const respuesta = await cliente
        .from('documentos')
        .select('paginas')
        .eq('organizacion_id', organizacionId)
        .eq('identidad', id)
        .maybeSingle()
      const fila = exigeSinError(respuesta, `no se pudo leer el documento ${id}`)
      if (fila === null || typeof fila !== 'object') return null
      return validaPaginasGuardadas((fila as Record<string, unknown>).paginas)
    },

    async lista(): Promise<readonly string[]> {
      const respuesta = await cliente
        .from('documentos')
        .select('identidad')
        .eq('organizacion_id', organizacionId)
        .order('creado_en', { ascending: false })
      const filas = exigeSinError(respuesta, 'no se pudieron listar los documentos')
      if (!Array.isArray(filas)) return []
      return filas
        .map((f) => (typeof f === 'object' && f !== null ? (f as Record<string, unknown>).identidad : null))
        .filter((v): v is string => typeof v === 'string')
    },
  }
}

export function almacenDePlantillas(opciones: OpcionesDelAlmacen): AlmacenPlantillas {
  const { cliente, organizacionId } = opciones
  return {
    async guardaPorDefecto(tipoDocumento: string, plantilla: unknown): Promise<void> {
      const respuesta = await cliente.from('plantillas').upsert(
        { organizacion_id: organizacionId, tipo_documento: tipoDocumento, plantilla },
        { onConflict: 'organizacion_id,tipo_documento' },
      )
      exigeSinError(respuesta, `no se pudo guardar la plantilla de ${tipoDocumento}`)
    },

    async leePorDefecto(tipoDocumento: string): Promise<unknown | null> {
      const respuesta = await cliente
        .from('plantillas')
        .select('plantilla')
        .eq('organizacion_id', organizacionId)
        .eq('tipo_documento', tipoDocumento)
        .maybeSingle()
      const fila = exigeSinError(respuesta, `no se pudo leer la plantilla de ${tipoDocumento}`)
      if (fila === null || typeof fila !== 'object') return null
      return (fila as Record<string, unknown>).plantilla ?? null
    },
  }
}
