/**
 * El `DescriptorDeEsquema` LEIDO de la base, no declarado a mano.
 *
 * Es la diferencia con los tres fixtures JSON que ya existen en `pruebas/fixtures/`: alli el
 * descriptor es un fichero que alguien escribio y que puede afirmar cualquier cosa; aqui sale de
 * `pragma table_info`, asi que describe lo que la base TIENE. Un descriptor que puede mentir prueba
 * el parser; uno derivado prueba el circuito.
 *
 * OJO CON LA LECTURA DE §2.6 QUE SERIA FACIL SACAR DE AQUI Y ES FALSA: que este banco
 * introspeccione su base NO significa que la herramienta pueda introspeccionar la de un proyecto.
 * En Supabase no hay via sin privilegio —el OpenAPI por anon key esta bloqueado y la introspeccion
 * de GraphQL viene desactivada—, y por eso el cimiento sigue siendo el descriptor DECLARADO. Esto
 * es la via 2, la comodidad, y solo funciona porque la base es local y del propio banco.
 */
import type { DescriptorDeEsquema, TablaDescrita, ColumnaDescrita, FilaDeCatalogo } from '../dist/index.js'
import { esquemaVacio } from '../dist/index.js'
import type { Base } from './base.ts'
import { TABLAS_DE_NEGOCIO } from './esquema.ts'

interface FilaTableInfo {
  name: string
  type: string
  notnull: number
  pk: number
}

interface FilaForeignKey {
  from: string
  table: string
  to: string
}

/** Los catalogos: contra estas tablas se resuelven VALORES, no solo columnas. */
const ES_CATALOGO: ReadonlySet<string> = new Set(['proveedores', 'productos'])

/**
 * Deriva el descriptor de las tablas de NEGOCIO que existan.
 *
 * Solo las de negocio: las de la herramienta (`documentos`, `lotes`, `plantillas`...) no son del
 * proyecto consumidor y ofrecerlas para mapear seria proponer que un campo de una factura vaya a
 * `documentos.paginas`, que no significa nada.
 *
 * En una base abierta con `sinNegocio: true` esto devuelve `tablas: []` — que NO es un caso
 * especial ni una rama: es el proyecto virgen de §2.8, y recorre el mismo codigo que uno poblado.
 */
export function descriptorDesdeLaBase(base: Base, version = '1'): DescriptorDeEsquema {
  const tablas: TablaDescrita[] = []
  for (const nombre of TABLAS_DE_NEGOCIO) {
    const info = base.db.prepare(`pragma table_info(${nombre})`).all() as unknown as FilaTableInfo[]
    if (info.length === 0) continue
    const fks = base.db.prepare(`pragma foreign_key_list(${nombre})`).all() as unknown as FilaForeignKey[]
    const columnas: ColumnaDescrita[] = info.map((c) => {
      const fk = fks.find((f) => f.from === c.name)
      const columna: ColumnaDescrita = {
        nombre: c.name,
        tipo: c.type.toLowerCase(),
        nulable: c.notnull === 0,
      }
      const conPk = c.pk > 0 ? { ...columna, esClavePrimaria: true } : columna
      return fk === undefined ? conPk : { ...conPk, referencia: { tabla: fk.table, columna: fk.to } }
    })
    const tabla: TablaDescrita = { nombre, columnas }
    tablas.push(ES_CATALOGO.has(nombre) ? { ...tabla, esCatalogo: true } : tabla)
  }
  return tablas.length === 0 ? esquemaVacio(version) : { version, tablas }
}

/**
 * Un descriptor DESALINEADO: declara una columna que la base ya no tiene.
 *
 * Se construye a partir del real y añadiendole la mentira, en vez de escribirlo entero a mano, para
 * que el resto del descriptor siga siendo cierto: lo que se prueba es que `detectaDesalineacion`
 * caza UNA divergencia concreta, no que rechaza un fichero inventado de arriba abajo.
 */
export function descriptorDesalineado(base: Base): DescriptorDeEsquema {
  const real = descriptorDesdeLaBase(base)
  const tablas = real.tablas.map((t) =>
    t.nombre === 'proveedores'
      ? {
          ...t,
          columnas: [
            ...t.columnas,
            // Esta columna existio en una version anterior del ERP y se borro en una migracion. Es
            // el caso realista: no un descriptor absurdo, sino uno que se quedo viejo.
            { nombre: 'telefono_contacto', tipo: 'text', nulable: true } satisfies ColumnaDescrita,
          ],
        }
      : t,
  )
  return { version: `${real.version}-desalineado`, tablas }
}

/**
 * Las filas de un catalogo, con la forma que la reconciliacion consume.
 *
 * `etiqueta` es por lo que se compara: la razon social para proveedores, el GTIN para productos.
 * Que el GTIN sea la etiqueta es lo que obliga a resolverlo por `resuelveIdentificador` y no por
 * similitud — y `resuelveValor` lanza si alguien lo intenta, que es la barrera de §2.10.
 */
export function catalogoDe(base: Base, tabla: 'proveedores' | 'productos'): readonly FilaDeCatalogo[] {
  // Un catalogo que no existe son CERO filas, no una excepcion.
  //
  // La primera version lanzaba `no such table`, y era un incumplimiento de §2.8 disfrazado de
  // robustez: obligaba a quien llama a preguntar antes "¿hay catalogos?" — es decir, a escribir el
  // `if (tieneCatalogos)` que el diseño existe para no tener. Con cero filas, un proyecto virgen
  // recorre EXACTAMENTE el mismo codigo y lo que sale es `sin_resolver` para todo, que es la
  // respuesta correcta: no hay ninguna fila a la que engancharse, asi que se propone un alta.
  const existe = base.db
    .prepare("select 1 as hay from sqlite_master where type = 'table' and name = ?")
    .get(tabla)
  if (existe === undefined) return []
  const columna = tabla === 'proveedores' ? 'razon_social' : 'gtin'
  const filas = base.db
    .prepare(`select id, ${columna} as etiqueta from ${tabla} order by id`)
    .all() as { id: string; etiqueta: string }[]
  return filas.map((f) => ({ id: f.id, etiqueta: f.etiqueta }))
}
