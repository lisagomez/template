/**
 * El registro de esquemas: el punto de extension.
 *
 * La prueba que de verdad importa aqui es la del esquema INVENTADO. Un registro probado solo con
 * complementos del SAT demuestra que sabemos leer esos cuatro; probado con uno que no existe
 * demuestra que es un mecanismo, que es lo que se pidio.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analizaXml, atributo } from '../dist/xml/arbol.js'
import { registroDeEsquemas, avisoDeComplementos } from '../dist/xml/registro.js'
import type { LectorDeComplemento } from '../dist/xml/registro.js'
import type { Elemento } from '../dist/xml/arbol.js'

const MIO = 'http://ejemplo.invalid/mi-esquema'
const OTRO = 'http://ejemplo.invalid/otro-esquema'

/** Un lector de un esquema que no existe en ningun sitio. Ese es el punto. */
function lectorInventado(version = '1.0'): LectorDeComplemento {
  return {
    clave: { espacio: MIO, nombreLocal: 'MiComplemento', version },
    nombre: 'Mi complemento de prueba',
    lee: (nodo: Elemento) => ({
      campos: [
        {
          clave: 'mi_dato',
          valor: atributo(nodo, 'Dato') ?? '',
          confianza: 1,
          procedencia: 'xml' as const,
        },
      ],
      noLeido: ['Detalle'],
    }),
  }
}

/** Envuelve un complemento en un comprobante minimo y devuelve el nodo `Complemento`. */
function complementoCon(dentro: string, espacios = `xmlns:m="${MIO}"`): Elemento {
  const doc = analizaXml(`<C ${espacios}><Complemento>${dentro}</Complemento></C>`)
  return doc.raiz.hijos[0]
}

// --- El mecanismo sirve fuera del CFDI -----------------------------------------------------------

test('un lector de un esquema INVENTADO se registra y lee', () => {
  const registro = registroDeEsquemas([lectorInventado()])
  const leido = registro.lee(complementoCon('<m:MiComplemento Version="1.0" Dato="hola"/>'))
  assert.equal(leido.sinLector.length, 0)
  assert.equal(leido.leidos.length, 1)
  assert.equal(leido.leidos[0].nombre, 'Mi complemento de prueba')
  assert.deepEqual(leido.leidos[0].campos.map((c) => [c.clave, c.valor]), [['mi_dato', 'hola']])
})

test('todo campo de un complemento sale con procedencia xml', () => {
  const registro = registroDeEsquemas([lectorInventado()])
  const leido = registro.lee(complementoCon('<m:MiComplemento Version="1.0" Dato="x"/>'))
  for (const campo of leido.leidos[0].campos) assert.equal(campo.procedencia, 'xml')
})

test('lo que el lector vio y no tradujo queda declarado', () => {
  const registro = registroDeEsquemas([lectorInventado()])
  const leido = registro.lee(complementoCon('<m:MiComplemento Version="1.0" Dato="x"/>'))
  assert.deepEqual(leido.leidos[0].noLeido, ['Detalle'])
})

// --- Resolucion por direccion, no por prefijo ----------------------------------------------------

test('el prefijo del documento no tiene que coincidir con ninguno del lector', () => {
  // El lector declara una DIRECCION. Que el documento la escriba con `m:`, con `zz:` o sin prefijo
  // es asunto del emisor.
  const registro = registroDeEsquemas([lectorInventado()])
  const conZz = registro.lee(
    complementoCon('<zz:MiComplemento Version="1.0" Dato="x"/>', `xmlns:zz="${MIO}"`),
  )
  assert.equal(conZz.leidos.length, 1, 'otro prefijo, misma direccion: se lee igual')

  const porDefecto = registro.lee(
    complementoCon('<MiComplemento Version="1.0" Dato="x"/>', `xmlns="${MIO}"`),
  )
  assert.equal(porDefecto.leidos.length, 1, 'sin prefijo, con espacio por defecto: se lee igual')
})

test('el mismo nombre en otra direccion NO lo lee el mismo lector', () => {
  const registro = registroDeEsquemas([lectorInventado()])
  const leido = registro.lee(
    complementoCon('<o:MiComplemento Version="1.0" Dato="x"/>', `xmlns:o="${OTRO}"`),
  )
  assert.equal(leido.leidos.length, 0)
  assert.equal(leido.sinLector.length, 1)
})

// --- Declarar, no descartar ----------------------------------------------------------------------

