import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { leeCfdi40, camposParaCotejo } from '../dist/xml/cfdi/comprobante-40.js'
import { registroDeEsquemas } from '../dist/xml/registro.js'
import { lectorDeTimbre11 } from '../dist/xml/cfdi/timbre-11.js'
import { lectorDeCartaPorte31, INVENTARIO_CARTA_PORTE, claveDeAtributo } from '../dist/xml/cfdi/carta-porte-31.js'
import { CARTA_PORTE_31, SIN_LECTOR, nombreDelEsquema } from '../dist/xml/cfdi/espacios.js'

const fixture = (nombre: string): Uint8Array => new Uint8Array(readFileSync(new URL(`./fixtures/${nombre}.xml`, import.meta.url)))
const TRASLADO = fixture('cfdi-40-carta-porte-31')
const conTimbre = registroDeEsquemas([lectorDeTimbre11])
const completo = registroDeEsquemas([lectorDeTimbre11, lectorDeCartaPorte31])
const valor = (campos: readonly { clave: string; valor: string }[], clave: string): string | undefined => campos.find((c) => c.clave === clave)?.valor

test('las claves salen del nombre del SAT, con las siglas enteras y en snake_case', () => {
  assert.equal(claveDeAtributo('IdCCP'), 'id_ccp')
  assert.equal(claveDeAtributo('PlacaVM'), 'placa_vm')
  assert.equal(claveDeAtributo('RFCRemitenteDestinatario'), 'rfc_remitente_destinatario')
  assert.equal(claveDeAtributo('UUIDComercioExt'), 'uuid_comercio_ext')
  assert.equal(claveDeAtributo('FolioImpoVUCEM'), 'folio_impo_vucem')
  assert.equal(claveDeAtributo('NumRegSanPlagCOFEPRIS'), 'num_reg_san_plag_cofepris')
  assert.equal(claveDeAtributo('PesoEnKg'), 'peso_en_kg')
})

test('sin el lector registrado, la carta porte se declara con su nombre y el traslado entra sin carga', () => {
  const lectura = leeCfdi40(TRASLADO, conTimbre)
  if (!lectura.esCfdi) return assert.fail('deberia ser CFDI')
  assert.equal(lectura.complementos.sinLector.length, 1)
  assert.equal(lectura.complementos.sinLector[0].nombreLocal, 'CartaPorte')
  assert.equal(lectura.complementos.sinLector[0].espacio, CARTA_PORTE_31)
  assert.equal(nombreDelEsquema(CARTA_PORTE_31), 'Carta Porte 3.1')
  assert.equal(SIN_LECTOR[CARTA_PORTE_31], undefined)
})

test('con el lector: raiz, ubicaciones numeradas con domicilio, y el medio de transporte dicho una vez', () => {
  const lectura = leeCfdi40(TRASLADO, completo)
  if (!lectura.esCfdi) return assert.fail('deberia ser CFDI')
  assert.deepEqual(lectura.complementos.sinLector, [])
  const campos = camposParaCotejo(lectura)
  assert.equal(valor(campos, 'id_ccp'), 'CCC0A1B2-3C4D-5E6F-7A8B-9C0D1E2F3A4B')
  assert.equal(valor(campos, 'transp_internac'), 'No')
  assert.equal(valor(campos, 'total_dist_rec'), '920.5')
  const propios = lectura.complementos.leidos.find((c) => c.nombre === 'Complemento carta porte 3.1')?.campos ?? []
  assert.equal(propios.some((c) => c.clave === 'version'), false, 'la version es la clave del registro, no un campo del complemento')
  assert.equal(valor(campos, 'ubicaciones_ubicacions_total'), '2')
  assert.equal(valor(campos, 'ubicaciones_ubicacion_1_tipo_ubicacion'), 'Origen')
  assert.equal(valor(campos, 'ubicaciones_ubicacion_1_rfc_remitente_destinatario'), 'AAA010101AAA')
  assert.equal(valor(campos, 'ubicaciones_ubicacion_2_distancia_recorrida'), '920.5')
  assert.equal(valor(campos, 'ubicaciones_ubicacion_2_domicilio_codigo_postal'), '06600')
  assert.equal(valor(campos, 'medio_de_transporte'), 'autotransporte')
})

