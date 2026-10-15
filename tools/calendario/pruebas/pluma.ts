/**
 * La pluma: una escritura deja proveedor y espejo consistentes, o falla tipada. Nunca duplica, nunca
 * pisa un cambio ajeno sin decirlo, y nunca manda un correo a un tercero sin confirmacion humana.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esErrorCalendario, idDesdeClave, type Instancia } from '../dist/index.js'
import { banco, TRABAJO, ZONA, horaLocal, diaLocal, DIA } from './_base.ts'

const JUNTA = { titulo: 'Junta con proveedor', inicio: '2026-10-20T17:00:00.000Z', fin: '2026-10-20T18:00:00.000Z', zona: ZONA }
const semana = { calendarios: [TRABAJO], desde: Date.parse('2026-10-19T06:00:00Z'), hasta: Date.parse('2026-10-26T06:00:00Z'), zona: ZONA }

test('crear es idempotente por clave: dos llamadas, un solo evento en Google y en el espejo', async () => {
  const { sim, pluma, lector } = banco()
  const a = await pluma.crea(TRABAJO, JUNTA, { clave: 'crea-junta' })
  const b = await pluma.crea(TRABAJO, JUNTA, { clave: 'crea-junta' })
  assert.equal(a.repetida, false)
  assert.equal(b.repetida, true)
  assert.equal(sim.llamadas.filter((l) => l.op === 'crea').length, 1)
  assert.equal(sim.eventosDe(TRABAJO).length, 1)
  assert.equal((await lector.consulta(semana)).instancias.length, 1)
})

test('409: si Google ya tenia el evento (el proceso cayo antes de anotarlo), se lee y no se duplica', async () => {
  const { sim, pluma, almacen } = banco()
  await sim.crea(TRABAJO, { ...JUNTA, descripcion: '', lugar: '', todoElDia: false, recurrencia: null, invitados: [], recordatorios: [], color: null, visibilidad: 'predeterminada', transparencia: 'ocupado', vinculos: [], estado: 'confirmado' }, { notificar: 'nadie', id: idDesdeClave('perdida') })
  const r = await pluma.crea(TRABAJO, JUNTA, { clave: 'perdida' })
  assert.equal(sim.eventosDe(TRABAJO).length, 1)
  assert.equal(r.eventos[0]?.id, idDesdeClave('perdida'))
  assert.ok(await almacen.evento(TRABAJO, idDesdeClave('perdida')))
})

test('reparacion del espejo: Google acepto y el espejo fallo → `pendiente`, sin repetir la escritura, y repara() lo asienta', async () => {
  const { sim, pluma, almacen, lector } = banco()
  almacen.programaFalla('guardaEventos')
  const r = await pluma.crea(TRABAJO, JUNTA, { clave: 'con-espejo-caido' })
  assert.equal(r.espejo, 'pendiente')
  assert.equal((await lector.consulta(semana)).instancias.length, 0, 'el espejo todavia no lo tiene')
  assert.equal((await lector.consulta(semana)).salud.reparacionesPendientes, 1)
  assert.deepEqual(await pluma.repara(), { reparadas: 1, pendientes: 0 })
  const despues = await lector.consulta(semana)
  assert.equal(despues.instancias.length, 1)
  assert.equal(despues.salud.reparacionesPendientes, 0)
  const otra = await pluma.crea(TRABAJO, JUNTA, { clave: 'con-espejo-caido' })
  assert.equal(otra.repetida, true)
  assert.equal(sim.llamadas.filter((l) => l.op === 'crea').length, 1, 'el reintento no volvio a escribir en Google')
})

test('si ni siquiera se puede anotar la intencion, no se toca Google', async () => {
  const { sim, pluma, almacen } = banco()
  almacen.programaFalla('anotaIntencion')
  await assert.rejects(pluma.crea(TRABAJO, JUNTA, { clave: 'x' }), (e) => esErrorCalendario(e, 'espejo'))
  assert.equal(sim.llamadas.length, 0)
})

test('etag: si alguien cambio el evento despues de leerlo, falla `conflicto` y el espejo queda con la version vigente', async () => {
  const { sim, pluma, almacen } = banco()
  const { eventos: [ev] } = await pluma.crea(TRABAJO, JUNTA, { clave: 'c1' })
  assert.ok(ev)
  await sim.actualiza(TRABAJO, ev.id, { titulo: 'Cambiado en el telefono' }, { notificar: 'nadie' })
  await assert.rejects(
    pluma.actualiza({ ...TRABAJO, id: ev.id, etag: ev.etag }, { titulo: 'Mi cambio' }, { clave: 'c2' }),
    (e) => esErrorCalendario(e, 'conflicto'),
  )
  assert.equal((await almacen.evento(TRABAJO, ev.id))?.titulo, 'Cambiado en el telefono')
})

test('429: se reintenta con la espera que pide el proveedor; agotado, falla `limite` y no deja nada a medias', async () => {
  const { sim, pluma, reloj, almacen } = banco()
  sim.programaFalla('crea', 'limite', 2, 1_500)
  const r = await pluma.crea(TRABAJO, JUNTA, { clave: 'con-429' })
  assert.equal(r.espejo, 'al-dia')
  assert.deepEqual(reloj.esperas, [1_500, 1_500])
  sim.programaFalla('crea', 'limite', 10, 100)
  await assert.rejects(pluma.crea(TRABAJO, { ...JUNTA, titulo: 'otra' }, { clave: 'agotada' }), (e) => esErrorCalendario(e, 'limite'))
  assert.equal((await almacen.intenciones()).length, 0)
})

test('invalid_grant: la escritura falla tipada diciendo quien lo destraba; la lectura sigue saliendo del espejo', async () => {
  const { sim, pluma, lector } = banco()
  await pluma.crea(TRABAJO, JUNTA, { clave: 'antes' })
  sim.caducaCredencial()
  await assert.rejects(pluma.crea(TRABAJO, { ...JUNTA, titulo: 'despues' }, { clave: 'despues' }), (e) => {
    assert.ok(esErrorCalendario(e, 'credencial'))
    assert.match(e.destraba ?? '', /reautenticar/)
    return true
  })
  const l = await lector.consulta(semana)
  assert.equal(l.instancias.length, 1, 'lo de antes se sigue leyendo')
  assert.equal(l.salud.escritura, 'bloqueada')
  assert.equal(l.salud.estado, 'error')
})

test('invitados: por defecto no se notifica a nadie; notificar exige confirmacion humana explicita', async () => {
  const { sim, pluma } = banco()
  const conInvitados = { ...JUNTA, invitados: [{ correo: 'cliente@otra.com' }, { correo: 'socia@negocio.mx' }] }
  await pluma.crea(TRABAJO, conInvitados, { clave: 'silencio' })
  assert.equal(sim.notificaciones.length, 0)
  await assert.rejects(pluma.crea(TRABAJO, conInvitados, { clave: 'sin-confirmar', notificar: 'todos' }), (e) => esErrorCalendario(e, 'requiere-confirmacion'))
  assert.equal(sim.llamadas.filter((l) => l.op === 'crea').length, 1, 'sin confirmacion ni siquiera se llamo a Google')
  await pluma.crea(TRABAJO, conInvitados, { clave: 'confirmada', notificar: 'externos', confirmaNotificar: true })
  assert.deepEqual(sim.notificaciones.map((n) => n.para), ['cliente@otra.com'])
})

/** Stand-up L-V 9:30 desde el lunes 19 de octubre. */
async function conStandUp(zona = ZONA, inicio = '2026-10-19T15:30:00.000Z', fin = '2026-10-19T15:45:00.000Z', regla = 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') {
  const b = banco()
  const { eventos: [serie] } = await b.pluma.crea(TRABAJO, { titulo: 'Stand-up', inicio, fin, zona, recurrencia: [regla] }, { clave: 'serie' })
  assert.ok(serie)
  const lee = async (desde = semana.desde, hasta = semana.hasta, z = zona) => (await b.lector.consulta({ calendarios: [TRABAJO], desde, hasta, zona: z })).instancias
  return { ...b, serie, lee }
}

