import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aplicaPlantilla,
  cuentaBajoUmbral,
  puedeValidarseSinRevision,
  exigeCotejo,
  disposicionDe,
} from '../dist/react/revision.js'
import { comoPlantilla, cargaPlantilla, guardaPlantilla } from '../dist/plantilla-por-defecto.js'
import type { CampoExtraido } from '../dist/tipos.js'
import type { PlantillaDeRevision } from '../dist/plantilla.js'

const campo = (clave: string, confianza: number, extra: Partial<CampoExtraido> = {}): CampoExtraido => ({
  clave,
  valor: `v-${clave}`,
  confianza,
  procedencia: 'ocr',
  region: { pagina: 0, x: 0.1, y: 0.1, ancho: 0.2, alto: 0.05 },
  ...extra,
})

const plantilla = (campos: Partial<PlantillaDeRevision['campos'][number]>[]): PlantillaDeRevision => ({
  tipoDocumento: 'factura',
  campos: campos.map((c, i) => ({
    clave: c.clave ?? `c${i}`,
    etiqueta: c.etiqueta ?? c.clave ?? `c${i}`,
    visible: c.visible ?? true,
    editable: c.editable ?? true,
    orden: c.orden ?? i,
  })),
})

// --- El umbral es obligatorio y explicito -------------------------------------------------------

test('un umbral fuera de [0,1] se rechaza en vez de comparar contra algo raro', () => {
  assert.throws(() => aplicaPlantilla([], null, 1.5), RangeError)
  assert.throws(() => aplicaPlantilla([], null, -0.1), RangeError)
  assert.throws(() => aplicaPlantilla([], null, Number.NaN), RangeError)
})

test('bajoUmbral es estrictamente MENOR: justo en el umbral no va a revision', () => {
  const filas = aplicaPlantilla([campo('a', 0.8)], null, 0.8)
  assert.equal(filas[0].bajoUmbral, false, 'el umbral es el minimo aceptable, no el primer rechazo')
})

test('por debajo del umbral si marca', () => {
  assert.equal(aplicaPlantilla([campo('a', 0.79)], null, 0.8)[0].bajoUmbral, true)
})

// --- La plantilla decide orden, etiqueta y visibilidad --------------------------------------------

test('la plantilla ordena y renombra', () => {
  const filas = aplicaPlantilla([campo('total', 0.9), campo('folio', 0.9)], plantilla([
    { clave: 'folio', etiqueta: 'Folio fiscal', orden: 0 },
    { clave: 'total', etiqueta: 'Importe total', orden: 1 },
  ]), 0.8)
  assert.deepEqual(filas.map((f) => f.etiqueta), ['Folio fiscal', 'Importe total'])
})

test('un campo deshabilitado a proposito no se muestra', () => {
  const filas = aplicaPlantilla([campo('a', 0.9), campo('ruido', 0.9)], plantilla([
    { clave: 'a', orden: 0 },
    { clave: 'ruido', visible: false, orden: 1 },
  ]), 0.8)
  assert.deepEqual(filas.map((f) => f.clave), ['a'])
})

test('un campo que la plantilla NO conoce se muestra igual, al final', () => {
  // Esconderlo seria peor que el desorden: el motor encontro algo que la plantilla no preveia, y
  // eso es justo lo que hay que revisar.
  const filas = aplicaPlantilla([campo('sorpresa', 0.9), campo('folio', 0.9)], plantilla([
    { clave: 'folio', orden: 0 },
  ]), 0.8)
  assert.deepEqual(filas.map((f) => f.clave), ['folio', 'sorpresa'])
})

test('sin plantilla se conserva el orden de llegada y las claves como etiqueta', () => {
  const filas = aplicaPlantilla([campo('b', 0.9), campo('a', 0.9)], null, 0.8)
  assert.deepEqual(filas.map((f) => f.etiqueta), ['b', 'a'])
})

// --- La cola de revision no se disimula -----------------------------------------------------------

test('se cuenta cuantos caen bajo umbral, sin adjetivos', () => {
  const filas = aplicaPlantilla([campo('a', 0.5), campo('b', 0.95), campo('c', 0.4)], null, 0.8)
  assert.equal(cuentaBajoUmbral(filas), 2)
})

