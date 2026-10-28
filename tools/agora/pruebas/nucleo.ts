/** Fase 1 · la suite del núcleo, en verde sobre una base sembrada (PGlite, o Postgres real con AGORA_PG_URL). */
import { after, before, test } from 'node:test'
import { corre, preparada } from './_marco.ts'
import { NUCLEO } from './_suite-nucleo.ts'

let b: Awaited<ReturnType<typeof preparada>>
before(async () => { b = await preparada() })
after(async () => { await b?.cierra() })

for (const k of NUCLEO) {
  test(`[${k.tipo}] ${k.nombre}`, async () => {
    const [r] = await corre(b.c, [k])
    if (!r!.ok) throw new Error(r!.error)
  })
}