test('mercancias con sus sub-elementos numerados, y el autotransporte con vehiculo, seguros y remolque', () => {
  const lectura = leeCfdi40(TRASLADO, completo)
  if (!lectura.esCfdi) return assert.fail('deberia ser CFDI')
  const campos = camposParaCotejo(lectura)
  assert.equal(valor(campos, 'mercancias_peso_bruto_total'), '1250.00')
  assert.equal(valor(campos, 'mercancias_mercancias_total'), '2')
  assert.equal(valor(campos, 'mercancias_mercancia_1_bienes_transp'), '43211500')
  assert.equal(valor(campos, 'mercancias_mercancia_1_fraccion_arancelaria'), '8473300201')
  assert.equal(valor(campos, 'mercancias_mercancia_1_documentacion_1_num_pedimento'), '26  07  1234  6000123')
  assert.equal(valor(campos, 'mercancias_mercancia_1_guia_1_numero_guia_identificacion'), 'GUIA-000777')
  assert.equal(valor(campos, 'mercancias_mercancia_1_cantidad_transporta_1_id_destino'), 'DE000001')
  assert.equal(valor(campos, 'mercancias_mercancia_2_documentacions_total'), '0', 'la segunda no trae documentacion: el contador lo dice')
  assert.equal(valor(campos, 'mercancias_autotransporte_num_permiso_sct'), 'PERM-SINT-001')
  assert.equal(valor(campos, 'mercancias_autotransporte_vehiculo_placa_vm'), 'ABC1234')
  assert.equal(valor(campos, 'mercancias_autotransporte_seguros_poliza_resp_civil'), 'POL-RC-1')
  assert.equal(valor(campos, 'mercancias_autotransporte_remolques_remolque_1_placa'), 'REM9876')
  assert.equal(valor(campos, 'figuras_figura_1_num_licencia'), 'LIC-SINT-5555')
  assert.equal(valor(campos, 'figuras_figura_1_parte_1_parte_transporte'), 'PT01')
  assert.equal(valor(campos, 'figuras_figura_1_domicilio_estado'), 'NLE')
})

test('los identificadores van marcados y los textos no', () => {
  const lectura = leeCfdi40(TRASLADO, completo)
  if (!lectura.esCfdi) return assert.fail('deberia ser CFDI')
  const campos = camposParaCotejo(lectura)
  for (const clave of ['id_ccp', 'ubicaciones_ubicacion_1_id_ubicacion', 'mercancias_autotransporte_vehiculo_placa_vm', 'mercancias_autotransporte_remolques_remolque_1_placa', 'figuras_figura_1_rfc_figura', 'mercancias_mercancia_1_documentacion_1_num_pedimento']) {
    assert.equal(campos.find((c) => c.clave === clave)?.formato, 'identificador', clave)
  }
  assert.equal(campos.find((c) => c.clave === 'mercancias_mercancia_1_descripcion')?.formato, undefined)
})

test('un atributo que el esquema no anticipa se declara en noLeido; la version va pineada', () => {
  const texto = new TextDecoder().decode(TRASLADO)
  const raro = leeCfdi40(new TextEncoder().encode(texto.replace('PlacaVM="ABC1234"', 'PlacaVM="ABC1234" ColorVM="rojo"')), completo)
  if (!raro.esCfdi) return assert.fail('deberia ser CFDI')
  assert.deepEqual(raro.complementos.leidos.find((c) => c.nombre === 'Complemento carta porte 3.1')?.noLeido, ['IdentificacionVehicular/@ColorVM'])
  const vieja = leeCfdi40(new TextEncoder().encode(texto.replace('CartaPorte Version="3.1"', 'CartaPorte Version="3.0"')), completo)
  if (!vieja.esCfdi) return assert.fail('deberia ser CFDI')
  assert.equal(vieja.complementos.sinLector.length, 1)
  assert.equal(vieja.complementos.sinLector[0].version, '3.0')
})

test('el inventario cubre los 25 elementos del XSD y une los dos Contenedor (barco y tren)', () => {
  const elementos = ['CartaPorte', 'RegimenesAduaneros', 'RegimenAduaneroCCP', 'Ubicaciones', 'Ubicacion', 'Domicilio', 'Mercancias', 'Mercancia',
    'DocumentacionAduanera', 'GuiasIdentificacion', 'CantidadTransporta', 'DetalleMercancia', 'Autotransporte', 'IdentificacionVehicular', 'Seguros',
    'Remolques', 'Remolque', 'TransporteMaritimo', 'Contenedor', 'RemolquesCCP', 'RemolqueCCP', 'TransporteAereo', 'TransporteFerroviario',
    'DerechosDePaso', 'Carro', 'FiguraTransporte', 'TiposFigura', 'PartesTransporte']
  for (const e of elementos) assert.ok(Array.isArray(INVENTARIO_CARTA_PORTE[e]), e)
  assert.ok(INVENTARIO_CARTA_PORTE['Contenedor'].includes('MatriculaContenedor') && INVENTARIO_CARTA_PORTE['Contenedor'].includes('PesoContenedorVacio'))
  assert.equal(INVENTARIO_CARTA_PORTE['Mercancia'].length, 38)
})