test('un solo campo bajo umbral impide validar sin revision', () => {
  const filas = aplicaPlantilla([campo('a', 0.95), campo('b', 0.2)], null, 0.8)
  assert.equal(puedeValidarseSinRevision(filas, true), false, 'ni cotejado')
})

test('un campo de OCR SIN region tampoco se puede validar solo', () => {
  // Un dato de reconocimiento que no se puede citar no se puede auditar despues.
  const filas = aplicaPlantilla([campo('a', 0.99, { region: undefined })], null, 0.8)
  assert.equal(puedeValidarseSinRevision(filas, true), false, 'ni cotejado')
})

test('un campo de CODIGO sin region si vale, PERO exige cotejo', () => {
  // La falta de region no es el problema: un escaner no produce imagen. Lo que si lo es, desde que
  // existe la barrera del cotejo, es que nadie haya comparado ese codigo contra una segunda
  // fuente. Una pegatina falsa decodifica igual de limpio que la legitima (§2.11 del SDD).
  const filas = aplicaPlantilla([campo('gtin', 1, { region: undefined, procedencia: 'codigo' })], null, 0.8)
  assert.equal(puedeValidarseSinRevision(filas, true), true, 'cotejado si')
  assert.equal(puedeValidarseSinRevision(filas, false), false, 'sin cotejar no')
})

test('todo por encima del umbral y con region: se puede validar', () => {
  // Solo OCR: no hay fuente determinista, asi que el cotejo no aplica y da igual lo que se pase.
  const filas = aplicaPlantilla([campo('a', 0.9), campo('b', 0.85)], null, 0.8)
  assert.equal(puedeValidarseSinRevision(filas, false), true)
  assert.equal(exigeCotejo(filas), false)
})

// --- TAR-12: la disposicion que se persiste --------------------------------------------------------

test('la disposicion guarda TODOS los campos, tambien los apagados', () => {
  // Guardar solo lo visible perderia que alguien deshabilito algo a proposito, y la siguiente
  // tanda lo traeria de vuelta — justo el trabajo que la plantilla existe para no repetir.
  const filas = aplicaPlantilla([campo('a', 0.9)], null, 0.8)
  const disposicion = disposicionDe('factura', filas, ['ruido'])
  assert.deepEqual(disposicion.campos.map((c) => [c.clave, c.visible]), [['a', true], ['ruido', false]])
})

test('la disposicion conserva el orden en que quedaron en pantalla', () => {
  const filas = aplicaPlantilla([campo('z', 0.9), campo('a', 0.9)], null, 0.8)
  const disposicion = disposicionDe('factura', filas)
  assert.deepEqual(disposicion.campos.map((c) => c.clave), ['z', 'a'])
  assert.deepEqual(disposicion.campos.map((c) => c.orden), [0, 1])
})

test('lo guardado vuelve a aplicarse igual: ida y vuelta', () => {
  const original = aplicaPlantilla([campo('total', 0.9), campo('folio', 0.9)], plantilla([
    { clave: 'folio', etiqueta: 'Folio', orden: 0 },
    { clave: 'total', etiqueta: 'Total', orden: 1 },
  ]), 0.8)
  const guardada = disposicionDe('factura', original)
  const revuelta = aplicaPlantilla([campo('total', 0.9), campo('folio', 0.9)], guardada, 0.8)
  assert.deepEqual(revuelta.map((f) => f.etiqueta), ['Folio', 'Total'], 'la segunda tanda tiene que llegar igual')
})

// --- Lo leido del almacen es `unknown` por contrato del puerto -------------------------------------

test('comoPlantilla rechaza lo que no tiene forma de plantilla', () => {
  assert.equal(comoPlantilla(null, 'factura'), null)
  assert.equal(comoPlantilla({ campos: 'no es lista' }, 'factura'), null)
  assert.equal(comoPlantilla({ campos: [] }, 'factura'), null, 'una plantilla sin campos no aplica nada: es como no tenerla')
})

test('comoPlantilla descarta los campos sin clave y conserva el resto', () => {
  const p = comoPlantilla({ campos: [{ clave: 'a', etiqueta: 'A', visible: true, editable: true, orden: 0 }, { etiqueta: 'sin clave' }] }, 'factura')
  assert.equal(p?.campos.length, 1)
})

test('comoPlantilla completa el tipo de documento si lo guardado no lo trae', () => {
  const p = comoPlantilla({ campos: [{ clave: 'a', etiqueta: 'A', visible: true, editable: true, orden: 0 }] }, 'factura')
  assert.equal(p?.tipoDocumento, 'factura')
})

