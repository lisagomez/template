import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectaLectura, dependeDeLaHeuristica, avisoDeConfiguracion } from '../dist/react/escaner.js'
import type { Pulsacion } from '../dist/react/escaner.js'
import { lectorDeCamara } from '../dist/react/camara.js'
import type { FabricaDeDetector } from '../dist/react/camara.js'

/** Teclea una cadena a `ms` de separacion entre teclas. */
const teclea = (texto: string, ms = 10, desde = 1000): Pulsacion[] =>
  [...texto].map((tecla, i) => ({ tecla, instante: desde + i * ms }))

const conEnter = (pulsaciones: Pulsacion[]): Pulsacion[] => [
  ...pulsaciones,
  { tecla: 'Enter', instante: (pulsaciones[pulsaciones.length - 1]?.instante ?? 0) + 10 },
]

// --- TAR-32 · Via 1: determinista ------------------------------------------------------------------

const CONFIGURADO = { prefijo: '~', sufijo: 'Enter' }

test('con prefijo y sufijo la deteccion es determinista y fiable', () => {
  const lectura = detectaLectura(conEnter(teclea('~7501234567890')), CONFIGURADO)
  assert.equal(lectura?.carga, '7501234567890')
  assert.equal(lectura?.via, 'prefijo_sufijo')
  assert.equal(lectura?.fiable, true)
})

test('lo que una persona teclea NO se detecta, aunque teclee rapidisimo', () => {
  // Sin el prefijo del aparato no es una lectura, y da igual a que velocidad venga.
  assert.equal(detectaLectura(conEnter(teclea('7501234567890', 1)), CONFIGURADO), null)
})

test('estando configurado NO se cae al respaldo por tiempos', () => {
  // Reintroducir la heuristica aqui devolveria justo los falsos positivos que la via 1 elimina.
  const config = { ...CONFIGURADO, rafaga: { msEntreTeclas: 50, minimoCaracteres: 4 } }
  assert.equal(detectaLectura(conEnter(teclea('7501234567890', 1)), config), null)
})

test('un sufijo de un caracter tambien vale', () => {
  const lectura = detectaLectura(teclea('~ABC#'), { prefijo: '~', sufijo: '#' })
  assert.equal(lectura?.carga, 'ABC')
})

test('solo prefijo, sin sufijo, tambien es determinista', () => {
  const lectura = detectaLectura(teclea('~ABC'), { prefijo: '~', sufijo: '' })
  assert.equal(lectura?.carga, 'ABC')
  assert.equal(lectura?.fiable, true)
})

test('el prefijo sin carga detras no es una lectura', () => {
  assert.equal(detectaLectura(conEnter(teclea('~')), CONFIGURADO), null)
})

// --- TAR-32 · Via 2: respaldo, y solo si se declara ---------------------------------------------------

test('sin configurar Y sin parametros de rafaga, NO se detecta nada', () => {
  // Es lo correcto sin medir: TAR-34 esta bloqueada, y un default inventado aqui adivinaria.
  assert.equal(detectaLectura(teclea('7501234567890', 1), { prefijo: '', sufijo: '' }), null)
})

test('con parametros declarados, la rafaga se detecta pero NO se marca fiable', () => {
  const config = { prefijo: '', sufijo: '', rafaga: { msEntreTeclas: 30, minimoCaracteres: 8 } }
  const lectura = detectaLectura(teclea('7501234567890', 5), config)
  assert.equal(lectura?.via, 'rafaga')
  assert.equal(lectura?.fiable, false, 'la heuristica falla en las dos direcciones: quien la use tiene que saberlo')
})

test('un tecleo humano lento no pasa por rafaga', () => {
  const config = { prefijo: '', sufijo: '', rafaga: { msEntreTeclas: 30, minimoCaracteres: 8 } }
  assert.equal(detectaLectura(teclea('7501234567890', 120), config), null)
})

// --- El aviso que empuja a configurar el aparato -------------------------------------------------------

test('se sabe cuando la configuracion depende de adivinar', () => {
  assert.equal(dependeDeLaHeuristica({ prefijo: '', sufijo: '' }), true)
  assert.equal(dependeDeLaHeuristica(CONFIGURADO), false)
})

