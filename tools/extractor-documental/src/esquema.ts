/**
 * El descriptor del esquema de destino: lo que el proyecto que instala la herramienta YA tiene.
 *
 * La decision que ordena todo el modulo: **un descriptor vacio es un proyecto sin catalogos**, y
 * recorre exactamente el mismo codigo que uno poblado. No hay `if (tieneCatalogos)`. Dos caminos
 * separados divergen en cuanto alguien arregla un bug en uno solo, y el que se queda roto es
 * siempre el que nadie mira.
 *
 * El descriptor se DECLARA, no se descubre: no hay via sin privilegio para introspeccionar un
 * esquema de Supabase (el OpenAPI por anon key esta bloqueado, la introspeccion GraphQL viene
 * desactivada), y exigir una clave secreta ampliaria el privilegio en todo proyecto consumidor.
 */

export interface ReferenciaAColumna {
  tabla: string
  columna: string
}

export interface ColumnaDescrita {
  nombre: string
  tipo: string
  nulable: boolean
  esClavePrimaria?: boolean
  /** Si apunta a otra tabla, la clave foranea que ya existe. */
  referencia?: ReferenciaAColumna
}

export interface TablaDescrita {
  nombre: string
  columnas: readonly ColumnaDescrita[]
  /** Marca las tablas que son catalogos: contra ellas se resuelven valores, no solo columnas. */
  esCatalogo?: boolean
}

export interface DescriptorDeEsquema {
  version: string
  tablas: readonly TablaDescrita[]
}

/** El proyecto virgen. No es un caso especial: es este valor. */
export function esquemaVacio(version = '1'): DescriptorDeEsquema {
  return { version, tablas: [] }
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export interface ResultadoDeValidacion {
  ok: boolean
  errores: readonly string[]
}

/**
 * Valida la FORMA de un descriptor que viene de fuera (un JSON declarado a mano).
 *
 * Sin dependencias a proposito: el nucleo no importa Zod. El consumidor que quiera un esquema Zod
 * lo construye en su lado; aqui basta con no dejar entrar basura.
 */
export function validaDescriptor(valor: unknown): ResultadoDeValidacion {
  const errores: string[] = []
  if (!esObjeto(valor)) return { ok: false, errores: ['el descriptor tiene que ser un objeto'] }
  if (typeof valor.version !== 'string') errores.push('falta `version` (cadena)')
  if (!Array.isArray(valor.tablas)) {
    errores.push('falta `tablas` (lista); un proyecto sin catalogos declara `tablas: []`')
    return { ok: false, errores }
  }
  const vistas = new Set<string>()
  for (const [i, tabla] of valor.tablas.entries()) {
    if (!esObjeto(tabla) || typeof tabla.nombre !== 'string') {
      errores.push(`tablas[${i}]: falta \`nombre\``)
      continue
    }
    if (vistas.has(tabla.nombre)) errores.push(`tabla "${tabla.nombre}" declarada dos veces`)
    vistas.add(tabla.nombre)
    if (!Array.isArray(tabla.columnas) || tabla.columnas.length === 0) {
      errores.push(`tabla "${tabla.nombre}": \`columnas\` tiene que ser una lista no vacia`)
      continue
    }
    for (const [j, col] of tabla.columnas.entries()) {
      if (!esObjeto(col) || typeof col.nombre !== 'string' || typeof col.tipo !== 'string') {
        errores.push(`tabla "${tabla.nombre}", columnas[${j}]: falta \`nombre\` o \`tipo\``)
      }
    }
  }
  return { ok: errores.length === 0, errores }
}

/**
 * La implementacion por defecto del puerto `EsquemaExistente`: **no consulta nada**.
 *
 * Devuelve el descriptor que el integrador declaro. Es la via que no pide ningun privilegio, la
 * unica que funciona igual fuera de Supabase, y la que hace que un proyecto sin catalogos sea
 * `tablas: []` en vez de una rama de codigo aparte.
 *
 * Se valida al construir y no en cada llamada: un descriptor mal formado es un error de
 * integracion, y tiene que salir al arrancar y no a mitad de una revision.
 */
export function esquemaDeclarado(descriptor: DescriptorDeEsquema): { describe(): Promise<DescriptorDeEsquema> } {
  const validacion = validaDescriptor(descriptor)
  if (!validacion.ok) {
    throw new Error(`Descriptor de esquema invalido: ${validacion.errores.join(' · ')}`)
  }
  return { describe: () => Promise.resolve(descriptor) }
}

export function buscaTabla(esquema: DescriptorDeEsquema, tabla: string): TablaDescrita | null {
  return esquema.tablas.find((t) => t.nombre === tabla) ?? null
}

export function buscaColumna(
  esquema: DescriptorDeEsquema,
  tabla: string,
  columna: string,
): ColumnaDescrita | null {
  return buscaTabla(esquema, tabla)?.columnas.find((c) => c.nombre === columna) ?? null
}

/** Los catalogos declarados. En un esquema vacio son cero, y eso no rompe nada. */
export function catalogos(esquema: DescriptorDeEsquema): readonly TablaDescrita[] {
  return esquema.tablas.filter((t) => t.esCatalogo === true)
}

export interface Desalineacion {
  tabla: string
  columna?: string
  motivo: string
}

/**
 * Compara el descriptor DECLARADO con uno REAL (el que devuelva una introspeccion, cuando el
 * proyecto la tenga habilitada) y devuelve lo que ya no cuadra.
 *
 * Se ejecuta ANTES de proponer ningun mapeo: mapear contra una columna que se borro hace dos
 * migraciones produce una propuesta que parece correcta y falla al aplicarse.
 */
export function detectaDesalineacion(
  declarado: DescriptorDeEsquema,
  real: DescriptorDeEsquema,
): readonly Desalineacion[] {
  const problemas: Desalineacion[] = []
  for (const tabla of declarado.tablas) {
    const enReal = buscaTabla(real, tabla.nombre)
    if (enReal === null) {
      problemas.push({ tabla: tabla.nombre, motivo: 'declarada pero no existe en la base' })
      continue
    }
    for (const col of tabla.columnas) {
      const colReal = enReal.columnas.find((c) => c.nombre === col.nombre)
      if (colReal === undefined) {
        problemas.push({ tabla: tabla.nombre, columna: col.nombre, motivo: 'declarada pero no existe en la base' })
      } else if (colReal.tipo !== col.tipo) {
        problemas.push({
          tabla: tabla.nombre,
          columna: col.nombre,
          motivo: `el tipo declarado (${col.tipo}) no coincide con el real (${colReal.tipo})`,
        })
      }
    }
  }
  return problemas
}
