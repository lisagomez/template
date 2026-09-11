import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  leeCapaCero,
  extraeConCapaCero,
  extraeTextoDeContenido,
  pareceTexto,
  cuentaPaginasPdf,
  capaCeroComoJson,
} from '../dist/capa-cero.js'
import type { MotorOcr } from '../dist/puertos.js'
import type { PaginaExtraida } from '../dist/tipos.js'

const bytes = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0))

function une(...trozos: Uint8Array[]): Uint8Array {
  const total = trozos.reduce((n, t) => n + t.length, 0)
  const salida = new Uint8Array(total)
  let i = 0
  for (const t of trozos) {
    salida.set(t, i)
    i += t.length
  }
  return salida
}

async function desinfla(datos: Uint8Array): Promise<Uint8Array> {
  const flujo = new Blob([datos as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(flujo).arrayBuffer())
}

/** PDF minimo pero con la forma real: cabecera, objeto con diccionario, flujo y trailer. */
async function pdfCon(contenido: string, opciones: { comprimido?: boolean; extra?: string } = {}) {
  const cuerpo = opciones.comprimido ? await desinfla(bytes(contenido)) : bytes(contenido)
  const filtro = opciones.comprimido ? ' /Filter /FlateDecode' : ''
  return une(
    bytes(`%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n${opciones.extra ?? ''}`),
    bytes(`4 0 obj\n<< /Length ${cuerpo.length}${filtro} >>\nstream\n`),
    cuerpo,
    bytes('\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'),
  )
}

/**
 * PDF con VARIOS flujos, que es como son los PDF de verdad: uno con el contenido de pagina y los
 * demas con la fuente embebida, su mapa ToUnicode y los glifos. `pdfCon` solo hace uno, y por eso
 * no cazaba el fallo del agregado.
 */
async function pdfConVarios(contenidos: readonly string[], { comprimido = false } = {}) {
  const trozos: Uint8Array[] = [bytes('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n')]
  for (const [i, contenido] of contenidos.entries()) {
    const cuerpo = comprimido ? await desinfla(bytes(contenido)) : bytes(contenido)
    const filtro = comprimido ? ' /Filter /FlateDecode' : ''
    trozos.push(bytes(`${i + 4} 0 obj\n<< /Length ${cuerpo.length}${filtro} >>\nstream\n`), cuerpo, bytes('\nendstream\nendobj\n'))
  }
  trozos.push(bytes('trailer\n<< /Root 1 0 R >>\n%%EOF\n'))
  return une(...trozos)
}

/** Glifos CID sin mapear: lo que produce una fuente embebida leida como si fuera texto. */
const GLIFOS = 'BT /F1 12 Tf (\u0000-\u00002\u00007\u0000;\u0000@\u0000E\u0000J\u0000O\u0000T\u0000Y) Tj ET'

const FACTURA = 'BT /F1 12 Tf 72 720 Td (Factura A-1874) Tj 0 -14 Td (Proveedor: ACME S.A.) Tj ET'

/** Motor de mentira que solo cuenta cuantas veces lo llamaron. Es toda la prueba de TAR-9. */
function motorQueCuenta(): MotorOcr & { llamadas: number } {
  return {
    llamadas: 0,
    modelo: 'motor-de-prueba-v1',
    limites: { bytesMaximos: 1000, paginasMaximas: 10, paginasPorAnotacion: 8 },
    async extrae(): Promise<PaginaExtraida[]> {
      this.llamadas++
      return [{ indice: 0, markdown: 'texto del motor', campos: [] }]
    },
  }
}

test('lee la capa de texto de un PDF sin comprimir', async () => {
  const resultado = await leeCapaCero(await pdfCon(FACTURA))
  assert.equal(resultado.hayTexto, true)
  assert.equal(resultado.motivo, null)
  assert.match(resultado.paginas.join('\n'), /Factura A-1874/)
  assert.match(resultado.paginas.join('\n'), /ACME S\.A\./)
})

test('lee la capa de texto de un PDF con FlateDecode', async () => {
  const resultado = await leeCapaCero(await pdfCon(FACTURA, { comprimido: true }))
  assert.equal(resultado.hayTexto, true)
  assert.match(resultado.paginas.join('\n'), /Factura A-1874/)
})

test('un flujo legible junto a flujos de glifos SI se resuelve sin motor', async () => {
  // El caso del CFDI real que destapo el fallo: cinco flujos, uno legible al 94 % y cuatro que no
  // son texto (fuente embebida, mapa ToUnicode, glifos CID). Juzgando el agregado, el promedio caia
  // por debajo del minimo y se rechazaban LOS CINCO — la factura se resolvia sin motor y se mandaba
  // al motor igual, que es justo el gasto que esta capa existe para evitar.
  const resultado = await leeCapaCero(await pdfConVarios([GLIFOS, FACTURA, GLIFOS, GLIFOS]))
  assert.equal(resultado.hayTexto, true)
  assert.equal(resultado.motivo, null)
  assert.match(resultado.paginas.join('\n'), /Factura A-1874/)
})

test('los flujos que no son texto se descartan ENTEROS, no se promedian', async () => {
  // La asimetria del modulo se respeta igual: lo que se descarta se descarta del todo, asi que no
  // se cuela un solo caracter dudoso entre los buenos.
  const resultado = await leeCapaCero(await pdfConVarios([GLIFOS, FACTURA, GLIFOS]))
  assert.equal(resultado.paginas.length, 1, 'solo el flujo legible sobrevive')
  assert.ok(!resultado.paginas.join('').includes('\u0000'), 'ningun glifo sin mapear se cuela')
})

test('si NINGUN flujo supera la imprimibilidad, sigue necesitando motor', async () => {
  // El arreglo no relaja la barrera: solo deja de castigar al flujo bueno por la compañia.
  const resultado = await leeCapaCero(await pdfConVarios([GLIFOS, GLIFOS]))
  assert.equal(resultado.hayTexto, false)
  assert.match(resultado.motivo ?? '', /imprimibilidad/)
})

test('el caso de varios flujos tambien funciona comprimido', async () => {
  const resultado = await leeCapaCero(await pdfConVarios([GLIFOS, FACTURA], { comprimido: true }))
  assert.equal(resultado.hayTexto, true)
  assert.match(resultado.paginas.join('\n'), /Factura A-1874/)
})

test('un escaneo no tiene capa de texto, y lo dice', async () => {
  // Un JPEG incrustado: el caso normal de un documento escaneado.
  const escaneo = une(
    bytes('%PDF-1.7\n5 0 obj\n<< /Subtype /Image /Filter /DCTDecode /Length 8 >>\nstream\n'),
    Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]),
    bytes('\nendstream\nendobj\n%%EOF\n'),
  )
  const resultado = await leeCapaCero(escaneo)
  assert.equal(resultado.hayTexto, false)
  assert.match(resultado.motivo ?? '', /escaneo|imagen/)
})

