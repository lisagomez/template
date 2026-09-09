import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  columnasOfrecidas,
  mapeaCampo,
  altasPendientes,
  requiereDecisionHumana,
} from '../dist/react/mapeo.js'
import type { ColumnaOfrecida } from '../dist/react/mapeo.js'
import type { DescriptorDeEsquema } from '../dist/esquema.js'
import type { CampoExtraido } from '../dist/tipos.js'
import { parecidosA } from '../dist/reconciliacion.js'

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
    { nombre: 'facturas', columnas: [{ nombre: 'folio', tipo: 'text', nulable: false }] },
  ],
}

const campo = (valor: string, extra: Partial<CampoExtraido> = {}): CampoExtraido => ({
  clave: 'proveedor',
  valor,
  confianza: 0.9,
  procedencia: 'ocr',
  ...extra,
})

const destino: ColumnaOfrecida = {
  tabla: 'proveedores',
  columna: 'nombre',
  tipo: 'text',
  preexistente: true,
  esCatalogo: true,
  etiqueta: 'proveedores.nombre',
}

const FILAS = [
  { id: '1874', etiqueta: 'ACME S.A. de C.V.' },
  { id: '2001', etiqueta: 'Distribuidora del Norte' },
]

// Umbrales explicitos: no hay default defendible sin medirlo (TAR-25 sigue bloqueada).
const OPCIONES = { resolucion: { umbral: 0.6, margenDeAmbiguedad: 0.1 }, filas: FILAS }

// --- RF-27: que columnas se ofrecen ---------------------------------------------------------------

test('se ofrecen las columnas del descriptor, marcadas como preexistentes', () => {
  const columnas = columnasOfrecidas(DESCRIPTOR)
  assert.deepEqual(columnas.map((c) => c.etiqueta), [
    'proveedores.id',
    'proveedores.nombre',
    'facturas.folio',
  ])
  assert.ok(columnas.every((c) => c.preexistente), 'todas vienen del proyecto: eso es lo que hay que distinguir')
})

test('se distingue que tablas son catalogo: contra ellas se resuelven VALORES', () => {
  const columnas = columnasOfrecidas(DESCRIPTOR)
  assert.equal(columnas.find((c) => c.etiqueta === 'proveedores.nombre')?.esCatalogo, true)
  assert.equal(columnas.find((c) => c.etiqueta === 'facturas.folio')?.esCatalogo, false)
})

test('un descriptor vacio ofrece lista vacia, y es un estado NORMAL', () => {
  // §2.8: el template no tiene bases, asi que el descriptor vacio es el caso normal, no un error.
  assert.deepEqual(columnasOfrecidas({ version: '1', tablas: [] }), [])
})

// --- El mapeo ---------------------------------------------------------------------------------------

test('sin destino elegido el campo queda sin_mapear: no se adivina la columna', () => {
  const mapeo = mapeaCampo(campo('ACME'), null, OPCIONES)
  assert.equal(mapeo.estado, 'sin_mapear')
  assert.equal(mapeo.destino, null)
  assert.equal(mapeo.alta, null, 'sin saber a que catalogo, no hay alta que proponer')
})

test('un valor que coincide se resuelve a la fila existente', () => {
  const mapeo = mapeaCampo(campo('ACME S.A. de C.V.'), destino, OPCIONES)
  assert.equal(mapeo.estado, 'resuelto')
  assert.equal(mapeo.resolucion?.elegida?.id, '1874')
  assert.equal(mapeo.alta, null, 'lo que se resolvio no se da de alta: seria duplicarlo')
})

// --- TAR-22: el valor huerfano -----------------------------------------------------------------------

test('sin coincidencia queda sin_resolver y se PROPONE el alta', () => {
  const mapeo = mapeaCampo(campo('Ferreteria Zeta'), destino, OPCIONES)
  assert.equal(mapeo.estado, 'sin_resolver')
  assert.ok(mapeo.alta, 'RF-29 pide proponerla')
  assert.equal(mapeo.alta?.catalogo, 'proveedores')
  assert.equal(mapeo.alta?.valor, 'Ferreteria Zeta')
})

test('la propuesta lleva los parecidos AL LADO: es lo que hace saltar el duplicado', () => {
  // EL CASO QUE IMPORTA, y que estaba roto: "ACME Servicios Industriales" no alcanza el umbral,
  // asi que se propone darlo de alta. Si la propuesta llegara con la lista de candidatos de la
  // RESOLUCION vendria vacia por definicion —si se propone es porque nadie llego al umbral— y el
  // revisor crearia un proveedor nuevo sin ver que "ACME S.A. de C.V." ya existe. El flujo que
  // existe para evitar duplicados los estaria creando.
  const mapeo = mapeaCampo(campo('ACME Servicios Industriales'), destino, OPCIONES)
  assert.equal(mapeo.estado, 'sin_resolver')
  assert.equal(mapeo.resolucion?.candidatos.length, 0, 'la resolucion no deja candidatos: por eso se propone el alta')
  assert.ok((mapeo.alta?.candidatos.length ?? 0) > 0, 'sin los parecidos delante, el revisor duplica ACME')
  assert.equal(mapeo.alta?.candidatos[0].fila.id, '1874')
})

