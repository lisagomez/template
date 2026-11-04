/**
 * El reloj de las pruebas (`_reloj.ts`): la base y el código leen la misma hora, la de AHORA_DE_PRUEBAS, y avanza.
 * Si alguien quita el import de `_base.ts` o rompe el desplazamiento, cae aquí el mismo día, no al cambiar de mes.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
// Por `_marco.ts`, como las demás suites, y NUNCA de `_reloj.ts` directo: importarlo aquí instalaría el reloj por su
// cuenta y la prueba no vería que `_base.ts` dejó de hacerlo (pasó en la primera contraprueba, 2026-11-04).
import { preparada, AHORA_DE_PRUEBAS, relojDeLaCorrida } from './_marco.ts'

const contraPostgres = Boolean(process.env.AGORA_PG_URL)

test('[reloj] la base y el código leen la hora de las pruebas, no la de hoy', { skip: contraPostgres && 'contra PostgreSQL real el reloj es el del servidor' }, async () => {
  const b = await preparada()
  try {
    const [r] = await b.base.consulta<{ ms: string }>('select (extract(epoch from now()) * 1000)::bigint::text ms')
    const enLaBase = Number(r!.ms)
    const enElCodigo = Date.now()
    const objetivo = Date.parse(AHORA_DE_PRUEBAS)
    assert.ok(Math.abs(enLaBase - enElCodigo) < 5_000, `la base y el código discrepan ${enLaBase - enElCodigo} ms (${relojDeLaCorrida})`)
    assert.ok(enElCodigo >= objetivo && enElCodigo - objetivo < 10 * 60_000, `el código va en ${new Date(enElCodigo).toISOString()}, no en ${AHORA_DE_PRUEBAS}`)
  } finally {
    await b.cierra()
  }
})

test('[reloj] el tiempo sigue avanzando desde ahí', async () => {
  const antes = Date.now()
  await new Promise((ok) => setTimeout(ok, 50))
  assert.ok(Date.now() - antes >= 40, 'el reloj de las pruebas se quedó quieto')
})