const porDia = (xs: Instancia[], zona = ZONA) => Object.fromEntries(xs.map((i) => [diaLocal(i.inicioMs, zona), horaLocal(i.inicioMs, zona)]))
const delDia = (xs: Instancia[], dia: string, zona = ZONA) => xs.find((i) => diaLocal(i.inicioMs, zona) === dia) as Instancia

test('alcance «este»: solo esa ocurrencia se mueve', async () => {
  const { pluma, lee } = await conStandUp()
  const mie = delDia(await lee(), '2026-10-21')
  await pluma.actualiza(mie, { inicio: '2026-10-21T17:00:00.000Z', fin: '2026-10-21T17:15:00.000Z' }, { clave: 'mueve-mie', alcance: 'este' })
  assert.deepEqual(porDia(await lee()), { '2026-10-19': '09:30', '2026-10-20': '09:30', '2026-10-21': '11:00', '2026-10-22': '09:30', '2026-10-23': '09:30' })
})

test('alcance «este y los siguientes»: la serie se parte; lo anterior no se mueve y la excepcion previa sobrevive', async () => {
  const { pluma, lee, sim } = await conStandUp()
  const mie = delDia(await lee(), '2026-10-21')
  await pluma.actualiza(mie, { inicio: '2026-10-21T17:00:00.000Z', fin: '2026-10-21T17:15:00.000Z' }, { clave: 'excepcion', alcance: 'este' })
  const jue = delDia(await lee(), '2026-10-22')
  await pluma.actualiza(jue, { inicio: '2026-10-22T18:00:00.000Z', fin: '2026-10-22T18:15:00.000Z' }, { clave: 'parte', alcance: 'siguientes' })
  assert.deepEqual(porDia(await lee()), { '2026-10-19': '09:30', '2026-10-20': '09:30', '2026-10-21': '11:00', '2026-10-22': '12:00', '2026-10-23': '12:00' })
  const siguiente = { desde: semana.desde + 7 * DIA, hasta: semana.hasta + 7 * DIA }
  assert.equal(Object.values(porDia(await lee(siguiente.desde, siguiente.hasta))).join(), '12:00,12:00,12:00,12:00,12:00')
  const series = sim.eventosDe(TRABAJO).filter((e) => e.recurrencia && e.estado !== 'cancelado')
  assert.equal(series.length, 2, 'en Google quedan dos series: la cortada y la nueva')
  assert.ok(series.some((s) => s.recurrencia?.some((l) => l.includes('UNTIL='))))
})

