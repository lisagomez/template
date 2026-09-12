import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { leeCfdi40, camposParaCotejo } from '../dist/xml/cfdi/comprobante-40.js'
import { registroDeEsquemas } from '../dist/xml/registro.js'
import { lectorDeTimbre11 } from '../dist/xml/cfdi/timbre-11.js'
import {
  lectorDeImpuestosLocales10, lectorDeLeyendasFiscales10, lectorDeDonatarias11,
  INVENTARIO_IMPUESTOS_LOCALES, INVENTARIO_LEYENDAS_FISCALES, INVENTARIO_DONATARIAS,
} from '../dist/xml/cfdi/menores.js'
import { IMPUESTOS_LOCALES_10, LEYENDAS_FISCALES_10, DONATARIAS_11, nombreDelEsquema } from '../dist/xml/cfdi/espacios.js'

const fixture = (nombre: string): Uint8Array => new Uint8Array(readFileSync(new URL(`./fixtures/${nombre}.xml`, import.meta.url)))
const HOSPEDAJE = fixture('cfdi-40-complementos-menores')
const conTimbre = registroDeEsquemas([lectorDeTimbre11])
const completo = registroDeEsquemas([lectorDeTimbre11, lectorDeImpuestosLocales10, lectorDeLeyendasFiscales10, lectorDeDonatarias11])
const valor = (campos: readonly { clave: string; valor: string }[], clave: string): string | undefined => campos.find((c) => c.clave === clave)?.valor

test('la version en MINUSCULA se reconoce: sin lector los tres se declaran con su version, no como "sin version"', () => {
  const lectura = leeCfdi40(HOSPEDAJE, conTimbre)
  if (!lectura.esCfdi) return assert.fail('deberia ser CFDI')
  assert.equal(lectura.complementos.sinLector.length, 3)
  assert.deepEqual(lectura.complementos.sinLector.map((c) => [c.nombreLocal, c.version]), [['ImpuestosLocales', '1.0'], ['LeyendasFiscales', '1.0'], ['Donatarias', '1.1']])
  assert.equal(nombreDelEsquema(IMPUESTOS_LOCALES_10), 'Impuestos Locales 1.0')
  assert.equal(nombreDelEsquema(LEYENDAS_FISCALES_10), 'Leyendas Fiscales 1.0')
  assert.equal(nombreDelEsquema(DONATARIAS_11), 'Donatarias 1.1')
})

test('con los lectores: los tres se leen, y la version en minuscula no entra como campo', () => {
  const lectura = leeCfdi40(HOSPEDAJE, completo)
  if (!lectura.esCfdi) return assert.fail('deberia ser CFDI')
  assert.deepEqual(lectura.complementos.sinLector, [])
  assert.deepEqual(lectura.complementos.leidos.map((c) => c.nombre).sort(), [
    'Complemento de donatarias 1.1', 'Complemento de impuestos locales 1.0', 'Complemento de leyendas fiscales 1.0', 'Timbre fiscal digital 1.1',
  ].sort())
  for (const c of lectura.complementos.leidos) assert.ok(!c.campos.some((x) => x.clave === 'version'), c.nombre)
})

test('impuestos locales: varias retenciones como hermanos se leen todas, numeradas, con sus totales', () => {
  const lectura = leeCfdi40(HOSPEDAJE, completo)
  if (!lectura.esCfdi) return assert.fail('deberia ser CFDI')
  const campos = camposParaCotejo(lectura)
  assert.equal(valor(campos, 'totalde_retenciones'), '50.00')
  assert.equal(valor(campos, 'totalde_traslados'), '30.00')
  assert.equal(valor(campos, 'retencions_total'), '2')
  assert.equal(valor(campos, 'retencion_1_imp_loc_retenido'), 'ISR CEDULAR')
  assert.equal(valor(campos, 'retencion_2_importe'), '25.00')
  assert.equal(valor(campos, 'traslado_1_imp_loc_trasladado'), 'ISH')
  assert.equal(valor(campos, 'traslado_1_tasade_traslado'), '3.00')
})

test('leyendas fiscales: cada leyenda numerada, con o sin norma; donatarias: la autorizacion es identificador', () => {
  const lectura = leeCfdi40(HOSPEDAJE, completo)
  if (!lectura.esCfdi) return assert.fail('deberia ser CFDI')
  const campos = camposParaCotejo(lectura)
  assert.equal(valor(campos, 'leyendas_total'), '2')
  assert.equal(valor(campos, 'leyenda_1_norma'), 'Art. 93')
  assert.equal(valor(campos, 'leyenda_2_texto_leyenda'), 'Leyenda sintetica dos, sin norma')
  assert.equal(valor(campos, 'leyenda_2_norma'), undefined)
  assert.equal(valor(campos, 'no_autorizacion'), '700-29-00-00-00-2026-00123')
  assert.equal(campos.find((c) => c.clave === 'no_autorizacion')?.formato, 'identificador')
  assert.equal(valor(campos, 'fecha_autorizacion'), '2026-01-15')
})

test('un atributo no anticipado se declara; la version va pineada tambien en minuscula', () => {
  const texto = new TextDecoder().decode(HOSPEDAJE)
  const raro = leeCfdi40(new TextEncoder().encode(texto.replace('norma="Art. 93"', 'norma="Art. 93" fraccion="II"')), completo)
  if (!raro.esCfdi) return assert.fail('deberia ser CFDI')
  assert.deepEqual(raro.complementos.leidos.find((c) => c.nombre === 'Complemento de leyendas fiscales 1.0')?.noLeido, ['Leyenda/@fraccion'])
  const vieja = leeCfdi40(new TextEncoder().encode(texto.replace('donat:Donatarias version="1.1"', 'donat:Donatarias version="1.0"')), completo)
  if (!vieja.esCfdi) return assert.fail('deberia ser CFDI')
  assert.deepEqual(vieja.complementos.sinLector.map((c) => [c.nombreLocal, c.version]), [['Donatarias', '1.0']])
})

test('los inventarios llevan la version en minuscula, como el XSD, para que el comprobador de deriva no la marque', () => {
  assert.deepEqual(INVENTARIO_IMPUESTOS_LOCALES['ImpuestosLocales'], ['version', 'TotaldeRetenciones', 'TotaldeTraslados'])
  assert.deepEqual(INVENTARIO_LEYENDAS_FISCALES['LeyendasFiscales'], ['version'])
  assert.deepEqual(INVENTARIO_DONATARIAS['Donatarias'], ['version', 'noAutorizacion', 'fechaAutorizacion', 'leyenda'])
})
