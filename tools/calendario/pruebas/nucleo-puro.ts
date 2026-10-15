/**
 * La regla que hace de esto una herramienta y no un trozo de app: el NUCLEO no importa React, ni Next,
 * ni Supabase, ni nada de Node que no corra en un navegador. Se recorre el grafo de imports de
 * `dist/index.js` y se mira cada especificador.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

function grafo(entrada: string): { archivos: string[]; externos: Set<string> } {
  const vistos = new Set<string>()
  const externos = new Set<string>()
  const pendientes = [join(dist, entrada)]
  while (pendientes.length) {
    const archivo = pendientes.pop() as string
    if (vistos.has(archivo)) continue
    vistos.add(archivo)
    const codigo = readFileSync(archivo, 'utf8')
    for (const m of codigo.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const esp = (m[1] ?? m[2]) as string
      if (esp.startsWith('.')) pendientes.push(resolve(dirname(archivo), esp))
      else externos.add(esp)
    }
  }
  return { archivos: [...vistos], externos }
}

test('el nucleo solo depende de zod: ni React, ni Next, ni Supabase, ni node:*', () => {
  const { archivos, externos } = grafo('index.js')
  assert.ok(archivos.length >= 10, `se recorrieron ${archivos.length} modulos`)
  assert.deepEqual([...externos], ['zod'])
})

test('los adaptadores con dependencias viven en su subpath, fuera del nucleo', () => {
  const nucleo = new Set(grafo('index.js').archivos)
  for (const sub of ['react/index.js', 'gog/proceso.js', 'almacenes/archivo.js']) {
    assert.ok(!nucleo.has(join(dist, sub)), `${sub} no entra por el nucleo`)
  }
})
