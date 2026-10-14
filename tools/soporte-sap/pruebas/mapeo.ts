/**
 * El mapeo contextual de dos herramientas de tickets distintas: el FDE propone, solo una persona
 * aprueba, solo lo aprobado se aplica, y toda fila sale mapeada o en revisión con su motivo.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { similitud, digitoVerificadorRfc, digitoVerificadorCurp } from '../../extractor-documental/dist/index.js'
import { generaCorpus, exporteSucio, proponeMapeo, apruebaMapeo, aplicaMapeo, fechaUtc, seudonimoDe } from '../dist/index.js'

/** Una sal de PRUEBA: el importador seudonimiza con HMAC y su sal (PRP-010 H-32). */
const seudonimiza = { sal: 'sal-de-prueba-del-importador', hmac: (k: string, s: string) => createHmac('sha256', k).update(s).digest('hex') }
const corpus = generaCorpus({ rfc: digitoVerificadorRfc, curp: digitoVerificadorCurp })

for (const consultora of ['andina', 'boreal'] as const) {
  test(`${consultora}: propuesta, aprobación humana y cuenta cerrada`, () => {
    const e = exporteSucio(corpus, consultora)
    const m = proponeMapeo({ consultora, herramienta: e.herramienta, version: 1, columnas: e.columnas, muestras: e.filas.slice(0, 200), desfaseFechasMin: -360, similitud })
    for (const campo of ['idOrigen', 'cliente', 'titulo', 'creada', 'prioridad', 'modulo', 'sistema', 'asignado'] as const) assert.ok(m.columnas[campo], `${consultora}: falta la columna de ${campo}`)
    assert.throws(() => aplicaMapeo(m, e.filas, seudonimiza), /no está aprobado/)
    assert.throws(() => apruebaMapeo(m, { tipo: 'agente', id: 'fde' }, []), /una persona/)
    const aprobado = apruebaMapeo(m, { tipo: 'humano', id: 'usr-experto' }, [])
    const r = aplicaMapeo(aprobado, e.filas, seudonimiza)
    assert.ok(r.cuenta.cuadra, JSON.stringify(r.cuenta))
    assert.equal(r.cuenta.entrada, r.cuenta.mapeadas + r.cuenta.revision)
    for (const i of e.verdad.sinCliente) assert.ok(r.revision.some((x) => x.indice === i && x.motivos.includes('falta cliente')), `fila ${i} sin cliente`)
    for (const i of e.verdad.prioridadRara) assert.ok(r.revision.some((x) => x.indice === i && x.motivos.some((mo) => /prioridad fuera de vocabulario/.test(mo))), `fila ${i}`)
    assert.ok(r.mapeadas.every((x) => !x.incidencia.asignado || /^usr-[0-9a-f]{12}$/.test(x.incidencia.asignado)), 'el asignado entra como seudónimo')
  })
}

test('cada valor mapeado dice de qué columna salió, su original y su regla; el crudo no se toca', () => {
  const e = exporteSucio(corpus, 'andina')
  const copia = JSON.stringify(e.filas)
  const m = apruebaMapeo(proponeMapeo({ consultora: 'andina', herramienta: e.herramienta, version: 1, columnas: e.columnas, muestras: e.filas, desfaseFechasMin: -360, similitud }), { tipo: 'humano', id: 'usr-experto' }, [])
  const r = aplicaMapeo(m, e.filas, seudonimiza)
  const primera = r.mapeadas[0]!
  const p = primera.procedencia.find((x) => x.campo === 'prioridad')!
  assert.equal(p.columna, 'priority')
  assert.match(p.regla, /vocabulario/)
  assert.equal(primera.incidencia.prioridad, p.valor)
  assert.equal(JSON.stringify(e.filas), copia, 'el crudo sigue igual')
  const reconstruido = primera.procedencia.map((x) => [x.columna, x.original])
  for (const [col, orig] of reconstruido) assert.equal(e.filas[primera.indice]![col!], orig)
})

test('similitud: un valor fuera de vocabulario se PROPONE y solo entra si el humano lo acepta', () => {
  const filas = [{ number: 'INC1', company: 'Aceros', short_description: 'x', sys_created_on: '2026-05-01 10:00:00', priority: 'Highestt' }]
  const m = proponeMapeo({ consultora: 'andina', herramienta: 'mesauno', version: 1, columnas: Object.keys(filas[0]!), muestras: filas, desfaseFechasMin: -360, similitud })
  assert.equal(m.propuestosPorSimilitud['prioridad:highestt'], 'P1')
  const sin = aplicaMapeo(apruebaMapeo(m, { tipo: 'humano', id: 'u' }, []), filas, seudonimiza)
  assert.equal(sin.cuenta.revision, 1)
  const con = aplicaMapeo(apruebaMapeo(m, { tipo: 'humano', id: 'u' }, ['prioridad:highestt']), filas, seudonimiza)
  assert.equal(con.mapeadas[0]?.incidencia.prioridad, 'P1')
  assert.match(con.mapeadas[0]!.procedencia.find((x) => x.campo === 'prioridad')!.regla, /aceptada por u/)
})

test('fechas: sin zona se toma la del mapeo; con zona se respeta', () => {
  assert.equal(fechaUtc('2026-05-14 10:22:00', -360), '2026-05-14T16:22:00.000Z')
  assert.equal(fechaUtc('2026-06-03T11:05:00.000-0600', -360), '2026-06-03T17:05:00.000Z')
  assert.equal(fechaUtc('14/05/2026', -360), null)
})

// PRP-010 H-32: el importador seudonimizaba con sha256(consultora|nombre), sin sal: quien adivinara un nombre lo revertía.
test('H-32 · el seudónimo del importador lleva sal: sin ella no se calcula, y adivinar el nombre ya no lo revierte', () => {
  const s1 = seudonimoDe('andina', 'Juan Pérez', seudonimiza)
  assert.match(s1, /^usr-[0-9a-f]{12}$/)
  assert.equal(seudonimoDe('andina', ' juan perez ', seudonimiza), s1, 'estable para el mismo nombre')
  // El ataque de antes: con el nombre adivinado se recalculaba el seudónimo y se comparaba.
  const adivinado = `usr-${createHash('sha256').update('andina|juan perez').digest('hex').slice(0, 12)}`
  assert.notEqual(s1, adivinado)
  assert.notEqual(seudonimoDe('andina', 'Juan Pérez', { ...seudonimiza, sal: 'otra-sal-de-otro-despliegue' }), s1, 'otra sal, otro seudónimo')
  for (const sal of ['', 'corta']) assert.throws(() => seudonimoDe('andina', 'Juan Pérez', { ...seudonimiza, sal }), /necesita su sal/)
})
