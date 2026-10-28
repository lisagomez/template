/**
 * Fase 7 · Ágora sobre la capa: los malos de la capa que se resuelven en la COMPOSICIÓN (sin base). Cada prueba siembra
 * el defecto sobre una copia (la composición, la memoria, el resumen o la conversación) y exige que la capa o Ágora lo
 * bloqueen. Lo que bloquea la base (el testigo del freno: cita ajena, repetida o vencida) está en `_suite-capa.ts`.
 *
 * Lee la composición y los enchufes del árbol, como el verificador: si alguien cambia un enchufe de Ágora, esto lo ve.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { compone, creaConversacion, creaMemoria, validaResumen, AlmacenEnMemoria, MemoriaNegada, type Enchufe, type Manejadores } from '../../capa/dist/index.js'
import { recuerdaPreferencia } from '../../../src/features/agora/services/preferencias.ts'
import { AGENTES, PERSONAS } from '../dist/laboratorio/datos.js'

const RAIZ = resolve(import.meta.dirname, '../../..')
const lee = (p: string) => readFileSync(join(RAIZ, p), 'utf8')
const COMPOSICION = JSON.parse(lee('productos/composiciones/agora.json'))
const ENCHUFES: Enchufe[] = [...lee('src/shared/capa/enchufes.ts').matchAll(/'([^']+\/enchufe\.json)'/g)].map((m) => m[1]!).filter((a) => !a.startsWith('.')).map((a) => JSON.parse(lee(a)))
const producto = () => {
  const r = compone(COMPOSICION, ENCHUFES)
  if (!r.ok) throw new Error(`la composición de Ágora no compone: ${r.problemas.join('; ')}`)
  return r.producto
}

/** La conversación de la capa con las intenciones REALES de Ágora y manejadores espía: cuenta quién se llamó. */
function conversacion() {
  const p = producto()
  const llamados: string[] = []
  const manejadores: Manejadores = Object.fromEntries(p.intenciones.map((i) => [i.id, async () => { llamados.push(i.id); return { texto: `hecho: ${i.id}` } }]))
  const memoria = creaMemoria({ almacen: new AlmacenEnMemoria(), producto: 'agora', inquilino: 'golfo-norte', permisos: p.permisos })
  return { p, llamados, c: creaConversacion({ intenciones: p.intenciones, manejadores, memoria, nivel: 'lo-importante' }) }
}

test('la composición de Ágora compone: marca propia, voz LOCAL, datos sensibles y ningún adaptador de nube', () => {
  const p = producto()
  assert.equal(p.composicion.marca.nombre, 'Ágora')
  assert.doesNotMatch(JSON.stringify(p.composicion.marca), /arbrain|levy/i)
  assert.equal(p.composicion.datosSensibles, true)
  assert.deepEqual(p.voz.sale, [], 'algo de la voz sale de la máquina')
  assert.equal(p.ranuras.conversacion.quien, 'agora-buzon')
  assert.equal(p.ranuras.plan.quien, 'calendario')
})

/** Los nombres propios del laboratorio (socios, personas y organizaciones), sin las palabras comunes que los acompañan. */
const COMUNES = new Set(['despacho', 'fiscal', 'coordinador', 'planeacion', 'analista', 'metricas', 'supervisor', 'financiero', 'vigia', 'distribuidora', 'cv'])
const norma = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const PROPIOS = new Set([...AGENTES.filter((a) => a.origen === 'externo').map((a) => a.nombre), ...PERSONAS.map((p) => p.nombre), 'Golfo Norte', 'Bajío']
  .flatMap((n) => norma(n).split(/[^a-zñ]+/)).filter((t) => t.length >= 4 && !COMUNES.has(t)))

test('regla: ningún ejemplo de una intención de Ágora que ESCRIBE lleva un nombre propio (el nombre no decide la acción)', () => {
  // Medido el 2026-10-28 con el corpus 1: con «suspende a medios norte» de ejemplo, «transfiere 50 mil a medios norte»
  // caía en suspender y «paga la factura de fletes del golfo» en revocar: el nombre del socio pesaba más que el verbo.
  const malos = ENCHUFES.filter((e) => e.modulo.startsWith('agora')).flatMap((e) => e.intenciones.filter((i) => i.efecto === 'escribe')
    .flatMap((i) => i.ejemplos.filter((x) => norma(x).split(/[^a-zñ]+/).some((t) => PROPIOS.has(t))).map((x) => `${i.id}: «${x}»`)))
  assert.ok(PROPIOS.has('medios') && PROPIOS.has('fletes') && PROPIOS.has('paula'), 'la lista de nombres propios no se armó')
  assert.deepEqual(malos, [])
})

