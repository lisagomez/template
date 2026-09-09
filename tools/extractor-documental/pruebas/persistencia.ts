import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  almacenDeDocumentos,
  almacenDePlantillas,
  validaPaginasGuardadas,
  ESTADOS_EN_BASE,
  CLASES_EN_BASE,
  ROLES_EN_BASE,
  TIPOS_DE_TRABAJO_EN_BASE,
  ESTADOS_DE_LOTE_EN_BASE,
} from '../dist/almacenes/supabase.js'
import { almacenDeOriginales } from '../dist/almacenes/supabase-storage.js'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const sql = readFileSync(join(raiz, 'migraciones', '001-extractor-documental.sql'), 'utf8')

/** El cuerpo de un `create table`, para no confundir columnas del mismo nombre en tablas distintas. */
function bloqueDeTabla(tabla: string): string {
  const encontrado = new RegExp(`create table if not exists public\\.${tabla}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i').exec(sql)
  assert.ok(encontrado, `no encuentro la tabla "${tabla}" en la migracion`)
  return encontrado[1]
}

/**
 * Saca la lista de un `CHECK (<columna> in ('a', 'b'))` de UNA tabla concreta.
 *
 * La tabla es obligatoria por un motivo que costo un fallo: `estado` existe en `lotes`
 * (abierto/cerrado) y en `documentos` (los nueve del ciclo). Buscar por columna suelta cazaba la
 * primera y comparaba dos listas que no tienen por que parecerse.
 */
function valoresDelCheck(tabla: string, columna: string): string[] {
  const bloque = bloqueDeTabla(tabla)
  const patron = new RegExp(`check\\s*\\(\\s*${columna}\\s+in\\s*\\(([^)]*)\\)`, 'is')
  const encontrado = patron.exec(bloque)
  assert.ok(encontrado, `no hay CHECK para "${tabla}.${columna}"`)
  return [...encontrado[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

/** Saca los miembros de una union de tipos de TypeScript, para atarla al CHECK. */
function unionDe(archivo: string, nombre: string): string[] {
  const codigo = readFileSync(join(raiz, 'src', archivo), 'utf8')
  const patron = new RegExp(`export type ${nombre}\\s*=([^]*?)(?=\\n\\n|\\nexport|\\n/\\*)`, 's')
  const encontrado = patron.exec(codigo)
  assert.ok(encontrado, `no encuentro la union ${nombre} en src/${archivo}`)
  return [...encontrado[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

// --- El espejo: la base, el adaptador y el nucleo dicen lo mismo ---------------------------------

test('los estados de documento: migracion, adaptador y NUCLEO dicen la misma lista', () => {
  // Tres sitios repiten esta lista: `tipos.ts`, el adaptador y el SQL. El dia que alguien anada
  // un estado en uno solo, esto falla — que es todo el motivo de que la prueba exista.
  const enSql = valoresDelCheck('documentos', 'estado').sort()
  assert.deepEqual([...ESTADOS_EN_BASE].sort(), enSql)
  assert.deepEqual(unionDe('tipos.ts', 'EstadoDocumento').sort(), enSql)
})

test('las clases de fuente, igual en los tres', () => {
  const enSql = valoresDelCheck('documentos', 'clase_de_fuente').sort()
  assert.deepEqual([...CLASES_EN_BASE].sort(), enSql)
  assert.deepEqual(unionDe('tipos.ts', 'ClaseDeFuente').sort(), enSql)
})

test('los roles, igual entre migracion, adaptador y nucleo', () => {
  const enSql = valoresDelCheck('membresias', 'rol').sort()
  assert.deepEqual([...ROLES_EN_BASE].sort(), enSql)
  assert.deepEqual(unionDe('roles.ts', 'Rol').sort(), enSql)
})

test('los tipos de trabajo del lote son espejo', () => {
  assert.deepEqual([...TIPOS_DE_TRABAJO_EN_BASE].sort(), valoresDelCheck('lotes', 'tipo_de_trabajo').sort())
})

test('los estados del lote son espejo, y NO son los del documento', () => {
  const deLote = valoresDelCheck('lotes', 'estado').sort()
  assert.deepEqual([...ESTADOS_DE_LOTE_EN_BASE].sort(), deLote)
  assert.notDeepEqual(deLote, valoresDelCheck('documentos', 'estado').sort())
})

// --- Que la migracion cubra lo que los adaptadores usan -------------------------------------------

test('toda tabla que tocan los adaptadores existe en la migracion', () => {
  const fuentes = ['almacenes/supabase.ts'].map((f) => readFileSync(join(raiz, 'src', f), 'utf8')).join('\n')
  const usadas = new Set([...fuentes.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1]))
  assert.ok(usadas.size > 0, 'la prueba no encontro ninguna tabla: revisa el patron')
  for (const tabla of usadas) {
    assert.match(
      sql,
      new RegExp(`create table if not exists public\\.${tabla}\\b`, 'i'),
      `el adaptador usa "${tabla}" y la migracion no la crea: revienta en el proyecto de destino`,
    )
  }
})

// --- Las reglas de la casa, verificadas sobre el SQL ----------------------------------------------

test('TODA tabla creada tiene RLS activada', () => {
  const creadas = [...sql.matchAll(/create table if not exists public\.([a-z_]+)/gi)].map((m) => m[1])
  assert.ok(creadas.length >= 7)
  for (const tabla of creadas) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.${tabla} enable row level security`, 'i'),
      `"${tabla}" se crea sin RLS: seria una tabla que cualquiera lee`,
    )
  }
})