test('un PDF cifrado se descarta sin intentar descifrarlo', async () => {
  const resultado = await leeCapaCero(await pdfCon(FACTURA, { extra: '2 0 obj\n<< /Encrypt 3 0 R >>\nendobj\n' }))
  assert.equal(resultado.hayTexto, false)
  assert.match(resultado.motivo ?? '', /cifrado/)
})

test('lo que no es PDF no entra por aqui', async () => {
  const resultado = await leeCapaCero(bytes('\x89PNG\r\n\x1a\n'))
  assert.equal(resultado.hayTexto, false)
  assert.match(resultado.motivo ?? '', /no es un PDF/)
})

// --- El corazon de TAR-9: contar las llamadas -------------------------------------------------

test('un PDF con texto nativo se resuelve SIN llamar al motor', async () => {
  const motor = motorQueCuenta()
  const salida = await extraeConCapaCero(motor, await pdfCon(FACTURA))
  assert.equal(motor.llamadas, 0, 'se llamo al motor teniendo el texto delante')
  assert.equal(salida.porCapaCero, true)
  assert.match(salida.paginas[0].markdown, /Factura A-1874/)
})

test('un escaneo SI llama al motor, y el motivo queda dicho', async () => {
  const motor = motorQueCuenta()
  const escaneo = une(bytes('%PDF-1.7\n5 0 obj\n<< /Length 0 >>\nstream\n'), bytes('\nendstream\n%%EOF\n'))
  const salida = await extraeConCapaCero(motor, escaneo)
  assert.equal(motor.llamadas, 1)
  assert.equal(salida.porCapaCero, false)
  assert.ok(salida.motivo && salida.motivo.length > 0, 'gastar una llamada sin decir por que es lo que se evita')
})

