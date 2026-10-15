/**
 * El adaptador `gog` (no medido: con un `ejecuta` falso se prueba lo que SI depende de nosotros —las
 * banderas, la traduccion de errores y de eventos—) y el CLI: dry-run por defecto y gate humano
 * para notificar a terceros.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AlmacenEnMemoria } from '../dist/almacenes/memoria.js'
import { Lector, Pluma, esErrorCalendario, sincroniza } from '../dist/index.js'
import { ProveedorGog, banderasDeEvento, normalizaGog, traduceErrorGog, type GogEvento } from '../dist/gog/index.js'
import { ejecutorGog } from '../dist/gog/proceso.js'
import { TRABAJO, ZONA } from './_base.ts'

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli', 'index.js')

function falso(respuestas: Record<string, unknown>) {
  const llamadas: string[][] = []
  const ejecuta = async (args: string[]) => {
    llamadas.push(args)
    const r = respuestas[args[1] as string]
    if (r instanceof Error) throw r
    return JSON.stringify(r ?? {})
  }
  return { ejecuta, llamadas }
}

const GOG_EVENTO: GogEvento = {
  id: 'abc123', summary: 'Revision', start: { dateTime: '2026-10-20T10:00:00-06:00', timeZone: ZONA }, end: { dateTime: '2026-10-20T11:00:00-06:00' },
  attendees: [{ email: 'cliente@otra.com', responseStatus: 'accepted' }], transparency: 'transparent', visibility: 'private',
  extendedProperties: { private: { mc_task_id: 't-9', 'vinculo:lead': 'L-1' } }, etag: '"77"', updated: '2026-10-15T00:00:00Z', status: 'confirmed',
}

test('gog: un evento de `gog --json` se traduce completo (zona, invitados, transparencia, vinculos y el `mc_task_id` de la fuente)', () => {
  const e = normalizaGog(TRABAJO, GOG_EVENTO, 'UTC')
  assert.equal(e.inicio, '2026-10-20T16:00:00.000Z')
  assert.equal(e.zona, ZONA)
  assert.deepEqual(e.invitados, [{ correo: 'cliente@otra.com', nombre: undefined, respuesta: 'acepta', opcional: undefined }])
  assert.equal(e.transparencia, 'libre')
  assert.equal(e.visibilidad, 'privada')
  assert.deepEqual(e.vinculos, [{ tipo: 'tarea', id: 't-9' }, { tipo: 'lead', id: 'L-1' }])
  assert.equal(normalizaGog(TRABAJO, { id: 'x', start: { date: '2026-10-20' }, end: { date: '2026-10-21' } }, ZONA).transparencia, 'libre')
})

test('gog: las banderas mandan `--send-updates none` por defecto y llevan rrule, recordatorios y vinculos', () => {
  const a = banderasDeEvento({ titulo: 'T', inicio: '2026-10-20T16:00:00.000Z', fin: '2026-10-20T17:00:00.000Z', recurrencia: ['RRULE:FREQ=WEEKLY'], recordatorios: [{ metodo: 'aviso', minutos: 10 }], vinculos: [{ tipo: 'reserva', id: 'r1' }] }, 'nadie')
  assert.deepEqual(a.slice(a.indexOf('--send-updates'), a.indexOf('--send-updates') + 2), ['--send-updates', 'none'])
  assert.ok(a.join(' ').includes('--rrule RRULE:FREQ=WEEKLY --reminder popup:10m --private-prop vinculo:reserva=r1'))
})

test('gog: los errores de `gog` se vuelven codigos que el nucleo decide (y el ENOENT dice que instalar)', () => {
  assert.equal(traduceErrorGog(new Error('oauth2: "invalid_grant" "Token has been expired or revoked."')).codigo, 'credencial')
  assert.equal(traduceErrorGog(new Error('googleapi: Error 429: rateLimitExceeded')).codigo, 'limite')
  assert.equal(traduceErrorGog(new Error('googleapi: Error 412: Precondition Failed')).codigo, 'conflicto')
  const sinGog = traduceErrorGog(new Error('spawn gog ENOENT'))
  assert.equal(sinGog.codigo, 'proveedor')
  assert.match(sinGog.destraba ?? '', /instalar gog/)
})

test('gog: el listado que llega al tope se marca incompleto, y la sync entonces no poda', async () => {
  const { ejecuta } = falso({ events: { events: [GOG_EVENTO, { ...GOG_EVENTO, id: 'def' }] } })
  const gog = new ProveedorGog({ ejecuta, maximo: 2, zona: ZONA })
  const almacen = new AlmacenEnMemoria()
  const r = await sincroniza({ proveedor: gog, almacen }, TRABAJO, { ventana: { desde: 0, hasta: Date.parse('2027-01-01') } })
  assert.equal(r.completo, false)
  assert.equal((await almacen.eventos([TRABAJO], { desde: 0, hasta: Date.parse('2027-01-01') })).length, 2)
})

test('gog: la pluma funciona sin id propio ni lectura por id; lo pendiente lo cierra una sync completa', async () => {
  const { ejecuta, llamadas } = falso({ create: { event: GOG_EVENTO }, events: { events: [GOG_EVENTO] } })
  const gog = new ProveedorGog({ ejecuta, zona: ZONA })
  const almacen = new AlmacenEnMemoria()
  const pluma = new Pluma({ proveedor: gog, almacen })
  almacen.programaFalla('guardaEventos')
  const r = await pluma.crea(TRABAJO, { titulo: 'Revision', inicio: '2026-10-20T16:00:00.000Z', fin: '2026-10-20T17:00:00.000Z', zona: ZONA }, { clave: 'g1' })
  assert.equal(r.espejo, 'pendiente')
  assert.ok(!llamadas[0]?.includes('--id'), 'gog no recibe un id propio')
  assert.deepEqual(await pluma.repara(), { reparadas: 0, pendientes: 1 }, 'sin lectura por id no se puede reparar evento a evento')
  await sincroniza({ proveedor: gog, almacen }, TRABAJO, { ventana: { desde: 0, hasta: Date.parse('2027-01-01') } })
  const l = await new Lector({ almacen }).salud([TRABAJO])
  assert.equal(l.reparacionesPendientes, 0)
})

test('gog/proceso: sin GOG_KEYRING_PASSWORD falla `credencial` antes de ejecutar nada (y no imprime el valor)', async () => {
  const ejecuta = ejecutorGog({ env: { GOG_KEYRING_PASSWORD: undefined }, binario: '/no/existe' })
  await assert.rejects(ejecuta(['calendar', 'calendars']), (e) => esErrorCalendario(e, 'credencial') && /GOG_KEYRING_PASSWORD/.test(e.message))
})

function cli(args: string[], env: Record<string, string> = {}): Promise<{ codigo: number; salida: string; error: string }> {
  return new Promise((r) => execFile(process.execPath, [CLI, ...args], { env: { ...process.env, CALENDARIO_CUENTA: 'agenda@negocio.mx', ...env } }, (e, salida, error) =>
    r({ codigo: e ? (typeof e.code === 'number' ? e.code : 1) : 0, salida, error })))
}

test('CLI: sin --aplica es un dry-run que imprime el plan y no crea el espejo ni llama a nadie', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'calendario-cli-'))
  const espejo = join(dir, 'espejo.json')
  const r = await cli(['crea', '--calendario', 'trabajo', '--titulo', 'Demo', '--inicio', '2026-10-20T16:00:00Z', '--fin', '2026-10-20T17:00:00Z', '--invitado', 'cliente@otra.com', '--notificar', 'todos', '--espejo', espejo])
  assert.equal(r.codigo, 0, r.error)
  const p = JSON.parse(r.salida)
  assert.equal(p.aplicado, false)
  assert.equal(p.irreversible, true)
  await assert.rejects(stat(espejo))
})

test('CLI: aplicar algo que notifica a invitados sin --confirmo-notificar sale con 2 y no escribe', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'calendario-cli-'))
  const espejo = join(dir, 'espejo.json')
  const base = ['crea', '--proveedor', 'simulador', '--calendario', 'trabajo', '--titulo', 'Demo', '--inicio', '2026-10-20T16:00:00Z', '--fin', '2026-10-20T17:00:00Z', '--invitado', 'cliente@otra.com', '--espejo', espejo, '--aplica']
  const sinConfirmar = await cli([...base, '--notificar', 'todos'])
  assert.equal(sinConfirmar.codigo, 2)
  assert.equal(JSON.parse(sinConfirmar.error).error, 'requiere-confirmacion')
  const sinNotificar = await cli(base)
  assert.equal(sinNotificar.codigo, 0, sinNotificar.error)
  const guardado = JSON.parse(await readFile(espejo, 'utf8'))
  assert.equal(guardado.eventos.length, 1)
  const consulta = await cli(['consulta', '--calendario', 'trabajo', '--desde', '2026-10-19T00:00:00Z', '--hasta', '2026-10-26T00:00:00Z', '--espejo', espejo])
  assert.equal(JSON.parse(consulta.salida).instancias.length, 1)
})

test('CLI: un --notificar o --alcance fuera de su lista sale con 2 antes de planear o escribir (no se cuela como `todos`)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'calendario-cli-'))
  const espejo = join(dir, 'espejo.json')
  const crea = ['crea', '--proveedor', 'simulador', '--calendario', 'trabajo', '--titulo', 'Demo', '--inicio', '2026-10-20T16:00:00Z', '--fin', '2026-10-20T17:00:00Z', '--invitado', 'cliente@otra.com', '--espejo', espejo]
  const casos = [
    [...crea, '--notificar', 'foo'],
    [...crea, '--notificar', 'foo', '--confirmo-notificar', '--aplica'],
    ['actualiza', '--calendario', 'trabajo', '--evento', 'e1', '--alcance', 'casi', '--espejo', espejo],
  ]
  for (const args of casos) {
    const r = await cli(args)
    assert.equal(r.codigo, 2, r.salida)
    assert.match(JSON.parse(r.error).mensaje, /^--(notificar|alcance) .*se espera/)
  }
  await assert.rejects(stat(espejo), 'nada llego a escribir el espejo')
})

test('CLI: una consulta con fechas que no se leen, o con la ventana al reves, sale con 2 en vez de contestar «no hay nada»', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'calendario-cli-'))
  for (const [desde, hasta] of [['basura', '2026-10-26T00:00:00Z'], ['2026-10-26T00:00:00Z', '2026-10-19T00:00:00Z']]) {
    const r = await cli(['consulta', '--calendario', 'trabajo', '--desde', desde as string, '--hasta', hasta as string, '--espejo', join(dir, 'espejo.json')])
    assert.equal(r.codigo, 2, r.salida)
    assert.equal(r.salida, '')
  }
})

test('CLI: una cuenta vacia es una cuenta que falta, y una orden desconocida se dice antes que lo que le falta', async () => {
  const vacia = await cli(['sincroniza', '--calendario', 'trabajo'], { CALENDARIO_CUENTA: '' })
  assert.equal(vacia.codigo, 2)
  assert.match(JSON.parse(vacia.error).mensaje, /falta --cuenta/)
  const orden = await cli(['agenda'], { CALENDARIO_CUENTA: '' })
  assert.equal(orden.codigo, 2)
  assert.equal(JSON.parse(orden.error).mensaje, 'orden desconocida: agenda')
})
