/** Fase 5 · la suite de coordinador (cada comprobación sobre una base nueva: algunas cambian el estado). */
import { test } from 'node:test'
import { corre, preparada } from './_marco.ts'
import { COORDINADOR } from './_suite-coordinador.ts'

for (const k of COORDINADOR) {
  test(`[${k.tipo}] ${k.nombre}`, async () => {
    const b = await preparada()
    try {
      const [r] = await corre(b.c, [k])
      if (!r!.ok) throw new Error(r!.error)
    } finally { await b.cierra() }
  })
}