test('pedir anotaciones llama al motor AUNQUE el PDF traiga texto', async () => {
  // El matiz que decide la correccion: la capa 0 da texto, no campos con confianza y region.
  // Devolver campos vacios "porque habia texto" seria dar por extraida una factura sin un dato.
  const motor = motorQueCuenta()
  const salida = await extraeConCapaCero(motor, await pdfCon(FACTURA), { esquemaDeAnotacion: { total: 'number' } })
  assert.equal(motor.llamadas, 1)
  assert.equal(salida.porCapaCero, false)
  assert.match(salida.motivo ?? '', /anotaciones/)
})

test('la via de capa 0 no inventa campos ni confianza', async () => {
  const motor = motorQueCuenta()
  const salida = await extraeConCapaCero(motor, await pdfCon(FACTURA))
  assert.deepEqual(salida.paginas[0].campos, [], 'un campo que nadie extrajo no tiene confianza 1: no tiene confianza')
})

// --- La barrera contra el falso positivo ------------------------------------------------------

test('basura que se descomprime no pasa por texto', () => {
  // La basura se CONSTRUYE, no se escribe literal: un fichero con bytes de control dentro no se
  // puede revisar de un vistazo, y aqui hay diecisiete seguidos que nadie veria.
  const basura = [1, 2, 3, 4, 5, 6, 7, 8, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]
    .map((c) => String.fromCharCode(c))
    .join('')
  assert.equal(pareceTexto(basura), false)
})

test('un texto demasiado corto no cuenta como capa', () => {
  assert.equal(pareceTexto('ok'), false)
})

test('el espanol con acentos si cuenta como texto', () => {
  assert.equal(pareceTexto('Facturación de energía eléctrica del añejo'), true)
})

// --- El extractor de operadores ---------------------------------------------------------------

test('TJ con array y kerning conserva las partes', () => {
  assert.match(extraeTextoDeContenido('[(AC) -20 (ME)] TJ'), /ACME/)
})

test('las cadenas hexadecimales se decodifican', () => {
  assert.match(extraeTextoDeContenido('<48656C6C6F> Tj'), /Hello/)
})

test('el hexadecimal con BOM se lee como UTF-16BE', () => {
  assert.match(extraeTextoDeContenido('<FEFF00480069> Tj'), /Hi/)
})

test('los escapes de una cadena literal se respetan', () => {
  assert.match(extraeTextoDeContenido('(Total \\(IVA\\): 100) Tj'), /Total \(IVA\): 100/)
})

// --- Contar paginas: el `null` es la parte importante -------------------------------------------

test('cuenta las paginas por /Count del arbol', () => {
  const pdf = bytes('%PDF-1.7\n1 0 obj\n<< /Type /Pages /Count 12 >>\nendobj\n%%EOF')
  assert.equal(cuentaPaginasPdf(pdf), 12)
})

test('si no hay /Count, cuenta los objetos /Type /Page', () => {
  const pdf = bytes('%PDF-1.7\n2 0 obj\n<< /Type /Page >>\nendobj\n3 0 obj\n<< /Type /Page >>\nendobj\n%%EOF')
  assert.equal(cuentaPaginasPdf(pdf), 2)
})

