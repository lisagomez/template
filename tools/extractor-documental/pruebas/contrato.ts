import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

/** El NUCLEO: solo lo de primer nivel. Es lo que se sirve por el subpath `.`. */
const fuentes = readdirSync(join(raiz, 'src')).filter((f) => f.endsWith('.ts'))

/**
 * Todo lo demas: los adaptadores, que viven en subcarpetas y SI pueden importar su peer.
 *
 * Se enumeran aparte porque durante un tiempo no se enumeraban en absoluto: la prueba leia solo
 * el primer nivel, asi que un adaptador podia usar `any`, pasar de 500 lineas o tocar el DOM y
 * ningun gate se enteraba. Un contrato que solo cubre la mitad del paquete es justo la clase de
 * control que pasa su propia prueba mientras deja el hueco abierto.
 */
function fuentesAnidadas(desde = join(raiz, 'src'), prefijo = ''): string[] {
  const salida: string[] = []
  for (const entrada of readdirSync(desde, { withFileTypes: true })) {
    if (entrada.isDirectory()) salida.push(...fuentesAnidadas(join(desde, entrada.name), `${prefijo}${entrada.name}/`))
    else if (/\.tsx?$/.test(entrada.name) && prefijo !== '') salida.push(`${prefijo}${entrada.name}`)
  }
  return salida
}
const adaptadores = fuentesAnidadas()
const todas = [...fuentes, ...adaptadores]

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

test('no se usa `any` en ninguna fuente, adaptadores incluidos', () => {
  for (const archivo of todas) {
    const codigo = readFileSync(join(raiz, 'src', archivo), 'utf8')
    assert.doesNotMatch(codigo, /:\s*any\b/, `src/${archivo} usa any; la regla de la casa es unknown`)
  }
})

test('ningun archivo pasa de 500 lineas, adaptadores incluidos', () => {
  for (const archivo of todas) {
    const lineas = readFileSync(join(raiz, 'src', archivo), 'utf8').split('\n').length
    assert.ok(lineas <= 500, `src/${archivo} tiene ${lineas} lineas`)
  }
})

/**
 * El adaptador autohospedado es el UNICO motor sin dependencia, y esa es su razon de existir: es
 * el que permite montar la herramienta sin que el documento salga del perimetro. En cuanto importe
 * un SDK deja de serlo, y nadie se entera hasta que el proyecto de destino instala de mas.
 */
test('el motor autohospedado no importa absolutamente nada externo', () => {
  const codigo = readFileSync(join(raiz, 'src', 'motores', 'openai-compat.ts'), 'utf8')
  const importa = [...codigo.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
  for (const modulo of importa) {
    assert.ok(
      modulo.startsWith('.'),
      `openai-compat importa "${modulo}": su contrato es \`fetch\` y nada mas (§4 del SDD)`,
    )
  }
})

/** Cada subpath declarado tiene que existir: si no, revienta en el proyecto de destino (TAR-1). */
test('todo subpath de `exports` apunta a un fichero que existe', () => {
  const pkg = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')) as {
    exports: Record<string, { import: string }>
  }
  for (const [subpath, destino] of Object.entries(pkg.exports)) {
    const relativa = destino.import.replace(/^\.\/dist\//, '').replace(/\.js$/, '.ts')
    assert.ok(
      existsSync(join(raiz, 'src', relativa)),
      `exports["${subpath}"] apunta a ${destino.import}, y src/${relativa} no existe`,
    )
  }
})

/**
 * `'use client'` tiene que ser la PRIMERA linea de todo componente, y sobrevivir al build.
 *
 * Sin ella, Next intenta ejecutar el componente en el servidor y falla — pero no aqui: falla en el
 * proyecto de destino, que es el peor sitio para descubrirlo. Se comprueba en la fuente Y en
 * `dist/`, porque lo que se publica es `dist/` y un build que se la coma pasaria esta prueba
 * mirando solo la fuente.
 */
test("todo componente lleva 'use client' en la primera linea, en fuente y en dist", () => {
  const componentes = adaptadores.filter((f) => f.endsWith('.tsx'))
  assert.ok(componentes.length > 0, 'no hay componentes: si se anaden, esta prueba los cubre')
  for (const archivo of componentes) {
    const fuente = readFileSync(join(raiz, 'src', archivo), 'utf8')
    assert.match(fuente.split('\n')[0], /^'use client'$/, `src/${archivo} no empieza por 'use client'`)
    const construido = join(raiz, 'dist', archivo.replace(/\.tsx$/, '.js'))
    if (existsSync(construido)) {
      assert.match(
        readFileSync(construido, 'utf8').split('\n')[0],
        /^['"]use client['"];?$/,
        `el build se comio la directiva en ${archivo}: revienta en el proyecto de destino`,
      )
    }
  }
})

/** El nucleo no puede importar React; `./react` es justo donde SI puede. */
test('solo los archivos de src/react/ importan React', () => {
  for (const archivo of adaptadores) {
    const codigo = readFileSync(join(raiz, 'src', archivo), 'utf8')
    if (archivo.startsWith('react/')) continue
    assert.doesNotMatch(codigo, /from ['"]react/, `src/${archivo} importa React fuera de ./react`)
  }
})