/**
 * Quita comentarios antes de buscar. Importa: la primera version de estas dos pruebas prohibia la
 * cadena `service_role` a secas, y fallaba contra el comentario que explica **que no se usa**.
 * Una prueba asi obliga a borrar la explicacion para pasar, que es el peor intercambio posible:
 * se pierde el porque y se gana un verde. Lo que hay que vigilar es el USO.
 */
const sinComentariosSql = (t: string) => t.replace(/--.*$/gm, '')
const sinComentariosTs = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

test('la migracion no USA service_role por ninguna parte (C7)', () => {
  assert.doesNotMatch(sinComentariosSql(sql), /service_role/i)
})

test('los adaptadores tampoco lo usan', () => {
  for (const f of ['almacenes/supabase.ts', 'almacenes/supabase-storage.ts']) {
    const codigo = sinComentariosTs(readFileSync(join(raiz, 'src', f), 'utf8'))
    assert.doesNotMatch(codigo, /service_role|SERVICE_ROLE/)
  }
})

test('y ninguna policy se abre a un rol que no sea `authenticated`', () => {
  const roles = [...sinComentariosSql(sql).matchAll(/create policy[\s\S]*?\sto\s+(\w+)/gi)].map((m) => m[1])
  assert.ok(roles.length > 0)
  for (const rol of roles) {
    assert.equal(rol, 'authenticated', `hay una policy para "${rol}": anon o public abriria el dato`)
  }
})

test('el bucket de originales se crea PRIVADO', () => {
  assert.match(sql, /storage\.buckets[^;]*'originales'[^;]*false/i, 'un bucket publico con facturas es una fuga con enlace permanente')
})

test('la policy del bucket se acota por el primer segmento de la ruta', () => {
  assert.match(sql, /storage\.foldername\(name\)\)\[1\]/, 'sin ese segmento la RLS del bucket no es expresable')
})

test('versiones_de_campo es append-only DE VERDAD: sin policy de update ni de delete', () => {
  // Sin policy permisiva, RLS deniega. Es la diferencia entre "no lo hacemos" y "no se puede".
  const policies = [...sql.matchAll(/create policy\s+(\w+)\s+on\s+public\.versiones_de_campo\s+for\s+(\w+)/gi)]
  const acciones = policies.map((m) => m[2].toLowerCase())
  assert.ok(acciones.includes('select') && acciones.includes('insert'))
  assert.ok(!acciones.includes('update'), 'corregir es insertar una version nueva, nunca reescribir')
  assert.ok(!acciones.includes('delete'))
  assert.ok(!acciones.includes('all'))
})

test('las lapidas tampoco se editan ni se borran: son la constancia', () => {
  const acciones = [...sql.matchAll(/create policy\s+\w+\s+on\s+public\.lapidas\s+for\s+(\w+)/gi)].map((m) => m[1].toLowerCase())
  assert.ok(!acciones.includes('update') && !acciones.includes('delete') && !acciones.includes('all'))
})

test('la lapida NO tiene clave foranea al documento: tiene que sobrevivirlo', () => {
  const bloque = /create table if not exists public\.lapidas\s*\(([^;]*)\)/i.exec(sql)
  assert.ok(bloque)
  assert.doesNotMatch(bloque[1], /documento_id[^,]*references/i, 'un cascade se llevaria la constancia de que existio')
})

test('la funcion de pertenencia fija su search_path', () => {
  assert.match(sql, /security definer[\s\S]{0,120}set search_path/i, 'un security definer con search_path abierto es una via de escalada')
})

// --- Los adaptadores, contra un cliente de mentira --------------------------------------------------

