import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Las tres carpetas de ADAPTADOR: las unicas que pueden importar su peer, tocar el DOM o hablar
 * con la red. Todo lo demas bajo `src/` es NUCLEO, este en el primer nivel o en una subcarpeta.
 *
 * La lista esta al reves A PROPOSITO, y esa inversion arregla un hueco real. Antes el nucleo se
 * definia como "lo del primer nivel de src/", asi que una carpeta nueva quedaba clasificada como
 * adaptador sin que nadie lo decidiera, y se libraba de las dos garantias que mas le importan: no
 * importar proveedores y no tocar el sistema de archivos. Enumerando lo que SI es adaptador, lo
 * nuevo cae del lado seguro por defecto — y si de verdad necesita un peer, falla ruidosamente y
 * alguien tiene que venir a declararlo aqui, que es exactamente cuando conviene decidirlo.
 *
 * Es la segunda mitad de una leccion que este archivo ya se llevo una vez: la prueba leia solo el
 * primer nivel, y un adaptador podia usar `any`, pasar de 500 lineas o tocar el DOM sin que
 * ningun gate se enterara. Un contrato que solo cubre la mitad del paquete es justo la clase de
 * control que pasa su propia prueba mientras deja el hueco abierto.
 */
const CARPETAS_DE_ADAPTADOR = ['motores/', 'almacenes/', 'react/'] as const

function fuentesBajo(desde: string, prefijo = ''): string[] {
  const salida: string[] = []
  for (const entrada of readdirSync(desde, { withFileTypes: true })) {
    if (entrada.isDirectory()) salida.push(...fuentesBajo(join(desde, entrada.name), `${prefijo}${entrada.name}/`))
    else if (/\.tsx?$/.test(entrada.name)) salida.push(`${prefijo}${entrada.name}`)
  }
  return salida
}

const esAdaptador = (archivo: string): boolean =>
  CARPETAS_DE_ADAPTADOR.some((carpeta) => archivo.startsWith(carpeta))

const todas = fuentesBajo(join(raiz, 'src'))
/** El NUCLEO: lo que se sirve por `.` y por cualquier subpath que no arrastre un peer. */
const fuentes = todas.filter((archivo) => !esAdaptador(archivo))
const adaptadores = todas.filter(esAdaptador)

/**
 * Control sobre el propio control, y no es ceremonia: sin el, la inversion de arriba se puede
 * romper sin que ninguna prueba se entere.
 *
 * Se comprueba sobre la FUNCION y con rutas inventadas, no sobre el arbol de hoy. Recorrer el
 * arbol no demostraria nada mientras no exista ninguna carpeta de nucleo: la prueba pasaria en
 * verde por no tener nada que clasificar, que es la peor clase de prueba que hay.
 */
test('una carpeta nueva bajo src/ se clasifica como nucleo, no como adaptador', () => {
  assert.equal(esAdaptador('xml/lexico.ts'), false, 'una carpeta nueva tiene que caer en el nucleo')
  assert.equal(esAdaptador('xml/cfdi/comprobante-40.ts'), false, 'y tambien si esta mas anidada')
  assert.equal(esAdaptador('motores/mistral.ts'), true)
  assert.equal(esAdaptador('almacenes/supabase.ts'), true)
  assert.equal(esAdaptador('react/index.ts'), true)
})

test('toda carpeta declarada como adaptador existe de verdad', () => {
  // Si alguien renombra una carpeta y no toca la lista, esa carpeta pasa a tratarse como nucleo.
  // Es el lado seguro, pero un adaptador legitimo tratado como nucleo tampoco es correcto, y sin
  // esto la lista se queda obsoleta en silencio.
  for (const carpeta of CARPETAS_DE_ADAPTADOR) {
    assert.ok(
      existsSync(join(raiz, 'src', carpeta)),
      `CARPETAS_DE_ADAPTADOR nombra src/${carpeta}, que no existe`,
    )
  }
})

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
