/**
 * Los puertos del extractor, implementados sobre la base embebida.
 *
 * FORMA COPIADA, NO INVENTADA: cada fabrica recibe `{ base, organizacionId }` igual que la de
 * Supabase recibe `{ cliente, organizacionId }`, y devuelve el puerto. Toda consulta se acota a la
 * organizacion porque esa es la unidad de aislamiento del diseño (§2.16), no el usuario: quien
 * sube no es quien revisa, y aislar por usuario romperia justo el flujo que la herramienta existe
 * para cubrir.
 *
 * LA DIFERENCIA CON PRODUCCION, DICHA EN VOZ ALTA: alli ese filtro lo impone RLS y la base niega
 * la fila aunque el codigo se equivoque; aqui lo impone este archivo. Es una garantia mas debil.
 * Ver la cabecera de `esquema.ts`.
 */
import type {
  AlmacenDocumentos,
  AlmacenPlantillas,
  AlmacenDeOriginales,
  AlmacenLocal,
  RepositorioDeRegistros,
  EntradaEnCola,
  Lote,
  PaginaExtraida,
  CriteriosDeBusqueda,
} from '../dist/index.js'
import { normalizaCriterios, normalizaIdentificador } from '../dist/index.js'
// Se importa la validacion del adaptador de Supabase en vez de escribir otra: las dos leen JSON
// que guardo una version anterior de la herramienta, y dos validaciones que divergen dejan pasar
// en un sitio lo que el otro rechaza, sin dar ningun error.
import { validaPaginasGuardadas } from '../dist/almacenes/supabase.js'
import type { Base } from './base.ts'

export interface OpcionesDelAlmacen {
  base: Base
  organizacionId: string
}

const ahora = (): string => new Date().toISOString()

// --- Documentos ---------------------------------------------------------------------------------

export function almacenDeDocumentos(opciones: OpcionesDelAlmacen): AlmacenDocumentos {
  const { base, organizacionId } = opciones
  return {
    async guarda(id: string, paginas: readonly PaginaExtraida[]): Promise<void> {
      // `on conflict` sobre la misma clave unica que la migracion declara: (org, identidad, clase).
      // Reprocesar el mismo documento tiene que ser idempotente — es la propiedad entera de
      // `identidadDe()`, y un insert a secas la romperia en el primer reintento de un lote.
      base.db
        .prepare(
          `insert into documentos (id, organizacion_id, identidad, clase_de_fuente, estado, paginas, creado_en)
           values (?, ?, ?, 'documento', 'extraido', ?, ?)
           on conflict (organizacion_id, identidad, clase_de_fuente)
           do update set paginas = excluded.paginas`,
        )
        // El id se deriva de la identidad ENTERA, no de un prefijo. Truncar a 16 caracteres
        // hexadecimales metia una probabilidad de colision donde no hacia ninguna falta: dos
        // documentos distintos con el mismo prefijo compartirian clave primaria, y el segundo
        // pisaria al primero. La columna es texto y el hash cabe.
        .run(`doc-${id}`, organizacionId, id, JSON.stringify(paginas), ahora())
    },

    async lee(id: string): Promise<PaginaExtraida[] | null> {
      const fila = base.db
        .prepare(
          `select paginas from documentos
           where organizacion_id = ? and identidad = ? and clase_de_fuente = 'documento'`,
        )
        .get(organizacionId, id) as { paginas: string } | undefined
      if (fila === undefined) return null
      // Lo que hay en la columna lo escribio una version anterior de la herramienta. Se valida
      // antes de devolverlo por la misma razon que en produccion: la columna acepta cualquier forma.
      return validaPaginasGuardadas(JSON.parse(fila.paginas))
    },

    async lista(): Promise<readonly string[]> {
      const filas = base.db
        .prepare(
          `select identidad from documentos
           where organizacion_id = ? and clase_de_fuente = 'documento'
           order by creado_en desc, identidad asc`,
        )
        .all(organizacionId) as { identidad: string }[]
      return filas.map((f) => f.identidad)
    },
  }
}

// --- Plantillas ---------------------------------------------------------------------------------

export function almacenDePlantillas(opciones: OpcionesDelAlmacen): AlmacenPlantillas {
  const { base, organizacionId } = opciones
  return {
    async guardaPorDefecto(tipoDocumento: string, plantilla: unknown): Promise<void> {
      base.db
        .prepare(
          `insert into plantillas (organizacion_id, tipo_documento, plantilla, actualizado_en)
           values (?, ?, ?, ?)
           on conflict (organizacion_id, tipo_documento)
           do update set plantilla = excluded.plantilla, actualizado_en = excluded.actualizado_en`,
        )
        .run(organizacionId, tipoDocumento, JSON.stringify(plantilla), ahora())
    },

    async leePorDefecto(tipoDocumento: string): Promise<unknown | null> {
      const fila = base.db
        .prepare('select plantilla from plantillas where organizacion_id = ? and tipo_documento = ?')
        .get(organizacionId, tipoDocumento) as { plantilla: string } | undefined
      return fila === undefined ? null : JSON.parse(fila.plantilla)
    },
  }
}

