/**
 * Propuesta de modelo entidad-relacion, en SQL y como TEXTO. Cubre RF-17, RF-18, RF-19 y RF-31.
 *
 * §2.3 del SDD nombra el peligro exacto: «generar SQL a partir de campos que un modelo de lenguaje
 * extrajo de un escaneo es exactamente el caso que la regla de la casa prohibe confiar. Un
 * `CREATE TABLE` derivado de una alucinacion no falla ruidosamente — crea una tabla plausible con
 * una columna de mas, y nadie lo nota hasta que hay datos dentro.»
 *
 * De ahi las dos propiedades que estructuran este archivo:
 *
 * 1. **Se emite, no se aplica.** Aqui no hay cliente de base de datos, ni `execute`, ni un puerto
 *    que ejecute. La salida es una cadena. Aplicarla es gate humano (RF-19), y no hay forma de
 *    saltarselo desde este paquete porque no existe la ruta.
 * 2. **Sobre lo preexistente no se emite NADA.** Ni `ALTER`, ni `DROP`, ni un `CREATE` que choque.
 *    Una tabla que ya esta en el descriptor se reporta como sitio donde mapear, no como algo que
 *    tocar (RF-31). La herramienta no conoce lo que depende de esa tabla, asi que no puede saber
 *    que rompe al cambiarla.
 *
 * Y la barrera de la propiedad 2 vive EN EL CODIGO, no solo en la prueba: `revisaSql` recorre lo
 * generado antes de devolverlo y **lanza** si aparece una sentencia prohibida. Una barrera que
 * solo existe en el test protege al test; esta protege al proyecto que instale la herramienta.
 */
import type { DescriptorDeEsquema, TablaDescrita } from './esquema.js'
import type { CampoDePlantilla, PlantillaDeRevision } from './plantilla.js'

/**
 * Verbos que NUNCA son legitimos en una propuesta de modelo. `ALTER` no esta aqui a proposito: se
 * comprueba aparte, por la tabla a la que apunta (ver `revisaSql`).
 */
const SENTENCIAS_PROHIBIDAS = /\b(DROP|TRUNCATE|DELETE|UPDATE|GRANT|REVOKE)\b/i

export interface ColumnaPropuesta {
  nombre: string
  tipo: string
  nulable: boolean
  /** Si el campo se mapeo a un catalogo existente, la clave foranea que se propone. */
  referencia?: { tabla: string; columna: string }
}

export interface EntidadPropuesta {
  tabla: string
  columnas: readonly ColumnaPropuesta[]
}

export interface RelacionPropuesta {
  desde: string
  columna: string
  hacia: string
  hastaColumna: string
  /** `1` o `*` en el extremo de origen. La cardinalidad del destino siempre es 1: es la PK. */
  cardinalidad: '1' | '*'
  /** `true` si la tabla de destino ya existia. Se pinta punteada: no se crea, se referencia. */
  haciaPreexistente: boolean
}

export interface PropuestaDeModelo {
  /** Solo lo que NO existe. Lo preexistente no se propone: se referencia. */
  entidades: readonly EntidadPropuesta[]
  relaciones: readonly RelacionPropuesta[]
  /** Catalogos derivados de los campos habilitados (RF-17). */
  catalogosDerivados: readonly string[]
  /** El SQL. Es texto y solo texto: nadie de este paquete lo ejecuta (RF-19). */
  sql: string
  /** Lo que quien revise tiene que mirar antes de aplicar nada. */
  avisos: readonly string[]
}

/** `Numero de Factura` → `numero_de_factura`. Sin acentos y sin nada que exija comillas. */
export function aNombreDeColumna(clave: string): string {
  const sinAcentos = clave.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const limpio = sinAcentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return limpio.length === 0 ? 'campo' : /^[0-9]/.test(limpio) ? `c_${limpio}` : limpio
}

/**
 * Tipo SQL de un campo. Conservador a proposito: `text` salvo prueba en contra.
 *
 * Adivinar `numeric` porque las tres muestras que se vieron eran numeros es como se acaba con una
 * columna que rechaza el cuarto documento. El tipo estrecho se elige al revisar, con el dato
 * delante, no aqui.
 */