test('/Type /Pages no se confunde con /Type /Page', () => {
  const pdf = bytes('%PDF-1.7\n1 0 obj\n<< /Type /Pages >>\nendobj\n2 0 obj\n<< /Type /Page >>\nendobj\n%%EOF')
  assert.equal(cuentaPaginasPdf(pdf), 1)
})

test('si las dos vias discrepan devuelve null, y no un numero a medias', () => {
  const pdf = bytes('%PDF-1.7\n1 0 obj\n<< /Type /Pages /Count 9 >>\nendobj\n2 0 obj\n<< /Type /Page >>\nendobj\n%%EOF')
  assert.equal(cuentaPaginasPdf(pdf), null, 'adivinar mal parte el documento por donde no toca')
})

test('lo que no es PDF no tiene paginas que contar', () => {
  assert.equal(cuentaPaginasPdf(bytes('hola')), null)
})

test('Td separa renglones, para que una factura no salga en una sola linea', () => {
  const texto = extraeTextoDeContenido('BT (linea uno) Tj 0 -14 Td (linea dos) Tj ET')
  assert.ok(texto.includes('\n'), 'sin salto de linea la factura deja de ser legible al revisarla')
})


// --- Salida en JSON -----------------------------------------------------------------------------

/**
 * Control U+0001 construido con `fromCharCode`, no escrito literal.
 *
 * Es la misma disciplina que `src/saneado.ts`: un byte de control dentro del fichero no se ve al
 * revisarlo. Aqui hasta el arnes lo rechazo tres veces al intentar escribirlo, que es la mejor
 * prueba de que la regla vale.
 */
const CONTROL_DE_PRUEBA = String.fromCharCode(1)

test('capaCeroComoJson describe un PDF resuelto sin motor', async () => {
  const json = capaCeroComoJson(await leeCapaCero(await pdfCon(FACTURA)))
  assert.equal(json.hayTexto, true)
  assert.equal(json.motivo, null)
  assert.equal(json.bloques, 1)
  assert.ok(json.lineas.some((l) => l.includes('Factura A-1874')))
})

test('capaCeroComoJson describe tambien el rechazo, con su motivo', async () => {
  const json = capaCeroComoJson(await leeCapaCero(bytes('no soy un pdf')))
  assert.equal(json.hayTexto, false)
  assert.match(json.motivo ?? '', /no es un PDF/)
  assert.deepEqual(json.lineas, [], 'sin texto la lista va vacia, nunca con una cadena vacia dentro')
})

test('capaCeroComoJson NO inventa confianzas', async () => {
  // La capa 0 no estima: su texto es exacto. Un 0,99 aqui seria el numero falso que TAR-17 existe
  // para impedir, y convertir lineas en campos es trabajo del motor o de quien revisa.
  const json = capaCeroComoJson(await leeCapaCero(await pdfCon(FACTURA)))
  assert.ok(!('confianza' in json), 'el resultado no lleva confianza')
  assert.ok(!('campos' in json), 'ni campos: son lineas')
  assert.ok(!JSON.stringify(json).includes('confianza'))
})

test('capaCeroComoJson sanea: ni un control llega a la salida', async () => {
  const sucio = `BT /F1 12 Tf (Total:${CONTROL_DE_PRUEBA} 1234.56 de la factura) Tj ET`
  const json = capaCeroComoJson(await leeCapaCero(await pdfCon(sucio)))
  assert.equal(json.saneado.controles, 1)
  assert.ok(
    !json.lineas.join('').includes(CONTROL_DE_PRUEBA),
    'el control no puede sobrevivir a la serializacion',
  )
})

test('capaCeroComoJson conserva lo descartado en el propio JSON', async () => {
  const json = capaCeroComoJson(await leeCapaCero(await pdfCon(FACTURA)))
  assert.ok(json.lineas.some((l) => l.includes('Factura A-1874')), 'lo bueno se queda')
  assert.ok(Array.isArray(json.saneado.lineasDescartadas), 'lo descartado viaja en el JSON')
})

