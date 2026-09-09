import { test } from 'node:test'
import assert from 'node:assert/strict'
import { almacenDeCola, validaEntrada } from '../dist/almacenes/indexeddb.js'
import type { BaseIdb, PeticionIdb } from '../dist/almacenes/indexeddb.js'
import type { EntradaEnCola } from '../dist/cola.js'

/** IndexedDB de mentira: misma forma, un Map dentro. Permite probar sin navegador. */
function baseFalsa(inicial: Record<string, unknown> = {}) {
  const datos = new Map(Object.entries(inicial))
  const llamadas: string[] = []
  const peticion = <T>(valor: T, fallo?: string): PeticionIdb<T> => {
    const p: PeticionIdb<T> = { result: valor, error: fallo ? { message: fallo } : null, onsuccess: null, onerror: null }
    queueMicrotask(() => (fallo ? p.onerror?.() : p.onsuccess?.()))
    return p
  }
  const almacen = {
    put(valor: unknown) {
      llamadas.push('put')
      const v = valor as { id: string }
      datos.set(v.id, valor)
      return peticion(undefined)
    },
    get(clave: string) {
      llamadas.push('get')
      return peticion(datos.get(clave))
    },
    getAll() {
      llamadas.push('getAll')
      return peticion([...datos.values()])
    },
    count() {
      llamadas.push('count')
      return peticion(datos.size)
    },
  }
  const modos: string[] = []
  const base: BaseIdb = {
    transaction(_n: string, modo: 'readonly' | 'readwrite') {
      modos.push(modo)
      return { objectStore: () => almacen }
    },
  }
  return { base, datos, llamadas, modos }
}

const entrada = (id: string, estado = 'pendiente'): EntradaEnCola =>
  ({ id, estado, intentos: 0, instanteServidor: null, lectura: { carga: 'X', clase: 'evento', instante: '2026-01-01T00:00:00Z' } } as unknown as EntradaEnCola)

// --- Lo basico --------------------------------------------------------------------------------

test('guardar y leer una entrada', async () => {
  const { base } = baseFalsa()
  const cola = almacenDeCola({ base })
  await cola.guarda(entrada('a'))
  const leida = await cola.lee('a')
  assert.equal(leida?.id, 'a')
})

test('leer algo que no existe devuelve null, no un error', async () => {
  const { base } = baseFalsa()
  assert.equal(await almacenDeCola({ base }).lee('nope'), null)
})

test('guardar abre la transaccion en readwrite y leer en readonly', async () => {
  const { base, modos } = baseFalsa()
  const cola = almacenDeCola({ base })
  await cola.guarda(entrada('a'))
  await cola.lee('a')
  assert.deepEqual(modos, ['readwrite', 'readonly'])
})

test('cuenta devuelve el total', async () => {
  const { base } = baseFalsa({ a: entrada('a'), b: entrada('b') })
  assert.equal(await almacenDeCola({ base }).cuenta(), 2)
})

test('un error de IndexedDB se propaga con su mensaje', async () => {
  const base: BaseIdb = {
    transaction: () => ({
      objectStore: () => ({
        put: () => {
          const p = { result: undefined, error: { message: 'QuotaExceededError' }, onsuccess: null, onerror: null } as PeticionIdb<undefined>
          queueMicrotask(() => p.onerror?.())
          return p
        },
        get: () => ({}) as never,
        getAll: () => ({}) as never,
        count: () => ({}) as never,
      }),
    }),
  }
  await assert.rejects(() => almacenDeCola({ base }).guarda(entrada('a')), /QuotaExceededError/)
})

// --- Pendientes: lo sincronizado ya no es cola --------------------------------------------------

test('listaPendientes deja fuera lo ya sincronizado', async () => {
  const { base } = baseFalsa({
    a: entrada('a', 'pendiente'),
    b: entrada('b', 'sincronizada'),
    c: entrada('c', 'fallida'),
  })
  const pendientes = await almacenDeCola({ base }).listaPendientes()
  assert.deepEqual(pendientes.map((e) => e.id).sort(), ['a', 'c'])
})

