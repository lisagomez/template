/**
 * Proveedor → espejo: incremental con borrados, paginas, 410 → completa, listado cortado → sin poda,
 * credencial caducada → estado de error con quien lo destraba (y la lectura sigue).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculaSalud, sincroniza, type PaginaDeEventos, type Proveedor } from '../dist/index.js'
import { banco, TRABAJO, ZONA, HORA } from './_base.ts'

const semana = { calendarios: [TRABAJO], desde: Date.parse('2026-10-19T06:00:00Z'), hasta: Date.parse('2026-10-26T06:00:00Z'), zona: ZONA }
const utc = (dia: number, hora: number) => new Date(Date.UTC(2026, 9, dia, hora)).toISOString()
const ev = (titulo: string, dia: number) => ({ titulo, inicio: utc(dia, 16), fin: utc(dia, 17), zona: ZONA })
const titulos = async (b: ReturnType<typeof banco>) => (await b.lector.consulta(semana)).instancias.map((i) => i.titulo).sort()

test('primera sincronizacion: completa, guarda el token, y el espejo queda como Google', async () => {
  const b = banco()
  b.sim.siembra(TRABAJO, ev('Dentista', 20))
  b.sim.siembra(TRABAJO, ev('Comida', 21))
  const r = await sincroniza(b, TRABAJO)
  assert.equal(r.modo, 'completa')
  assert.equal(r.error, null)
  assert.deepEqual(await titulos(b), ['Comida', 'Dentista'])
  assert.ok((await b.almacen.estadoSync(TRABAJO))?.token)
})

test('incremental: altas, cambios y BORRADOS hechos fuera (en el telefono) llegan al espejo', async () => {
  const b = banco()
  const dentista = b.sim.siembra(TRABAJO, ev('Dentista', 20))
  const comida = b.sim.siembra(TRABAJO, ev('Comida', 21))
  await sincroniza(b, TRABAJO)
  await b.sim.actualiza(TRABAJO, dentista.id, { titulo: 'Dentista (cambiado)' }, { notificar: 'nadie' })
  await b.sim.borra(TRABAJO, comida.id, { notificar: 'nadie' })
  b.sim.siembra(TRABAJO, ev('Gimnasio', 22))
  const r = await sincroniza(b, TRABAJO)
  assert.equal(r.modo, 'incremental')
  assert.equal(r.borrados, 1)
  assert.deepEqual(await titulos(b), ['Dentista (cambiado)', 'Gimnasio'])
})

test('paginas: con 5 eventos y paginas de 2, se piden 3 paginas y llegan los 5', async () => {
  const b = banco()
  b.sim.tamanoPagina = 2
  for (const d of [19, 20, 21, 22, 23]) b.sim.siembra(TRABAJO, ev(`E${d}`, d))
  const r = await sincroniza(b, TRABAJO)
  assert.equal(r.paginas, 3)
  assert.equal((await titulos(b)).length, 5)
})

test('410: si Google invalida el token, se hace una completa y desaparece lo que se borro mientras', async () => {
  const b = banco()
  const comida = b.sim.siembra(TRABAJO, ev('Comida', 21))
  b.sim.siembra(TRABAJO, ev('Dentista', 20))
  await sincroniza(b, TRABAJO)
  await b.sim.borra(TRABAJO, comida.id, { notificar: 'nadie' })
  b.sim.invalidaTokens()
  const r = await sincroniza(b, TRABAJO)
  assert.equal(r.modo, 'completa')
  assert.equal(r.error, null)
  assert.deepEqual(await titulos(b), ['Dentista'])
})

test('listado cortado: si el proveedor no da todo, NO se poda (la fuente borraba eventos que existian)', async () => {
  const b = banco()
  b.sim.siembra(TRABAJO, ev('Dentista', 20))
  b.sim.siembra(TRABAJO, ev('Comida', 21))
  await sincroniza(b, TRABAJO)
  const cortado: Proveedor = {
    ...b.sim, nombre: 'cortado', medido: true, capacidades: b.sim.capacidades,
    calendarios: (c) => b.sim.calendarios(c), obtiene: (r, id) => b.sim.obtiene(r, id),
    crea: (r, d, o) => b.sim.crea(r, d, o), actualiza: (r, id, d, o) => b.sim.actualiza(r, id, d, o),
    modificaInstancia: (r, s, i, d, o) => b.sim.modificaInstancia(r, s, i, d, o), borra: (r, id, o) => b.sim.borra(r, id, o),
    lista: async (r, p): Promise<PaginaDeEventos> => {
      const pag = await b.sim.lista(r, { ...p, token: null })
      return { ...pag, eventos: pag.eventos.slice(0, 1), tokenSync: null, completo: false }
    },
  }
  const r = await sincroniza({ proveedor: cortado, almacen: b.almacen, reloj: b.reloj }, TRABAJO, { forzarCompleta: true })
  assert.equal(r.completo, false)
  assert.deepEqual(await titulos(b), ['Comida', 'Dentista'], 'no se borro nada que no llego')
})

test('credencial caducada: la sync no revienta, guarda el error con quien lo destraba, y se sigue leyendo', async () => {
  const b = banco()
  b.sim.siembra(TRABAJO, ev('Dentista', 20))
  await sincroniza(b, TRABAJO)
  b.sim.caducaCredencial()
  const r = await sincroniza(b, TRABAJO)
  assert.equal(r.error?.codigo, 'credencial')
  const l = await b.lector.consulta(semana)
  assert.deepEqual(l.instancias.map((i) => i.titulo), ['Dentista'])
  assert.equal(l.salud.estado, 'error')
  assert.equal(l.salud.escritura, 'bloqueada')
  assert.match(l.salud.destraba ?? '', /reautenticar/)
  b.sim.caducaCredencial(false)
  await sincroniza(b, TRABAJO)
  assert.equal((await b.lector.consulta(semana)).salud.escritura, 'permitida')
})

test('una completa cierra las reparaciones pendientes de ese calendario: el espejo ya ES Google', async () => {
  const b = banco()
  b.almacen.programaFalla('guardaEventos')
  b.sim.caducaCredencial(false)
  await b.pluma.crea(TRABAJO, ev('Pendiente', 20), { clave: 'p' })
  assert.equal((await b.lector.consulta(semana)).salud.reparacionesPendientes, 1)
  await sincroniza(b, TRABAJO, { forzarCompleta: true })
  const l = await b.lector.consulta(semana)
  assert.equal(l.salud.reparacionesPendientes, 0)
  assert.deepEqual(l.instancias.map((i) => i.titulo), ['Pendiente'])
})

test('salud: fresca recien sincronizada, rancia pasado el umbral, y la edad se reporta', async () => {
  const ref = TRABAJO
  const base = { ...ref, token: 't', ultimoIntento: 0, error: null }
  const ahora = Date.parse('2026-10-19T14:00:00Z')
  assert.equal(calculaSalud([{ ref, estado: { ...base, ultimaSync: ahora - HORA } }], ahora).estado, 'fresco')
  const rancia = calculaSalud([{ ref, estado: { ...base, ultimaSync: ahora - 7 * HORA } }], ahora)
  assert.equal(rancia.estado, 'rancio')
  assert.equal(rancia.edadMs, 7 * HORA)
  assert.equal(calculaSalud([{ ref, estado: null }], ahora).causa, 'nunca se ha sincronizado')
})