test('el JSON sobrevive a serializar y volver', async () => {
  // Es la propiedad entera: que se pueda guardar, mandar y comparar entre dos corridas.
  const json = capaCeroComoJson(await leeCapaCero(await pdfCon(FACTURA)))
  assert.deepEqual(JSON.parse(JSON.stringify(json)), json)
})

// --- Tm: el operador de posicion que faltaba ----------------------------------------------------

test('dos Tm a distinta altura son dos lineas, no una pegada', () => {
  // El caso real: el nombre del emisor y su RFC se concatenaban en "OPERADORA LOBOLO890914R16".
  const flujo = 'BT /F3 10 Tf 1 0 0 -1 155.5 8.5 Tm [(OPERADORA LOB)] TJ 1 0 0 -1 163.3 20.5 Tm [(OLO890914R16)] TJ ET'
  assert.equal(extraeTextoDeContenido(flujo).trim(), 'OPERADORA LOB\nOLO890914R16')
})

test('dos Tm a la misma altura y lejos son dos columnas, con espacio', () => {
  const flujo = 'BT 1 0 0 -1 60 12 Tm [(Lugar de expedicion)] TJ 1 0 0 -1 132 12 Tm [(45609)] TJ ET'
  assert.equal(extraeTextoDeContenido(flujo).trim(), 'Lugar de expedicion 45609')
})

test('dos Tm a la misma altura y JUNTOS son la misma palabra, sin espacio', () => {
  // Sin esto, arreglar el pegado vertical rompia la palabra en horizontal: un titulo dibujado letra
  // a letra salia como "S E C C I O N".
  const flujo = 'BT 1 0 0 -1 100 12 Tm [(Fac)] TJ 1 0 0 -1 102 12 Tm [(tura)] TJ ET'
  assert.equal(extraeTextoDeContenido(flujo).trim(), 'Factura')
})

test('un Tm que retrocede es otra columna, aunque este cerca', () => {
  // Volver hacia atras nunca es la continuacion de una palabra.
  const flujo = 'BT 1 0 0 -1 200 12 Tm [(IVA)] TJ 1 0 0 -1 151 12 Tm [(16 %)] TJ ET'
  assert.equal(extraeTextoDeContenido(flujo).trim(), 'IVA 16 %')
})

test('el primer Tm no inventa separacion', () => {
  assert.equal(extraeTextoDeContenido('BT 1 0 0 -1 100 12 Tm [(Solo)] TJ ET').trim(), 'Solo')
})

test('Td y ET siguen produciendo salto de linea', () => {
  // La conducta anterior no se toca: solo se AÑADE Tm.
  assert.equal(extraeTextoDeContenido('BT (uno) Tj 0 -14 Td (dos) Tj ET').trim(), 'uno\ndos')
})

test('los espacios que trae el propio literal se respetan', () => {
  // Un generador que simula letter-spacing mete los espacios DENTRO del literal. Quitarlos seria
  // alterar el contenido del documento, que es justo lo que esta capa no hace.
  const flujo = 'BT 1 0 0 -1 117 9 Tm [( S E C C I O N   D E   C O N C E P T O S)] TJ ET'
  assert.match(extraeTextoDeContenido(flujo), /S E C C I O N/)
})

// --- Lo que enseño un PDF escaneado de verdad ----------------------------------------------------
// Los tres salieron de pasar un escaneo real por la demo el 2026-09-10. Su sintoma era un motivo
// que no tenia nada que ver con el documento: decia que lo extraido no parecia texto cuando lo
// cierto era que no habia texto ninguno.

test('un flujo que declara /Type es fontaneria y NO se lee como contenido', async () => {
  // La tabla de referencias, los flujos de objetos y los metadatos inflan a bytes que no son
  // texto. Un flujo de CONTENIDO no declara tipo; estos si, y ahi se distinguen.
  const conEstructura = await pdfCon('BT (Factura A-1874 del proveedor) Tj ET', {
    // Lleva a proposito algo que SI se extraeria: con bytes que no producen texto, la prueba
    // pasaria igual con el arreglo desactivado y no defenderia nada.
    extra:
      '9 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Length 46 >>\n' +
      'stream\nBT (ESTO SALE DE LA FONTANERIA Y NO DEBE) Tj ET\nendstream\nendobj\n',
  })
  const r = await leeCapaCero(conEstructura)
  assert.equal(r.hayTexto, true)
  assert.equal(r.paginas.length, 1, 'solo el contenido de pagina, no la estructura')
  assert.match(r.paginas[0], /Factura A-1874/)
  assert.doesNotMatch(r.paginas.join(''), /FONTANERIA/, 'ni un caracter de un flujo de estructura')
})