// --- Lo que hay en el disco lo escribio otra version ---------------------------------------------

test('una entrada irreconocible se descarta en vez de devolverse a medias', async () => {
  const { base } = baseFalsa({ a: entrada('a'), rota: { id: 'rota' } })
  const pendientes = await almacenDeCola({ base }).listaPendientes()
  assert.deepEqual(pendientes.map((e) => e.id), ['a'], 'enviar una entrada a medias la rechaza el servidor para siempre')
})

test('validaEntrada exige los campos que la cola necesita', () => {
  assert.equal(validaEntrada(null), null)
  assert.equal(validaEntrada({ id: '', estado: 'pendiente', intentos: 0, instanteServidor: null, lectura: {} }), null)
  assert.equal(validaEntrada({ id: 'a', estado: 'pendiente', intentos: -1, instanteServidor: null, lectura: {} }), null)
  assert.equal(validaEntrada({ id: 'a', estado: 'pendiente', intentos: 0, instanteServidor: 5, lectura: {} }), null)
  assert.ok(validaEntrada({ id: 'a', estado: 'pendiente', intentos: 0, instanteServidor: null, lectura: {} }))
})

test('instanteServidor null es valido: es lo normal mientras no ha llegado al servidor', () => {
  assert.ok(validaEntrada({ id: 'a', estado: 'pendiente', intentos: 0, instanteServidor: null, lectura: {} }))
})

// --- El riesgo de purga: lo que este adaptador NO puede arreglar ---------------------------------

test('con almacenamiento persistido, el navegador no purga y se dice', async () => {
  const { base } = baseFalsa()
  const cola = almacenDeCola({ base, persistido: async () => true, estimacion: async () => ({ usage: 10, quota: 100 }) })
  const riesgo = await cola.estimaPurga()
  assert.equal(riesgo.persistido, true)
  assert.match(riesgo.mensaje, /no lo purgara/)
})

test('sin persistir, el mensaje empuja a instalar la app', async () => {
  const { base } = baseFalsa()
  const cola = almacenDeCola({ base, persistido: async () => false, estimacion: async () => ({ usage: 80, quota: 100 }) })
  const riesgo = await cola.estimaPurga()
  assert.equal(riesgo.persistido, false)
  assert.match(riesgo.mensaje, /80 %/)
  assert.match(riesgo.mensaje, /puede borrar la cola/)
})

test('si el navegador no sabe estimar, se dice que NO SE SABE — nunca cero', async () => {
  const { base } = baseFalsa()
  const cola = almacenDeCola({ base, persistido: async () => false, estimacion: async () => ({}) })
  const riesgo = await cola.estimaPurga()
  assert.equal(riesgo.usadoBytes, null, 'un cero aqui se leeria como "hay sitio de sobra"')
  assert.equal(riesgo.cuotaBytes, null)
  assert.match(riesgo.mensaje, /No se puede saber/)
})

test('sin las API de storage (Safari viejo, contexto no seguro) tampoco se inventa nada', async () => {
  const { base } = baseFalsa()
  const riesgo = await almacenDeCola({ base }).estimaPurga()
  assert.equal(riesgo.usadoBytes, null)
  assert.equal(riesgo.persistido, false)
  assert.match(riesgo.mensaje, /No se puede saber/)
})

test('si estimar LANZA, no revienta la cola: se degrada a no-se-sabe', async () => {
  const { base } = baseFalsa()
  const cola = almacenDeCola({
    base,
    persistido: async () => { throw new Error('no disponible') },
    estimacion: async () => { throw new Error('no disponible') },
  })
  const riesgo = await cola.estimaPurga()
  assert.equal(riesgo.persistido, false)
  assert.match(riesgo.mensaje, /No se puede saber/)
})

test('una cuota de cero no produce una division silenciosa', async () => {
  const { base } = baseFalsa()
  const cola = almacenDeCola({ base, persistido: async () => false, estimacion: async () => ({ usage: 0, quota: 0 }) })
  const riesgo = await cola.estimaPurga()
  assert.match(riesgo.mensaje, /No se puede saber/)
})
