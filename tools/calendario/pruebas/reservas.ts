/**
 * Disponibilidad y reserva, el contrato de los productos que agendan: huecos reales (horario, margenes,
 * aviso minimo, horizonte), `sin-hueco` tipado cuando no hay, y doble reserva IMPOSIBLE incluso con
 * peticiones simultaneas.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculaHuecos, huecoEnZona, Reservas, sincroniza, type EntradaReglas, type Hueco } from '../dist/index.js'
import { banco, TRABAJO, ZONA, horaLocal, MINUTO_EN_MS } from './_reservas.ts'

const REGLAS: EntradaReglas = {
  zona: ZONA,
  horario: [1, 2, 3, 4, 5].map((dia) => ({ dia, desde: '09:00', hasta: '13:00' })),
  duracionMin: 30, margenDespuesMin: 15, avisoMinimoMin: 60, horizonteDias: 14,
}

function conReservas(reglas: EntradaReglas = REGLAS, inicio = '2026-10-19T08:00:00-06:00') {
  const b = banco(inicio)
  const reservas = new Reservas({ almacen: b.almacen, pluma: b.pluma, lector: b.lector, recurso: TRABAJO, reglas, reloj: b.reloj, ttlMin: 10 })
  return { ...b, reservas }
}

const huecos = (r: Awaited<ReturnType<Reservas['huecos']>>): Hueco[] => (r.tipo === 'huecos' ? r.huecos : [])

test('huecos del lunes: desde las 9 (aviso de 1 h a las 8), cada 45 min (30 + 15 de margen), sin pasar de las 13', async () => {
  const { reservas } = conReservas()
  const lunes = huecos(await reservas.huecos({ hasta: Date.parse('2026-10-19T19:00:00Z') }))
  assert.deepEqual(lunes.map((h) => horaLocal(h.inicioMs)), ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30'])
})

test('un evento del calendario ocupa (el hueco de 9:30 no cabe: su margen de despues choca con la junta de las 10) y un evento «libre» no', async () => {
  const { reservas, sim, almacen, reloj } = conReservas()
  sim.siembra(TRABAJO, { titulo: 'Junta', inicio: '2026-10-19T16:00:00.000Z', fin: '2026-10-19T17:00:00.000Z', zona: ZONA })
  sim.siembra(TRABAJO, { titulo: 'Recordatorio', inicio: '2026-10-19T18:00:00.000Z', fin: '2026-10-19T18:30:00.000Z', zona: ZONA, transparencia: 'libre' })
  await sincroniza({ proveedor: sim, almacen, reloj }, TRABAJO)
  const lunes = huecos(await reservas.huecos({ hasta: Date.parse('2026-10-19T19:00:00Z') }))
  assert.deepEqual(lunes.map((h) => horaLocal(h.inicioMs)), ['09:00', '11:00', '11:30', '12:00', '12:30'])
})

test('sin hueco es un resultado TIPADO, nunca un hueco inventado: agenda llena y sin horario', async () => {
  const { reservas, sim, almacen, reloj } = conReservas()
  sim.siembra(TRABAJO, { titulo: 'Inventario todo el dia', inicio: '2026-10-19T14:00:00.000Z', fin: '2026-10-19T20:00:00.000Z', zona: ZONA })
  await sincroniza({ proveedor: sim, almacen, reloj }, TRABAJO)
  const lleno = await reservas.huecos({ hasta: Date.parse('2026-10-19T20:00:00Z') })
  assert.equal(lleno.tipo, 'sin-hueco')
  assert.equal(lleno.tipo === 'sin-hueco' && lleno.motivo, 'agenda-llena')
  const sabado = await reservas.huecos({ desde: Date.parse('2026-10-24T06:00:00Z'), hasta: Date.parse('2026-10-25T06:00:00Z') })
  assert.equal(sabado.tipo === 'sin-hueco' && sabado.motivo, 'sin-horario')
})

test('reservar: el primero aparta el hueco; el segundo, sobre el mismo hueco, se rechaza con `ocupado`', async () => {
  const { reservas } = conReservas()
  const [h] = huecos(await reservas.huecos({ maximo: 1 }))
  assert.ok(h)
  const a = await reservas.tentativa({ inicio: h.inicio, referencia: 'conv-001', clave: 'a' })
  const b = await reservas.tentativa({ inicio: h.inicio, referencia: 'conv-002', clave: 'b' })
  assert.equal(a.ok, true)
  assert.deepEqual(b.ok ? 'acepto' : b.motivo, 'ocupado')
  assert.notEqual(huecos(await reservas.huecos({ maximo: 1 }))[0]?.inicio, h.inicio, 'el hueco apartado ya no se ofrece')
})

test('doble reserva CONCURRENTE: 25 peticiones simultaneas al mismo hueco → exactamente 1 aceptada', async () => {
  const { reservas } = conReservas()
  const [h] = huecos(await reservas.huecos({ maximo: 1 }))
  assert.ok(h)
  const rs = await Promise.all(Array.from({ length: 25 }, (_, i) => reservas.tentativa({ inicio: h.inicio, referencia: `conv-${i}`, clave: `k${i}` })))
  assert.equal(rs.filter((r) => r.ok).length, 1)
  assert.equal(rs.filter((r) => !r.ok && r.motivo === 'ocupado').length, 24)
})

test('margenes entre reservas: con 15 min despues, no cabe una reserva pegada a otra', async () => {
  const { reservas } = conReservas({ ...REGLAS, intervaloMin: 15 })
  await reservas.tentativa({ inicio: '2026-10-19T15:00:00.000Z', referencia: 'r1', clave: 'r1' })
  const pegada = await reservas.tentativa({ inicio: '2026-10-19T15:30:00.000Z', referencia: 'r2', clave: 'r2' })
  assert.deepEqual(pegada.ok ? 'acepto' : pegada.motivo, 'ocupado')
  const conMargen = await reservas.tentativa({ inicio: '2026-10-19T15:45:00.000Z', referencia: 'r3', clave: 'r3' })
  assert.equal(conMargen.ok, true)
})

test('idempotencia: reintentar con la misma clave devuelve la misma reserva; un inicio fuera de regla se rechaza', async () => {
  const { reservas } = conReservas()
  const a = await reservas.tentativa({ inicio: '2026-10-19T15:00:00.000Z', referencia: 'r', clave: 'misma' })
  const b = await reservas.tentativa({ inicio: '2026-10-19T15:00:00.000Z', referencia: 'r', clave: 'misma' })
  assert.ok(a.ok && b.ok && b.repetida && a.reserva.id === b.reserva.id)
  const desalineado = await reservas.tentativa({ inicio: '2026-10-19T15:10:00.000Z', referencia: 'r', clave: 'otra' })
  assert.deepEqual(desalineado.ok ? 'acepto' : desalineado.motivo, 'fuera-de-regla')
})

test('la tentativa expira sola: pasado el TTL el hueco vuelve y confirmar tarde dice `expirada`', async () => {
  const { reservas, reloj } = conReservas()
  const a = await reservas.tentativa({ inicio: '2026-10-19T16:00:00.000Z', referencia: 'r', clave: 'lenta' })
  assert.ok(a.ok)
  assert.deepEqual((await reservas.tentativa({ inicio: '2026-10-19T16:00:00.000Z', referencia: 'r2', clave: 'pronto' })).ok, false)
  reloj.avanza(11 * MINUTO_EN_MS)
  const otro = await reservas.tentativa({ inicio: '2026-10-19T16:00:00.000Z', referencia: 'r2', clave: 'rapida' })
  assert.equal(otro.ok, true)
  const tarde = await reservas.confirma(a.reserva.id, { titulo: 'Cita', clave: 'conf-lenta' })
  assert.deepEqual(tarde.ok ? 'acepto' : tarde.motivo, 'expirada')
})

test('confirmar crea UN evento con una referencia (sin datos de la persona) y sin notificar a nadie; liberar lo quita', async () => {
  const { reservas, sim, lector } = conReservas()
  const t = await reservas.tentativa({ inicio: '2026-10-19T15:00:00.000Z', referencia: 'conv-77', clave: 't' })
  assert.ok(t.ok)
  const c1 = await reservas.confirma(t.reserva.id, { titulo: 'Cita de valoracion', clave: 'c' })
  const c2 = await reservas.confirma(t.reserva.id, { titulo: 'Cita de valoracion', clave: 'c' })
  assert.ok(c1.ok && c2.ok && c2.repetida)
  const eventos = sim.eventosDe(TRABAJO)
  assert.equal(eventos.length, 1)
  assert.deepEqual(eventos[0]?.vinculos, [{ tipo: 'reserva', id: t.reserva.id }])
  assert.deepEqual(eventos[0]?.invitados, [])
  assert.equal(eventos[0]?.descripcion, '')
  assert.equal(sim.notificaciones.length, 0)
  const semana = { calendarios: [TRABAJO], desde: Date.parse('2026-10-19T06:00:00Z'), hasta: Date.parse('2026-10-20T06:00:00Z'), zona: ZONA }
  assert.equal((await lector.consulta(semana)).instancias.length, 1)
  const l = await reservas.libera(t.reserva.id, { clave: 'l' })
  assert.ok(l.ok)
  assert.equal((await lector.consulta(semana)).instancias.length, 0)
  assert.equal((await reservas.tentativa({ inicio: '2026-10-19T15:00:00.000Z', referencia: 'otra', clave: 'de-nuevo' })).ok, true)
})

test('si mientras estaba apartado alguien agenda en ese hueco (fuera de las reservas), confirmar dice `ocupado` y no escribe encima', async () => {
  const { reservas, sim, almacen, reloj } = conReservas()
  const t = await reservas.tentativa({ inicio: '2026-10-19T16:00:00.000Z', referencia: 'r', clave: 'apartada' })
  assert.ok(t.ok)
  sim.siembra(TRABAJO, { titulo: 'Puesto desde el telefono', inicio: '2026-10-19T16:15:00.000Z', fin: '2026-10-19T16:45:00.000Z', zona: ZONA })
  await sincroniza({ proveedor: sim, almacen, reloj }, TRABAJO)
  const c = await reservas.confirma(t.reserva.id, { titulo: 'Cita', clave: 'conf' })
  assert.deepEqual(c.ok ? 'acepto' : c.motivo, 'ocupado')
  assert.equal(sim.eventosDe(TRABAJO).filter((e) => e.titulo === 'Cita').length, 0)
  assert.equal((await reservas.reserva(t.reserva.id))?.estado, 'liberada')
})

test('tope por dia y fechas bloqueadas', async () => {
  const { reservas } = conReservas({ ...REGLAS, maxPorDia: 1, fechasBloqueadas: ['2026-10-20'] })
  await reservas.tentativa({ inicio: '2026-10-19T15:00:00.000Z', referencia: 'r', clave: 'una' })
  const hs = huecos(await reservas.huecos({ hasta: Date.parse('2026-10-22T06:00:00Z') }))
  assert.deepEqual([...new Set(hs.map((h) => h.inicio.slice(0, 10)))], ['2026-10-21'])
})

test('DST en los huecos: el dia del salto de primavera la hora inexistente no se ofrece', () => {
  const reglas: EntradaReglas = { zona: 'America/New_York', horario: [{ dia: 0, desde: '00:00', hasta: '04:00' }], duracionMin: 60, horizonteDias: 3 }
  const r = calculaHuecos(reglas, { ocupados: [], bloques: [], ahora: Date.parse('2026-03-07T12:00:00Z') })
  assert.deepEqual(r.tipo === 'huecos' && r.huecos.map((h) => horaLocal(h.inicioMs, 'America/New_York')), ['00:00', '01:00', '03:00'])
})

test('el hueco se le dice a quien reserva en SU zona', () => {
  const h = { inicio: '2026-10-19T15:00:00.000Z', fin: '2026-10-19T15:30:00.000Z', inicioMs: Date.parse('2026-10-19T15:00:00Z'), finMs: Date.parse('2026-10-19T15:30:00Z') }
  assert.match(huecoEnZona(h, 'Europe/Madrid'), /17:00/)
  assert.match(huecoEnZona(h, 'America/Mexico_City'), /09:00/)
})
