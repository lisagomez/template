/**
 * El esquema del banco, derivado de `migraciones/001-extractor-documental.sql`.
 *
 * POR QUE HAY UNA TRADUCCION Y NO SE REUSA EL SQL DE PRODUCCION. La migracion es Postgres de
 * verdad: `uuid`, `timestamptz`, `jsonb`, el operador `~` de expresiones regulares, `create policy`,
 * `security definer`, `auth.uid()` y `storage.buckets`. Nada de eso existe en SQLite. La traduccion
 * es real y conviene decirlo en voz alta en vez de fingir que la base de prueba "es como
 * produccion":
 *
 *   uuid         → text        (los valores siguen siendo UUID validos, generados en TS)
 *   timestamptz  → text        (ISO-8601 en UTC)
 *   jsonb        → text        (JSON serializado; SQLite lo consulta con json_extract)
 *   x ~ 'regex'  → glob        (`not glob '*[^0-9a-f]*'` + length, que expresa lo mismo aqui)
 *   RLS/policies → NADA        ← la diferencia importante, y va abajo
 *
 * LO QUE ESTE BANCO NO PRUEBA, Y NO DEBE APARENTAR QUE PRUEBA: **las policies de RLS**. SQLite no
 * tiene RLS. El aislamiento por organizacion que en produccion imponen las policies aqui lo impone
 * el codigo de los adaptadores (cada consulta filtra por `organizacion_id`), que es una garantia
 * mas debil: en produccion la base lo niega aunque el codigo se equivoque, y aqui no. Las policies
 * de esa migracion **siguen sin haberse ejecutado nunca**, y este banco no cambia eso.
 *
 * LO QUE SI IMPIDE QUE LA TRADUCCION SE PUDRA: `ESPEJO_DE_LA_MIGRACION` de abajo, que
 * `pruebas/banco-espejo.ts` compara columna a columna contra el SQL real. Una tabla que cambie en
 * produccion y no aqui pone el gate en rojo. Es el mismo mecanismo que `pruebas/persistencia.ts`
 * usa para las listas de valores, y por la misma razon: una copia a mano diverge sola.
 */

// --- Espejos de los CHECK de la migracion -------------------------------------------------------
// Mismas listas que `src/almacenes/supabase.ts`. Que existan dos veces no es duplicacion ociosa:
// alli describen lo que acepta PostgREST y aqui lo que acepta la base del banco, y la prueba ata
// las dos a la migracion, que es la fuente.

export const ESTADOS_DE_DOCUMENTO = [
  'pendiente', 'en_cola', 'procesando', 'extraido',
  'en_revision', 'revision_humana', 'validado', 'rechazado', 'fallido',
] as const

export const CLASES_DE_FUENTE = ['documento', 'etiqueta', 'evento'] as const
export const ROLES = ['operario', 'revisor', 'consulta'] as const
export const TIPOS_DE_TRABAJO = ['facturas', 'inventario', 'trazabilidad', 'mixto'] as const
export const ESTADOS_DE_LOTE = ['abierto', 'en_revision', 'cerrado'] as const

const enSql = (valores: readonly string[]): string => valores.map((v) => `'${v}'`).join(', ')

/**
 * Las tablas de la HERRAMIENTA y sus columnas, tal como las declara la migracion.
 *
 * Se declara aparte del DDL —y no se deriva de el— para que la prueba compare contra la migracion
 * y no contra el propio DDL de este archivo, que seria comprobar que una copia coincide consigo
 * misma.
 */
export const ESPEJO_DE_LA_MIGRACION: Readonly<Record<string, readonly string[]>> = {
  organizaciones: ['id', 'nombre', 'creado_en'],
  membresias: ['organizacion_id', 'usuario_id', 'rol', 'creado_en'],
  lotes: [
    'id', 'organizacion_id', 'titulo', 'tipo_de_trabajo', 'estado',
    'creado_por', 'creado_en', 'cerrado_en',
  ],
  documentos: [
    'id', 'organizacion_id', 'lote_id', 'identidad', 'clase_de_fuente', 'estado',
    'tipo_documento', 'ruta_original', 'paginas', 'creado_en',
  ],
  plantillas: ['organizacion_id', 'tipo_documento', 'plantilla', 'actualizado_en'],
  versiones_de_campo: [
    'id', 'organizacion_id', 'documento_id', 'clave', 'valor',
    'version', 'motivo', 'autor', 'creado_en',
  ],
  indice_identificadores: [
    'organizacion_id', 'documento_id', 'identificador_normalizado', 'clave',
  ],
  lapidas: ['id', 'organizacion_id', 'documento_id', 'motivo', 'suprimido_por', 'suprimido_en'],
}

/**
 * Las tablas del NEGOCIO. No salen de la migracion y no deben: son del proyecto que INSTALA la
 * herramienta, no de la herramienta.
 *
 * Es exactamente la distincion de §2.8 del SDD hecha carne — lo que el `DescriptorDeEsquema`
 * describe es esto, no las tablas de arriba. Meterlas en el mismo saco haria que el descriptor
 * ofreciera mapear un campo contra `documentos.paginas`, que no significa nada.
 */
