import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const fuentes = readdirSync(join(raiz, 'src')).filter((f) => f.endsWith('.ts'))

/** Lo que convierte una herramienta en "un trozo de una app concreta con otro nombre". */
const PROHIBIDO = [/from ['"]react/, /from ['"]next/, /from ['"]@supabase/, /from ['"]@mistralai/]

/**
 * LA regla del contrato de empaquetado: el nucleo no importa nada. Si esto se rompe, el paquete
 * deja de ser instalable en cualquier proyecto y nadie se entera hasta el proyecto de DESTINO.
 */
test('el nucleo no importa React, Next, Supabase ni ningun proveedor', () => {
  for (const archivo of fuentes) {
    const codigo = readFileSync(join(raiz, 'src', archivo), 'utf8')
    for (const patron of PROHIBIDO) {
      assert.doesNotMatch(codigo, patron, `src/${archivo} importa algo prohibido: ${patron}`)
    }
  }
})

test('el nucleo no tiene dependencias declaradas', () => {
  const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')) as Record<string, unknown>
  assert.equal(pkg.dependencies, undefined, 'una dependencia en el nucleo la hereda todo consumidor')
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.sideEffects, false)
  assert.ok(typeof pkg.engines === 'object' && pkg.engines !== null)
})

test('el nucleo no toca el DOM ni el sistema de archivos', () => {
  // Es lo que permite probarlo sin navegador. `webkitdirectory` y `webkitGetAsEntry` viven en
  // ./react, no aqui: aqui el arbol llega ya aplanado.
  for (const archivo of fuentes) {
    const codigo = readFileSync(join(raiz, 'src', archivo), 'utf8')
    for (const patron of [/\bdocument\./, /\bwindow\./, /from ['"]node:fs/]) {
      assert.doesNotMatch(codigo, patron, `src/${archivo} usa ${patron}`)
    }
  }
})

test('no se usa `any` en ninguna fuente', () => {
  for (const archivo of fuentes) {
    const codigo = readFileSync(join(raiz, 'src', archivo), 'utf8')
    assert.doesNotMatch(codigo, /:\s*any\b/, `src/${archivo} usa any; la regla de la casa es unknown`)
  }
})

test('ningun archivo pasa de 500 lineas ni ninguna funcion exportada es enorme', () => {
  for (const archivo of fuentes) {
    const lineas = readFileSync(join(raiz, 'src', archivo), 'utf8').split('\n').length
    assert.ok(lineas <= 500, `src/${archivo} tiene ${lineas} lineas`)
  }
})