function clienteFalso(respuesta: { data: unknown; error: { message: string } | null }) {
  const llamadas: { tabla?: string; metodo: string; args: unknown[] }[] = []
  const consulta: Record<string, unknown> = {}
  for (const metodo of ['select', 'insert', 'upsert', 'eq', 'order']) {
    consulta[metodo] = (...args: unknown[]) => {
      llamadas.push({ metodo, args })
      return consulta
    }
  }
  consulta.maybeSingle = () => Promise.resolve(respuesta)
  consulta.then = (r: (v: unknown) => unknown) => Promise.resolve(respuesta).then(r)
  const cliente = {
    from(tabla: string) {
      llamadas.push({ tabla, metodo: 'from', args: [] })
      return consulta as never
    },
  }
  return { cliente, llamadas }
}

test('guardar acota por organizacion y usa la identidad por contenido', async () => {
  const { cliente, llamadas } = clienteFalso({ data: null, error: null })
  await almacenDeDocumentos({ cliente, organizacionId: 'org-1' }).guarda('a'.repeat(64), [])
  const upsert = llamadas.find((l) => l.metodo === 'upsert')
  assert.ok(upsert)
  const fila = upsert.args[0] as Record<string, unknown>
  assert.equal(fila.organizacion_id, 'org-1')
  assert.equal(fila.identidad, 'a'.repeat(64))
})

test('un error de la base se propaga con contexto en vez de devolver null', async () => {
  const { cliente } = clienteFalso({ data: null, error: { message: 'permission denied' } })
  await assert.rejects(
    () => almacenDeDocumentos({ cliente, organizacionId: 'org-1' }).lee('x'),
    /no se pudo leer.*permission denied/,
  )
})

test('un documento que no existe devuelve null, no un error', async () => {
  const { cliente } = clienteFalso({ data: null, error: null })
  assert.equal(await almacenDeDocumentos({ cliente, organizacionId: 'org-1' }).lee('x'), null)
})

test('lo guardado se valida al leerlo: una forma vieja no se cuela como pagina', () => {
  assert.deepEqual(validaPaginasGuardadas([{ sin: 'markdown' }, { markdown: 'ok', indice: 3 }]), [
    { indice: 3, markdown: 'ok', campos: [] },
  ])
})

test('la plantilla se guarda por organizacion y tipo de documento', async () => {
  const { cliente, llamadas } = clienteFalso({ data: null, error: null })
  await almacenDePlantillas({ cliente, organizacionId: 'org-1' }).guardaPorDefecto('factura', { campos: [] })
  const upsert = llamadas.find((l) => l.metodo === 'upsert')
  const fila = upsert?.args[0] as Record<string, unknown>
  assert.equal(fila.tipo_documento, 'factura')
  assert.equal(fila.organizacion_id, 'org-1')
})

// --- Storage ------------------------------------------------------------------------------------

function storageFalso(respuesta: { data: unknown; error: { message: string } | null }) {
  const llamadas: { metodo: string; args: unknown[] }[] = []
  const api = {
    upload: (...args: unknown[]) => (llamadas.push({ metodo: 'upload', args }), Promise.resolve(respuesta)),
    createSignedUrl: (...args: unknown[]) => (llamadas.push({ metodo: 'createSignedUrl', args }), Promise.resolve(respuesta)),
    remove: (...args: unknown[]) => (llamadas.push({ metodo: 'remove', args }), Promise.resolve(respuesta)),
  }
  return { cliente: { storage: { from: () => api } } as never, llamadas }
}

test('la URL firmada se acota al tope aunque se pidan treinta dias', async () => {
  const { cliente, llamadas } = storageFalso({ data: { signedUrl: 'https://x/y' }, error: null })
  await almacenDeOriginales({ cliente, segundosMaximos: 3600 }).urlFirmada('org/doc.pdf', 60 * 60 * 24 * 30)
  const firma = llamadas.find((l) => l.metodo === 'createSignedUrl')
  assert.equal(firma?.args[1], 3600, 'una URL firmada larga circula por correo y sobrevive al permiso')
})

test('una caducidad no positiva se rechaza', async () => {
  const { cliente } = storageFalso({ data: null, error: null })
  await assert.rejects(() => almacenDeOriginales({ cliente }).urlFirmada('a', 0), RangeError)
})

test('si Storage no devuelve URL, se lanza en vez de devolver una cadena vacia', async () => {
  const { cliente } = storageFalso({ data: {}, error: null })
  await assert.rejects(() => almacenDeOriginales({ cliente }).urlFirmada('a', 60), /no devolvio una URL firmada/)
})

test('subir no sobrescribe: la ruta lleva la identidad por contenido', async () => {
  const { cliente, llamadas } = storageFalso({ data: null, error: null })
  await almacenDeOriginales({ cliente }).guarda('org/doc.pdf', new Uint8Array([1]), 'application/pdf')
  const subida = llamadas.find((l) => l.metodo === 'upload')
  assert.equal((subida?.args[2] as Record<string, unknown>).upsert, false)
})
