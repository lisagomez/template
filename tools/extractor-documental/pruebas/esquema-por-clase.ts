import { test } from 'node:test'
import assert from 'node:assert/strict'
import { declaraEsquemas, claseDeDocumento, estructuraPorClase } from '../dist/esquema-por-clase.js'
import type { CampoConEvidencia } from '../dist/evidencia.js'
import type { ClasificacionDePagina } from '../dist/clasifica-pagina.js'

const campo = (clave: string, valor: string): CampoConEvidencia => ({ clave, valor, confianza: 0.5, procedencia: 'ocr', evidencia: 'motor', revisionHumana: true })
const pag = (clase: string): ClasificacionDePagina => ({ clase, evidencia: clase === 'sin_clasificar' ? null : clase })
const ESQUEMAS = declaraEsquemas([
  { clase: 'constancia_fiscal', claves: [{ clave: 'rfc', obligatoria: true }, { clave: 'nombre' }, { clave: 'regimen', obligatoria: true }] },
  { clase: 'curp', claves: [{ clave: 'curp', obligatoria: true }] },
  { clase: 'alta_imss', claves: [{ clave: 'nss', obligatoria: true }, { clave: 'curp' }] },
])

test('declarar dos esquemas para la misma clase, o una clave repetida, es un error de configuracion', () => {
  assert.throws(() => declaraEsquemas([{ clase: 'x', claves: [] }, { clase: 'x', claves: [] }]), /esquema repetido/)
  assert.throws(() => declaraEsquemas([{ clase: 'x', claves: [{ clave: 'a' }, { clave: 'a' }] }]), /clave repetida "a"/)
})

test('la clase del documento es la mas frecuente entre sus paginas, sin contar las no clasificadas', () => {
  assert.equal(claseDeDocumento([pag('sin_clasificar'), pag('curp'), pag('curp'), pag('alta_imss')]), 'curp')
  assert.equal(claseDeDocumento([pag('sin_clasificar')]), 'sin_clasificar')
  assert.equal(claseDeDocumento([], 'cfdi'), 'cfdi', 'un XML no tiene paginas: la clase la fija quien lo lee')
})

test('presentes por clave, faltantes solo las obligatorias, y lo no previsto se CONSERVA aparte', () => {
  const d = estructuraPorClase([campo('rfc', 'A'), campo('rfc', 'B'), campo('telefono', '555')], [pag('constancia_fiscal')], ESQUEMAS)
  assert.equal(d.sinClase, false)
  assert.deepEqual(Object.keys(d.campos), ['rfc'])
  assert.equal(d.campos.rfc.length, 2, 'dos rfc en una hoja son dos, no uno')
  assert.deepEqual(d.faltantes, ['regimen'], '`nombre` es opcional y no se declara faltante')
  assert.deepEqual(d.noPrevistos.map((c) => c.clave), ['telefono'])
})

test('un documento sin clase declarada sale como tal, con los campos crudos y sin forzar esquema', () => {
  const d = estructuraPorClase([campo('rfc', 'A')], [pag('sin_clasificar')], ESQUEMAS)
  assert.equal(d.sinClase, true)
  assert.equal(d.clase, 'sin_clasificar')
  assert.deepEqual(d.campos, {})
  assert.deepEqual(d.noPrevistos.map((c) => c.clave), ['rfc'])
  const conClasePeroSinEsquema = estructuraPorClase([campo('x', '1')], [pag('contrato')], ESQUEMAS)
  assert.equal(conClasePeroSinEsquema.sinClase, true, 'una clase sin esquema declarado tampoco se inventa')
  assert.equal(conClasePeroSinEsquema.clase, 'contrato')
})