test('el aviso distingue "no detectara nada" de "esta adivinando"', () => {
  assert.match(avisoDeConfiguracion({ prefijo: '', sufijo: '' }) ?? '', /no se detectara ninguna lectura/)
  assert.match(
    avisoDeConfiguracion({ prefijo: '', sufijo: '', rafaga: { msEntreTeclas: 30, minimoCaracteres: 8 } }) ?? '',
    /adivinando/,
  )
  assert.equal(avisoDeConfiguracion(CONFIGURADO), null, 'configurado: no hay nada que avisar')
})

// --- TAR-31 · La camara, y la garantia del wasm ---------------------------------------------------------

function fabricaFalsa(opciones: { hayNativo: boolean }) {
  const contador = { nativo: 0, respaldo: 0 }
  const fabrica: FabricaDeDetector = {
    nativo() {
      contador.nativo++
      return opciones.hayNativo ? { async detect() { return [{ rawValue: 'NATIVO' }] } } : undefined
    },
    async respaldo() {
      contador.respaldo++
      return { async detect() { return [{ rawValue: 'WASM' }] } }
    },
  }
  return { fabrica, contador }
}

test('LA GARANTIA DE TAR-31: construir el lector NO carga el wasm', () => {
  // Un import estatico lo meteria en el bundle de todo el que importe el modulo, incluida la
  // persona que solo sube PDF y no abrira una camara en su vida. Y no se notaria al probar.
  const { fabrica, contador } = fabricaFalsa({ hayNativo: false })
  const lector = lectorDeCamara({ fabrica })
  assert.equal(contador.respaldo, 0, 'se cargo el wasm sin que nadie abriera la camara')
  assert.equal(contador.nativo, 0, 'ni siquiera se consulta el nativo hasta la primera lectura')
  assert.equal(lector.motorUsado(), 'ninguno')
})

test('donde hay BarcodeDetector nativo, el wasm NO se carga nunca', async () => {
  const { fabrica, contador } = fabricaFalsa({ hayNativo: true })
  const lector = lectorDeCamara({ fabrica })
  assert.deepEqual(await lector.lee(new Uint8Array()), ['NATIVO'])
  assert.equal(contador.respaldo, 0)
  assert.equal(lector.motorUsado(), 'nativo')
})

test('donde no lo hay (Safari, Firefox) se cae al wasm', async () => {
  const { fabrica, contador } = fabricaFalsa({ hayNativo: false })
  const lector = lectorDeCamara({ fabrica })
  assert.deepEqual(await lector.lee(new Uint8Array()), ['WASM'])
  assert.equal(contador.respaldo, 1)
  assert.equal(lector.motorUsado(), 'wasm')
})

test('el detector se resuelve UNA vez, no en cada lectura', async () => {
  const { fabrica, contador } = fabricaFalsa({ hayNativo: false })
  const lector = lectorDeCamara({ fabrica })
  await lector.lee(new Uint8Array())
  await lector.lee(new Uint8Array())
  assert.equal(contador.respaldo, 1, 'cargar el wasm en cada lectura seria peor que cargarlo al importar')
})

test('sin nativo y sin respaldo se dice, en vez de devolver una lista vacia', async () => {
  const lector = lectorDeCamara({ fabrica: { nativo: () => undefined } })
  await assert.rejects(() => lector.lee(new Uint8Array()), /no trae BarcodeDetector/)
})

test('las cargas vacias se descartan; las crudas se devuelven sin interpretar', async () => {
  const fabrica: FabricaDeDetector = {
    nativo: () => ({ async detect() { return [{ rawValue: '01075012345678903' }, { rawValue: '' }] } }),
  }
  const leidas = await lectorDeCamara({ fabrica }).lee(new Uint8Array())
  assert.deepEqual(leidas, ['01075012345678903'], 'interpretarlas es de analizaCarga, no de aqui')
})

test('los formatos declarados son los que se piden', () => {
  const lector = lectorDeCamara({ formatos: ['qr_code'], fabrica: { nativo: () => undefined } })
  assert.deepEqual([...lector.formatos], ['qr_code'])
})
