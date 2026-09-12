import { test } from 'node:test'
import assert from 'node:assert/strict'
import { declaraClases, clasePorTitulo, clasificaPaginas, SIN_CLASIFICAR } from '../dist/clasifica-pagina.js'

const CLASES = declaraClases([
  { clase: 'contrato', titulo: /contrato\s+individual\s+de\s+trabajo/i },
  { clase: 'alta_imss', titulo: /aviso\s+de\s+inscripci[oó]n|alta\s+imss/i },
  { clase: 'acta_nacimiento', titulo: /acta\s+de\s+nacimiento/i },
])

test('gana la primera clase que casa, en el orden declarado, y la evidencia cita el fragmento', () => {
  const r = clasePorTitulo('ACTA DE NACIMIENTO\n... contrato individual de trabajo anexo ...', CLASES)
  assert.equal(r.clase, 'contrato', 'contrato va antes en la lista aunque el acta salga primero en el texto')
  assert.equal(r.evidencia, 'contrato individual de trabajo')
})

test('sin coincidencia es sin_clasificar con evidencia null; el texto vacio tambien', () => {
  assert.deepEqual(clasePorTitulo('Carta de recomendacion', CLASES), { clase: SIN_CLASIFICAR, evidencia: null })
  assert.deepEqual(clasePorTitulo('', CLASES), { clase: SIN_CLASIFICAR, evidencia: null })
})

test('una clase repetida o la reservada se rechazan al declarar', () => {
  assert.throws(() => declaraClases([{ clase: 'x', titulo: /a/ }, { clase: 'x', titulo: /b/ }]), /repetida/)
  assert.throws(() => declaraClases([{ clase: SIN_CLASIFICAR, titulo: /a/ }]), /reservada/)
})

test('un patron con flag g no se queda atascado entre paginas', () => {
  const conG = declaraClases([{ clase: 'acta', titulo: /acta/gi }])
  const paginas = [{ indice: 0, markdown: 'ACTA uno', campos: [] }, { indice: 1, markdown: 'ACTA dos', campos: [] }]
  assert.deepEqual(clasificaPaginas(paginas, conG).map((c) => c.clase), ['acta', 'acta'])
})
