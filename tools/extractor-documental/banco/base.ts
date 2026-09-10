/**
 * La base embebida del banco: apertura, esquema y cierre.
 *
 * POR QUE `node:sqlite` Y NO OTRA COSA. La propiedad que este paquete tiene hoy y que conviene no
 * perder es que **corre sin nada instalado**: `tools/extractor-documental/node_modules` no existe y
 * las pruebas pasan igual, sin red y sin compilador. `node:sqlite` viene dentro de Node 22.18+, asi
 * que el banco hereda esa propiedad entera.
 *
 * La alternativa seria era PGlite —Postgres compilado a WASM—, y el argumento a su favor parecia
 * fuerte: produccion es Supabase, o sea Postgres. Al leer `src/almacenes/supabase.ts` resulta que
 * ese argumento no aplica al camino que este banco ejercita: **el adaptador no escribe SQL**, habla
 * PostgREST (`.from().upsert().eq()`). El dialecto de Postgres solo vive en la migracion, que es
 * otro artefacto y otro objetivo. A cambio, PGlite obligaria a un `npm install` con varios MB de
 * WASM en un directorio que hoy no tiene ningun `node_modules`, y las pruebas dejarian de correr
 * en un contenedor aislado.
 *
 * Lo que PGlite SI desbloquearia, y queda anotado como trabajo aparte: ejecutar por primera vez las
 * policies de RLS de la migracion, que hoy estan escritas y no se han corrido nunca.
 *
 * Sobre el `ExperimentalWarning` que Node emite al importar `node:sqlite`: **no se silencia**.
 * Apagarlo con `--no-warnings` apagaria tambien los que avisan de algo que importa, y un aviso
 * cierto es informacion. Que salga.
 */
import { DatabaseSync } from 'node:sqlite'
import { DDL_HERRAMIENTA, DDL_NEGOCIO } from './esquema.ts'

export interface Base {
  /** La conexion cruda, para los adaptadores. */
  db: DatabaseSync
  /** Ruta en disco, o `':memory:'`. */
  ruta: string
  cierra(): void
}

export interface OpcionesDeBase {
  /** `':memory:'` por defecto: una prueba que deja ficheros sueltos contamina la siguiente. */
  ruta?: string
  /** Solo tablas de la herramienta. Sirve para el descriptor VACIO: un proyecto virgen (§2.8). */
  sinNegocio?: boolean
}

/**
 * Abre la base y aplica el esquema.
 *
 * `foreign_keys` se enciende siempre y a proposito: SQLite las tiene APAGADAS por defecto, asi que
 * una base de prueba sin este pragma aceptaria un documento con `lote_id` inexistente y la prueba
 * pasaria verde mientras produccion —donde Postgres si las aplica— lo rechaza. Una base de prueba
 * mas permisiva que produccion es peor que no tener base: da luz verde a lo que va a fallar.
 */
export function abreBase(opciones: OpcionesDeBase = {}): Base {
  const ruta = opciones.ruta ?? ':memory:'
  const db = new DatabaseSync(ruta)
  db.exec('pragma foreign_keys = on')
  db.exec(DDL_HERRAMIENTA)
  if (opciones.sinNegocio !== true) db.exec(DDL_NEGOCIO)
  return {
    db,
    ruta,
    cierra: () => db.close(),
  }
}

/** Las tablas que existen ahora mismo. Se lee de la base, no de una lista declarada. */
export function tablasDe(base: Base): readonly string[] {
  const filas = base.db
    .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name")
    .all() as { name: string }[]
  return filas.map((f) => f.name)
}

/** Las columnas de una tabla, en el orden en que se declararon. */
export function columnasDe(base: Base, tabla: string): readonly string[] {
  const filas = base.db.prepare(`pragma table_info(${tabla})`).all() as { name: string }[]
  return filas.map((f) => f.name)
}

/** Cuenta filas. Para el resumen de la siembra, que es lo que se pega como evidencia. */
export function cuenta(base: Base, tabla: string): number {
  const fila = base.db.prepare(`select count(*) as n from ${tabla}`).get() as { n: number }
  return fila.n
}
