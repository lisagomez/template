/**
 * El almacen de Supabase contra un Postgres REAL y efimero (PGlite, en proceso): la migracion se aplica
 * dos veces, con los roles de Supabase (`anon`, `authenticated`) y `auth.uid()`. Se prueba el caso
 * MALO: un dueño no ve ni toca lo de otro, `anon` no ejecuta nada, y ninguna politica es `USING (true)`.
 * Nada de esto toca una base real.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { Lector, Pluma, Reservas, sincroniza, type Reserva } from '../dist/index.js'
import { AlmacenSupabase, type ClienteRpc } from '../dist/almacenes/supabase.js'
import { SimuladorGoogle } from '../dist/simulador/index.js'
import { calendario, relojDePrueba, TRABAJO, ZONA } from './_base.ts'

const SQL = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'migraciones', '0001_calendario.sql'), 'utf8')
const SUPABASE_MINIMO = `
create role anon nologin; create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
`
const A = '10000000-0000-4000-8000-0000000000a1'
const B = '10000000-0000-4000-8000-0000000000b1'
const CONJUNTOS = new Set(['calendario_calendarios', 'calendario_eventos', 'calendario_excepciones', 'calendario_intenciones', 'calendario_reservas'])

async function base(): Promise<PGlite> {
  const db = new PGlite({ extensions: { btree_gist } })
  await db.exec(SUPABASE_MINIMO)
  await db.exec(SQL)
  await db.exec(SQL) // idempotente: aplicarla dos veces no rompe nada
  return db
}

/** Lo que haria PostgREST con el JWT del usuario: rol `authenticated` y su `sub`, en una transaccion. */
function como(db: PGlite, rol: 'authenticated' | 'anon', usuario: string | null): ClienteRpc {
  return {
    rpc: async (f, args = {}) => {
      const nombres = Object.keys(args)
      const valores = nombres.map((n) => {
        const v = args[n]
        return n === 'p_ids' || v === null || typeof v !== 'object' ? v : JSON.stringify(v)
      })
      try {
        const filas = await db.transaction(async (tx) => {
          await tx.exec(`set local role ${rol}`)
          await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [usuario ?? ''])
          return (await tx.query<{ r: unknown }>(`select public.${f}(${nombres.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`, valores)).rows
        })
        const datos = filas.map((x) => x.r)
        return { data: CONJUNTOS.has(f) ? datos : datos[0] ?? null, error: null }
      } catch (e) {
        return { data: null, error: { message: e instanceof Error ? e.message : String(e) } }
      }
    },
  }
}

function escenario(db: PGlite, usuario: string) {
  const reloj = relojDePrueba('2026-10-19T08:00:00-06:00')
  const sim = new SimuladorGoogle({ reloj })
  sim.agregaCalendario(calendario(TRABAJO, 'Trabajo'))
  const almacen = new AlmacenSupabase(como(db, 'authenticated', usuario))
  const pluma = new Pluma({ proveedor: sim, almacen, reloj })
  const lector = new Lector({ almacen, reloj })
  return { reloj, sim, proveedor: sim, almacen, pluma, lector }
}

const semana = { calendarios: [TRABAJO], desde: Date.parse('2026-10-19T06:00:00Z'), hasta: Date.parse('2026-10-26T06:00:00Z'), zona: ZONA }

test('la migracion: idempotente, RLS en todas sus tablas y ninguna politica `USING (true)`', async () => {
  const db = await base()
  const tablas = (await db.query<{ relname: string; relrowsecurity: boolean }>(`select relname, relrowsecurity from pg_class where relname like 'calendario\\_%' and relkind = 'r' order by 1`)).rows
  assert.equal(tablas.length, 5)
  assert.ok(tablas.every((t) => t.relrowsecurity), JSON.stringify(tablas))
  const politicas = (await db.query<{ qual: string }>(`select qual from pg_policies where tablename like 'calendario\\_%'`)).rows
  assert.equal(politicas.length, 5)
  assert.ok(politicas.every((p) => p.qual.includes('auth.uid()')))
  assert.doesNotMatch(SQL.replace(/--.*$/gm, ''), /using\s*\(\s*true\s*\)/i)
})

test('contrato: pluma, sincronizacion y lector funcionan igual sobre Supabase (serie partida incluida)', async () => {
  const db = await base()
  const b = escenario(db, A)
  b.sim.siembra(TRABAJO, { titulo: 'Dentista', inicio: '2026-10-20T16:00:00.000Z', fin: '2026-10-20T17:00:00.000Z', zona: ZONA })
  assert.equal((await sincroniza(b, TRABAJO)).error, null)
  const { eventos: [serie] } = await b.pluma.crea(TRABAJO, { titulo: 'Stand-up', inicio: '2026-10-19T15:30:00.000Z', fin: '2026-10-19T15:45:00.000Z', zona: ZONA, recurrencia: ['RRULE:FREQ=DAILY;COUNT=5'] }, { clave: 's' })
  assert.ok(serie)
  const jue = (await b.lector.consulta(semana)).instancias.find((i) => i.titulo === 'Stand-up' && i.inicio.startsWith('2026-10-22'))
  assert.ok(jue)
  await b.pluma.actualiza(jue, { titulo: 'Stand-up nuevo' }, { clave: 'p', alcance: 'siguientes' })
  const titulos = (await b.lector.consulta(semana)).instancias.map((i) => i.titulo)
  // lun, mar (+ dentista), mie con el titulo viejo; jue y vie, la cola, con el nuevo: COUNT=5 se conserva.
  assert.deepEqual(titulos, ['Stand-up', 'Stand-up', 'Dentista', 'Stand-up', 'Stand-up nuevo', 'Stand-up nuevo'])
  assert.equal((await b.pluma.crea(TRABAJO, { titulo: 'x', inicio: '2026-10-21T16:00:00.000Z', fin: '2026-10-21T17:00:00.000Z', zona: ZONA }, { clave: 's' })).repetida, true)
})

