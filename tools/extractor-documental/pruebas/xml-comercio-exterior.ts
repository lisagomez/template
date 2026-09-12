import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { leeCfdi40, camposParaCotejo } from '../dist/xml/cfdi/comprobante-40.js'
import { registroDeEsquemas } from '../dist/xml/registro.js'
import { lectorDeTimbre11 } from '../dist/xml/cfdi/timbre-11.js'
import { lectorDeComercioExterior20, INVENTARIO_COMERCIO_EXTERIOR } from '../dist/xml/cfdi/comercio-exterior-20.js'
import { COMERCIO_EXTERIOR_20, SIN_LECTOR, nombreDelEsquema } from '../dist/xml/cfdi/espacios.js'

const fixture = (nombre: string): Uint8Array => new Uint8Array(readFileSync(new URL(`./fixtures/${nombre}.xml`, import.meta.url)))
const EXPORTACION = fixture('cfdi-40-comercio-exterior-20')
const conTimbre = registroDeEsquemas([lectorDeTimbre11])
const completo = registroDeEsquemas([lectorDeTimbre11, lectorDeComercioExterior20])

const valor = (campos: readonly { clave: string; valor: string }[], clave: string): string | undefined => campos.find((c) => c.clave === clave)?.valor

test('sin el lector registrado, el complemento se declara con su nombre y la factura entra como nacional', () => {
  const lectura = leeCfdi40(EXPORTACION, conTimbre)
  assert.equal(lectura.esCfdi, true)
  if (!lectura.esCfdi) return
  assert.equal(lectura.complementos.sinLector.length, 1)
  assert.equal(lectura.complementos.sinLector[0].nombreLocal, 'ComercioExterior')
  assert.equal(lectura.complementos.sinLector[0].espacio, COMERCIO_EXTERIOR_20)
  assert.equal(nombreDelEsquema(COMERCIO_EXTERIOR_20), 'Comercio Exterior 2.0')
  assert.equal(SIN_LECTOR[COMERCIO_EXTERIOR_20], undefined, 'ya no es un esquema sin lector')
  assert.equal(valor(camposParaCotejo(lectura), 'total_usd'), undefined, 'sin lector no hay total en dolares')
})

test('con el lector: raiz, emisor, propietario, receptor y destinatario, con sus domicilios numerados cuando hay varios', () => {
  const lectura = leeCfdi40(EXPORTACION, completo)
  assert.equal(lectura.esCfdi, true)
  if (!lectura.esCfdi) return
  assert.deepEqual(lectura.complementos.sinLector, [])
  const campos = camposParaCotejo(lectura)
  assert.equal(valor(campos, 'clave_de_pedimento'), 'A1')
  assert.equal(valor(campos, 'certificado_origen'), '1')
  assert.equal(valor(campos, 'incoterm'), 'FOB')
  assert.equal(valor(campos, 'tipo_cambio_usd'), '17.10')
  assert.equal(valor(campos, 'total_usd'), '12500.00')
  assert.equal(valor(campos, 'observaciones'), 'Embarque sintetico de prueba')
  assert.equal(valor(campos, 'emisor_curp'), 'GOAJ040229HDFNRNA6')
  assert.equal(valor(campos, 'emisor_domicilio_estado'), 'BCN')
  assert.equal(valor(campos, 'propietario_1_num_reg_id_trib'), '98-7654321')
  assert.equal(valor(campos, 'receptor_num_reg_id_trib'), '12-3456789')
  assert.equal(valor(campos, 'receptor_domicilio_pais'), 'USA')
  assert.equal(valor(campos, 'destinatario_1_nombre'), 'WAREHOUSE SYNTHETIC INC')
  assert.equal(valor(campos, 'destinatario_1_domicilio_1_codigo_postal'), '90802')
  assert.equal(valor(campos, 'destinatario_1_domicilio_2_estado'), 'TEXAS', 'dos domicilios del mismo destinatario, numerados')
})

