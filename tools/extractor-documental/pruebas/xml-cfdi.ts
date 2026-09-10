/**
 * El comprobante CFDI 4.0, sus complementos y lo que el lector se niega a afirmar.
 *
 * La prueba central de todo el diseno es la primera: el MISMO documento escrito con prefijos
 * distintos tiene que dar exactamente los mismos campos. Si alguien resolviera alguna vez por
 * prefijo, esa prueba lo caza antes de que lo descubra un emisor real por nosotros.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  leeCfdi40,
  camposParaCotejo,
  cotejaSelloConQr,
  avisoDelComprobante,
} from '../dist/xml/cfdi/comprobante-40.js'
import { registroDeEsquemas } from '../dist/xml/registro.js'
import { lectorDeTimbre11, INVENTARIO_TIMBRE } from '../dist/xml/cfdi/timbre-11.js'
import { lectorDePagos20, INVENTARIO_PAGOS } from '../dist/xml/cfdi/pagos-20.js'
import { INVENTARIO, OMITIDOS } from '../dist/xml/cfdi/inventario.js'

const aqui = dirname(fileURLToPath(import.meta.url))
const fixture = (nombre: string): string =>
  readFileSync(join(aqui, 'fixtures', `${nombre}.xml`), 'utf8')

const conTimbre = registroDeEsquemas([lectorDeTimbre11])
const completo = registroDeEsquemas([lectorDeTimbre11, lectorDePagos20])

const porClave = (campos: readonly { clave: string; valor: string }[]): Record<string, string> =>
  Object.fromEntries(campos.map((c) => [c.clave, c.valor]))

// --- LA prueba central ---------------------------------------------------------------------------

test('el mismo comprobante con prefijos distintos da EXACTAMENTE los mismos campos', () => {
  const conCfdi = leeCfdi40(fixture('cfdi-40-ingreso'), conTimbre)
  const conOtros = leeCfdi40(fixture('cfdi-40-prefijos-raros'), conTimbre)
  assert.equal(conCfdi.esCfdi, true)
  assert.equal(conOtros.esCfdi, true)
  assert.deepEqual(conOtros.campos, conCfdi.campos)
  assert.deepEqual(conOtros.conceptos, conCfdi.conceptos)
  assert.deepEqual(camposParaCotejo(conOtros), camposParaCotejo(conCfdi))
})

test('lee el tronco entero: comprobante, emisor, receptor y conceptos', () => {
  const lectura = leeCfdi40(fixture('cfdi-40-ingreso'), conTimbre)
  const campos = porClave(lectura.campos)
  assert.equal(campos['total'], '1160.00')
  assert.equal(campos['rfc_emisor'], 'AAA010101AAA')
  assert.equal(campos['nombre_emisor'], 'OPERADORA DE EJEMPLO SA DE CV')
  assert.equal(campos['rfc_receptor'], 'XAXX010101000')
  assert.equal(campos['nombre_receptor'], 'PUBLICO EN GENERAL')
  assert.equal(campos['uso_cfdi'], 'S01')
  assert.equal(lectura.conceptos.length, 2)
  assert.equal(porClave(lectura.conceptos[1].campos)['descripcion'], 'Maniobras de carga')
})

test('todo campo sale con procedencia xml y confianza 1', () => {
  const lectura = leeCfdi40(fixture('cfdi-40-ingreso'), conTimbre)
  for (const campo of camposParaCotejo(lectura)) {
    assert.equal(campo.procedencia, 'xml')
    assert.equal(campo.confianza, 1)
  }
})

test('los importes se conservan como cadena, con su cero final', () => {
  // Pasar por `number` perderia el cero y abriria la puerta al redondeo binario.
  const campos = porClave(leeCfdi40(fixture('cfdi-40-ingreso'), conTimbre).campos)
  assert.equal(campos['total'], '1160.00')
  assert.equal(campos['subtotal'], '1000.00')
})

test('emite CODIGOS del SAT, nunca etiquetas', () => {
  // Un catalogo embarcado envejece y etiqueta mal en silencio. Traducir un codigo contra las
  // tablas del proyecto es de `reconciliacion.ts`, y en un proyecto con grafo poblado, del grafo.
  const campos = porClave(leeCfdi40(fixture('cfdi-40-ingreso'), conTimbre).campos)
  assert.equal(campos['forma_pago'], '03')
  assert.equal(campos['regimen_fiscal_emisor'], '601')
  assert.doesNotMatch(JSON.stringify(campos), /Transferencia electronica/i)
})

test('los identificadores van marcados para que NO se comparen por parecido', () => {
  const lectura = leeCfdi40(fixture('cfdi-40-ingreso'), conTimbre)
  const rfc = lectura.campos.find((c) => c.clave === 'rfc_emisor')
  const uuid = camposParaCotejo(lectura).find((c) => c.clave === 'uuid')
  assert.equal(rfc?.formato, 'identificador')
  assert.equal(uuid?.formato, 'identificador')
})

// --- El timbre, empezando por su ausencia --------------------------------------------------------

test('un comprobante SIN timbrar se reporta como hecho, y lo demas se lee igual', () => {
  const lectura = leeCfdi40(fixture('cfdi-40-sin-timbre'), conTimbre)
  assert.equal(lectura.esCfdi, true, 'sin timbrar no es ilegible')
  assert.equal(lectura.timbrado, false)
  assert.equal(porClave(lectura.campos)['total'], '1160.00', 'los demas campos SI se leyeron')
  assert.match(avisoDelComprobante(lectura) ?? '', /NO trae timbre fiscal/)
})

test('con timbre se lee el identificador unico y los datos del certificador', () => {
  const lectura = leeCfdi40(fixture('cfdi-40-ingreso'), conTimbre)
  const campos = porClave(camposParaCotejo(lectura))
  assert.equal(lectura.timbrado, true)
  assert.equal(campos['uuid'], '11111111-2222-3333-4444-555555555555')
  assert.equal(campos['rfc_proveedor_certificacion'], 'BBB020202BBB')
  assert.equal(avisoDelComprobante(lectura), null, 'no hay nada que advertir')
})

// --- El sello: lo que el lector se niega a afirmar ------------------------------------------------

test('el sello se lee y se declara NO verificado, siempre', () => {
  for (const nombre of ['cfdi-40-ingreso', 'cfdi-40-sin-timbre', 'cfdi-40-pagos-20']) {
    const lectura = leeCfdi40(fixture(nombre), completo)
    assert.equal(lectura.sello.verificado, false, `${nombre}: el sello nunca se da por verificado`)
  }
  const conSello = leeCfdi40(fixture('cfdi-40-ingreso'), conTimbre)
  assert.ok((conSello.sello.emisor ?? '').length > 0, 'el sello del emisor si se transcribe')
  assert.ok((conSello.sello.sat ?? '').length > 0, 'y el del SAT tambien')
})

test('el sello NO sale bajo la clave del codigo impreso', () => {
  // `corrobora` pliega mayusculas antes de comparar: correcto para un RFC, FALSO para base64. Si
  // el sello viajara bajo la clave `sello` podria dar un acuerdo falso sobre el unico campo que
  // existe para detectar una sustitucion.
  const claves = camposParaCotejo(leeCfdi40(fixture('cfdi-40-ingreso'), conTimbre)).map((c) => c.clave)
  assert.equal(claves.includes('sello'), false)
  assert.equal(claves.includes('sello_sat'), true)
})

test('el sello se cotea contra el final que lleva el codigo, no entero', () => {
  const sello = 'abcDEF123xyzFINAL8'
  assert.equal(cotejaSelloConQr(sello, 'FINAL8'), true)
  assert.equal(cotejaSelloConQr(sello, 'final8'), false, 'base64 distingue mayusculas')
  assert.equal(cotejaSelloConQr(sello, 'OTRO99'), false)
  assert.equal(cotejaSelloConQr(null, 'FINAL8'), false)
  assert.equal(cotejaSelloConQr(sello, ''), false, 'una cadena vacia no coincide con todo')
})

// --- Declarar, no descartar ----------------------------------------------------------------------

test('un complemento desconocido se declara Y el tronco se lee igual de completo', () => {
  const conRaro = leeCfdi40(fixture('cfdi-40-complemento-desconocido'), conTimbre)
  const sinNada = leeCfdi40(fixture('cfdi-40-sin-timbre'), conTimbre)
  assert.equal(conRaro.complementos.sinLector.length, 1)
  assert.equal(conRaro.complementos.sinLector[0].nombreLocal, 'AlgoQueNadieRegistro')
  assert.deepEqual(conRaro.campos, sinNada.campos, 'el complemento raro no le quita nada al tronco')
  assert.match(avisoDelComprobante(conRaro) ?? '', /no se leyeron/)
})

test('un complemento de otra version no se lee, y el aviso nombra las dos', () => {
  const lectura = leeCfdi40(fixture('cfdi-40-pagos-version-vieja'), completo)
  const aviso = avisoDelComprobante(lectura) ?? ''
  assert.equal(lectura.complementos.leidos.length, 0)
  assert.match(aviso, /version 2\.0/)
  assert.match(aviso, /declara 1\.0/)
  assert.equal(
    camposParaCotejo(lectura).some((c) => c.clave === 'monto_total_pagos'),
    false,
    'ni un solo importe suyo puede aparecer en el resultado',
  )
})

// --- El recibo de pago, que sin su complemento es una falsedad -----------------------------------

test('un recibo de pago SIN lector avisa de que el total del tronco no es lo que se pago', () => {
  const lectura = leeCfdi40(fixture('cfdi-40-pagos-20'), conTimbre)
  assert.equal(lectura.tipoDeComprobante, 'P')
  assert.equal(porClave(lectura.campos)['total'], '0', 'el tronco de un REP vale cero')
  assert.match(avisoDelComprobante(lectura) ?? '', /no es lo que se pago/)
})

test('con el lector de pagos aparece el dinero de verdad', () => {
  const lectura = leeCfdi40(fixture('cfdi-40-pagos-20'), completo)
  const campos = porClave(camposParaCotejo(lectura))
  assert.equal(campos['monto_total_pagos'], '1160.00')
  assert.equal(campos['numero_de_pagos'], '1')
  assert.equal(campos['pago_1_monto'], '1160.00')
  assert.equal(campos['pago_1_docto_1_id_documento'], '11111111-2222-3333-4444-555555555555')
  assert.equal(campos['pago_1_docto_1_imp_saldo_insoluto'], '0.00')
  assert.equal(avisoDelComprobante(lectura), null)
})

test('el desglose de impuestos que el lector no traduce queda declarado', () => {
  const lectura = leeCfdi40(fixture('cfdi-40-pagos-20'), completo)
  assert.deepEqual(lectura.complementos.leidos[0].noLeido, ['ImpuestosDR'])
})

// --- La addenda ----------------------------------------------------------------------------------

test('la addenda se declara presente y NO se convierte en campos', () => {
  const lectura = leeCfdi40(fixture('cfdi-40-addenda'), conTimbre)
  assert.deepEqual(lectura.addenda?.hijos, ['OrdenDeCompra', 'ContactoDeAlmacen'])
  assert.equal(lectura.addenda?.leida, false)
  assert.equal(
    JSON.stringify(camposParaCotejo(lectura)).includes('OC-4471'),
    false,
    'nada de la addenda se cuela como campo',
  )
  assert.match(avisoDelComprobante(lectura) ?? '', /addenda/)
})

test('sin addenda el campo es null, no un objeto vacio', () => {
  assert.equal(leeCfdi40(fixture('cfdi-40-ingreso'), conTimbre).addenda, null)
})

// --- Lo que NO es un CFDI 4.0: motivo, nunca excepcion --------------------------------------------

test('un XML mal formado devuelve motivo y no revienta el lote', () => {
  const lectura = leeCfdi40('<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4">')
  assert.equal(lectura.esCfdi, false)
  assert.match(lectura.motivo ?? '', /nunca se cerro/)
})

test('un DOCTYPE llega hasta aqui como motivo, no como excepcion', () => {
  const lectura = leeCfdi40('<!DOCTYPE a [ <!ENTITY x SYSTEM "no-existe.txt"> ]><a/>')
  assert.equal(lectura.esCfdi, false)
  assert.match(lectura.motivo ?? '', /DOCTYPE/)
})

test('otra raiz no es un comprobante, y se dice cual era', () => {
  const lectura = leeCfdi40('<Factura xmlns="http://ejemplo.invalid/x"/>')
  assert.match(lectura.motivo ?? '', /la raiz es <Factura>/)
})

test('el prefijo habitual sobre otra direccion NO se acepta como CFDI', () => {
  // El reverso de la prueba central. Si el lector resolviera por prefijo, esto pasaria por bueno.
  const lectura = leeCfdi40('<cfdi:Comprobante xmlns:cfdi="http://ejemplo.invalid/falso" Version="4.0"/>')
  assert.equal(lectura.esCfdi, false)
  assert.match(lectura.motivo ?? '', /ejemplo\.invalid\/falso/)
})

test('un CFDI 3.3 se rechaza nombrando su version, no en silencio', () => {
  const lectura = leeCfdi40('<Comprobante xmlns="http://www.sat.gob.mx/cfd/4" Version="3.3"/>')
  assert.match(lectura.motivo ?? '', /version 3\.3 y este lector solo lee la 4\.0/)
})

test('una codificacion que no es UTF-8 se rechaza en vez de romper los acentos', () => {
  const lectura = leeCfdi40('<?xml version="1.0" encoding="ISO-8859-1"?><a/>')
  assert.match(lectura.motivo ?? '', /solo lee UTF-8/)
})

test('bytes que no son UTF-8 valido se rechazan', () => {
  const lectura = leeCfdi40(new Uint8Array([0x3c, 0x61, 0xff, 0xfe, 0x2f, 0x3e]))
  assert.match(lectura.motivo ?? '', /no son UTF-8 valido/)
})

test('lee igual desde bytes que desde cadena', () => {
  const texto = fixture('cfdi-40-ingreso')
  const desdeBytes = leeCfdi40(new TextEncoder().encode(texto), conTimbre)
  assert.deepEqual(desdeBytes.campos, leeCfdi40(texto, conTimbre).campos)
})

test('sin registro se lee el tronco y TODOS los complementos salen declarados', () => {
  const lectura = leeCfdi40(fixture('cfdi-40-ingreso'))
  assert.equal(lectura.esCfdi, true)
  assert.equal(porClave(lectura.campos)['total'], '1160.00')
  assert.equal(lectura.complementos.leidos.length, 0)
  assert.equal(lectura.complementos.sinLector.length, 1)
})

// --- Lo que solo un documento REAL ensena --------------------------------------------------------
// Estas pruebas salen de un CFDI 4.0 de honorarios que paso por la herramienta el 2026-09-10. El
// fixture tiene los datos cambiados y la estructura intacta. Cada una fija algo que la suite
// sintetica no veia, y la primera fija un defecto que estaba en verde.

test('el bloque de impuestos se lee: sin el, la aritmetica del comprobante no cierra', () => {
  // El defecto que este documento destapo. Los impuestos se perdian ENTEROS y en silencio, y el
  // aviso decia que no habia nada que advertir. En una factura de honorarios el total no es el
  // subtotal, y lo retenido es lo que alguien tiene que enterar al SAT.
  const campos = porClave(leeCfdi40(fixture('cfdi-40-honorarios-retenciones'), conTimbre).campos)
  assert.equal(campos['total_impuestos_trasladados'], '1537.23')
  assert.equal(campos['total_impuestos_retenidos'], '1144.92')
  const cierra =
    Number(campos['subtotal']) +
    Number(campos['total_impuestos_trasladados']) -
    Number(campos['total_impuestos_retenidos'])
  assert.equal(cierra.toFixed(2), campos['total'])
})

test('dos retenciones de impuestos distintos no se pisan', () => {
  // Aplanarlas sin indice dejaria una sola, y cual sobrevive seria cosa del orden del fichero.
  const campos = porClave(leeCfdi40(fixture('cfdi-40-honorarios-retenciones'), conTimbre).campos)
  assert.equal(campos['retencion_1_impuesto'], '002')
  assert.equal(campos['retencion_1_importe'], '1024.82')
  assert.equal(campos['retencion_2_impuesto'], '001')
  assert.equal(campos['retencion_2_importe'], '120.10')
})

test('el renglon trae sus propios impuestos, con los seis decimales del documento', () => {
  const lectura = leeCfdi40(fixture('cfdi-40-honorarios-retenciones'), conTimbre)
  const delRenglon = porClave(lectura.conceptos[0].campos)
  assert.equal(delRenglon['importe'], '9607.690000', 'ni se redondea ni se reformatea')
  assert.equal(delRenglon['traslado_1_tasa_o_cuota'], '0.160000')
  assert.equal(delRenglon['retencion_2_importe'], '120.096125')
})

test('las declaraciones xmlns al FINAL de los atributos se resuelven igual', () => {
  // El documento real declara `xsi:schemaLocation` antes que ningun `xmlns`, y pone las
  // declaraciones al final. Resolver el nombre segun se leen los atributos, en vez de tras
  // leerlos todos, fallaria aqui.
  const lectura = leeCfdi40(fixture('cfdi-40-honorarios-retenciones'), conTimbre)
  assert.equal(lectura.esCfdi, true)
  assert.equal(lectura.motivo, null)
})

test('el timbre que declara su propio xmlns EN SI MISMO se lee igual', () => {
  // En el documento real el `xmlns:tfd` no esta en la raiz: esta en el propio timbre.
  const lectura = leeCfdi40(fixture('cfdi-40-honorarios-retenciones'), conTimbre)
  assert.equal(lectura.timbrado, true)
  assert.equal(porClave(camposParaCotejo(lectura))['uuid'], 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE')
})

test('el certificado NO se extrae, y su numero SI', () => {
  // El atributo `Certificado` lleva el X.509 entero, con el nombre, el correo y los
  // identificadores fiscales de quien firma. El numero identifica sin exponer nada.
  const lectura = leeCfdi40(fixture('cfdi-40-honorarios-retenciones'), conTimbre)
  const claves = camposParaCotejo(lectura).map((c) => c.clave)
  assert.equal(claves.includes('no_certificado_emisor'), true)
  assert.equal(
    claves.some((k) => k === 'certificado'),
    false,
    'volcar el certificado sacaria datos personales a un campo que despues viaja a una base y a un CSV',
  )
})

test('un elemento del tronco que el lector no traduce se DECLARA', () => {
  // La regla de los complementos, aplicada al tronco — que es donde menos se nota y mas duele.
  // `CfdiRelacionados` es real y este lector no lo trata todavia.
  const conRelacionado = fixture('cfdi-40-ingreso').replace(
    '<cfdi:Emisor',
    '<cfdi:CfdiRelacionados TipoRelacion="04"><cfdi:CfdiRelacionado UUID="x"/></cfdi:CfdiRelacionados><cfdi:Emisor',
  )
  const lectura = leeCfdi40(conRelacionado, conTimbre)
  assert.deepEqual(lectura.noLeido, ['CfdiRelacionados'])
  assert.match(avisoDelComprobante(lectura) ?? '', /CfdiRelacionados/)
})

test('un comprobante que el lector traduce entero no declara nada sin leer', () => {
  assert.deepEqual(leeCfdi40(fixture('cfdi-40-honorarios-retenciones'), conTimbre).noLeido, [])
})

// --- Que la estructura no envejezca en silencio ---------------------------------------------------
// El lector es una traduccion a mano del esquema del SAT, y una traduccion a mano diverge sola. Lo
// que sigue es la mitad que se puede probar sin red; la otra mitad la compara `medicion/deriva.mjs`
// contra el esquema publicado, a mano y fuera del gate.

test('un ATRIBUTO que el lector no conoce se declara, no desaparece', () => {
  // Costo un agujero propio: cuando un CFDI real destapo que los impuestos se perdian, se arreglo
  // para los ELEMENTOS y quedo abierto para los atributos. Es la misma regla, y no vale a medias.
  const conNuevo =
    '<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Total="1.00" ' +
    'AtributoQueElSatAnadeManana="importa"><cfdi:Emisor Rfc="AAA010101AAA" Raro="x"/></cfdi:Comprobante>'
  const lectura = leeCfdi40(conNuevo)
  assert.deepEqual(lectura.noLeido, [
    'Comprobante/@AtributoQueElSatAnadeManana',
    'Emisor/@Raro',
  ])
})

test('un atributo CON espacio de nombres no se declara: es fontaneria, no dato', () => {
  // `xsi:schemaLocation` va en casi todos los CFDI del mundo. Declararlo seria gritar siempre, y
  // un aviso que salta siempre es un aviso que nadie lee.
  const lectura = leeCfdi40(fixture('cfdi-40-honorarios-retenciones'), conTimbre)
  assert.deepEqual(lectura.noLeido, [])
})

test('de un elemento desconocido NO se listan tambien sus hijos', () => {
  // Si el padre ya esta declarado, enumerar lo que lleva dentro es ruido que entierra la senal.
  const conRelacionados =
    '<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0">' +
    '<cfdi:CfdiRelacionados TipoRelacion="04"><cfdi:CfdiRelacionado UUID="x"/></cfdi:CfdiRelacionados>' +
    '</cfdi:Comprobante>'
  assert.deepEqual(leeCfdi40(conRelacionados).noLeido, ['CfdiRelacionados'])
})

test('el certificado esta declarado como omitido, no como deriva', () => {
  // La diferencia importa para el comprobador: un hueco es trabajo pendiente, una omision es una
  // decision ya tomada. Confundirlos hace que el informe pida arreglar lo que ya esta bien.
  assert.equal(OMITIDOS['Comprobante']?.includes('Certificado'), true)
  assert.equal(INVENTARIO['Comprobante'].includes('Certificado'), false)
})

test('el inventario declara lo que el lector mapea de verdad', () => {
  // Si alguien anade un atributo a la tabla del lector y el inventario no se entera, el comprobador
  // de deriva mentiria en las dos direcciones. Se construyen de la misma tabla justo para esto.
  for (const atributoDelSat of ['Version', 'Total', 'Sello', 'NoCertificado', 'Confirmacion']) {
    assert.ok(INVENTARIO['Comprobante'].includes(atributoDelSat), `falta ${atributoDelSat}`)
  }
  assert.ok(INVENTARIO_TIMBRE['TimbreFiscalDigital'].includes('UUID'))
  assert.ok(INVENTARIO_PAGOS['Pago'].includes('Monto'))
})

test('los cuatro atributos que el esquema oficial delato ya se leen', () => {
  // Los encontro `medicion/deriva.mjs` comparando contra el XSD publicado del SAT.
  const completo =
    '<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Confirmacion="ECVH1">' +
    '<cfdi:Emisor Rfc="AAA010101AAA" FacAtrAdquirente="1234567890"/>' +
    '<cfdi:Receptor Rfc="XEXX010101000" ResidenciaFiscal="USA" NumRegIdTrib="123456789"/>' +
    '</cfdi:Comprobante>'
  const lectura = leeCfdi40(completo)
  const campos = porClave(lectura.campos)
  assert.equal(campos['confirmacion'], 'ECVH1')
  assert.equal(campos['fac_atr_adquirente'], '1234567890')
  assert.equal(campos['residencia_fiscal_receptor'], 'USA')
  assert.equal(campos['num_reg_id_trib_receptor'], '123456789')
  assert.deepEqual(lectura.noLeido, [], 'y ya no se declaran como sin traducir')
})

test('el lector de pagos tambien declara los atributos que no traduce', () => {
  const conPagos =
    '<Comprobante xmlns="http://www.sat.gob.mx/cfd/4" Version="4.0"><Complemento>' +
    '<p:Pagos xmlns:p="http://www.sat.gob.mx/Pagos20" Version="2.0">' +
    '<p:Totales MontoTotalPagos="100" TotalRetencionesIVA="16"/>' +
    '<p:Pago Monto="100" SelloPago="xxx"/></p:Pagos></Complemento></Comprobante>'
  const lectura = leeCfdi40(conPagos, registroDeEsquemas([lectorDePagos20]))
  assert.deepEqual(lectura.complementos.leidos[0].noLeido, [
    'Totales/@TotalRetencionesIVA',
    'Pago/@SelloPago',
  ])
})
