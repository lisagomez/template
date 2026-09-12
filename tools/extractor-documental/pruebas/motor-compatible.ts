import { test } from 'node:test'
import assert from 'node:assert/strict'
import { motorCompatible, validaPaginas, tipoMimeDe, sinTranscripcionRepetida } from '../dist/motores/openai-compat.js'
import { INSTRUCCION, traduceElCorte } from '../dist/motores/comun.js'

const bytes = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0))
const PDF = bytes('%PDF-1.7 documento de prueba')

/** `fetch` de mentira: guarda lo que se le pidio y devuelve lo que se le diga. */
function fetchFalso(cuerpo: unknown, estado = 200) {
  const registro: { url?: string; init?: RequestInit; veces: number } = { veces: 0 }
  const falso = (async (url: string | URL | Request, init?: RequestInit) => {
    registro.url = String(url)
    registro.init = init
    registro.veces++
    return new Response(JSON.stringify(cuerpo), {
      status: estado,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return { falso, registro }
}

const respuestaCon = (contenido: unknown) => ({
  choices: [{ message: { content: JSON.stringify(contenido) } }],
})

const UNA_PAGINA = {
  paginas: [
    {
      indice: 0,
      markdown: '# Factura A-1874',
      campos: [
        { clave: 'total', valor: '1200.00', confianza: 0.94, region: { pagina: 0, x: 0.1, y: 0.2, ancho: 0.3, alto: 0.05 } },
      ],
    },
  ],
}

// --- C1: el modelo va pineado -----------------------------------------------------------------

test('un alias autoactualizable se rechaza al construir, no al usar', () => {
  for (const alias of ['paddleocr-vl:latest', 'glm-ocr-latest', 'modelo/stable', 'algo:current', 'x-head']) {
    assert.throws(
      () => motorCompatible({ base: 'http://x/v1', modelo: alias }),
      /C1/,
      `"${alias}" deberia rechazarse: cambia el comportamiento sin diff`,
    )
  }
})

test('un modelo pineado se acepta y se expone tal cual', () => {
  const motor = motorCompatible({ base: 'http://x/v1', modelo: 'paddleocr-vl-0.9.1' })
  assert.equal(motor.modelo, 'paddleocr-vl-0.9.1')
})

test('un modelo vacio no cuela', () => {
  assert.throws(() => motorCompatible({ base: 'http://x/v1', modelo: '  ' }), /obligatorio/)
})

// --- La llamada real --------------------------------------------------------------------------

test('llama al endpoint de completions con el modelo pineado dentro', async () => {
  const { falso, registro } = fetchFalso(respuestaCon(UNA_PAGINA))
  const motor = motorCompatible({ base: 'http://servidor:8000/v1/', modelo: 'glm-ocr-1.2.0', fetch: falso })
  await motor.extrae(PDF)
  assert.equal(registro.veces, 1, 'el adaptador tiene que llamar a la API real, jamas inventarse la respuesta')
  assert.equal(registro.url, 'http://servidor:8000/v1/chat/completions', 'la barra final no debe duplicarse')
  const enviado = JSON.parse(String(registro.init?.body)) as { model: string; messages: unknown[] }
  assert.equal(enviado.model, 'glm-ocr-1.2.0')
})

test('el documento viaja como data URI con su tipo real, deducido de los bytes', async () => {
  const { falso, registro } = fetchFalso(respuestaCon(UNA_PAGINA))
  const motor = motorCompatible({ base: 'http://x/v1', modelo: 'm-1.0', fetch: falso })
  await motor.extrae(PDF)
  assert.match(String(registro.init?.body), /data:application\/pdf;base64,/)
})

test('sin clave no se manda cabecera de autorizacion', async () => {
  const { falso, registro } = fetchFalso(respuestaCon(UNA_PAGINA))
  await motorCompatible({ base: 'http://x/v1', modelo: 'm-1.0', fetch: falso }).extrae(PDF)
  const cabeceras = registro.init?.headers as Record<string, string>
  assert.equal(cabeceras.authorization, undefined)
})

test('con clave se manda como Bearer', async () => {
  const { falso, registro } = fetchFalso(respuestaCon(UNA_PAGINA))
  await motorCompatible({ base: 'http://x/v1', modelo: 'm-1.0', clave: 'k-secreta', fetch: falso }).extrae(PDF)
  const cabeceras = registro.init?.headers as Record<string, string>
  assert.equal(cabeceras.authorization, 'Bearer k-secreta')
})

test('un error del servidor NO filtra la clave ni el cuerpo', async () => {
  const { falso } = fetchFalso({ error: 'unauthorized', echo: 'contenido del documento' }, 401)
  const motor = motorCompatible({ base: 'http://x/v1', modelo: 'm-1.0', clave: 'k-secretisima', fetch: falso })
  await assert.rejects(
    () => motor.extrae(PDF),
    (e: Error) => {
      assert.match(e.message, /401/, 'el codigo si se dice: sin el no se puede depurar')
      assert.doesNotMatch(e.message, /k-secretisima/, 'la clave no aparece ni enmascarada')
      assert.doesNotMatch(e.message, /contenido del documento/, 'el cuerpo lleva el documento dentro')
      return true
    },
  )
})

test('un documento que pasa del limite se corta antes de gastar la llamada', async () => {
  const { falso, registro } = fetchFalso(respuestaCon(UNA_PAGINA))
  const motor = motorCompatible({ base: 'http://x/v1', modelo: 'm-1.0', fetch: falso, limites: { bytesMaximos: 4 } })
  await assert.rejects(() => motor.extrae(PDF), /topa en 4/)
  assert.equal(registro.veces, 0, 'no se llama al motor para que lo rechace el: eso se paga igual')
})

// --- La salida del modelo no se confia ----------------------------------------------------------

test('la respuesta valida se convierte en paginas', () => {
  const paginas = validaPaginas(UNA_PAGINA)
  assert.equal(paginas.length, 1)
  assert.equal(paginas[0].campos[0].procedencia, 'ocr', 'lo que sale del motor es procedencia ocr, siempre')
  assert.equal(paginas[0].campos[0].confianza, 0.94)
})

test('una confianza en texto descarta el campo, no lo cuela', () => {
  const paginas = validaPaginas({
    paginas: [{ indice: 0, markdown: 'x', campos: [{ clave: 'a', valor: 'b', confianza: 'alta' }] }],
  })
  assert.deepEqual(paginas[0].campos, [], 'un "alta" no se compara contra un umbral: rompe el control en silencio')
})

test('una confianza en escala 0-100 tambien se descarta', () => {
  const paginas = validaPaginas({
    paginas: [{ indice: 0, markdown: 'x', campos: [{ clave: 'a', valor: 'b', confianza: 95 }] }],
  })
  assert.deepEqual(paginas[0].campos, [])
})

test('una region fuera de rango se descarta entera, no se recorta', () => {
  const paginas = validaPaginas({
    paginas: [
      { indice: 0, markdown: 'x', campos: [{ clave: 'a', valor: 'b', confianza: 0.9, region: { pagina: 0, x: 5, y: 0, ancho: 0.1, alto: 0.1 } }] },
    ],
  })
  assert.equal(paginas[0].campos.length, 1, 'el campo sobrevive')
  assert.equal(paginas[0].campos[0].region, undefined, 'recortarla citaria un sitio que no es de donde salio')
})

test('los campos malos se descartan uno a uno y los buenos sobreviven', () => {
  const paginas = validaPaginas({
    paginas: [
      {
        indice: 0,
        markdown: 'x',
        campos: [
          { clave: 'bueno', valor: 'v', confianza: 0.8 },
          { clave: '', valor: 'v', confianza: 0.8 },
          { valor: 'sin clave', confianza: 0.8 },
          { clave: 'otro', valor: 'v', confianza: 0.5 },
        ],
      },
    ],
  })
  assert.deepEqual(paginas[0].campos.map((c) => c.clave), ['bueno', 'otro'])
})

test('una pagina sin markdown invalida la respuesta entera', () => {
  assert.throws(() => validaPaginas({ paginas: [{ indice: 0, campos: [] }] }), /markdown/)
})

test('una respuesta sin `paginas` no se puede usar', () => {
  assert.throws(() => validaPaginas({ resultado: 'ok' }), /no devolvio/)
})

test('el indice que falta se deduce de la posicion, no se inventa otro', () => {
  const paginas = validaPaginas({ paginas: [{ markdown: 'a' }, { markdown: 'b' }] })
  assert.deepEqual(paginas.map((p) => p.indice), [0, 1])
})

test('un contenido que no es JSON se rechaza sin volcar el documento', async () => {
  const { falso } = fetchFalso({ choices: [{ message: { content: 'lo siento, no puedo' } }] })
  const motor = motorCompatible({ base: 'http://x/v1', modelo: 'm-1.0', fetch: falso })
  await assert.rejects(() => motor.extrae(PDF), (e: Error) => {
    assert.match(e.message, /no es JSON/)
    assert.doesNotMatch(e.message, /lo siento/)
    return true
  })
})

test('un servidor que no habla el dialecto se detecta', async () => {
  const { falso } = fetchFalso({ resultado: 'otro formato' })
  const motor = motorCompatible({ base: 'http://x/v1', modelo: 'm-1.0', fetch: falso })
  await assert.rejects(() => motor.extrae(PDF), /choices/)
})

// --- Deteccion de tipo ---------------------------------------------------------------------------

test('el tipo sale de los bytes y no del nombre', () => {
  assert.equal(tipoMimeDe(bytes('%PDF-1.7')), 'application/pdf')
  assert.equal(tipoMimeDe(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])), 'image/png')
  assert.equal(tipoMimeDe(Uint8Array.from([0xff, 0xd8, 0xff])), 'image/jpeg')
  assert.equal(tipoMimeDe(bytes('cualquier cosa')), 'application/octet-stream')
})

// --- Lo que enseño encender un motor de verdad ---------------------------------------------------

test('la instruccion NO enseña huecos con puntos suspensivos', () => {
  // Costo un fallo real: un modelo pequeño devolvio un campo con clave `...`, valor `...` y
  // confianza 0 — copio la plantilla en vez de rellenarla. Uno grande entiende que son huecos;
  // uno pequeño los toma por la respuesta, y el resultado no parece un fallo sino un documento
  // del que no se pudo sacar nada.
  assert.doesNotMatch(INSTRUCCION, /"\.\.\."/, 'un hueco dibujado con puntos se copia literal')
  assert.match(INSTRUCCION, /NO copies/i, 'y se dice expresamente que no se copien')
  assert.match(INSTRUCCION, /<[^>]+>/, 'los huecos van descritos entre <>')
})

test('el corte de Node se traduce a algo accionable', () => {
  // `AbortSignal.timeout(...)` no gobierna cuanto espera Node por la primera respuesta: undici
  // corta a los 5 minutos. Muerde justo en el caso que la herramienta existe para permitir — un
  // motor autohospedado sin GPU, donde una pagina tarda 337 segundos y sube con el documento.
  const deUndici = Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_HEADERS_TIMEOUT' } })
  const traducido = traduceElCorte(deUndici, 1_800_000)
  assert.match(traducido.message, /5 minutos/)
  assert.match(traducido.message, /1800 s/, 'dice cuanto se habia pedido, para que se vea la contradiccion')
  assert.match(traducido.message, /dispatcher|streaming/, 'y por donde sale')
  assert.doesNotMatch(traducido.message, /UND_ERR/, 'el codigo de undici no le dice nada a nadie')
})

test('cualquier otro error pasa tal cual, sin disfrazarse de lo que no es', () => {
  const otro = new Error('la red se cayo')
  assert.equal(traduceElCorte(otro, 1000), otro)
})

test('en modo transcripcion pide solo texto, no exige JSON y devuelve una pagina con campos vacios', async () => {
  let cuerpoEnviado: Record<string, unknown> = {}
  const fetchFalso = (async (_url: string | URL | Request, init?: RequestInit) => {
    cuerpoEnviado = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(JSON.stringify({ choices: [{ message: { content: 'FACTURA\nFolio: F-1' } }] }), { status: 200 })
  }) as typeof fetch
  const motor = motorCompatible({ base: 'http://motor.local/v1', modelo: 'glm-ocr:q8_0', fetch: fetchFalso, modo: 'transcripcion' })
  const paginas = await motor.extrae(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))
  assert.deepEqual(paginas, [{ indice: 0, markdown: 'FACTURA\nFolio: F-1', campos: [] }])
  assert.equal(cuerpoEnviado.response_format, undefined, 'a un motor de OCR puro no se le exige JSON')
  const mensajes = cuerpoEnviado.messages as { content: { type: string; text?: string }[] }[]
  assert.match(mensajes[0].content[0].text ?? '', /^Transcribe todo el texto/)
})

test('una transcripcion devuelta dos veces (la segunda en una valla markdown) se queda en una; una que no se repite, intacta', () => {
  const texto = 'MINUTA\nFecha: 2026-04-25\nAsistentes: 3'
  assert.equal(sinTranscripcionRepetida(`${texto}\n\`\`\`markdown\n\n${texto}\n\`\`\``), texto)
  assert.equal(sinTranscripcionRepetida(texto), texto)
  assert.equal(sinTranscripcionRepetida('ab ac'), 'ab ac', 'solo se quita una copia EXACTA por mitades')
  assert.equal(sinTranscripcionRepetida('abab'), 'ab')
  assert.equal(sinTranscripcionRepetida('quince dias\n\nquince días'), 'quince dias', 'un acento de diferencia sigue siendo repeticion; queda la primera')
})

// --- Uso de tokens: lo que el SERVIDOR declara, nunca una estimacion propia --------------------

test('cuando el servidor declara `usage`, se reporta tal cual por el callback, sin cambiar el valor de retorno', async () => {
  const { falso } = fetchFalso({
    ...respuestaCon(UNA_PAGINA),
    usage: { prompt_tokens: 1200, completion_tokens: 340, total_tokens: 1540 },
  })
  const motor = motorCompatible({ base: 'http://x/v1', modelo: 'glm-ocr:q8_0', fetch: falso })
  let capturado: unknown = 'no-se-llamo'
  const paginas = await motor.extrae(PDF, { alConsumirTokens: (uso) => { capturado = uso } })
  assert.deepEqual(capturado, { tokensDeEntrada: 1200, tokensDeSalida: 340, tokensTotal: 1540 })
  assert.equal(paginas.length, 1, 'el uso viaja por el callback, no dentro de lo que ya devolvia extrae()')
})

test('si el servidor no declara `total_tokens`, se calcula sumando entrada y salida', async () => {
  const { falso } = fetchFalso({ ...respuestaCon(UNA_PAGINA), usage: { prompt_tokens: 500, completion_tokens: 100 } })
  const motor = motorCompatible({ base: 'http://x/v1', modelo: 'glm-ocr:q8_0', fetch: falso })
  let capturado: unknown
  await motor.extrae(PDF, { alConsumirTokens: (uso) => { capturado = uso } })
  assert.deepEqual(capturado, { tokensDeEntrada: 500, tokensDeSalida: 100, tokensTotal: 600 })
})

test('sin `usage` en la respuesta, el callback recibe null — nunca ceros inventados', async () => {
  const { falso } = fetchFalso(respuestaCon(UNA_PAGINA))
  const motor = motorCompatible({ base: 'http://x/v1', modelo: 'glm-ocr:q8_0', fetch: falso })
  let capturado: unknown = 'no-se-llamo'
  await motor.extrae(PDF, { alConsumirTokens: (uso) => { capturado = uso } })
  assert.equal(capturado, null)
})

test('un `usage` a medias (falta completion_tokens) se trata como ausente entero, no como parcial', async () => {
  const { falso } = fetchFalso({ ...respuestaCon(UNA_PAGINA), usage: { prompt_tokens: 500 } })
  const motor = motorCompatible({ base: 'http://x/v1', modelo: 'glm-ocr:q8_0', fetch: falso })
  let capturado: unknown = 'no-se-llamo'
  await motor.extrae(PDF, { alConsumirTokens: (uso) => { capturado = uso } })
  assert.equal(capturado, null, 'un total que mezcla lo real con lo desconocido es peor que declarar que no se sabe')
})

test('sin `alConsumirTokens`, no truena: el callback es opcional y nadie esta obligado a leerlo', async () => {
  const { falso } = fetchFalso({ ...respuestaCon(UNA_PAGINA), usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })
  const motor = motorCompatible({ base: 'http://x/v1', modelo: 'glm-ocr:q8_0', fetch: falso })
  const paginas = await motor.extrae(PDF)
  assert.equal(paginas.length, 1)
})

test('en modo transcripcion tambien se reporta el uso: el callback no depende del modo', async () => {
  const fetchFalso2 = (async () => new Response(JSON.stringify({
    choices: [{ message: { content: 'FACTURA' } }],
    usage: { prompt_tokens: 900, completion_tokens: 40, total_tokens: 940 },
  }), { status: 200 })) as typeof fetch
  const motor = motorCompatible({ base: 'http://x/v1', modelo: 'glm-ocr:q8_0', fetch: fetchFalso2, modo: 'transcripcion' })
  let capturado: unknown
  await motor.extrae(PDF, { alConsumirTokens: (uso) => { capturado = uso } })
  assert.deepEqual(capturado, { tokensDeEntrada: 900, tokensDeSalida: 40, tokensTotal: 940 })
})

test('un `usage` con todo ceros es no declarar: el callback recibe null (medido con Ollama y GLM-OCR)', async () => {
  const { falso } = fetchFalso({ ...respuestaCon(UNA_PAGINA), usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } })
  const motor = motorCompatible({ base: 'http://x/v1', modelo: 'glm-ocr:q8_0', fetch: falso })
  let capturado: unknown = 'no-se-llamo'
  await motor.extrae(PDF, { alConsumirTokens: (uso) => { capturado = uso } })
  assert.equal(capturado, null)
})
