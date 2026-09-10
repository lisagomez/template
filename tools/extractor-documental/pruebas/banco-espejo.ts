/**
 * El gate que impide que el banco se separe de produccion en silencio.
 *
 * El banco traduce la migracion de Postgres a SQLite (ver `banco/esquema.ts`), y una traduccion a
 * mano diverge sola: alguien añade una columna a `documentos` en la migracion, el banco sigue con
 * las de antes, y las pruebas del banco pasan verdes mientras validan un esquema que ya no existe.
 * Es el mismo fallo que `pruebas/persistencia.ts` caza para las listas de valores, y se caza igual:
 * comparando contra el SQL real, que es la fuente.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  ESPEJO_DE_LA_MIGRACION,
  ESTADOS_DE_DOCUMENTO,
  CLASES_DE_FUENTE,
  ROLES,
  TIPOS_DE_TRABAJO,
  ESTADOS_DE_LOTE,
  TABLAS_DE_NEGOCIO,
} from '../banco/esquema.ts'
import { abreBase, tablasDe, columnasDe } from '../banco/base.ts'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const sql = readFileSync(join(raiz, 'migraciones', '001-extractor-documental.sql'), 'utf8')

function bloqueDeTabla(tabla: string): string {
  const encontrado = new RegExp(`create table if not exists public\\.${tabla}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i').exec(sql)
  assert.ok(encontrado, `no encuentro la tabla "${tabla}" en la migracion`)
  return encontrado[1]
}

/** Las columnas declaradas en un `create table`, sin las restricciones de tabla ni los comentarios. */
function columnasDeLaMigracion(tabla: string): string[] {
  const nombres: string[] = []
  for (const linea of bloqueDeTabla(tabla).split('\n')) {
    const limpia = linea.trim()
    if (limpia.length === 0 || limpia.startsWith('--')) continue
    // `primary key (...)`, `unique (...)` y `foreign key (...)` son restricciones, no columnas.
    if (/^(primary key|unique|foreign key|check|constraint)\b/i.test(limpia)) continue
    const encontrado = /^([a-z_][a-z0-9_]*)\s/i.exec(limpia)
    if (encontrado !== null) nombres.push(encontrado[1])
  }
  return nombres
}

function valoresDelCheck(tabla: string, columna: string): string[] {
  const patron = new RegExp(`check\\s*\\(\\s*${columna}\\s+in\\s*\\(([^)]*)\\)`, 'is')
  const encontrado = patron.exec(bloqueDeTabla(tabla))
  assert.ok(encontrado, `no hay CHECK para "${tabla}.${columna}"`)
  return [...encontrado[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

test('el espejo declara exactamente las tablas de la migracion', () => {
  const enLaMigracion = [...sql.matchAll(/create table if not exists public\.([a-z_]+)/gi)].map((m) => m[1])
  assert.deepEqual(Object.keys(ESPEJO_DE_LA_MIGRACION).sort(), enLaMigracion.sort())
})

for (const [tabla, columnas] of Object.entries(ESPEJO_DE_LA_MIGRACION)) {
  test(`${tabla}: las columnas del espejo son las de la migracion`, () => {
    assert.deepEqual([...columnas].sort(), columnasDeLaMigracion(tabla).sort())
  })
}

test('la base del banco crea todas las tablas de la herramienta', () => {
  const base = abreBase()
  try {
    const existentes = new Set(tablasDe(base))
    for (const tabla of Object.keys(ESPEJO_DE_LA_MIGRACION)) {
      assert.ok(existentes.has(tabla), `falta la tabla "${tabla}" en la base del banco`)
    }
  } finally {
    base.cierra()
  }
})

for (const [tabla, columnas] of Object.entries(ESPEJO_DE_LA_MIGRACION)) {
  test(`${tabla}: la base del banco tiene las columnas declaradas`, () => {
    const base = abreBase()
    try {
      assert.deepEqual([...columnasDe(base, tabla)].sort(), [...columnas].sort())
    } finally {
      base.cierra()
    }
  })
}

// --- Las listas de valores, atadas al CHECK de la migracion -------------------------------------

const LISTAS: readonly (readonly [string, string, readonly string[]])[] = [
  ['documentos', 'estado', ESTADOS_DE_DOCUMENTO],
  ['documentos', 'clase_de_fuente', CLASES_DE_FUENTE],
  ['membresias', 'rol', ROLES],
  ['lotes', 'tipo_de_trabajo', TIPOS_DE_TRABAJO],
  ['lotes', 'estado', ESTADOS_DE_LOTE],
]

for (const [tabla, columna, lista] of LISTAS) {
  test(`${tabla}.${columna}: la lista del banco es espejo del CHECK`, () => {
    assert.deepEqual([...lista].sort(), valoresDelCheck(tabla, columna).sort())
  })
}

test('las tablas de negocio NO salen de la migracion: son del proyecto consumidor', () => {
  // Si alguna vez una de estas apareciera en la migracion, significaria que la herramienta se ha
  // puesto a declarar los catalogos de sus consumidores, que es justo lo que §2.8 evita.
  for (const tabla of TABLAS_DE_NEGOCIO) {
    assert.ok(
      !new RegExp(`create table if not exists public\\.${tabla}\\b`, 'i').test(sql),
      `"${tabla}" es una tabla de negocio y no debe estar en la migracion de la herramienta`,
    )
  }
})

test('el CHECK de identidad del banco acepta un sha256 y rechaza lo que no lo es', () => {
  const base = abreBase()
  try {
    base.db
      .prepare('insert into organizaciones (id, nombre, creado_en) values (?, ?, ?)')
      .run('org', 'Prueba', '2026-01-01T00:00:00.000Z')
    const alta = base.db.prepare(
      `insert into documentos (id, organizacion_id, identidad, clase_de_fuente, estado, paginas, creado_en)
       values (?, 'org', ?, 'documento', 'extraido', '[]', '2026-01-01T00:00:00.000Z')`,
    )
    const bueno = 'a'.repeat(64)
    alta.run('d1', bueno)
    // Longitud correcta pero con un caracter fuera del alfabeto hexadecimal: el `~` de Postgres lo
    // rechaza y el `not glob` del banco tambien tiene que hacerlo.
    assert.throws(() => alta.run('d2', `${'a'.repeat(63)}z`), /CHECK/i)
    assert.throws(() => alta.run('d3', 'a'.repeat(63)), /CHECK/i)
  } finally {
    base.cierra()
  }
})