test('alcance «todos» desde una ocurrencia en horario de invierno: la serie entera pasa a 10:00 LOCAL, tambien antes del cambio', async () => {
  const NY = 'America/New_York'
  const { pluma, lee } = await conStandUp(NY, '2026-10-26T13:00:00.000Z', '2026-10-26T13:30:00.000Z', 'RRULE:FREQ=DAILY;COUNT=14')
  const desde = Date.parse('2026-10-26T04:00:00Z')
  const hasta = desde + 14 * DIA
  const lun2 = delDia(await lee(desde, hasta, NY), '2026-11-02', NY)
  await pluma.actualiza(lun2, { inicio: '2026-11-02T15:00:00.000Z', fin: '2026-11-02T15:30:00.000Z' }, { clave: 'todas', alcance: 'todos' })
  const horas = new Set((await lee(desde, hasta, NY)).map((i) => horaLocal(i.inicioMs, NY)))
  assert.deepEqual([...horas], ['10:00'])
})

test('partir una serie con COUNT: entre las dos siguen siendo exactamente las ocurrencias originales', async () => {
  const { pluma, lee } = await conStandUp(ZONA, '2026-10-19T15:30:00.000Z', '2026-10-19T15:45:00.000Z', 'RRULE:FREQ=DAILY;COUNT=10')
  const todas = await lee(semana.desde, semana.hasta + 14 * DIA)
  assert.equal(todas.length, 10)
  const cuarta = todas[3] as Instancia
  await pluma.actualiza(cuarta, { titulo: 'Stand-up (nuevo formato)' }, { clave: 'formato', alcance: 'siguientes' })
  const despues = await lee(semana.desde, semana.hasta + 14 * DIA)
  assert.equal(despues.length, 10)
  assert.deepEqual(despues.map((i) => i.titulo.includes('nuevo')), [false, false, false, true, true, true, true, true, true, true])
})

test('compensacion: si la serie nueva no se puede crear, el corte se deshace y nada queda a medias', async () => {
  const { pluma, lee, sim, almacen } = await conStandUp()
  const jue = delDia(await lee(), '2026-10-22')
  sim.programaFalla('crea', 'proveedor')
  await assert.rejects(pluma.actualiza(jue, { titulo: 'X' }, { clave: 'falla-a-medias', alcance: 'siguientes' }), (e) => esErrorCalendario(e, 'proveedor'))
  const series = sim.eventosDe(TRABAJO).filter((e) => e.recurrencia && e.estado !== 'cancelado')
  assert.equal(series.length, 1)
  assert.ok(!series[0]?.recurrencia?.some((l) => l.includes('UNTIL')), 'la serie volvio a no tener fin')
  assert.equal(Object.keys(porDia(await lee())).length, 5)
  assert.equal((await almacen.intenciones()).length, 0)
})

test('borrar: «este» quita una ocurrencia, «siguientes» corta la serie y «todos» la elimina', async () => {
  const { pluma, lee } = await conStandUp()
  await pluma.borra(delDia(await lee(), '2026-10-20'), { clave: 'b1', alcance: 'este' })
  assert.deepEqual(Object.keys(porDia(await lee())), ['2026-10-19', '2026-10-21', '2026-10-22', '2026-10-23'])
  await pluma.borra(delDia(await lee(), '2026-10-22'), { clave: 'b2', alcance: 'siguientes' })
  assert.deepEqual(Object.keys(porDia(await lee())), ['2026-10-19', '2026-10-21'])
  await pluma.borra(delDia(await lee(), '2026-10-19'), { clave: 'b3', alcance: 'todos' })
  assert.equal((await lee()).length, 0)
})

test('validacion con Zod: fin antes de inicio o una zona inventada se rechazan antes de tocar Google', async () => {
  const { sim, pluma } = banco()
  await assert.rejects(pluma.crea(TRABAJO, { ...JUNTA, fin: '2026-10-20T16:00:00.000Z' }, { clave: 'v1' }), (e) => esErrorCalendario(e, 'validacion'))
  await assert.rejects(pluma.crea(TRABAJO, { ...JUNTA, zona: 'Marte/Olympus' }, { clave: 'v2' }), (e) => esErrorCalendario(e, 'validacion'))
  assert.equal(sim.llamadas.length, 0)
})