/**
 * Bytes que imitan a un JPEG: altos de Latin-1 —que `pareceTexto` cuenta como imprimibles— con una
 * secuencia que parece un operador de texto metida dentro.
 *
 * Esa secuencia no esta de adorno. Los bytes de una imagen real contienen de todo por pura
 * estadistica, y el dia que dan con algo con forma de operador, el extractor saca "texto" de una
 * foto. Sin ella, esta prueba pasaria con el arreglo desactivado y no defenderia nada.
 */
const ALTO =
  '\u00c0\u00cd\u00ce\u00df\u00da\u00c1\u00c9\u00cd\u00d3\u00da\u00dc\u00d1'.repeat(3) +
  'BT (basura de la imagen que jamas debe salir) Tj ET' +
  '\u00c0\u00cd\u00ce\u00df\u00da\u00c1\u00c9\u00cd\u00d3\u00da\u00dc\u00d1'.repeat(3)

test('un PDF sin capa de texto lo dice TAL CUAL: es un escaneo', async () => {
  // El motivo importa tanto como el veredicto. "No supera la prueba de imprimibilidad" no le dice
  // nada a nadie; "es un escaneo o una imagen" dice que hacer — llamar al motor.
  const soloImagen = await pdfCon('q 612 0 0 792 0 0 cm /x2 Do Q', {
    // SIN `/Filter` a proposito: con filtro, la version vieja tambien la saltaba y esto no
    // distinguiria. Sin el se leia cruda, y sus bytes altos pasaban por imprimibles.
    extra:
      `2 0 obj\n<< /Type /XObject /Subtype /Image /Length ${ALTO.length} >>\n` +
      `stream\n${ALTO}\nendstream\nendobj\n`,
  })
  const r = await leeCapaCero(soloImagen)
  assert.equal(r.hayTexto, false)
  assert.match(r.motivo ?? '', /escaneo o una imagen/)
  assert.equal(r.paginas.length, 0, 'y ni un bloque salido de los bytes de la foto')
})

test('cuatro caracteres de basura no son una capa de texto', async () => {
  // Con el filtro en `> 0`, cuatro bytes sueltos bastaban para que el documento dejara de parecer
  // un escaneo y el motivo cambiara al equivocado. El minimo ya existia en `pareceTexto`; solo se
  // aplicaba demasiado tarde.
  const r = await leeCapaCero(await pdfCon('BT (abc) Tj ET'))
  assert.equal(r.hayTexto, false)
  assert.match(r.motivo ?? '', /escaneo o una imagen/, 'tres letras no son una capa de texto')
})

test('el diccionario se lee del PROPIO objeto, no del vecino', async () => {
  // Una ventana de tamano fijo hacia atras cruza la frontera del objeto y lee el filtro del de al
  // lado. Medido en un escaneo real: su bloque de metadatos, texto plano sin filtro, quedaba junto
  // a un objeto que si declaraba compresion, se intentaba inflar y fallaba — y ese fallo se
  // reportaba como "filtro no soportado" en un documento que no tenia ninguno.
  const conVecino = await pdfCon('BT (Proveedor ACME S.A. de C.V.) Tj ET', {
    extra: '7 0 obj\n<< /Length 40 /Filter /FlateDecode >>\nstream\nxxxx\nendstream\nendobj\n',
  })
  const r = await leeCapaCero(conVecino)
  assert.equal(r.hayTexto, true)
  assert.match(r.paginas.join(''), /Proveedor ACME/)
})