// --- Originales ---------------------------------------------------------------------------------

/**
 * Los bytes del fichero original.
 *
 * `urlFirmada` NO firma nada: devuelve un identificador local con su vencimiento a la vista. Es una
 * simulacion y se dice, porque una firma de mentira que PAREZCA una firma es peor que ninguna —
 * invita a probar contra ella el codigo que en produccion depende de que caduque de verdad. Lo
 * unico que este adaptador garantiza es la FORMA: que hay una ruta, que se pide un plazo, y que el
 * plazo viaja en lo devuelto.
 */
export function almacenDeOriginales(opciones: OpcionesDelAlmacen): AlmacenDeOriginales {
  const { base, organizacionId } = opciones
  return {
    async guarda(ruta: string, contenido: Uint8Array, tipoMime: string): Promise<void> {
      base.db
        .prepare(
          `insert into originales (ruta, organizacion_id, contenido, tipo_mime, guardado_en)
           values (?, ?, ?, ?, ?)
           on conflict (ruta) do update set contenido = excluded.contenido`,
        )
        .run(ruta, organizacionId, contenido, tipoMime, ahora())
    },

    async urlFirmada(ruta: string, segundos: number): Promise<string> {
      const fila = base.db
        .prepare('select 1 as hay from originales where ruta = ? and organizacion_id = ?')
        .get(ruta, organizacionId) as { hay: number } | undefined
      if (fila === undefined) throw new Error(`no hay original en "${ruta}"`)
      const vence = new Date(Date.now() + segundos * 1000).toISOString()
      return `banco://originales/${ruta}?vence=${vence}&simulada=si`
    },

    async borra(ruta: string): Promise<void> {
      base.db.prepare('delete from originales where ruta = ? and organizacion_id = ?').run(ruta, organizacionId)
    },
  }
}

// --- Cola de lecturas ---------------------------------------------------------------------------

/**
 * El puerto `AlmacenLocal`, que en produccion es IndexedDB en el dispositivo.
 *
 * Existe aqui porque en Node no hay IndexedDB, y sin el la cola —lo que impide perder eventos sin
 * cobertura— no se podria ejercitar fuera de un navegador.
 */
export function almacenDeCola(opciones: OpcionesDelAlmacen): AlmacenLocal {
  const { base, organizacionId } = opciones
  return {
    async guarda(entrada: EntradaEnCola): Promise<void> {
      base.db
        .prepare(
          `insert into cola_de_lecturas (id, organizacion_id, lectura, estado, intentos, instante_servidor, ultimo_error)
           values (?, ?, ?, ?, ?, ?, ?)
           on conflict (id) do update set
             estado = excluded.estado,
             intentos = excluded.intentos,
             instante_servidor = excluded.instante_servidor,
             ultimo_error = excluded.ultimo_error`,
        )
        .run(
          entrada.id,
          organizacionId,
          JSON.stringify(entrada.lectura),
          entrada.estado,
          entrada.intentos,
          entrada.instanteServidor,
          entrada.ultimoError ?? null,
        )
    },

    async lee(id: string): Promise<EntradaEnCola | null> {
      const fila = base.db
        .prepare('select * from cola_de_lecturas where id = ? and organizacion_id = ?')
        .get(id, organizacionId) as Record<string, unknown> | undefined
      return fila === undefined ? null : aEntrada(fila)
    },

    async listaPendientes(): Promise<readonly EntradaEnCola[]> {
      const filas = base.db
        .prepare(
          `select * from cola_de_lecturas
           where organizacion_id = ? and estado = 'pendiente'
           order by json_extract(lectura, '$.instanteDispositivo') asc`,
        )
        .all(organizacionId) as Record<string, unknown>[]
      return filas.map(aEntrada)
    },

    async cuenta(): Promise<number> {
      const fila = base.db
        .prepare("select count(*) as n from cola_de_lecturas where organizacion_id = ? and estado = 'pendiente'")
        .get(organizacionId) as { n: number }
      return fila.n
    },
  }
}

