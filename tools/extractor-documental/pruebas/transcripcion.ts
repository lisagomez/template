import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cotejaContraTranscripcion, huella } from '../dist/transcripcion.js'
import type { PaginaExtraida, CampoExtraido } from '../dist/tipos.js'

const campo = (clave: string, valor: string): CampoExtraido => ({ clave, valor, confianza: 0.9, procedencia: 'ocr' })
const pagina = (markdown: string, campos: CampoExtraido[]): PaginaExtraida => ({ indice: 0, markdown, campos })

test('la huella pliega acentos, mayusculas, puntuacion y espacios; un importe se reduce a digitos', () => {
  assert.equal(huella('Acme, S.A. de C.V.'), huella('ACME SA DE CV'))
  assert.equal(huella('1,160.00'), '116000')
  assert.equal(huella('$ 1160.00'), huella('$1,160.00'))
})

test('un campo cuyo valor esta en la transcripcion coincide; uno que el motor compuso, no', () => {
  const paginas = [pagina('FACTURA A-1874\nEmisor: Acme SA de CV\nRFC AAA010101AAA\nTotal: $1,160.00', [
    campo('folio', 'A-1874'),
    campo('emisor', 'Acme, S.A. de C.V.'),
    campo('total', '1160.00'),
    campo('rfc_receptor', 'XAXX010101000'),
  ])]
  const cotejo = cotejaContraTranscripcion(paginas)
  assert.deepEqual(cotejo.coinciden.map((c) => c.clave), ['folio', 'emisor', 'total'])
  assert.deepEqual(cotejo.noCoinciden.map((c) => c.clave), ['rfc_receptor'], 'no esta en el papel: lo compuso')
  assert.equal(cotejo.sinTranscripcion, false)
})

test('sin transcripcion no hay contra que cotejar: se dice, y NADA coincide', () => {
  const cotejo = cotejaContraTranscripcion([pagina('', [campo('folio', 'A-1')])])
  assert.equal(cotejo.sinTranscripcion, true)
  assert.equal(cotejo.coinciden.length, 0)
  assert.equal(cotejo.noCoinciden.length, 1)
})

test('un valor vacio nunca coincide, aunque la cadena vacia este en todas partes', () => {
  const cotejo = cotejaContraTranscripcion([pagina('algo de texto', [campo('x', '   ')])])
  assert.equal(cotejo.coinciden.length, 0)
})

test('se coteja contra TODAS las paginas, no solo la del campo', () => {
  const paginas = [pagina('pagina uno', []), { ...pagina('Folio B-77', [campo('folio', 'B-77')]), indice: 1 }]
  assert.equal(cotejaContraTranscripcion(paginas).coinciden.length, 1)
})