export function tipoSqlDe(muestras: readonly string[]): string {
  const utiles = muestras.filter((m) => m.trim().length > 0)
  if (utiles.length === 0) return 'text'
  const todas = (patron: RegExp) => utiles.every((m) => patron.test(m.trim()))
  if (todas(/^-?\d{1,15}$/)) return 'bigint'
  if (todas(/^-?\d{1,15}[.,]\d{1,6}$/)) return 'numeric'
  if (todas(/^\d{4}-\d{2}-\d{2}$/)) return 'date'
  return 'text'
}

/** RF-17: los catalogos salen de los campos HABILITADOS, no de todos los que trajo el motor. */
export function preparaCatalogos(plantilla: PlantillaDeRevision): readonly string[] {
  return plantilla.campos
    .filter((c) => c.visible)
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map((c) => aNombreDeColumna(c.clave))
}

export interface OpcionesDeModelo {
  /** Muestras por clave de campo, para elegir el tipo. Sin muestras, `text`. */
  muestras?: Readonly<Record<string, readonly string[]>>
  /** Mapeo campo → tabla existente que el revisor ya decidio (RF-27). */
  mapeos?: Readonly<Record<string, { tabla: string; columna: string }>>
}

function columnaDe(campo: CampoDePlantilla, opciones: OpcionesDeModelo): ColumnaPropuesta {
  const nombre = aNombreDeColumna(campo.clave)
  const mapeo = opciones.mapeos?.[campo.clave]
  if (mapeo !== undefined) {
    return { nombre: `${aNombreDeColumna(mapeo.tabla)}_id`, tipo: 'bigint', nulable: true, referencia: mapeo }
  }
  return { nombre, tipo: tipoSqlDe(opciones.muestras?.[campo.clave] ?? []), nulable: true }
}

/**
 * La barrera (RF-31 · DoF-9). Recorre el SQL generado ENTERO y lanza si toca algo preexistente.
 *
 * Se exporta para poder probarla sola, pero sobre todo porque **la llama el generador antes de
 * devolver**: si un cambio futuro produjera una sentencia prohibida, la propuesta no sale de aqui.
 * Es la diferencia entre «hay una prueba que lo comprueba» y «no puede pasar».
 *
 * El matiz que hace que esto no sea una barrera decorativa: `ALTER` no se prohibe en bloque,
 * porque una tabla nueva necesita `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` y sin RLS seria una
 * tabla que cualquiera lee. Lo que se comprueba es **a que tabla apunta cada `ALTER`**: si es una
 * que esta propuesta acaba de crear, es terminar de crearla; si es cualquier otra, se lanza.
 * Prohibir el verbo entero habria obligado a emitir tablas sin RLS, que es cambiar un riesgo por
 * otro peor.
 */
