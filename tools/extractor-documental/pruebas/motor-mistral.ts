import { test } from 'node:test'
import assert from 'node:assert/strict'
import { motorMistral, planificaEnvio, traduceRespuesta, LIMITES_MISTRAL } from '../dist/motores/mistral.js'

const bytes = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0))

/** PDF de mentira con N objetos `/Type /Page`, que es como se cuentan las paginas. */
function pdfDe(paginas: number): Uint8Array {
  const objetos = Array.from({ length: paginas }, (_, i) => `${i + 2} 0 obj\n<< /Type /Page >>\nendobj\n`).join('')
  return bytes(`%PDF-1.7\n1 0 obj\n<< /Type /Pages /Count ${paginas} >>\nendobj\n${objetos}%%EOF\n`)
}

function fetchQueRegistra(porLlamada: (n: number) => unknown, estado = 200) {
  const cuerpos: unknown[] = []
  const falso = (async (_url: string | URL | Request, init?: RequestInit) => {
    cuerpos.push(JSON.parse(String(init?.body)))
    return new Response(JSON.stringify(porLlamada(cuerpos.length - 1)), {
      status: estado,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return { falso, cuerpos }
}

const ESQUEMA = { total: 'number' }

// --- El plan de envio, que es donde se decide si el troceo es correcto -------------------------

test('sin anotaciones va en una sola peticion, aunque tenga muchas paginas', () => {
  const plan = planificaEnvio(pdfDe(40), undefined, LIMITES_MISTRAL)
  assert.equal(plan.trozos.length, 1)
  assert.deepEqual(plan.trozos[0], [], 'entero: sin tope por peticion, trocear seria pagar N llamadas por una')
  assert.equal(plan.paginas, 40)
})

test('con anotaciones y mas de 8 paginas, trocea de 8 en 8', () => {
  const plan = planificaEnvio(pdfDe(20), { esquemaDeAnotacion: ESQUEMA }, LIMITES_MISTRAL)
  assert.equal(plan.trozos.length, 3)
  assert.deepEqual(plan.trozos[0], [0, 1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(plan.trozos[2], [16, 17, 18, 19], 'el ultimo trozo va corto, no relleno')
  assert.match(plan.motivo ?? '', /8 por peticion/)
})

test('con anotaciones y 8 paginas justas no trocea', () => {
  const plan = planificaEnvio(pdfDe(8), { esquemaDeAnotacion: ESQUEMA }, LIMITES_MISTRAL)
  assert.equal(plan.trozos.length, 1)
  assert.equal(plan.motivo, null)
})

test('las paginas pedidas a mano se respetan y se trocean igual', () => {
  const plan = planificaEnvio(pdfDe(50), { paginas: [3, 9, 12, 20, 21, 22, 30, 31, 40], esquemaDeAnotacion: ESQUEMA }, LIMITES_MISTRAL)
  assert.equal(plan.trozos.length, 2)
  assert.deepEqual(plan.trozos[0], [3, 9, 12, 20, 21, 22, 30, 31])
  assert.deepEqual(plan.trozos[1], [40])
})

test('un documento que pasa del tope se rechaza SIN gastar la llamada', () => {
  assert.throws(
    () => planificaEnvio(new Uint8Array(60 * 1024 * 1024), undefined, LIMITES_MISTRAL),
    /topa en 52428800/,
  )
})

test('el rechazo por tamano dice que trocear no es de este paquete', () => {
  assert.throws(() => planificaEnvio(new Uint8Array(60 * 1024 * 1024), undefined, LIMITES_MISTRAL), /divide el fichero antes/)
})

test('mas paginas que el tope de la API se rechaza antes de enviar', () => {
  assert.throws(() => planificaEnvio(pdfDe(1200), undefined, LIMITES_MISTRAL), /1200 paginas/)
})

test('si no se pueden contar las paginas, va entero en vez de adivinar', () => {
  const plan = planificaEnvio(bytes('no soy un pdf'), { esquemaDeAnotacion: ESQUEMA }, LIMITES_MISTRAL)
  assert.equal(plan.paginas, null)
  assert.deepEqual(plan.trozos, [[]])
  assert.match(plan.motivo ?? '', /no se pudo contar/)
})

// --- El remapeo de indices: el fallo silencioso que hace peligroso trocear ---------------------

test('los indices locales del trozo se remapean al global', () => {
  const paginas = traduceRespuesta(
    { pages: [{ index: 0, markdown: 'novena' }, { index: 1, markdown: 'decima' }] },
    [8, 9],
  )
  assert.deepEqual(paginas.map((p) => p.indice), [8, 9], 'sin remapeo la pagina 9 vuelve como pagina 1')
})

test('la region tambien se reubica a la pagina global', () => {
  const paginas = traduceRespuesta(
    {
      pages: [{ index: 0, markdown: 'x' }],
      document_annotation: JSON.stringify({ total: { valor: '10', confianza: 0.9, region: { pagina: 0, x: 0.1, y: 0.1, ancho: 0.2, alto: 0.1 } } }),
    },
    [16],
  )
  assert.equal(paginas[0].campos[0].region?.pagina, 16, 'la cita apuntaria al sitio equivocado')
})

test('sin trozo (documento entero) los indices se conservan', () => {
  const paginas = traduceRespuesta({ pages: [{ index: 0, markdown: 'a' }, { index: 1, markdown: 'b' }] }, [])
  assert.deepEqual(paginas.map((p) => p.indice), [0, 1])
})

test('una respuesta sin `pages` no se puede usar', () => {
  assert.throws(() => traduceRespuesta({ resultado: 'ok' }, []), /pages/)
})

test('una pagina sin markdown invalida la respuesta', () => {
  assert.throws(() => traduceRespuesta({ pages: [{ index: 0 }] }, []), /markdown/)
})

// --- La confianza que no se inventa ------------------------------------------------------------

test('un campo de anotacion SIN confianza sale con 0, no con 1', () => {
  const paginas = traduceRespuesta(
    { pages: [{ index: 0, markdown: 'x' }], document_annotation: JSON.stringify({ folio: 'A-1874' }) },
    [],
  )
  const campo = paginas[0].campos[0]
  assert.equal(campo.valor, 'A-1874')
  assert.equal(campo.confianza, 0, 'con 1 se saltaria la cola de revision entera, que es el control')
})

test('un campo de anotacion CON confianza valida la conserva', () => {
  const paginas = traduceRespuesta(
    {
      pages: [{ index: 0, markdown: 'x' }],
      document_annotation: JSON.stringify({ total: { valor: '1200', confianza: 0.88 } }),
    },
    [],
  )
  assert.equal(paginas[0].campos[0].confianza, 0.88)
})

test('una anotacion que no es JSON no rompe la extraccion, solo no aporta campos', () => {
  const paginas = traduceRespuesta({ pages: [{ index: 0, markdown: 'x' }], document_annotation: 'no soy json' }, [])
  assert.deepEqual(paginas[0].campos, [])
  assert.equal(paginas[0].markdown, 'x', 'el markdown se conserva: perderlo por una anotacion mala seria peor')
})

// --- El motor de punta a punta ------------------------------------------------------------------

test('un alias autoactualizable se rechaza igual que en el otro motor', () => {
  assert.throws(() => motorMistral({ modelo: 'mistral-ocr:latest', clave: 'k' }), /C1/)
})

test('sin clave no arranca', () => {
  assert.throws(() => motorMistral({ modelo: 'mistral-ocr-2505', clave: '  ' }), /clave/)
})

test('trocear con anotaciones produce N llamadas y recompone en orden', async () => {
  const { falso, cuerpos } = fetchQueRegistra((n) => ({
    pages: [{ index: 0, markdown: `trozo ${n}` }],
  }))
  const motor = motorMistral({ modelo: 'mistral-ocr-2505', clave: 'k', fetch: falso })
  const paginas = await motor.extrae(pdfDe(20), { esquemaDeAnotacion: ESQUEMA })

  assert.equal(cuerpos.length, 3, 'tres trozos, tres llamadas a la API real')
  const primero = cuerpos[0] as { pages: number[]; model: string; document_annotation_format: unknown }
  assert.deepEqual(primero.pages, [0, 1, 2, 3, 4, 5, 6, 7])
  assert.equal(primero.model, 'mistral-ocr-2505')
  assert.deepEqual(primero.document_annotation_format, ESQUEMA)
  assert.deepEqual(paginas.map((p) => p.indice), [0, 8, 16], 'ordenadas por indice global')
})

test('sin anotaciones es UNA llamada y sin lista de paginas', async () => {
  const { falso, cuerpos } = fetchQueRegistra(() => ({ pages: [{ index: 0, markdown: 'todo' }] }))
  await motorMistral({ modelo: 'mistral-ocr-2505', clave: 'k', fetch: falso }).extrae(pdfDe(30))
  assert.equal(cuerpos.length, 1)
  assert.equal((cuerpos[0] as { pages?: number[] }).pages, undefined)
})

test('un error de la API no filtra la clave ni el documento', async () => {
  const { falso } = fetchQueRegistra(() => ({ error: 'nope', echo: 'contenido de la factura' }), 429)
  const motor = motorMistral({ modelo: 'mistral-ocr-2505', clave: 'k-secretisima', fetch: falso })
  await assert.rejects(() => motor.extrae(pdfDe(1)), (e: Error) => {
    assert.match(e.message, /429/)
    assert.doesNotMatch(e.message, /k-secretisima/)
    assert.doesNotMatch(e.message, /contenido de la factura/)
    return true
  })
})

test('los limites publicados quedan declarados', () => {
  const motor = motorMistral({ modelo: 'mistral-ocr-2505', clave: 'k' })
  assert.equal(motor.limites.bytesMaximos, 50 * 1024 * 1024)
  assert.equal(motor.limites.paginasMaximas, 1000)
  assert.equal(motor.limites.paginasPorAnotacion, 8)
})
