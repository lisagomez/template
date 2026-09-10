/**
 * La siembra: que sea reproducible, y que los datos tengan la FORMA que dicen tener.
 *
 * Lo segundo importa tanto como lo primero. Un catalogo de pruebas con GTIN inventados a mano no
 * ejercita la validacion determinista de digito de control: la desactiva sin decirlo, y entonces
 * "el banco prueba los codigos" es una frase falsa que nadie comprueba.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validaModulo10, validaDigitoDeControl, analizaCarga, normaliza, similitud,
  resuelveValor, resuelveIdentificador,
} from '../dist/index.js'
import { siembra, huellaDe, SEMILLA_POR_DEFECTO } from '../banco/semilla.ts'
import { PROVEEDORES, PRODUCTOS, GTIN_AUSENTES, GUIAS, conDigitoDeControl } from '../banco/negocio.ts'

test('dos siembras con la misma semilla producen la misma base', () => {
  const a = siembra({ semilla: 'identica' })
  const b = siembra({ semilla: 'identica' })
  try {
    assert.equal(huellaDe(a.base), huellaDe(b.base))
  } finally {
    a.base.cierra()
    b.base.cierra()
  }
})

test('dos semillas distintas producen bases distintas', () => {
  const a = siembra({ semilla: 'una' })
  const b = siembra({ semilla: 'otra' })
  try {
    assert.notEqual(huellaDe(a.base), huellaDe(b.base))
  } finally {
    a.base.cierra()
    b.base.cierra()
  }
})

test('la siembra no depende del reloj de pared', () => {
  // Si algun `creado_en` saliera de `Date.now()`, dos siembras separadas en el tiempo divergirian
  // aunque la semilla fuese la misma. Es el fallo silencioso que la cabecera de `semilla.ts` evita.
  const a = siembra({ semilla: SEMILLA_POR_DEFECTO })
  const primera = huellaDe(a.base)
  a.base.cierra()
  const b = siembra({ semilla: SEMILLA_POR_DEFECTO })
  try {
    assert.equal(huellaDe(b.base), primera)
  } finally {
    b.base.cierra()
  }
})

test('todos los GTIN del catalogo pasan el digito de control', () => {
  for (const producto of PRODUCTOS) {
    assert.equal(producto.gtin.length, 13, `${producto.id}: un GTIN-13 tiene 13 digitos`)
    assert.ok(validaModulo10(producto.gtin), `${producto.id}: GTIN "${producto.gtin}" no valida`)
    assert.equal(validaDigitoDeControl(producto.gtin, 'gtin'), true)
  }
})

test('los GTIN ausentes tambien son validos: lo que falla no es el codigo, es que no esta', () => {
  // El escenario peligroso NO es un codigo corrupto —eso lo caza el digito de control— sino un
  // codigo perfectamente valido que no corresponde a nada del catalogo.
  const enCatalogo = new Set(PRODUCTOS.map((p) => p.gtin))
  for (const ausente of GTIN_AUSENTES) {
    assert.ok(validaModulo10(ausente.gtin), `"${ausente.gtin}" deberia ser un GTIN bien formado`)
    assert.ok(!enCatalogo.has(ausente.gtin), `"${ausente.gtin}" no puede estar en el catalogo`)
  }
})

test('cada GTIN ausente se parece peligrosamente a uno que si esta', () => {
  // MEDIDO, no supuesto: 0,786 para el par 7501001000035 / 7501001000011.
  //
  // Es algo MENOS que el 0,87 que la tabla de §2.10 del SDD da para "dos GTIN a un digito", y la
  // razon es real y vale la pena dejarla escrita: al cambiar un digito del CUERPO cambia tambien el
  // digito de control, asi que dos GTIN validos que "difieren en un digito" difieren de hecho en
  // DOS caracteres. Sigue estando muy por encima de cualquier umbral que alguien pondria.
  //
  // Esto NO calibra nada: el 0,7 de aqui es el suelo de una asercion sobre datos de este banco, no
  // un umbral de producto. Los umbrales se miden sobre corpus real (TAR-17, TAR-25).
  for (const ausente of GTIN_AUSENTES) {
    const pariente = PRODUCTOS.find((p) => p.id === ausente.parecidoA)
    assert.ok(pariente, `no encuentro el producto "${ausente.parecidoA}"`)
    const parecido = similitud(ausente.gtin, pariente.gtin)
    assert.ok(parecido > 0.7, `"${ausente.gtin}" vs "${pariente.gtin}": similitud ${parecido}`)
  }
})

test('con un catalogo de GTIN del mismo prefijo, la via difusa al menos empata', () => {
  // Hallazgo de este banco, y conviene no taparlo: los doce productos comparten el prefijo 750100,
  // asi que el primer y el segundo candidato quedan dentro del margen y la resolucion sale
  // `ambiguo`. El empate PROTEGE — levanta sospecha y manda el caso a una persona.
  //
  // Pero eso es suerte de la forma del catalogo, no una garantia del algoritmo. La prueba siguiente
  // enseña el caso en que la suerte no acompaña.
  const ausente = GTIN_AUSENTES[0]
  const catalogo = PRODUCTOS.map((p) => ({ id: p.id, etiqueta: p.gtin }))
  const resolucion = resuelveValor(ausente.gtin, catalogo, { umbral: 0.7, margenDeAmbiguedad: 0.05 })
  assert.equal(resolucion.estado, 'ambiguo')
  assert.equal(resolucion.elegida, null)
})

test('sin empate, la via difusa resuelve al producto EQUIVOCADO y lo declara resuelto', () => {
  // El escenario de §2.10 en su forma pura: el identificador correcto NO esta en el catalogo y
  // ningun otro le hace sombra al pariente. Entonces el segundo mejor gana SOLO, el estado es
  // `resuelto`, y la herramienta afirma que la caja es de otro producto. No hay error, no hay
  // aviso, no hay empate: hay stock en el SKU equivocado y nadie se entera.
  const ausente = GTIN_AUSENTES[0]
  const pariente = PRODUCTOS.find((p) => p.id === ausente.parecidoA)
  assert.ok(pariente)
  const catalogo = [
    { id: pariente.id, etiqueta: pariente.gtin },
    // Productos de prefijos distintos, como en un catalogo real con varios fabricantes.
    { id: 'otro-1', etiqueta: conDigitoDeControl('840099112233') },
    { id: 'otro-2', etiqueta: conDigitoDeControl('501234567890') },
  ]
  const resolucion = resuelveValor(ausente.gtin, catalogo, { umbral: 0.7, margenDeAmbiguedad: 0.05 })
  assert.equal(resolucion.estado, 'resuelto')
  assert.equal(resolucion.elegida?.id, ausente.parecidoA)
  assert.ok(!PRODUCTOS.some((p) => p.gtin === ausente.gtin), 'y el codigo leido no era de ese producto')
})

test('la barrera: resuelveValor LANZA si se le pasa formato identificador', () => {
  // Por eso lo anterior no puede ocurrir en el camino real. No es un aviso, es una excepcion.
  const catalogo = PRODUCTOS.map((p) => ({ id: p.id, etiqueta: p.gtin }))
  assert.throws(
    () => resuelveValor(GTIN_AUSENTES[0].gtin, catalogo, {
      umbral: 0.7,
      margenDeAmbiguedad: 0.05,
      formato: 'identificador',
    }),
    TypeError,
  )
})

test('por la via exacta, un GTIN ausente responde "no esta" y no ofrece candidatos', () => {
  const catalogo = PRODUCTOS.map((p) => ({ id: p.id, etiqueta: p.gtin }))
  const resolucion = resuelveIdentificador(GTIN_AUSENTES[0].gtin, catalogo)
  assert.equal(resolucion.estado, 'sin_resolver')
  assert.equal(resolucion.elegida, null)
  assert.equal(resolucion.candidatos.length, 0, 'ofrecer "el mas parecido" es invitar a aceptarlo')
})

test('las guias de FedEx del banco las clasifica el nucleo como guia', () => {
  for (const guia of GUIAS) {
    assert.equal(validaDigitoDeControl(guia.numero, 'fedex-express'), true, `guia "${guia.numero}"`)
    assert.equal(analizaCarga(guia.numero).tipo, 'guia')
  }
})

test('el generador de digito de control y el validador del nucleo no han divergido', () => {
  // `conDigitoDeControl` ya lanza si divergen. Esto lo ejercita sobre cuerpos variados para que el
  // fallo salga aqui y no a mitad de una siembra.
  for (const cuerpo of ['750100100001', '040012345678', '00000000000', '99999999999999999']) {
    assert.ok(validaModulo10(conDigitoDeControl(cuerpo)))
  }
})

test('ninguna variante de proveedor es identica a su razon social', () => {
  // Si el documento dijera exactamente lo que dice el catalogo, la reconciliacion no tendria nada
  // que resolver: la prueba pasaria sin probar nada.
  for (const p of PROVEEDORES) {
    for (const variante of p.variantes) {
      assert.notEqual(variante, p.razonSocial, `"${p.id}": la variante repite la razon social`)
    }
  }
})

test('las variantes normalizan a lo mismo que su razon social, o casi', () => {
  for (const p of PROVEEDORES) {
    for (const variante of p.variantes) {
      const parecido = similitud(variante, p.razonSocial)
      assert.ok(parecido > 0.5, `"${variante}" vs "${p.razonSocial}": ${parecido}`)
    }
  }
})

test('"Munoz" sin tilde y "Muñoz" con tilde normalizan igual', () => {
  const conTilde = PROVEEDORES.find((p) => p.id === 'prv-003')
  assert.ok(conTilde)
  assert.equal(normaliza('Empaques Munoz'), normaliza('Empaques Muñoz'))
})

test('los dos proveedores de lacteos se parecen lo bastante para ser ambiguos', () => {
  const valle = PROVEEDORES.find((p) => p.id === 'prv-007')
  const bajio = PROVEEDORES.find((p) => p.id === 'prv-008')
  assert.ok(valle && bajio)
  assert.ok(similitud(valle.razonSocial, bajio.razonSocial) > 0.6)
})

test('el resumen de la siembra cuenta lo que hay en la base', () => {
  const { base, resumen } = siembra({ facturas: 20 })
  try {
    assert.equal(resumen.proveedores, PROVEEDORES.length)
    assert.equal(resumen.productos, PRODUCTOS.length)
    assert.equal(resumen.facturas, 20)
    assert.equal(resumen.documentos.length, 20)
    assert.ok(resumen.tablas.includes('proveedores'))
  } finally {
    base.cierra()
  }
})

test('un proyecto virgen se siembra sin catalogos y no se rompe nada', () => {
  const { base, resumen } = siembra({ sinNegocio: true })
  try {
    assert.equal(resumen.proveedores, 0)
    assert.ok(!resumen.tablas.includes('proveedores'))
    // Las tablas de la herramienta SI estan: lo que falta son los catalogos del consumidor.
    assert.ok(resumen.tablas.includes('documentos'))
  } finally {
    base.cierra()
  }
})

test('al menos una factura sintetica trae un GTIN ausente del catalogo', () => {
  const { base, resumen } = siembra()
  try {
    assert.ok(resumen.documentos.some((d) => d.gtinAusente), 'sin este caso el escenario peligroso no se recorre')
  } finally {
    base.cierra()
  }
})