test('MALO 1 · «apruébalo», por voz o escrito, no aprueba nada: va a la intención que solo LEE', async () => {
  for (const [texto, via] of [['apruébalo', 'voz'], ['apruébalo', 'teclado'], ['sí, apruébala ya', 'voz'], ['aprueba la pauta de radio', 'teclado']] as const) {
    const { p, llamados, c } = conversacion()
    const v = c.enrutador.resuelve(texto)
    assert.ok(!v.intencion || v.intencion.efecto === 'lee', `«${texto}» resuelve a ${v.intencion?.id}, que escribe`)
    const m = await c.envia(texto, via)
    assert.ok(!['pregunta', 'freno'].includes(m?.estado ?? ''), `«${texto}» (${via}) quedó esperando un «sí» o un clic: ${m?.estado}`)
    await c.envia('sí', via) // y si después dice «sí», tampoco se escribe nada
    const tocadas = llamados.map((id) => p.intenciones.find((i) => i.id === id)!)
    assert.ok(tocadas.every((i) => i.efecto === 'lee'), `«${texto}» (${via}) tocó una intención que escribe: ${llamados.join(', ')}`)
    assert.equal(c.freno.pendientes().length, 0, `«${texto}» abrió el freno`)
  }
  // Y ningún manejador de Ágora llama a decidir una propuesta: aprobar es SOLO el clic sobre la tarjeta.
  assert.doesNotMatch(lee('src/features/agora/services/manejadores.ts'), /decidePropuesta|decide\(/)
})

test('MALO 2 · lo irreversible de Ágora pide el freno, y el freno no acepta ni Enter, ni voz, ni texto: solo el clic', async () => {
  for (const texto of ['cierra los costos de septiembre', 'revoca a Fletes del Golfo', 'quita la segregación de funciones']) {
    const { llamados, c } = conversacion()
    const m = await c.envia(texto, 'teclado')
    assert.equal(m?.estado, 'freno', `«${texto}» no abrió el freno`)
    for (const origen of ['teclado', 'voz', 'texto', 'agente'] as const) {
      const r = await c.confirma(m!.freno!.id, origen)
      assert.equal(r.estado, 'freno-negado', `«${texto}» se confirmó con ${origen}`)
    }
    assert.deepEqual(llamados, [], `«${texto}» se ejecutó sin el clic`)
  }
})

test('MALO 2 · una cita que dijo el asistente (y no la persona) no abre el freno', () => {
  const { c } = conversacion()
  const r = c.freno.pide({ accion: 'agora-contabilidad.cierra-periodo', porque: 'prueba', cita: 'cierra los costos de septiembre', mensajesDeLaPersona: ['muéstrame los costos'] })
  assert.equal(r.ok, false)
})

test('MALO 3 · la solicitud del freno sirve una vez y vence a los 15 minutos', async () => {
  let ahora = 1_000_000
  const p = producto()
  const llamados: string[] = []
  const manejadores: Manejadores = Object.fromEntries(p.intenciones.map((i) => [i.id, async () => { llamados.push(i.id); return { texto: 'hecho' } }]))
  const memoria = creaMemoria({ almacen: new AlmacenEnMemoria(), producto: 'agora', inquilino: 'golfo-norte', permisos: p.permisos })
  const c = creaConversacion({ intenciones: p.intenciones, manejadores, memoria, nivel: 'lo-importante', ahora: () => ahora })
  const m = await c.envia('revoca a Fletes del Golfo', 'teclado')
  assert.equal((await c.confirma(m!.freno!.id, 'clic')).estado, 'hecho')
  assert.notEqual((await c.confirma(m!.freno!.id, 'clic')).estado, 'hecho', 'la misma solicitud sirvió dos veces')
  assert.equal(llamados.length, 1)
  const m2 = await c.envia('cierra los costos de septiembre', 'teclado')
  ahora += 15 * 60 * 1000 + 1
  assert.notEqual((await c.confirma(m2!.freno!.id, 'clic')).estado, 'hecho', 'una solicitud vencida se confirmó')
  assert.equal(llamados.length, 1)
})

test('MALO 4 · una intención ambigua pregunta entre las dos en vez de adivinar', async () => {
  const { llamados, c } = conversacion()
  const m = await c.envia('ábrelo', 'teclado')
  assert.ok(m && ['ambigua', 'no-se'].includes(m.estado ?? ''), `«ábrelo» adivinó: ${m?.estado} ${llamados.join(', ')}`)
  assert.deepEqual(llamados, [])
})

test('MALO 5 · un cambio de monto pedido por intención va a la intención que PROPONE (no a una que aplica)', async () => {
  const { p, llamados, c } = conversacion()
  const m = await c.envia('cambia el monto de la campaña de radio a 150 mil', 'teclado')
  // Con «lo importante», lo que escribe pregunta antes; «sí» lo hace, y lo que hace es PROPONER (manejador de cambia).
  assert.equal(m?.estado, 'pregunta')
  assert.deepEqual(llamados, [])
  await c.envia('sí', 'voz')
  assert.deepEqual(llamados, ['agora-tablero.cambia'])
  const i = p.intenciones.find((x) => x.id === 'agora-tablero.cambia')!
  assert.equal(i.irreversible, false)
  assert.match(i.queHace, /propuesta/i, 'la intención de cambiar no dice que deja una propuesta')
})

test('MALO 6 · la memoria niega una clave que el enchufe no declara y una cifra financiera', async () => {
  const p = producto()
  const memoria = creaMemoria({ almacen: new AlmacenEnMemoria(), producto: 'agora', inquilino: 'golfo-norte', permisos: p.permisos })
  await recuerdaPreferencia(memoria, 'vista-tablero', 'kanban')
  await assert.rejects(memoria.recuerda('agora', 'presupuesto-del-mes', 408000), MemoriaNegada)
  await assert.rejects(memoria.recuerda('agora-costos', 'ultimo-periodo', '2026-10'), MemoriaNegada)
  await assert.rejects(memoria.recuerda('agora-buzon', 'hilo', ['mensaje']), MemoriaNegada)
  for (const cifra of ['$408,000.00', 132000, '132,000 MXN', '1250.50']) {
    await assert.rejects(recuerdaPreferencia(memoria, 'workspace-abierto', cifra), /no guarda cifras|uuid|inválid/i, `se guardó ${cifra}`)
  }
  await assert.rejects(recuerdaPreferencia(memoria, 'vista-tablero', 'pastel'))
})

test('MALO 7 · el resumen es de solo conteos y enlaces: un monto o un texto libre no pasan', () => {
  const d = COMPOSICION.resumen
  const base = { resumen: 1, producto: 'agora', generado: new Date(0).toISOString(), conteos: { 'pendientes-de-clic': 3, 'agentes-suspendidos': 1 }, enlaces: { agora: '/agora' } }
  assert.equal(validaResumen(base, d).ok, true)
  assert.equal(validaResumen({ ...base, conteos: { ...base.conteos, 'monto-pendiente-mxn': 132000 } }, d).ok, false)
  assert.equal(validaResumen({ ...base, conteos: { 'pendientes-de-clic': '$132,000' } }, d).ok, false)
  assert.equal(validaResumen({ ...base, conteos: { 'pendientes-de-clic': 1.5 } }, d).ok, false)
  assert.equal(validaResumen({ ...base, texto: 'Medios Norte pide 132 000 MXN' }, d).ok, false)
  assert.equal(validaResumen({ ...base, enlaces: { agora: 'https://fuera.example/agora?monto=132000' } }, d).ok, false)
})

test('MALO 8 · un adaptador de voz de nube en la composición de Ágora no compone (datos sensibles: nunca)', () => {
  for (const voz of [{ ...COMPOSICION.voz, stt: 'groq', nube: ['groq'] }, { ...COMPOSICION.voz, tts: 'elevenlabs', nube: ['elevenlabs'] }, { ...COMPOSICION.voz, stt: 'groq' }]) {
    const r = compone({ ...COMPOSICION, voz }, ENCHUFES)
    assert.equal(r.ok, false, `compuso con ${JSON.stringify(voz)}`)
  }
})

test('MALO 8 · un módulo de Ágora sin enchufe no compone', () => {
  const r = compone({ ...COMPOSICION, modulos: [...COMPOSICION.modulos, 'agora-reportes'] }, ENCHUFES)
  assert.equal(r.ok, false)
  assert.match((r as { problemas: string[] }).problemas.join(' '), /agora-reportes no tiene enchufe/)
})

test('intercambio: el plan lo llena la capa en vez del calendario, y la composición sigue componiendo', () => {
  const r = compone({ ...COMPOSICION, modulos: COMPOSICION.modulos.filter((m: string) => m !== 'calendario'), ranuras: { ...COMPOSICION.ranuras, plan: 'capa' } }, ENCHUFES)
  assert.ok(r.ok, r.ok ? '' : r.problemas.join('; '))
  assert.equal(r.producto.ranuras.plan.quien, 'capa')
})

test('el laboratorio no actúa al importarse (y nunca borra un contenedor que no creó)', () => {
  // 2026-10-28: `pg.ts` importaba `laboratorio.ts`, que al importarse levantaba el contenedor y, en un árbol sin
  // entorno, lo BORRABA y lo recreaba. Sin Docker en el PATH, importar no debe intentar nada.
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(join(RAIZ, 'scripts/agora/laboratorio.ts'))}); console.log('importado sin efectos')`],
    { encoding: 'utf8', env: { ...process.env, PATH: '/sin-docker' } })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /importado sin efectos/)
  assert.doesNotMatch(lee('scripts/agora/laboratorio.ts'), /if \(existe\(\) && !clave\) \{ docker\(\['rm'/)
})
