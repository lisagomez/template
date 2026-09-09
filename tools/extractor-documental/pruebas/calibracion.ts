import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cer,
  wer,
  distanciaDeEdicion,
  aciertaCampo,
  precisionDeCampos,
  correlacionConfianzaError,
  curvaDeUmbral,
  curvaDeSimilitud,
} from '../dist/calibracion.js'
import type { MuestraDeCampo } from '../dist/calibracion.js'

const campo = (obtenido: string, referencia: string, confianza: number): MuestraDeCampo => ({
  clave: 'total',
  obtenido,
  referencia,
  confianza,
})

// --- CER y WER ------------------------------------------------------------------------------------

test('un texto identico tiene error cero', () => {
  assert.equal(cer('ACME S.A.', 'ACME S.A.'), 0)
  assert.equal(wer('factura de marzo', 'factura de marzo'), 0)
})

test('CER cuenta caracteres, WER cuenta palabras', () => {
  // Una letra cambiada en una palabra: CER pequeño, WER de una palabra entera.
  assert.equal(cer('gato', 'gata'), 0.25)
  assert.equal(wer('el gato negro', 'el gata negro'), 1 / 3)
})

test('referencia vacia devuelve null, NO cero', () => {
  // Dividir por cero daria Infinity o NaN, y cualquiera de los dos contamina un promedio sin que
  // nadie lo note. Una pagina sin texto de referencia no tiene CER; no es que tenga CER cero.
  assert.equal(cer('', 'algo'), null)
  assert.equal(wer('   ', 'algo'), null)
})

test('la distancia de edicion es simetrica y cuenta inserciones', () => {
  assert.equal(distanciaDeEdicion([...'abc'], [...'abcd']), 1)
  assert.equal(distanciaDeEdicion([...'abcd'], [...'abc']), 1)
  assert.equal(distanciaDeEdicion([], [...'abc']), 3)
})

// --- Campos: lo que consume el negocio --------------------------------------------------------------

test('un campo acierta ignorando espacios y mayusculas', () => {
  assert.equal(aciertaCampo(campo('ACME  S.A.', 'acme s.a.', 0.9)), true)
})

test('EL CASO QUE §8 SEPARA: buen CER y campo mal', () => {
  // "1.234,56" -> "1.234,66": dos caracteres de ocho, CER excelente... e importe equivocado.
  const muestra = campo('1.234,66', '1.234,56', 0.97)
  assert.ok((cer(muestra.referencia, muestra.obtenido) ?? 1) < 0.2, 'el CER dice que esta casi perfecto')
  assert.equal(aciertaCampo(muestra), false, 'y el campo esta MAL: la calidad bruta no es la utilidad')
})

test('sin muestras no hay precision que dar', () => {
  assert.equal(precisionDeCampos([]), null)
})

test('la precision es la fraccion de campos correctos', () => {
  const muestras = [campo('a', 'a', 0.9), campo('b', 'x', 0.9), campo('c', 'c', 0.9), campo('d', 'd', 0.9)]
  assert.equal(precisionDeCampos(muestras), 0.75)
})

// --- La medicion mas valiosa de las cinco (§8) --------------------------------------------------------

test('cuando la confianza predice el acierto, r es alta y lo dice', () => {
  const muestras = [
    campo('a', 'a', 0.95), campo('b', 'b', 0.92), campo('c', 'c', 0.9),
    campo('x', 'z', 0.3), campo('y', 'w', 0.25), campo('v', 'u', 0.2),
  ]
  const { r, lectura } = correlacionConfianzaError(muestras)
  assert.ok((r ?? 0) > 0.5)
  assert.match(lectura, /un umbral sirve/)
})

test('cuando NO predice nada, lo dice sin rodeos: cambiar de motor', () => {
  // Aciertos y fallos mezclados en el mismo rango de confianza. Es el resultado que mas importa
  // poder ver: significa que buscar el corte perfecto es perder el tiempo.
  const muestras = [
    campo('a', 'a', 0.9), campo('x', 'z', 0.9),
    campo('b', 'b', 0.3), campo('y', 'w', 0.3),
  ]
  const { r, lectura } = correlacionConfianzaError(muestras)
  assert.ok(Math.abs(r ?? 1) < 0.2)
  assert.match(lectura, /Cambia de motor/)
})

test('sin fallos en el corpus NO se inventa una correlacion', () => {
  const { r, lectura } = correlacionConfianzaError([campo('a', 'a', 0.9), campo('b', 'b', 0.8)])
  assert.equal(r, null)
  assert.match(lectura, /no tiene de las dos clases/)
})

