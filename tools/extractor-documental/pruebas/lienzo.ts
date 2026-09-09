import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construyeLienzo, impedimentosDeRelacion, familiaDeTipo, altoDeTarjeta } from '../dist/react/lienzo.js'
import type { DescriptorDeEsquema } from '../dist/esquema.js'
import type { EntidadPropuesta, RelacionPropuesta } from '../dist/modelo.js'

const DESCRIPTOR: DescriptorDeEsquema = {
  version: '1',
  tablas: [
    {
      nombre: 'proveedores',
      esCatalogo: true,
      columnas: [
        { nombre: 'id', tipo: 'bigint', nulable: false, esClavePrimaria: true },
        { nombre: 'nombre', tipo: 'text', nulable: false },
      ],
    },
  ],
}

const ENTIDADES: EntidadPropuesta[] = [
  {
    tabla: 'facturas',
    columnas: [
      { nombre: 'folio', tipo: 'text', nulable: true },
      { nombre: 'proveedores_id', tipo: 'bigint', nulable: true, referencia: { tabla: 'proveedores', columna: 'id' } },
    ],
  },
]

const RELACIONES: RelacionPropuesta[] = [
  {
    desde: 'facturas',
    columna: 'proveedores_id',
    hacia: 'proveedores',
    hastaColumna: 'id',
    cardinalidad: '*',
    haciaPreexistente: true,
  },
]

// --- Lo que se copia de Power BI ------------------------------------------------------------------

test('una tarjeta por entidad, preexistentes y propuestas', () => {
  const { tarjetas } = construyeLienzo(ENTIDADES, RELACIONES, DESCRIPTOR)
  assert.deepEqual(tarjetas.map((t) => t.tabla), ['proveedores', 'facturas'])
})

test('lo preexistente se distingue por POSICION, no solo por color', () => {
  // Ponerlo tambien en la posicion lo hace legible para quien no distinga esos dos colores.
  const { tarjetas } = construyeLienzo(ENTIDADES, RELACIONES, DESCRIPTOR)
  const previa = tarjetas.find((t) => t.tabla === 'proveedores')
  const propuesta = tarjetas.find((t) => t.tabla === 'facturas')
  assert.equal(previa?.preexistente, true)
  assert.equal(propuesta?.preexistente, false)
  assert.ok((previa?.x ?? 0) < (propuesta?.x ?? 0))
})

test('las tarjetas se apilan sin solaparse', () => {
  const dos: DescriptorDeEsquema = {
    version: '1',
    tablas: [DESCRIPTOR.tablas[0], { nombre: 'clientes', columnas: [{ nombre: 'id', tipo: 'bigint', nulable: false }] }],
  }
  const { tarjetas } = construyeLienzo([], [], dos)
  const [a, b] = tarjetas
  assert.ok(b.y >= a.y + altoDeTarjeta(a), 'se solapan: la segunda empieza antes de que acabe la primera')
})

test('la cardinalidad va en los extremos, y el destino siempre es 1', () => {
  const { lineas } = construyeLienzo(ENTIDADES, RELACIONES, DESCRIPTOR)
  assert.equal(lineas[0].cardinalidadOrigen, '*')
  assert.equal(lineas[0].cardinalidadDestino, '1', 'el destino es la clave primaria: no puede ser otra cosa')
})

test('la linea es PUNTEADA cuando apunta a una tabla preexistente', () => {
  // Esa no se crea: se referencia. Es la convencion de Power BI y se entiende sin leyenda.
  const { lineas } = construyeLienzo(ENTIDADES, RELACIONES, DESCRIPTOR)
  assert.equal(lineas[0].trazo, 'punteada')
})

test('y SOLIDA cuando las dos las propone el modelo', () => {
  const { lineas } = construyeLienzo(
    ENTIDADES,
    [{ ...RELACIONES[0], haciaPreexistente: false }],
    { version: '1', tablas: [] },
  )
  assert.equal(lineas[0].trazo, 'solida')
})

test('la linea dice que columna apunta a que columna', () => {
  const { lineas } = construyeLienzo(ENTIDADES, RELACIONES, DESCRIPTOR)
  assert.equal(lineas[0].etiqueta, 'proveedores_id → proveedores.id')
})

// --- Lo que NO se copia --------------------------------------------------------------------------

test('NO existe direccion de filtro cruzado en ninguna parte del lienzo', async () => {
  // §2.7: en Power BI describe como se propagan los filtros al calcular agregaciones — un concepto
  // de BI. Aqui lo que existe es la cardinalidad y el sentido de la FK. Traer esa perilla seria
  // ofrecer un control que no gobierna nada, y eso es peor que no tenerlo: quien lo mueve cree
  // haber decidido algo.
  const { lineas } = construyeLienzo(ENTIDADES, RELACIONES, DESCRIPTOR)
  assert.deepEqual(
    Object.keys(lineas[0]).filter((k) => /filtro|cross|direccion/i.test(k)),
    [],
  )
})

// --- RF-33: el detalle ANTES de crear la relacion ---------------------------------------------------

test('no se puede relacionar una tabla consigo misma', () => {
  const faltan = impedimentosDeRelacion({ tabla: 'a', tipo: 'bigint' }, { tabla: 'a', tipo: 'bigint', esClave: true })
  assert.ok(faltan.includes('misma_tabla'))
})

test('el destino tiene que ser clave', () => {
  const faltan = impedimentosDeRelacion({ tabla: 'a', tipo: 'bigint' }, { tabla: 'b', tipo: 'bigint', esClave: false })
  assert.deepEqual(faltan, ['destino_no_es_clave'])
})

test('los tipos incompatibles se rechazan', () => {
  const faltan = impedimentosDeRelacion({ tabla: 'a', tipo: 'text' }, { tabla: 'b', tipo: 'bigint', esClave: true })
  assert.deepEqual(faltan, ['tipos_incompatibles'])
})

test('pero bigint e integer SI son compatibles: se compara por familia', () => {
  // Rechazarlos por no llamarse igual seria un falso impedimento que obliga a pelearse con la
  // herramienta hasta encontrar el nombre que le gusta.
  const faltan = impedimentosDeRelacion({ tabla: 'a', tipo: 'integer' }, { tabla: 'b', tipo: 'bigint', esClave: true })
  assert.deepEqual(faltan, [])
})

test('uuid y text son la misma familia; date es otra', () => {
  assert.equal(familiaDeTipo('uuid'), 'texto')
  assert.equal(familiaDeTipo('varchar(50)'), 'texto')
  assert.equal(familiaDeTipo('numeric(10,2)'), 'numero')
  assert.equal(familiaDeTipo('timestamptz'), 'fecha')
  assert.equal(familiaDeTipo('jsonb'), 'otro')
})

test('se devuelven TODOS los impedimentos, para no arreglarlos de uno en uno', () => {
  const faltan = impedimentosDeRelacion({ tabla: 'a', tipo: 'text' }, { tabla: 'a', tipo: 'bigint', esClave: false })
  assert.deepEqual([...faltan].sort(), ['destino_no_es_clave', 'misma_tabla', 'tipos_incompatibles'])
})

test('un modelo sin nada no revienta el lienzo', () => {
  const lienzo = construyeLienzo([], [], { version: '1', tablas: [] })
  assert.deepEqual(lienzo.tarjetas, [])
  assert.deepEqual(lienzo.lineas, [])
})