test('cargaPlantilla NO lanza si el almacen falla: devuelve null con el motivo', async () => {
  // La revision funciona sin plantilla, asi que no poder leer una preferencia no justifica dejar
  // al revisor sin pantalla. Pero el motivo se conserva: sin el, "no habia" y "no se pudo leer"
  // serian indistinguibles.
  const almacen = {
    async leePorDefecto() { throw new Error('permission denied') },
    async guardaPorDefecto() {},
  }
  const { plantilla, error } = await cargaPlantilla(almacen, 'factura')
  assert.equal(plantilla, null)
  assert.match(error ?? '', /permission denied/)
})

test('cargaPlantilla distingue "no habia" de "fallo"', async () => {
  const almacen = { async leePorDefecto() { return null }, async guardaPorDefecto() {} }
  const { plantilla, error } = await cargaPlantilla(almacen, 'factura')
  assert.equal(plantilla, null)
  assert.equal(error, null, 'sin error: simplemente no habia plantilla guardada')
})

test('guardaPlantilla SI lanza: al reves que la carga, y a proposito', async () => {
  // Fallar al leer una preferencia es un inconveniente. Fallar al guardar el trabajo de revision
  // de una persona y no decirselo le hace creer que quedo a salvo cuando no.
  const almacen = {
    async leePorDefecto() { return null },
    async guardaPorDefecto() { throw new Error('sin conexion') },
  }
  await assert.rejects(() => guardaPlantilla(almacen, { tipoDocumento: 'factura', campos: [] }), /sin conexion/)
})

test('un XML COTEJADO se auto-valida; uno de OCR sin region no, cotejado o no', () => {
  // Las dos razones para no promover son distintas y conviene no mezclarlas: al OCR le falta la
  // region para poder auditarlo despues; al XML no le falta nada que citar, le falta que alguien
  // haya comparado lo que dice contra otra fuente.
  const campo = { clave: 'total', valor: '1160.00', confianza: 1, region: undefined }
  const comoXml = aplicaPlantilla([{ ...campo, procedencia: 'xml' as const }], null, 0.85)
  const comoOcr = aplicaPlantilla([{ ...campo, procedencia: 'ocr' as const }], null, 0.85)

  assert.equal(puedeValidarseSinRevision(comoXml, true), true, 'un XML no tiene region que citar')
  assert.equal(puedeValidarseSinRevision(comoXml, false), false, 'pero sin cotejo no se promueve')
  assert.equal(puedeValidarseSinRevision(comoOcr, true), false, 'al OCR le falta la region')
})

test('el cotejo NO rescata a un campo de OCR sin region: son barreras distintas', () => {
  // Si el cotejo sirviera para saltarse la region, un proyecto lo pondria a `true` para librarse
  // de las dos cosas a la vez. Son problemas distintos con respuestas distintas.
  const filas = aplicaPlantilla(
    [{ clave: 'total', valor: '1', confianza: 1, procedencia: 'ocr' as const, region: undefined }],
    null,
    0.85,
  )
  assert.equal(puedeValidarseSinRevision(filas, true), false)
})

test('exigeCotejo distingue las fuentes deterministas de las demas', () => {
  const deUnXml = aplicaPlantilla(
    [{ clave: 'a', valor: '1', confianza: 1, procedencia: 'xml' as const }],
    null,
    0.85,
  )
  const deUnHumano = aplicaPlantilla(
    [{ clave: 'a', valor: '1', confianza: 1, procedencia: 'humano' as const }],
    null,
    0.85,
  )
  assert.equal(exigeCotejo(deUnXml), true)
  assert.equal(exigeCotejo(deUnHumano), false, 'a un dato tecleado por una persona ya lo miro una')
})

test('la marca de XML no exime del umbral, solo de la region', () => {
  // Por si alguien lee lo de arriba como "el XML se salta todos los controles". No: si su
  // confianza cayera por debajo del umbral, seguiria yendo a revision como cualquier otro.
  const bajo = aplicaPlantilla(
    [{ clave: 'total', valor: '1160.00', confianza: 0.5, procedencia: 'xml' as const }],
    null,
    0.85,
  )
  assert.equal(puedeValidarseSinRevision(bajo, true), false, 'ni cotejado')
})