test('las mercancias van numeradas, con sus descripciones especificas, y el conteo sale siempre', () => {
  const lectura = leeCfdi40(EXPORTACION, completo)
  if (!lectura.esCfdi) return assert.fail('deberia ser CFDI')
  const campos = camposParaCotejo(lectura)
  assert.equal(valor(campos, 'numero_de_mercancias'), '2')
  assert.equal(valor(campos, 'mercancia_1_no_identificacion'), 'SKU-100')
  assert.equal(valor(campos, 'mercancia_1_fraccion_arancelaria'), '8473300201')
  assert.equal(valor(campos, 'mercancia_1_valor_dolares'), '10000.0000')
  assert.equal(valor(campos, 'mercancia_1_descripcion_1_numero_serie'), 'SN-0001')
  assert.equal(valor(campos, 'mercancia_1_descripcion_2_submodelo'), 'B')
  assert.equal(valor(campos, 'mercancia_2_no_identificacion'), 'SKU-200')
  assert.equal(valor(campos, 'mercancia_2_descripcion_1_marca'), undefined, 'la segunda no trae descripciones')
})

test('los identificadores van marcados: se comparan exactos, nunca por parecido', () => {
  const lectura = leeCfdi40(EXPORTACION, completo)
  if (!lectura.esCfdi) return assert.fail('deberia ser CFDI')
  const campos = camposParaCotejo(lectura)
  for (const clave of ['receptor_num_reg_id_trib', 'mercancia_1_no_identificacion', 'mercancia_1_fraccion_arancelaria', 'mercancia_1_descripcion_1_numero_serie', 'clave_de_pedimento', 'num_certificado_origen']) {
    assert.equal(campos.find((c) => c.clave === clave)?.formato, 'identificador', clave)
  }
  assert.equal(campos.find((c) => c.clave === 'observaciones')?.formato, undefined)
})

test('un atributo que el esquema no anticipa se DECLARA en noLeido, no se pierde', () => {
  const raro = new TextDecoder().decode(EXPORTACION).replace('Incoterm="FOB"', 'Incoterm="FOB" AtributoNuevoDelSat="x"')
  const lectura = leeCfdi40(new TextEncoder().encode(raro), completo)
  if (!lectura.esCfdi) return assert.fail('deberia ser CFDI')
  const cce = lectura.complementos.leidos.find((c) => c.nombre === 'Complemento de comercio exterior 2.0')
  assert.ok(cce !== undefined)
  assert.deepEqual(cce.noLeido, ['ComercioExterior/@AtributoNuevoDelSat'])
})

test('la version va pineada: un ComercioExterior 1.1 queda sin lector aunque el 2.0 este registrado', () => {
  const vieja = new TextDecoder().decode(EXPORTACION).replace('cce20:ComercioExterior Version="2.0"', 'cce20:ComercioExterior Version="1.1"')
  const lectura = leeCfdi40(new TextEncoder().encode(vieja), completo)
  if (!lectura.esCfdi) return assert.fail('deberia ser CFDI')
  assert.equal(lectura.complementos.sinLector.length, 1)
  assert.equal(lectura.complementos.sinLector[0].version, '1.1')
  assert.match(lectura.complementos.sinLector[0].motivo, /versi/i)
})

test('el inventario cubre el esquema entero: cada elemento del XSD tiene su lista de atributos', () => {
  for (const elemento of ['ComercioExterior', 'Emisor', 'Domicilio', 'Propietario', 'Receptor', 'Destinatario', 'Mercancias', 'Mercancia', 'DescripcionesEspecificas']) {
    assert.ok(Array.isArray(INVENTARIO_COMERCIO_EXTERIOR[elemento]), elemento)
  }
  assert.deepEqual(INVENTARIO_COMERCIO_EXTERIOR['DescripcionesEspecificas'], ['Marca', 'Modelo', 'SubModelo', 'NumeroSerie'])
})