export const TABLAS_DE_NEGOCIO: readonly string[] = ['proveedores', 'productos', 'facturas']

// --- DDL ----------------------------------------------------------------------------------------

/** Tablas de la herramienta: espejo traducido de la migracion. */
export const DDL_HERRAMIENTA = `
create table if not exists organizaciones (
  id text primary key,
  nombre text not null check (length(trim(nombre)) > 0),
  creado_en text not null
);

create table if not exists membresias (
  organizacion_id text not null references organizaciones(id) on delete cascade,
  usuario_id text not null,
  rol text not null check (rol in (${enSql(ROLES)})),
  creado_en text not null,
  primary key (organizacion_id, usuario_id)
);

create table if not exists lotes (
  id text primary key,
  organizacion_id text not null references organizaciones(id) on delete cascade,
  titulo text not null check (length(trim(titulo)) > 0),
  tipo_de_trabajo text not null check (tipo_de_trabajo in (${enSql(TIPOS_DE_TRABAJO)})),
  estado text not null default 'abierto' check (estado in (${enSql(ESTADOS_DE_LOTE)})),
  creado_por text not null,
  creado_en text not null,
  cerrado_en text
);

create table if not exists documentos (
  id text primary key,
  organizacion_id text not null references organizaciones(id) on delete cascade,
  lote_id text references lotes(id) on delete set null,
  -- El \`~ '^[0-9a-f]{64}$'\` de Postgres, expresado con lo que SQLite tiene: la longitud exacta y
  -- la ausencia de cualquier caracter fuera del alfabeto hexadecimal.
  identidad text not null check (length(identidad) = 64 and identidad not glob '*[^0-9a-f]*'),
  clase_de_fuente text not null check (clase_de_fuente in (${enSql(CLASES_DE_FUENTE)})),
  estado text not null default 'pendiente' check (estado in (${enSql(ESTADOS_DE_DOCUMENTO)})),
  tipo_documento text,
  ruta_original text,
  paginas text not null default '[]',
  creado_en text not null,
  unique (organizacion_id, identidad, clase_de_fuente)
);

create table if not exists plantillas (
  organizacion_id text not null references organizaciones(id) on delete cascade,
  tipo_documento text not null check (length(trim(tipo_documento)) > 0),
  plantilla text not null,
  actualizado_en text not null,
  primary key (organizacion_id, tipo_documento)
);

create table if not exists versiones_de_campo (
  id text primary key,
  organizacion_id text not null references organizaciones(id) on delete cascade,
  documento_id text not null references documentos(id) on delete cascade,
  clave text not null,
  valor text not null,
  version integer not null check (version >= 1),
  motivo text not null check (length(trim(motivo)) > 0),
  autor text not null,
  creado_en text not null,
  unique (documento_id, clave, version)
);

create table if not exists indice_identificadores (
  organizacion_id text not null references organizaciones(id) on delete cascade,
  documento_id text not null references documentos(id) on delete cascade,
  identificador_normalizado text not null,
  clave text not null,
  primary key (documento_id, clave, identificador_normalizado)
);

create index if not exists indice_identificadores_busqueda
  on indice_identificadores (organizacion_id, identificador_normalizado);

create table if not exists lapidas (
  id text primary key,
  organizacion_id text not null references organizaciones(id) on delete cascade,
  documento_id text not null,
  motivo text not null check (length(trim(motivo)) > 0),
  suprimido_por text not null,
  suprimido_en text not null
);

-- Cola de lecturas sin conexion. NO esta en la migracion de Supabase a proposito: en produccion
-- vive en IndexedDB, en el dispositivo. Aqui se materializa para poder ejercitar el puerto
-- \`AlmacenLocal\` desde Node, donde no hay IndexedDB.
create table if not exists cola_de_lecturas (
  id text primary key,
  organizacion_id text not null references organizaciones(id) on delete cascade,
  lectura text not null,
  estado text not null check (estado in ('pendiente', 'sincronizada', 'fallida')),
  intentos integer not null default 0,
  instante_servidor text,
  ultimo_error text
);

-- Los bytes de los originales. En produccion es un bucket privado de Supabase Storage; aqui es
-- una tabla, y el \`pg_dump\` que en produccion NO se los lleva aqui es irrelevante.
create table if not exists originales (
  ruta text primary key,
  organizacion_id text not null references organizaciones(id) on delete cascade,
  contenido blob not null,
  tipo_mime text not null,
  guardado_en text not null
);
`

/** Tablas del negocio: los catalogos del proyecto consumidor. */
export const DDL_NEGOCIO = `
create table if not exists proveedores (
  id text primary key,
  razon_social text not null,
  rfc text not null unique
);

create table if not exists productos (
  id text primary key,
  descripcion text not null,
  gtin text not null unique,
  proveedor_id text not null references proveedores(id)
);

create table if not exists facturas (
  id text primary key,
  folio text not null,
  proveedor_id text references proveedores(id),
  total text not null,
  emitida_en text not null
);
`
