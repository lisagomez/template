/**
 * El arbol y la resolucion de espacios de nombres.
 *
 * La prueba central de todo el diseno esta aqui: el MISMO documento escrito con prefijos distintos
 * tiene que dar el mismo resultado. Si alguna vez alguien resuelve por prefijo, esa prueba lo caza
 * antes de que un emisor real lo descubra por nosotros.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analizaXml, hijo, hijos, atributo, atributoConEspacio } from '../dist/xml/arbol.js'

const CFD4 = 'http://www.sat.gob.mx/cfd/4'
const TFD = 'http://www.sat.gob.mx/TimbreFiscalDigital'

// --- La resolucion por direccion, no por prefijo -------------------------------------------------

test('el mismo documento con prefijos distintos da el mismo arbol', () => {
  const conCfdi = analizaXml(
    `<cfdi:Comprobante xmlns:cfdi="${CFD4}" Total="1160.00"><cfdi:Emisor Rfc="AAA010101AAA"/></cfdi:Comprobante>`,
  )
  const conOtro = analizaXml(
    `<z:Comprobante xmlns:z="${CFD4}" Total="1160.00"><z:Emisor Rfc="AAA010101AAA"/></z:Comprobante>`,
  )
  assert.equal(conCfdi.raiz.espacio, CFD4)
  assert.equal(conOtro.raiz.espacio, CFD4)
  assert.equal(conCfdi.raiz.nombreLocal, conOtro.raiz.nombreLocal)
  assert.equal(atributo(conCfdi.raiz, 'Total'), atributo(conOtro.raiz, 'Total'))
  assert.equal(
    hijo(conCfdi.raiz, CFD4, 'Emisor')?.nombreLocal,
    hijo(conOtro.raiz, CFD4, 'Emisor')?.nombreLocal,
  )
})

test('sin prefijo, con el espacio por defecto, tambien es el mismo esquema', () => {
  const doc = analizaXml(`<Comprobante xmlns="${CFD4}" Total="1160.00"><Emisor/></Comprobante>`)
  assert.equal(doc.raiz.espacio, CFD4)
  assert.equal(doc.raiz.prefijo, null)
  assert.equal(hijo(doc.raiz, CFD4, 'Emisor')?.espacio, CFD4)
})

test('el prefijo habitual apuntando a otra direccion NO es el mismo esquema', () => {
  // El reverso de la prueba anterior, y el que de verdad demuestra que no se resuelve por prefijo.
  const doc = analizaXml('<cfdi:Comprobante xmlns:cfdi="http://ejemplo.invalid/otro" Total="1"/>')
  assert.notEqual(doc.raiz.espacio, CFD4)
  assert.equal(hijo(doc.raiz, CFD4, 'Emisor'), null)
})

test('un prefijo usado y nunca declarado es documento roto, no un nombre con dos puntos', () => {
  assert.throws(() => analizaXml('<cfdi:Comprobante Total="1"/>'), /no esta declarado/)
})

test('el prefijo xml viene preligado sin que nadie lo declare', () => {
  const doc = analizaXml('<a xml:lang="es"/>')
  assert.equal(atributoConEspacio(doc.raiz, 'http://www.w3.org/XML/1998/namespace', 'lang'), 'es')
})

// --- La regla que casi todo el mundo se salta ----------------------------------------------------

test('un atributo SIN prefijo no esta en el espacio por defecto, esta en ninguno', () => {
  // Confundirlo hace que se busque `Total` dentro del espacio del SAT, donde no esta en ningun
  // documento del mundo, y se acabe culpando al emisor.
  const doc = analizaXml(`<Comprobante xmlns="${CFD4}" Total="1160.00"/>`)
  assert.equal(doc.raiz.espacio, CFD4, 'el ELEMENTO si esta en el espacio por defecto')
  assert.equal(doc.raiz.atributos[0].espacio, null, 'su ATRIBUTO no')
  assert.equal(atributo(doc.raiz, 'Total'), '1160.00')
  assert.equal(atributoConEspacio(doc.raiz, CFD4, 'Total'), null)
})

test('un atributo CON prefijo si lleva su direccion', () => {
  const doc = analizaXml(`<a xmlns:t="${TFD}" t:UUID="x"/>`)
  assert.equal(atributoConEspacio(doc.raiz, TFD, 'UUID'), 'x')
  assert.equal(atributo(doc.raiz, 'UUID'), null, 'no es un atributo sin espacio')
})

// --- Ambitos anidados ----------------------------------------------------------------------------

test('un hijo puede redefinir un prefijo, y al salir vuelve el de antes', () => {
  const doc = analizaXml(
    `<a xmlns:p="${CFD4}"><p:dentro xmlns:p="${TFD}"><p:hondo/></p:dentro><p:fuera/></a>`,
  )
  const dentro = doc.raiz.hijos[0]
  assert.equal(dentro.espacio, TFD, 'la redefinicion vale ya en el elemento que la declara')
  assert.equal(dentro.hijos[0].espacio, TFD, 'y en sus hijos')
  assert.equal(doc.raiz.hijos[1].espacio, CFD4, 'al salir vuelve a valer la del padre')
})

test('un elemento puede declarar el espacio en el que el mismo esta', () => {
  const doc = analizaXml(`<cfdi:Comprobante xmlns:cfdi="${CFD4}"/>`)
  assert.equal(doc.raiz.espacio, CFD4)
})

test('xmlns vacio deshace el espacio por defecto, no declara uno vacio', () => {
  // Importa dentro de una addenda: muchos emisores meten ahi elementos sin espacio ninguno.
  const doc = analizaXml(`<a xmlns="${CFD4}"><b xmlns=""><c/></b></a>`)
  assert.equal(doc.raiz.espacio, CFD4)
  assert.equal(doc.raiz.hijos[0].espacio, null)
  assert.equal(doc.raiz.hijos[0].hijos[0].espacio, null)
})

test('la raiz declara sus espacios, para poder diagnosticar el documento que no se reconoce', () => {
  const doc = analizaXml(`<cfdi:Comprobante xmlns:cfdi="${CFD4}" xmlns="otro"/>`)
  assert.equal(doc.espaciosEnLaRaiz['cfdi'], CFD4)
  assert.equal(doc.espaciosEnLaRaiz[''], 'otro')
})

// --- Estructura ----------------------------------------------------------------------------------

test('anida hijos y conserva el texto de las hojas', () => {
  const doc = analizaXml('<a><b>uno</b><b>dos</b></a>')
  const bes = hijos(doc.raiz, '', 'b')
  assert.equal(bes.length, 0, 'la cadena vacia no es "sin espacio"')
  assert.equal(doc.raiz.hijos.length, 2)
  assert.deepEqual(
    doc.raiz.hijos.map((h) => h.texto),
    ['uno', 'dos'],
  )
})

test('la etiqueta vacia produce un elemento igual que la que abre y cierra', () => {
  assert.deepEqual(analizaXml('<a><b/></a>').raiz.hijos[0], analizaXml('<a><b></b></a>').raiz.hijos[0])
})

test('un cierre que no corresponde nombra los dos', () => {
  assert.throws(() => analizaXml('<a><b></a></b>'), /se abrio <b> y se cierra <\/a>/)
})

test('un elemento que se abre y nunca se cierra falla', () => {
  assert.throws(() => analizaXml('<a><b></a>'), /se abrio <b>/)
})

test('un cierre sin apertura falla', () => {
  assert.throws(() => analizaXml('<a/></b>'), /sin que nada lo hubiera abierto/)
})

test('dos raices es documento roto', () => {
  assert.throws(() => analizaXml('<a/><b/>'), /un solo elemento raiz/)
})

test('texto fuera de la raiz falla', () => {
  assert.throws(() => analizaXml('<a/>suelto'), /fuera del elemento raiz/)
})

test('un documento sin ningun elemento no es documento', () => {
  assert.throws(() => analizaXml('<?xml version="1.0"?>'), /sin ningun elemento/)
})

test('no desborda con un anidamiento absurdo: la pila es explicita', () => {
  // Con recursion esto reventaria, y el arreglo habitual seria inventar un limite de profundidad.
  // Aqui no hace falta ninguno, que es la razon de construir con pila.
  const hondo = 50000
  const fuente = '<a>'.repeat(hondo) + '</a>'.repeat(hondo)
  let nivel = analizaXml(fuente).raiz
  let contados = 1
  while (nivel.hijos.length > 0) {
    nivel = nivel.hijos[0]
    contados++
  }
  assert.equal(contados, hondo)
})