test('un complemento sin lector se declara con su direccion y su version', () => {
  const registro = registroDeEsquemas([])
  const leido = registro.lee(
    complementoCon('<o:Desconocido Version="3.1" A="1"/>', `xmlns:o="${OTRO}"`),
  )
  assert.equal(leido.sinLector.length, 1)
  assert.equal(leido.sinLector[0].espacio, OTRO)
  assert.equal(leido.sinLector[0].nombreLocal, 'Desconocido')
  assert.equal(leido.sinLector[0].version, '3.1')
  assert.match(leido.sinLector[0].motivo, /sin lector registrado/)
})

test('el prefijo se conserva para ensenarlo, aunque no se use para resolver', () => {
  const registro = registroDeEsquemas([])
  const leido = registro.lee(
    complementoCon('<o:Desconocido Version="1.0"/>', `xmlns:o="${OTRO}"`),
  )
  assert.equal(leido.sinLector[0].prefijo, 'o')
})

test('un registro VACIO recorre el mismo codigo que uno poblado', () => {
  // Un camino distinto para el caso vacio es un camino que casi nunca se ejercita.
  const leido = registroDeEsquemas([]).lee(complementoCon('<m:MiComplemento Version="1.0"/>'))
  assert.equal(leido.leidos.length, 0)
  assert.equal(leido.sinLector.length, 1)
})

// --- Los tres motivos, que NO son el mismo hecho -------------------------------------------------

test('no hay lector y hay lector de otra version dan motivos DISTINTOS', () => {
  // Confundirlos esconde una migracion de esquema del SAT detras de un "no lo soportamos". Para
  // quien integra son dos acciones distintas: registrar algo nuevo, o actualizar lo registrado.
  const registro = registroDeEsquemas([lectorInventado('2.0')])

  const desconocido = registro.lee(
    complementoCon('<o:Otro Version="1.0"/>', `xmlns:o="${OTRO}"`),
  )
  assert.match(desconocido.sinLector[0].motivo, /sin lector registrado/)

  const desajuste = registro.lee(complementoCon('<m:MiComplemento Version="1.0"/>'))
  assert.match(desajuste.sinLector[0].motivo, /hay lector para la version 2\.0/)
  assert.match(desajuste.sinLector[0].motivo, /declara 1\.0/)
})

test('un complemento sin atributo Version tampoco se lee, y se dice por que', () => {
  const registro = registroDeEsquemas([lectorInventado('2.0')])
  const leido = registro.lee(complementoCon('<m:MiComplemento Dato="x"/>'))
  assert.equal(leido.leidos.length, 0)
  assert.equal(leido.sinLector[0].version, null)
  assert.match(leido.sinLector[0].motivo, /no declara ninguna/)
})

test('la version es PINEADA: una version que no es la registrada no se lee "porque se parece"', () => {
  const registro = registroDeEsquemas([lectorInventado('2.0')])
  const leido = registro.lee(complementoCon('<m:MiComplemento Version="2.1" Dato="x"/>'))
  assert.equal(leido.leidos.length, 0, 'leer 2.1 con las reglas de 2.0 daria un dato distinto')
  assert.equal(
    leido.leidos.flatMap((l) => l.campos).length,
    0,
    'y ningun campo suyo puede aparecer en el resultado',
  )
})

// --- Errores de integracion ----------------------------------------------------------------------

test('dos lectores para la misma clave es error al construir, no eleccion en silencio', () => {
  assert.throws(
    () => registroDeEsquemas([lectorInventado('1.0'), lectorInventado('1.0')]),
    /Dos lectores registrados/,
  )
})

test('dos lectores del mismo esquema en versiones distintas SI conviven', () => {
  const registro = registroDeEsquemas([lectorInventado('1.0'), lectorInventado('2.0')])
  assert.deepEqual([...registro.versionesDe(MIO, 'MiComplemento')].sort(), ['1.0', '2.0'])
  assert.equal(registro.registrados.length, 2)
})

test('busca devuelve null cuando no hay nada, no lanza', () => {
  // `null` no es un fallo: es un hueco que se declara.
  assert.equal(registroDeEsquemas([]).busca(MIO, 'MiComplemento', '1.0'), null)
})

// --- El aviso ------------------------------------------------------------------------------------

test('el aviso nombra lo que no se leyo y dice que sus datos no estan', () => {
  const registro = registroDeEsquemas([])
  const aviso = avisoDeComplementos(
    registro.lee(complementoCon('<o:Pagos Version="2.0"/>', `xmlns:o="${OTRO}"`)),
  ) ?? ''
  assert.match(aviso, /Pagos/)
  assert.match(aviso, /NO estan en el resultado/)
})

test('sin nada pendiente el aviso es null, no una cadena vacia', () => {
  const registro = registroDeEsquemas([lectorInventado()])
  const leido = registro.lee(complementoCon('<m:MiComplemento Version="1.0" Dato="x"/>'))
  assert.equal(avisoDeComplementos(leido), null)
})
