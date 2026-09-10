/**
 * El analisis lexico de XML.
 *
 * La mitad de este archivo son casos que DEBEN fallar, y esa proporcion no es casual: un
 * analizador que solo se prueba con documentos buenos pasa en verde mientras se traga en silencio
 * los malos, que son justo los que manda quien quiere hacer dano.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analizaLexico, decodificaEntidades } from '../dist/xml/lexico.js'

// --- El rechazo del DOCTYPE, que es la razon de ser del modulo -----------------------------------

test('un DOCTYPE se rechaza, y con el la entidad externa', () => {
  // El vector completo: la entidad apunta a un fichero del servidor y el valor acaba en un campo
  // de la factura. Apunta a proposito a algo que no existe — si el rechazo funciona el destino
  // nunca se resuelve, y un fixture apuntando a un fichero real seria la unica version de esta
  // prueba peligrosa de tener en un repositorio.
  const ataque =
    '<!DOCTYPE Comprobante [ <!ENTITY fuga SYSTEM "no-existe-y-da-igual.txt"> ]>' +
    '<Comprobante Total="&fuga;"/>'
  assert.throws(() => analizaLexico(ataque), /DOCTYPE/)
})

test('el rechazo del DOCTYPE dice que no hay forma de permitirlo', () => {
  // Si el mensaje solo dijera "no admitido", el siguiente en leerlo buscaria la opcion para
  // activarlo. Tiene que quedar claro que no existe.
  assert.throws(() => analizaLexico('<!DOCTYPE a><a/>'), /no existe la bandera/)
})

test('cualquier otra declaracion tambien se rechaza', () => {
  assert.throws(() => analizaLexico('<!ENTITY suelta "x"><a/>'), /no admitida/)
})

// --- Entidades ----------------------------------------------------------------------------------

test('las cinco predefinidas y las referencias numericas dan lo mismo', () => {
  assert.equal(decodificaEntidades('&amp;&#38;&#x26;', 1), '&&&')
  assert.equal(decodificaEntidades('&lt;&gt;&quot;&apos;', 1), '<>"\'')
})

test('una entidad desconocida es error, y NO se cuela como texto literal', () => {
  // Dejarla pasar corromperia un valor sin que nadie lo note, que es peor que fallar.
  assert.throws(() => decodificaEntidades('Total &loquesea; pesos', 1), /entidad desconocida/)
  let colada: string | null = null
  try {
    colada = decodificaEntidades('&loquesea;', 1)
  } catch {
    colada = null
  }
  assert.equal(colada, null, 'no puede devolver la entidad sin resolver como si fuera texto')
})

test('un "&" sin su ";" es documento roto, no un ampersand suelto', () => {
  assert.throws(() => decodificaEntidades('Perez & Hijos', 1), /"&" sin su ";"/)
})

test('una referencia numerica ilegible o fuera de rango falla', () => {
  assert.throws(() => decodificaEntidades('&#zz;', 1), /ilegible/)
  assert.throws(() => decodificaEntidades('&#x110000;', 1), /fuera de rango/)
})

test('el texto sin ampersand no se toca', () => {
  assert.equal(decodificaEntidades('OPERADORA LOBO SA DE CV', 1), 'OPERADORA LOBO SA DE CV')
})

// --- Etiquetas ----------------------------------------------------------------------------------

test('lee una etiqueta con sus atributos', () => {
  const piezas = analizaLexico('<cfdi:Comprobante Version="4.0" Total="1160.00"/>')
  assert.equal(piezas.length, 1)
  const primera = piezas[0]
  assert.equal(primera.tipo, 'apertura')
  if (primera.tipo !== 'apertura') return
  assert.equal(primera.nombre, 'cfdi:Comprobante')
  assert.equal(primera.vacio, true)
  assert.deepEqual(
    primera.atributos.map((a) => [a.nombre, a.valor]),
    [
      ['Version', '4.0'],
      ['Total', '1160.00'],
    ],
  )
})

test('un ">" dentro de un valor NO termina la etiqueta', () => {
  // El atajo de buscar el primer ">" parte la etiqueta por la mitad y produce un atributo
  // truncado sin dar ningun error.
  const piezas = analizaLexico('<Concepto Descripcion="Envio &gt; 100 kg" Cantidad="1"/>')
  const primera = piezas[0]
  if (primera.tipo !== 'apertura') return assert.fail('deberia ser una apertura')
  assert.equal(primera.atributos.length, 2)
  assert.equal(primera.atributos[0].valor, 'Envio > 100 kg')
  assert.equal(primera.atributos[1].nombre, 'Cantidad')
})

test('la comilla simple vale igual que la doble', () => {
  const piezas = analizaLexico("<a b='uno' c=\"dos\"/>")
  const primera = piezas[0]
  if (primera.tipo !== 'apertura') return assert.fail('deberia ser una apertura')
  assert.deepEqual(
    primera.atributos.map((a) => a.valor),
    ['uno', 'dos'],
  )
})

test('un atributo repetido es error: elegir uno seria adivinar el total', () => {
  assert.throws(() => analizaLexico('<a Total="10.00" Total="99.00"/>'), /aparece dos veces/)
})

test('un valor sin comillas se rechaza: eso es HTML, no XML', () => {
  assert.throws(() => analizaLexico('<a b=1/>'), /mal escrito/)
})

test('distingue la etiqueta vacia de la que abre', () => {
  const vacia = analizaLexico('<a/>')[0]
  const abre = analizaLexico('<a>')[0]
  assert.equal(vacia.tipo === 'apertura' && vacia.vacio, true)
  assert.equal(abre.tipo === 'apertura' && abre.vacio, false)
})

test('una etiqueta abierta que nunca cierra con ">" falla', () => {
  assert.throws(() => analizaLexico('<Comprobante Version="4.0"'), /nunca se cierra/)
})

// --- Comentarios, CDATA e instrucciones de proceso -----------------------------------------------

test('el prologo y los comentarios se saltan sin aparecer como texto', () => {
  const piezas = analizaLexico('<?xml version="1.0"?><!-- nota --><a/>')
  assert.equal(piezas.length, 1)
  assert.equal(piezas[0].tipo, 'apertura')
})

test('un comentario sin cerrar no se traga el resto del documento en silencio', () => {
  assert.throws(() => analizaLexico('<a><!-- abierto </a>'), /comentario sin cerrar/)
})

test('el CDATA llega entero y sin decodificar', () => {
  const piezas = analizaLexico('<a><![CDATA[ 1 < 2 & 3 ]]></a>')
  const texto = piezas.find((p) => p.tipo === 'texto')
  assert.equal(texto?.tipo === 'texto' ? texto.valor : null, ' 1 < 2 & 3 ')
})

test('un CDATA sin cerrar falla', () => {
  assert.throws(() => analizaLexico('<a><![CDATA[ sin fin </a>'), /CDATA sin cerrar/)
})

test('una instruccion de proceso sin cerrar falla', () => {
  assert.throws(() => analizaLexico('<?php echo <a/>'), /instruccion de proceso sin cerrar/)
})

// --- Texto y forma --------------------------------------------------------------------------

test('el espacio de sangrado entre etiquetas no llega como texto', () => {
  const piezas = analizaLexico('<a>\n  <b/>\n</a>')
  assert.equal(
    piezas.filter((p) => p.tipo === 'texto').length,
    0,
    'en un comprobante no hay contenido mixto: ese espacio es sangrado del generador',
  )
})

test('el texto de una hoja si llega', () => {
  const piezas = analizaLexico('<a>ELISA</a>')
  const texto = piezas[1]
  assert.equal(texto.tipo === 'texto' ? texto.valor : null, 'ELISA')
})

test('el BOM al principio no rompe la primera etiqueta', () => {
  // Con escape, nunca literal: es la misma regla que sigue `pruebas/saneado.ts`, y por el mismo
  // motivo — un caracter invisible dentro del fuente no se puede revisar de un vistazo.
  const piezas = analizaLexico('\u{FEFF}<a/>')
  assert.equal(piezas[0].tipo === 'apertura' ? piezas[0].nombre : null, 'a')
})

test('el error dice en que linea esta, no solo que hay uno', () => {
  // Sin numero de linea hay que leer a ojo un documento que a menudo viene en una sola linea de
  // treinta mil caracteres.
  assert.throws(() => analizaLexico('<a>\n<b>\n<c Total="1" Total="2"/>'), /linea 3/)
})

test('cuenta las lineas tambien dentro de un comentario largo', () => {
  assert.throws(() => analizaLexico('<a>\n<!-- uno\ndos\n-->\n<b Total="1" Total="2"/>'), /linea 5/)
})
