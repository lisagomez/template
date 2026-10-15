/**
 * Capa de actividad programada (cron con zona y DST) y lo puro de pintar (rangos, navegacion, columnas).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { corridas, corridasPorDia, disponColumnas, esErrorCalendario, navega, parseaCron, proyecta, rangoDeVista, type TrabajoProgramado } from '../dist/index.js'
import { diaLocal, horaLocal } from './_base.ts'

const NY = 'America/New_York'
const trabajo = (id: string, expresion: string, extra: Partial<TrabajoProgramado> = {}): TrabajoProgramado =>
  ({ id, nombre: id, expresion, zona: 'America/Mexico_City', pausado: false, grupo: null, duracionMin: 5, ...extra })

test('cron: pasos, rangos, listas, nombres y alias', () => {
  assert.equal(corridasPorDia('*/15 * * * *'), 96)
  assert.equal(corridasPorDia('0 9-17 * * MON-FRI'), (9 * 5) / 7)
  assert.equal(corridasPorDia('@daily'), 1)
  assert.deepEqual(parseaCron('5,35 8 * JAN,JUL SUN').meses, new Set([1, 7]))
  assert.deepEqual(parseaCron('0 0 * * 7').diasSemana, new Set([0]), 'el 7 tambien es domingo')
})

test('cron: dia-del-mes y dia-de-la-semana restringidos a la vez se combinan con O (como cron)', () => {
  const desde = Date.parse('2026-10-01T06:00:00Z')
  const xs = corridas('0 12 1 * MON', 'America/Mexico_City', desde, desde + 31 * 86_400_000)
  assert.deepEqual(xs.map((t) => diaLocal(t)), ['2026-10-01', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'])
})

test('cron invalido: error tipado, y en una proyeccion no tumba a los demas', () => {
  assert.throws(() => parseaCron('61 * * * *'), (e) => esErrorCalendario(e, 'validacion'))
  assert.throws(() => parseaCron('* * *'), (e) => esErrorCalendario(e, 'validacion'))
  const desde = Date.parse('2026-10-19T06:00:00Z')
  const p = proyecta([trabajo('roto', 'cada rato'), trabajo('ok', '0 9 * * *')], { desde, hasta: desde + 86_400_000 })
  assert.deepEqual(p.invalidos.map((i) => i.trabajo), ['roto'])
  assert.deepEqual(p.bloques.map((b) => horaLocal(b.inicioMs)), ['09:00'])
})

test('cron con DST: la hora que no existe no corre; la que se repite corre una vez', () => {
  const salto = Date.parse('2026-03-08T05:00:00Z')
  assert.deepEqual(corridas('30 2 * * *', NY, salto, salto + 86_400_000), [])
  const regreso = Date.parse('2026-11-01T04:00:00Z')
  assert.equal(corridas('30 1 * * *', NY, regreso, regreso + 86_400_000).length, 1)
})

test('proyeccion: los pausados no salen salvo que se pidan; nada antes de `ahora`; tope por trabajo', () => {
  const desde = Date.parse('2026-10-19T06:00:00Z')
  const hasta = desde + 86_400_000
  const ts = [trabajo('respaldo', '0 3 * * *'), trabajo('sync', '0 */3 * * *', { pausado: true }), trabajo('latido', '* * * * *')]
  const p = proyecta(ts, { desde, hasta, ahora: Date.parse('2026-10-19T12:00:00Z'), maximoPorTrabajo: 10 })
  assert.equal(p.bloques.filter((b) => b.trabajo === 'sync').length, 0)
  assert.equal(p.bloques.filter((b) => b.trabajo === 'latido').length, 10)
  assert.ok(p.bloques.every((b) => b.inicioMs >= Date.parse('2026-10-19T12:00:00Z')))
  assert.equal(proyecta(ts, { desde, hasta, incluirPausados: true }).bloques.filter((b) => b.trabajo === 'sync').length, 8)
})

test('vistas: la semana empieza en lunes, el mes son 6 semanas, y se navega por vista', () => {
  const s = rangoDeVista('semana', '2026-10-22', 'America/Mexico_City')
  assert.deepEqual([s.dias[0], s.dias[6]], ['2026-10-19', '2026-10-25'])
  const m = rangoDeVista('mes', '2026-10-15', 'America/Mexico_City')
  assert.equal(m.dias.length, 42)
  assert.equal(m.dias[0], '2026-09-28')
  assert.equal(navega('semana', '2026-10-22', 1), '2026-10-29')
  assert.equal(navega('mes', '2026-01-31', 1), '2026-02-01')
})

test('columnas: tres que se solapan se reparten en tres; uno aparte ocupa el ancho entero', () => {
  const h = (x: number) => Date.UTC(2026, 9, 19, x)
  const c = disponColumnas([
    { clave: 'a', inicioMs: h(9), finMs: h(11) }, { clave: 'b', inicioMs: h(10), finMs: h(12) },
    { clave: 'c', inicioMs: h(10), finMs: h(11) }, { clave: 'd', inicioMs: h(14), finMs: h(15) },
  ])
  assert.deepEqual([c.get('a')?.columnas, c.get('b')?.columnas, c.get('c')?.columnas, c.get('d')?.columnas], [3, 3, 3, 1])
  assert.equal(new Set(['a', 'b', 'c'].map((k) => c.get(k)?.columna)).size, 3)
})