export function revisaSql(sql: string, descriptor: DescriptorDeEsquema, tablasNuevas: ReadonlySet<string>): void {
  const nunca = SENTENCIAS_PROHIBIDAS.exec(sql)
  if (nunca !== null) {
    throw new Error(
      `la propuesta contiene \`${nunca[0].toUpperCase()}\`, que no es legitimo en una propuesta de modelo (RF-31)`,
    )
  }
  for (const encontrado of sql.matchAll(/\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?([A-Za-z0-9_.]+)"?/gi)) {
    const objetivo = encontrado[1]
    if (!tablasNuevas.has(objetivo)) {
      throw new Error(
        `la propuesta altera "${objetivo}", que no la crea ella: sobre lo preexistente no se emite nada (RF-31)`,
      )
    }
  }
  for (const tabla of descriptor.tablas) {
    const crea = new RegExp(`CREATE\\s+TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?"?${tabla.nombre}"?\\b`, 'i')
    if (crea.test(sql)) {
      throw new Error(
        `la propuesta crea "${tabla.nombre}", que ya existe en el descriptor: sobre lo preexistente no se emite nada (RF-31)`,
      )
    }
  }
}

const CABECERA = [
  '-- PROPUESTA. No la aplica nadie por ti: aplicarla es una accion irreversible y va por',
  '-- gate humano (RF-19). Revisala antes, sobre todo los tipos: se eligen conservadores',
  '-- (`text` salvo prueba en contra) porque adivinar estrecho rompe con el cuarto documento.',
  '--',
  '-- Sobre las tablas que ya existen en tu proyecto NO hay una sola sentencia: esta',
  '-- herramienta no sabe que depende de ellas, asi que no puede saber que rompe al tocarlas.',
]

function sqlDeEntidad(entidad: EntidadPropuesta, catalogosExistentes: readonly TablaDescrita[]): string[] {
  const lineas = [`CREATE TABLE IF NOT EXISTS ${entidad.tabla} (`, '  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,']
  lineas.push('  owner_id uuid NOT NULL DEFAULT auth.uid(),')
  for (const columna of entidad.columnas) {
    const nulo = columna.nulable ? '' : ' NOT NULL'
    const fk =
      columna.referencia !== undefined &&
      catalogosExistentes.some((t) => t.nombre === columna.referencia?.tabla)
        ? ` REFERENCES ${columna.referencia.tabla}(${columna.referencia.columna})`
        : ''
    lineas.push(`  ${columna.nombre} ${columna.tipo}${nulo}${fk},`)
  }
  lineas.push('  creado_en timestamptz NOT NULL DEFAULT now()')
  lineas.push(');')
  // RLS SIEMPRE: una tabla nueva sin politica es una tabla que cualquiera lee (regla de la casa).
  lineas.push(`ALTER TABLE ${entidad.tabla} ENABLE ROW LEVEL SECURITY;`)
  lineas.push(
    `CREATE POLICY "${entidad.tabla}_por_owner" ON ${entidad.tabla}`,
    '  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());',
  )
  return lineas
}

/**
 * RF-18: propone el modelo. Devuelve la propuesta con su SQL como texto.
 *
 * Ojo con una consecuencia de la regla de RF-31 que parece un descuido y no lo es: la tabla nueva
 * necesita `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, que es un `ALTER`. Se resuelve emitiendo
 * ese SQL SOLO para tablas que la propia propuesta acaba de crear, y la barrera se aplica al
 * bloque de tablas preexistentes. Activar RLS en una tabla que se crea en la misma transaccion no
 * es «alterar lo preexistente»: es terminar de crearla.
 */
export function proponeModelo(
  plantilla: PlantillaDeRevision,
  descriptor: DescriptorDeEsquema,
  opciones: OpcionesDeModelo = {},
): PropuestaDeModelo {
  const habilitados = plantilla.campos.filter((c) => c.visible).slice().sort((a, b) => a.orden - b.orden)
  const tabla = aNombreDeColumna(plantilla.tipoDocumento)
  const avisos: string[] = []

  const yaExiste = descriptor.tablas.some((t) => t.nombre === tabla)
  const columnas = habilitados.map((campo) => columnaDe(campo, opciones))

  const relaciones: RelacionPropuesta[] = []
  for (const columna of columnas) {
    if (columna.referencia === undefined) continue
    const destino = descriptor.tablas.find((t) => t.nombre === columna.referencia?.tabla)
    relaciones.push({
      desde: tabla,
      columna: columna.nombre,
      hacia: columna.referencia.tabla,
      hastaColumna: columna.referencia.columna,
      cardinalidad: '*',
      haciaPreexistente: destino !== undefined,
    })
    if (destino === undefined) {
      avisos.push(
        `el campo mapeado a "${columna.referencia.tabla}" apunta a una tabla que no esta en el descriptor: ` +
          'revisa el mapeo antes de aplicar, o declara esa tabla',
      )
    }
  }

  const entidades: EntidadPropuesta[] = yaExiste ? [] : [{ tabla, columnas }]
  if (yaExiste) {
    avisos.push(
      `"${tabla}" ya existe en tu proyecto: no se propone ninguna sentencia sobre ella (RF-31). ` +
        'Mapea los campos a sus columnas en la vista de revision.',
    )
  }
  for (const campo of plantilla.campos.filter((c) => !c.visible)) {
    avisos.push(`el campo "${campo.etiqueta}" esta deshabilitado y no entra en el modelo`)
  }

  const cuerpo = entidades.flatMap((e) => sqlDeEntidad(e, descriptor.tablas))
  const sql = [...CABECERA, '', ...cuerpo].join('\n') + (cuerpo.length > 0 ? '\n' : '\n-- Nada que crear.\n')

  // La barrera se aplica al SQL ENTERO, no a un extracto: recortar antes de revisar seria
  // revisar lo que ya sabemos que esta bien.
  revisaSql(sql, descriptor, new Set(entidades.map((e) => e.tabla)))

  return { entidades, relaciones, catalogosDerivados: preparaCatalogos(plantilla), sql, avisos }
}