function aEntrada(fila: Record<string, unknown>): EntradaEnCola {
  const entrada: EntradaEnCola = {
    id: String(fila.id),
    lectura: JSON.parse(String(fila.lectura)),
    estado: fila.estado as EntradaEnCola['estado'],
    intentos: Number(fila.intentos),
    instanteServidor: fila.instante_servidor === null ? null : String(fila.instante_servidor),
  }
  return fila.ultimo_error === null ? entrada : { ...entrada, ultimoError: String(fila.ultimo_error) }
}

// --- Lotes y busqueda ---------------------------------------------------------------------------

/**
 * `RepositorioDeRegistros`: guardar un lote, recuperarlo, y buscarlo.
 *
 * La busqueda por identificador va por IGUALDAD sobre el valor normalizado, nunca por parecido
 * (§2.10). El titulo, en cambio, si admite coincidencia parcial: es lo unico que una persona
 * recuerda a medias tres meses despues.
 */
export function repositorioDeRegistros(opciones: OpcionesDelAlmacen): RepositorioDeRegistros {
  const { base, organizacionId } = opciones
  return {
    async guardaLote(lote: unknown): Promise<void> {
      const l = lote as Lote
      base.db
        .prepare(
          `insert into lotes (id, organizacion_id, titulo, tipo_de_trabajo, estado, creado_por, creado_en, cerrado_en)
           values (?, ?, ?, ?, ?, ?, ?, ?)
           on conflict (id) do update set
             titulo = excluded.titulo, estado = excluded.estado, cerrado_en = excluded.cerrado_en`,
        )
        .run(l.id, organizacionId, l.titulo, l.tipoTrabajo, l.estado, l.creadoPor, l.creadoEn, l.cerradoEn)
    },

    async leeLote(id: string): Promise<unknown | null> {
      const fila = base.db
        .prepare('select * from lotes where id = ? and organizacion_id = ?')
        .get(id, organizacionId) as Record<string, unknown> | undefined
      if (fila === undefined) return null
      return {
        id: String(fila.id),
        organizacionId: String(fila.organizacion_id),
        titulo: String(fila.titulo),
        tipoTrabajo: fila.tipo_de_trabajo as Lote['tipoTrabajo'],
        estado: fila.estado as Lote['estado'],
        creadoPor: String(fila.creado_por),
        creadoEn: String(fila.creado_en),
        cerradoEn: fila.cerrado_en === null ? null : String(fila.cerrado_en),
      } satisfies Lote
    },

    async busca(criterios: unknown): Promise<readonly unknown[]> {
      const c = normalizaCriterios(criterios as CriteriosDeBusqueda)
      const donde: string[] = ['l.organizacion_id = ?']
      const valores: unknown[] = [organizacionId]
      if (c.titulo !== undefined && c.titulo.length > 0) {
        donde.push('lower(l.titulo) like ?')
        valores.push(`%${c.titulo.toLowerCase()}%`)
      }
      if (c.tipoTrabajo !== undefined) {
        donde.push('l.tipo_de_trabajo = ?')
        valores.push(c.tipoTrabajo)
      }
      if (c.estado !== undefined) {
        donde.push('l.estado = ?')
        valores.push(c.estado)
      }
      // `desde` y `hasta` estaban en `CriteriosDeBusqueda` y este adaptador los ACEPTABA sin
      // aplicarlos. Ese es el peor tipo de hueco: pedir "las facturas de septiembre" devolvia
      // tambien las de agosto, sin error y sin aviso, y quien mirara el resultado no tenia forma
      // de saber que el filtro no se habia aplicado. Las fechas son ISO-8601 en UTC, asi que el
      // orden lexicografico y el cronologico coinciden y basta comparar como texto.
      if (c.desde !== undefined) {
        donde.push('l.creado_en >= ?')
        valores.push(c.desde)
      }
      if (c.hasta !== undefined) {
        donde.push('l.creado_en <= ?')
        valores.push(c.hasta)
      }
      // El identificador entra por el indice, no por el titulo: es "la factura A-1234", que es como
      // se busca de verdad. Igualdad exacta sobre el normalizado.
      const union =
        c.identificador === undefined
          ? ''
          : `join documentos d on d.lote_id = l.id
             join indice_identificadores i on i.documento_id = d.id
               and i.identificador_normalizado = ?`
      // El `?` del identificador vive en el JOIN, que en el texto de la consulta va ANTES del
      // WHERE: por posicion es el PRIMER parametro, no el segundo.
      if (c.identificador !== undefined) valores.unshift(normalizaIdentificador(c.identificador))
      const filas = base.db
        .prepare(
          `select distinct l.id, l.titulo, l.tipo_de_trabajo, l.estado, l.creado_en
           from lotes l ${union} where ${donde.join(' and ')} order by l.creado_en desc`,
        )
        .all(...(valores as never[])) as Record<string, unknown>[]
      return filas
    },
  }
}