test('un valor sin ningun parecido propone el alta con la lista vacia, y esta bien', () => {
  const mapeo = mapeaCampo(campo('Zzzz'), destino, OPCIONES)
  assert.equal(mapeo.estado, 'sin_resolver')
  assert.deepEqual(mapeo.alta?.candidatos, [], 'inventar un parecido donde no lo hay seria peor que no enseñar ninguno')
})

test('`elegida` es null salvo en resuelto: nunca "el mejor candidato"', () => {
  const mapeo = mapeaCampo(campo('Ferreteria Zeta'), destino, OPCIONES)
  assert.equal(mapeo.resolucion?.elegida, null, 'ofrecer el mejor como si fuera la respuesta es como se parte un historial en dos')
})

test('altasPendientes junta lo que hay que confirmar, y NADA lo escribe', () => {
  const mapeos = [
    mapeaCampo(campo('ACME S.A. de C.V.'), destino, OPCIONES),
    mapeaCampo(campo('Ferreteria Zeta'), destino, OPCIONES),
  ]
  const altas = altasPendientes(mapeos)
  assert.equal(altas.length, 1)
  assert.equal(altas[0].valor, 'Ferreteria Zeta')
})

test('en este modulo no existe ninguna funcion que escriba un alta', async () => {
  // RF-30 no se cumple prometiendolo: se cumple porque la ruta no esta.
  const modulo = (await import('../dist/react/mapeo.js')) as Record<string, unknown>
  const escritoras = Object.keys(modulo).filter((n) => /^(crea|inserta|guarda|escribe|aplica)/i.test(n))
  assert.deepEqual(escritoras, [], `hay funciones que podrian escribir: ${escritoras.join(', ')}`)
})

// --- La barrera de los identificadores, que aqui se ELIGE bien -------------------------------------

test('un campo marcado identificador NO se resuelve por similitud', () => {
  // `resuelveValor` lanza ante un identificador a proposito. Este modulo elige la via correcta
  // antes de llamar; si se equivocara, la excepcion saltaria aqui.
  const filas = [{ id: 'p1', etiqueta: '7501234567890' }]
  const mapeo = mapeaCampo(campo('7501234567891', { formato: 'identificador' }), destino, { ...OPCIONES, filas })
  assert.notEqual(mapeo.estado, 'resuelto', 'dos GTIN que difieren en un digito son productos distintos')
})

test('un identificador exacto si resuelve', () => {
  const filas = [{ id: 'p1', etiqueta: '7501234567890' }]
  const mapeo = mapeaCampo(campo('7501234567890', { formato: 'identificador' }), destino, { ...OPCIONES, filas })
  assert.equal(mapeo.estado, 'resuelto')
  assert.equal(mapeo.resolucion?.elegida?.id, 'p1')
})

// --- Cuando hace falta una persona -------------------------------------------------------------------

test('un campo sin mapear cuenta como pendiente de decision', () => {
  assert.equal(requiereDecisionHumana([mapeaCampo(campo('x'), null, OPCIONES)]), true)
})

test('todo resuelto no requiere decision', () => {
  const mapeos = [mapeaCampo(campo('ACME S.A. de C.V.'), destino, OPCIONES)]
  assert.equal(requiereDecisionHumana(mapeos), false)
})

test('un solo sin_resolver basta para requerirla', () => {
  const mapeos = [
    mapeaCampo(campo('ACME S.A. de C.V.'), destino, OPCIONES),
    mapeaCampo(campo('Ferreteria Zeta'), destino, OPCIONES),
  ]
  assert.equal(requiereDecisionHumana(mapeos), true)
})

// --- `parecidosA`, la funcion que tapo el hueco -----------------------------------------------------

test('parecidosA NO filtra por umbral: esa es toda su razon de existir', () => {
  const cerca = parecidosA('ACME Servicios Industriales', FILAS)
  assert.ok(cerca.length > 0)
  assert.ok(cerca[0].similitud < 0.6, 'por debajo del umbral, que es justo lo que resuelveValor descarta')
})

test('parecidosA ordena de mas a menos parecido y respeta el tope', () => {
  const cerca = parecidosA('ACME', FILAS, 1)
  assert.equal(cerca.length, 1)
  assert.equal(cerca[0].fila.id, '1874')
})

test('parecidosA no devuelve filas con similitud cero: no son parecidos', () => {
  assert.deepEqual(parecidosA('Zzzz', FILAS), [])
})
