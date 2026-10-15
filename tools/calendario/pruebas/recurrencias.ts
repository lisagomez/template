/**
 * Tiempo y recurrencias: el horario de verano (DST) se resuelve en hora local, las reglas RFC 5545
 * dan las fechas que dan Google y Outlook, y lo que no se soporta se rechaza en vez de pintarse mal.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  conCuenta, cuentaAntes, desfase, esErrorCalendario, expande, instanteDesdeLocal, parseaRecurrencia, terminaAntes, desplazaLocal,
} from '../dist/index.js'
import { diaLocal, horaLocal } from './_base.ts'

const NY = 'America/New_York'
const fechas = (xs: Array<{ inicioMs: number }>, zona: string) => xs.map((o) => diaLocal(o.inicioMs, zona))

test('DST: 02:30 en Nueva York el dia del salto de primavera no existe; adelanta a 03:30 EDT u omite', () => {
  const h = { anio: 2026, mes: 3, dia: 8, hora: 2, minuto: 30, segundo: 0 }
  assert.equal(new Date(instanteDesdeLocal(h, NY, 'adelanta') as number).toISOString(), '2026-03-08T07:30:00.000Z')
  assert.equal(instanteDesdeLocal(h, NY, 'omite'), null)
})

test('DST: 01:30 en Nueva York el dia del regreso existe dos veces; se toma la primera (EDT)', () => {
  const t = instanteDesdeLocal({ anio: 2026, mes: 11, dia: 1, hora: 1, minuto: 30, segundo: 0 }, NY)
  assert.equal(new Date(t as number).toISOString(), '2026-11-01T05:30:00.000Z')
})

test('Ciudad de Mexico no tiene horario de verano desde 2022: el desfase es -6 h todo el año', () => {
  for (const mes of [1, 4, 7, 10]) assert.equal(desfase(Date.UTC(2026, mes - 1, 15, 12), 'America/Mexico_City'), -6 * 3_600_000)
})

test('DST: una diaria a las 9:00 en Nueva York sigue a las 9:00 locales al cruzar el salto (cambia su UTC)', () => {
  const rec = parseaRecurrencia(['RRULE:FREQ=DAILY'], NY)
  const os = expande(rec, { inicio: '2026-03-06T14:00:00.000Z', todoElDia: false, zona: NY }, 3_600_000, Date.UTC(2026, 2, 6), Date.UTC(2026, 2, 11))
  assert.deepEqual(os.map((o) => horaLocal(o.inicioMs, NY)), ['09:00', '09:00', '09:00', '09:00', '09:00'])
  // 6 y 7 de marzo en EST (UTC-5); desde el 8 (el salto es a las 2:00) en EDT (UTC-4).
  assert.deepEqual(os.map((o) => o.clave.slice(11, 16)), ['14:00', '14:00', '13:00', '13:00', '13:00'])
})

test('semanal L-M-V con COUNT=5 desde un lunes', () => {
  const rec = parseaRecurrencia(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=5'], 'America/Mexico_City')
  const os = expande(rec, { inicio: '2026-10-19T15:30:00.000Z', todoElDia: false, zona: 'America/Mexico_City' }, 1_800_000, Date.UTC(2026, 9, 1), Date.UTC(2026, 11, 1))
  assert.deepEqual(fechas(os, 'America/Mexico_City'), ['2026-10-19', '2026-10-21', '2026-10-23', '2026-10-26', '2026-10-28'])
})

test('mensual: el segundo martes (2TU) y el ultimo dia habil (BYSETPOS=-1)', () => {
  const z = 'America/Mexico_City'
  const segundoMartes = expande(parseaRecurrencia(['RRULE:FREQ=MONTHLY;BYDAY=2TU;COUNT=3'], z), { inicio: '2026-10-13T16:00:00.000Z', todoElDia: false, zona: z }, 3_600_000, 0, Date.UTC(2027, 1, 1))
  assert.deepEqual(fechas(segundoMartes, z), ['2026-10-13', '2026-11-10', '2026-12-08'])
  const ultimoHabil = expande(parseaRecurrencia(['RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=3'], z), { inicio: '2026-10-30T16:00:00.000Z', todoElDia: false, zona: z }, 3_600_000, 0, Date.UTC(2027, 1, 1))
  assert.deepEqual(fechas(ultimoHabil, z), ['2026-10-30', '2026-11-30', '2026-12-31'])
})

test('BYMONTHDAY=31 se salta los meses de 30 dias (no inventa un 31 de noviembre)', () => {
  const z = 'America/Mexico_City'
  const os = expande(parseaRecurrencia(['RRULE:FREQ=MONTHLY;BYMONTHDAY=31;COUNT=3'], z), { inicio: '2026-10-31T16:00:00.000Z', todoElDia: false, zona: z }, 3_600_000, 0, Date.UTC(2027, 6, 1))
  assert.deepEqual(fechas(os, z), ['2026-10-31', '2026-12-31', '2027-01-31'])
})

test('EXDATE con TZID quita la ocurrencia, pero COUNT la sigue contando (RFC 5545)', () => {
  const z = 'America/Mexico_City'
  const rec = parseaRecurrencia(['RRULE:FREQ=DAILY;COUNT=4', 'EXDATE;TZID=America/Mexico_City:20261021T093000'], z)
  const os = expande(rec, { inicio: '2026-10-19T15:30:00.000Z', todoElDia: false, zona: z }, 1_800_000, 0, Date.UTC(2027, 0, 1))
  assert.deepEqual(fechas(os, z), ['2026-10-19', '2026-10-20', '2026-10-22'])
})

test('UNTIL es inclusivo, y anual de todo el dia (un cumpleaños)', () => {
  const z = 'America/Mexico_City'
  const hasta = expande(parseaRecurrencia(['RRULE:FREQ=DAILY;UNTIL=20261021T153000Z'], z), { inicio: '2026-10-19T15:30:00.000Z', todoElDia: false, zona: z }, 1, 0, Date.UTC(2027, 0, 1))
  assert.equal(hasta.length, 3)
  const anual = expande(parseaRecurrencia(['RRULE:FREQ=YEARLY'], z), { inicio: '2026-02-14', todoElDia: true, zona: z }, 86_400_000, Date.UTC(2026, 0, 1), Date.UTC(2029, 0, 1))
  assert.deepEqual(anual.map((o) => o.clave), ['2026-02-14', '2027-02-14', '2028-02-14'])
})

test('lo no soportado se rechaza con error tipado: BYHOUR, RDATE, frecuencia horaria', () => {
  for (const lineas of [['RRULE:FREQ=DAILY;BYHOUR=9'], ['RRULE:FREQ=DAILY', 'RDATE:20261021'], ['RRULE:FREQ=HOURLY']]) {
    assert.throws(() => parseaRecurrencia(lineas, 'UTC'), (e) => esErrorCalendario(e, 'recurrencia'))
  }
})

test('partir una serie: la cabeza termina antes del corte y la cola conserva el COUNT restante', () => {
  const z = 'America/Mexico_City'
  const lineas = ['RRULE:FREQ=DAILY;COUNT=10']
  const serie = { inicio: '2026-10-19T15:30:00.000Z', todoElDia: false, zona: z }
  const corte = '2026-10-22T15:30:00.000Z'
  assert.equal(cuentaAntes(parseaRecurrencia(lineas, z), serie, corte), 3)
  const cabeza = expande(parseaRecurrencia(terminaAntes(lineas, corte), z), serie, 1, 0, Date.UTC(2027, 0, 1))
  assert.deepEqual(fechas(cabeza, z), ['2026-10-19', '2026-10-20', '2026-10-21'])
  const cola = expande(parseaRecurrencia(conCuenta(lineas, 7), z), { ...serie, inicio: corte }, 1, 0, Date.UTC(2027, 0, 1))
  assert.equal(cola.length, 7)
})

test('desplazar en hora local: 9:00→11:00 aplicado a una serie que empezo en horario de verano', () => {
  const base = Date.parse('2026-10-26T13:00:00.000Z') // 9:00 EDT
  const desde = Date.parse('2026-11-02T14:00:00.000Z') // 9:00 EST
  const hacia = Date.parse('2026-11-02T16:00:00.000Z') // 11:00 EST
  assert.equal(horaLocal(desplazaLocal(base, desde, hacia, NY), NY), '11:00')
})
