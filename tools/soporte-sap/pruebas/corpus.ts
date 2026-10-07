/**
 * El corpus sintético: determinista, con los datos personales sembrados VÁLIDOS (para que el
 * anonimizador se mida contra la forma real), y el calendario hábil que fecha su ciclo de vida.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { digitoVerificadorRfc, digitoVerificadorCurp, validaRfc, validaCurp, validaNss } from '../../extractor-documental/dist/index.js'
import { generaCorpus, personaSintetica, azar, digitoClabe, minutosHabiles, sumaMinutosHabiles, CALENDARIO_CDMX } from '../dist/index.js'

const digitos = { rfc: digitoVerificadorRfc, curp: digitoVerificadorCurp }

test('misma semilla, mismo corpus; seis meses, dos consultoras, cinco clientes', () => {
  const a = generaCorpus(digitos), b = generaCorpus(digitos)
  assert.deepEqual(a.incidencias.map((i) => i.id + i.creada), b.incidencias.map((i) => i.id + i.creada))
  assert.equal(a.clientes.length, 5)
  assert.ok(a.incidencias.length > 400, `${a.incidencias.length} incidencias`)
  assert.ok(a.incidencias.some((i) => i.reglaDeOrigen === null) && a.incidencias.some((i) => i.conDatosPersonales))
})

test('los datos personales sintéticos pasan los validadores del extractor', () => {
  const a = azar(7)
  for (let i = 0; i < 30; i++) {
    const p = personaSintetica(a, digitos, 'empresa')
    assert.ok(validaRfc(p.rfc), `RFC ${p.rfc}`)
    assert.ok(validaCurp(p.curp), `CURP ${p.curp}`)
    assert.ok(validaNss(p.nss), `NSS ${p.nss}`)
    assert.equal(p.clabe.at(-1), digitoClabe(p.clabe.slice(0, 17)))
    assert.match(p.correo, /\.example$/)
  }
})

test('cada incidencia tiene su ciclo en orden y ninguna pasa del corte', () => {
  const c = generaCorpus(digitos)
  for (const i of c.incidencias) {
    const fechas = i.eventos.map((e) => Date.parse(e.fecha))
    assert.deepEqual(fechas, [...fechas].sort((x, y) => x - y), i.id)
    assert.ok(fechas.every((f) => f <= Date.parse(c.corte)), i.id)
    assert.equal(i.eventos[0]?.tipo, 'RECIBIDA')
  }
})

test('calendario hábil: fines de semana, feriados y fuera de horario no cuentan', () => {
  const viernes17 = Date.parse('2026-09-11T23:00:00Z') // viernes 17:00 en CDMX
  const lunes10 = Date.parse('2026-09-14T16:00:00Z')   // lunes 10:00
  assert.equal(minutosHabiles(CALENDARIO_CDMX, viernes17, lunes10), 60 + 60)
  const martes15 = Date.parse('2026-09-15T23:00:00Z')  // martes 17:00; el 16 es feriado
  assert.equal(new Date(sumaMinutosHabiles(CALENDARIO_CDMX, martes15, 120)).toISOString(), '2026-09-17T16:00:00.000Z')
})