test('si todas las confianzas son iguales, se dice que el problema no es donde cortar', () => {
  const { r, lectura } = correlacionConfianzaError([campo('a', 'a', 0.8), campo('x', 'z', 0.8)])
  assert.equal(r, null)
  assert.match(lectura, /no es donde cortar/)
})

test('se reportan las medias de las dos clases, para poder mirarlas a mano', () => {
  const c = correlacionConfianzaError([campo('a', 'a', 0.9), campo('x', 'z', 0.4)])
  assert.equal(c.confianzaMediaAciertos, 0.9)
  assert.equal(c.confianzaMediaFallos, 0.4)
  assert.equal(c.aciertos, 1)
  assert.equal(c.fallos, 1)
})

// --- La curva: la tabla del intercambio, SIN recomendacion ----------------------------------------------

test('la curva NO devuelve ningun umbral recomendado', async () => {
  // Es el punto entero del modulo: elegir exige saber cuanto cuesta un error frente a una hora de
  // revision, y eso no esta en los datos. Un "sugerido" fingiria que si.
  const modulo = (await import('../dist/calibracion.js')) as Record<string, unknown>
  const sugerencias = Object.keys(modulo).filter((n) => /sugerid|recomend|optim|mejorUmbral/i.test(n))
  assert.deepEqual(sugerencias, [], `hay algo que recomienda un umbral: ${sugerencias.join(', ')}`)
  const punto = curvaDeUmbral([campo('a', 'a', 0.9)])[0]
  assert.deepEqual(
    Object.keys(punto).filter((k) => /sugerid|recomend|optim/i.test(k)),
    [],
  )
})

test('la curva enseña las dos columnas del intercambio', () => {
  const muestras = [
    campo('a', 'a', 0.95),  // acierto, confianza alta
    campo('x', 'z', 0.90),  // FALLO con confianza alta: el que se cuela
    campo('b', 'b', 0.40),  // acierto con confianza baja: revision innecesaria
    campo('y', 'w', 0.10),  // fallo con confianza baja: bien cazado
  ]
  const curva = curvaDeUmbral(muestras, 10)
  const en0 = curva[0]
  assert.equal(en0.aceptados, 4, 'umbral 0: se acepta todo')
  assert.equal(en0.erroresColados, 2, 'y se cuelan los dos fallos')
  assert.equal(en0.aCola, 0)

  const en1 = curva[curva.length - 1]
  assert.equal(en1.umbral, 1)
  assert.equal(en1.aCola, 4, 'umbral 1: todo a revision')
  assert.equal(en1.revisionInnecesaria, 2, 'incluidos los dos que estaban bien')
})

test('subir el umbral cuela menos errores y gasta mas revision: monotono en las dos', () => {
  const muestras = [
    campo('a', 'a', 0.9), campo('x', 'z', 0.7), campo('b', 'b', 0.5), campo('y', 'w', 0.3),
  ]
  const curva = curvaDeUmbral(muestras, 10)
  for (let i = 1; i < curva.length; i++) {
    assert.ok(curva[i].erroresColados <= curva[i - 1].erroresColados, 'los errores colados no pueden subir')
    assert.ok(curva[i].aCola >= curva[i - 1].aCola, 'la cola no puede bajar')
  }
})

test('pasos invalidos se rechazan', () => {
  assert.throws(() => curvaDeUmbral([], 0), RangeError)
})

// --- TAR-25: la misma tabla para la similitud -------------------------------------------------------------

test('la curva de similitud separa los dos errores, que NO son simetricos', () => {
  // Falso positivo: fusiona dos entidades distintas, y deshacerlo despues es arqueologia.
  // Falso negativo: crea un duplicado, que es feo pero se limpia.
  const muestras = [
    { valor: 'ACME SA', candidato: 'ACME S.A. de C.V.', similitud: 0.85, esLaMisma: true },
    { valor: 'ACME Servicios', candidato: 'ACME S.A. de C.V.', similitud: 0.7, esLaMisma: false },
  ]
  const curva = curvaDeSimilitud(muestras, 10)
  const en06 = curva.find((p) => Math.abs(p.umbral - 0.6) < 1e-9)
  assert.equal(en06?.falsosPositivos, 1, 'a 0.6 se fusiona ACME Servicios con ACME S.A.')
  const en08 = curva.find((p) => Math.abs(p.umbral - 0.8) < 1e-9)
  assert.equal(en08?.falsosPositivos, 0)
  assert.equal(en08?.falsosNegativos, 0, 'a 0.8 los dos casos caen bien')
})

test('la curva de similitud tampoco recomienda nada', () => {
  const punto = curvaDeSimilitud([{ valor: 'a', candidato: 'a', similitud: 1, esLaMisma: true }])[0]
  assert.deepEqual(Object.keys(punto).filter((k) => /sugerid|recomend|optim/i.test(k)), [])
})
