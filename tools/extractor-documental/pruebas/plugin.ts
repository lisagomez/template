import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { manifiesto } from '../dist/plugin.js'

test('el manifiesto trae lo que un lanzador necesita para pintarlo', () => {
  assert.equal(manifiesto.id, 'extractor-documental')
  for (const clave of ['nombre', 'descripcion', 'ruta', 'version'] as const) {
    assert.ok(manifiesto[clave].length > 0, `falta ${clave}`)
  }
  assert.ok(manifiesto.capacidades.length > 0)
})

test('el icono es SVG en linea y hereda el tema del anfitrion', () => {
  assert.match(manifiesto.icono, /^<svg /)
  assert.match(manifiesto.icono, /<\/svg>$/)
  // `currentColor` es lo que hace que el icono funcione en tema claro y oscuro sin dos versiones.
  assert.match(manifiesto.icono, /currentColor/)
})

/**
 * La razon de que el manifiesto viva en su propio subpath: un lanzador que solo quiere el nombre y
 * el icono no debe arrastrar React, ni el nucleo, ni una libreria de iconos. En este template
 * lucide ni siquiera esta instalado.
 */
test('plugin.ts no importa NADA', () => {
  const aqui = dirname(fileURLToPath(import.meta.url))
  const fuente = readFileSync(join(aqui, '../src/plugin.ts'), 'utf8')
  const imports = fuente.match(/^\s*import\s.+$/gm) ?? []
  assert.deepEqual(imports, [], `el manifiesto tiene que ser autonomo, y importa: ${imports.join(' | ')}`)
})
