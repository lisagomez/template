import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AlmacenEnMemoria, creaConversacion, creaMemoria, MemoriaNegada, resuelveComposicion, type Almacen, type Manejadores, type NivelPregunta } from '../dist/index.js'
import { AlmacenEnArchivo } from '../dist/almacenes/archivo.js'
import { COMPOSICION, ENCHUFES } from './_base.ts'

const producto = resuelveComposicion(COMPOSICION, ENCHUFES)

function banco(almacen: Almacen = new AlmacenEnMemoria(), nivel: NivelPregunta = 'lo-importante') {
  const citas: string[] = ['lunes 9:00 · revisión']
  const memoria = creaMemoria({ almacen, producto: 'consultorio-demo', inquilino: 'consultorio-norte', permisos: producto.permisos })
  const manejadores: Manejadores = {
    'agenda.consulta-hoy': async ({ memoria: m }) => { await m.recuerda('agenda', 'ultima-consulta', 'hoy'); return { texto: `Hoy tienes ${citas.length}: ${citas.join('; ')}.` } },
    'agenda.reserva': async () => { citas.push('mañana 10:00 · cita'); return { texto: 'Listo: mañana a las 10:00.' } },
    'agenda.cancela': async () => { citas.shift(); return { texto: 'Cancelada, y avisé.' } },
    'buzon.pendientes': async () => ({ texto: 'Hay 2 documentos pendientes.' }),
  }
  const conversacion = creaConversacion({ intenciones: producto.intenciones, manejadores, memoria, nivel })
  return { conversacion, citas, memoria, almacen }
}

test('conversación: lo que solo lee va directo; lo que escribe pregunta; lo que no sabe lo dice sin inventar', async () => {
  const { conversacion: c, citas } = banco()
  const hoy = await c.envia('¿qué tengo hoy?')
  assert.equal(hoy?.estado, 'hecho')
  assert.match(hoy!.texto, /Hoy tienes 1/)
  const pregunta = await c.envia('apártame una cita para mañana a las diez')
  assert.equal(pregunta?.estado, 'pregunta')
  assert.equal(citas.length, 1, 'todavía no')
  const hecho = await c.envia('sí, hazlo')
  assert.equal(hecho?.estado, 'hecho')
  assert.equal(citas.length, 2)
  const nose = await c.envia('pídeme una pizza hawaiana')
  assert.equal(nose?.estado, 'no-se')
  assert.match(nose!.texto, /prefiero decírtelo a inventarlo/)
})

test('conversación: lo irreversible pasa por el freno; la voz no lo confirma, el clic sí', async () => {
  const { conversacion: c, citas } = banco(new AlmacenEnMemoria(), 'solo-irreversible')
  const m = await c.envia('cancela la cita del lunes y avisa', 'voz')
  assert.equal(m?.estado, 'freno')
  assert.equal(m?.freno?.cita, 'cancela la cita del lunes y avisa')
  const porVoz = await c.confirma(m!.freno!.id, 'voz')
  assert.equal(porVoz.estado, 'freno-negado')
  assert.match(porVoz.texto, /no basta/)
  const porTeclado = await c.confirma(m!.freno!.id, 'teclado')
  assert.equal(porTeclado.estado, 'freno-negado')
  assert.equal(citas.length, 1, 'nada se movió')
  const porClic = await c.confirma(m!.freno!.id, 'clic')
  assert.equal(porClic.estado, 'hecho')
  assert.equal(citas.length, 0)
})

test('memoria: cada módulo toca solo lo que declara, y lo de un inquilino no se ve desde otro', async () => {
  const almacen = new AlmacenEnMemoria()
  const norte = creaMemoria({ almacen, producto: 'consultorio-demo', inquilino: 'norte', permisos: producto.permisos })
  const sur = creaMemoria({ almacen, producto: 'consultorio-demo', inquilino: 'sur', permisos: producto.permisos })
  await norte.recuerda('agenda', 'ultima-consulta', { cuando: 'hoy' })
  await norte.recuerda('agenda', 'ultima-consulta:lunes', 1)
  assert.deepEqual(await norte.recuerdo('agenda', 'ultima-consulta'), { cuando: 'hoy' })
  assert.equal(await sur.recuerdo('agenda', 'ultima-consulta'), null)
  await assert.rejects(norte.recuerda('buzon', 'algo', 1), MemoriaNegada)
  await assert.rejects(norte.recuerda('agenda', 'otra-clave', 1), MemoriaNegada)
  await assert.rejects(norte.recuerda('capa', 'grande', 'x'.repeat(70_000)), MemoriaNegada)
  assert.throws(() => creaMemoria({ almacen, producto: 'Con Espacios', inquilino: 'x', permisos: {} }), MemoriaNegada)
})

test('memoria en archivo: la conversación sigue ahí tras «recargar» (otra instancia sobre el mismo archivo)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'capa-'))
  try {
    const ruta = join(dir, 'memoria.json')
    const primera = banco(new AlmacenEnArchivo(ruta))
    await primera.conversacion.envia('¿qué tengo hoy?')
    const segunda = banco(new AlmacenEnArchivo(ruta))
    const vistos = await segunda.conversacion.carga()
    assert.deepEqual(vistos.map((m) => m.de), ['persona', 'asistente'])
    assert.equal(vistos[0]!.texto, '¿qué tengo hoy?')
    assert.equal(await segunda.memoria.recuerdo('agenda', 'ultima-consulta'), 'hoy')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('memoria por intención: «recuerda que…» se guarda en la memoria del producto y sigue tras recargar', async () => {
  const almacen = new AlmacenEnMemoria()
  const uno = banco(almacen)
  assert.equal((await uno.conversacion.envia('Recuerda que los viernes cerramos a las dos.'))?.texto, 'Lo recuerdo: «los viernes cerramos a las dos».')
  await uno.conversacion.envia('acuérdate de que el proveedor viene el martes')
  const dos = banco(almacen)
  await dos.conversacion.carga()
  const r = await dos.conversacion.envia('¿qué recuerdas?')
  assert.match(r!.texto, /los viernes cerramos a las dos.*el proveedor viene el martes/)
  assert.equal(r!.intencion, 'capa.recuerdos')
})