test('RLS, el caso malo: B no ve, no lee por id, no borra ni pisa lo de A', async () => {
  const db = await base()
  const a = escenario(db, A)
  const { eventos: [ev] } = await a.pluma.crea(TRABAJO, { titulo: 'Privado de A', inicio: '2026-10-20T16:00:00.000Z', fin: '2026-10-20T17:00:00.000Z', zona: ZONA }, { clave: 'a1' })
  assert.ok(ev)
  const almacenB = new AlmacenSupabase(como(db, 'authenticated', B))
  assert.equal((await almacenB.eventos([TRABAJO], semana)).length, 0)
  assert.equal(await almacenB.evento(TRABAJO, ev.id), null)
  await almacenB.borraEventos(TRABAJO, [ev.id])
  await almacenB.guardaEventos([{ ...ev, titulo: 'Pisado por B' }])
  assert.equal((await a.almacen.evento(TRABAJO, ev.id))?.titulo, 'Privado de A')
  assert.equal((await almacenB.evento(TRABAJO, ev.id))?.titulo, 'Pisado por B', 'B solo escribio en lo suyo')
  assert.equal(await almacenB.resultado('a1'), null, 'la idempotencia de A tampoco se filtra')
})

test('anon no ejecuta ninguna funcion del calendario', async () => {
  const db = await base()
  const anonimo = new AlmacenSupabase(como(db, 'anon', null))
  await assert.rejects(anonimo.calendarios(), /permission denied/)
})

const reserva = (id: string, desde: string, minutos: number, extra: Partial<Reserva> = {}): Reserva => {
  const inicio = Date.parse(desde)
  return { id, recurso: 'agenda@negocio.mx::trabajo', clave: id, inicio, fin: inicio + minutos * 60_000, bloqueDesde: inicio, bloqueHasta: inicio + minutos * 60_000, estado: 'tentativa', expira: Date.parse('2026-10-19T14:10:00Z'), referencia: 'conv', evento: null, creada: Date.parse('2026-10-19T14:00:00Z'), ...extra }
}

test('reserva atomica en la base: 12 simultaneas al mismo bloque → 1; la vencida se libera; otro dueño no choca', async () => {
  const db = await base()
  const a = new AlmacenSupabase(como(db, 'authenticated', A))
  const ahora = Date.parse('2026-10-19T14:00:00Z')
  const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => a.reservaSiLibre(reserva(`r${i}`, '2026-10-19T16:00:00Z', 30), ahora)))
  assert.equal(rs.filter(Boolean).length, 1)
  assert.equal(await a.reservaSiLibre(reserva('solapa', '2026-10-19T16:15:00Z', 30), ahora), false)
  assert.equal(await a.reservaSiLibre(reserva('vence', '2026-10-19T16:15:00Z', 30), Date.parse('2026-10-19T14:20:00Z')), true, 'la tentativa vencida ya no bloquea')
  const b = new AlmacenSupabase(como(db, 'authenticated', B))
  assert.equal(await b.reservaSiLibre(reserva('de-b', '2026-10-19T16:00:00Z', 30), ahora), true)
  assert.equal((await b.reservas('agenda@negocio.mx::trabajo', { desde: 0, hasta: Date.parse('2027-01-01') })).length, 1, 'B solo ve la suya')
})

test('el flujo completo de reservas sobre Supabase: tentativa, segunda rechazada, confirmar y liberar', async () => {
  const db = await base()
  const b = escenario(db, A)
  const reservas = new Reservas({ ...b, recurso: TRABAJO, reglas: { zona: ZONA, horario: [{ dia: 1, desde: '09:00', hasta: '13:00' }], duracionMin: 30 } })
  const t = await reservas.tentativa({ inicio: '2026-10-19T16:00:00.000Z', referencia: 'conv-1', clave: 't1' })
  assert.ok(t.ok)
  const otra = await reservas.tentativa({ inicio: '2026-10-19T16:00:00.000Z', referencia: 'conv-2', clave: 't2' })
  assert.equal(otra.ok ? 'acepto' : otra.motivo, 'ocupado')
  const c = await reservas.confirma(t.reserva.id, { titulo: 'Cita', clave: 'c1' })
  assert.ok(c.ok && c.reserva.evento)
  assert.equal((await b.lector.consulta(semana)).instancias.length, 1)
  assert.ok((await reservas.libera(t.reserva.id, { clave: 'l1' })).ok)
  assert.equal((await b.lector.consulta(semana)).instancias.length, 0)
})
