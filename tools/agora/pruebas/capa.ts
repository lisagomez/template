/** Fase 7 · la suite del testigo del freno (cada comprobación sobre una base nueva: algunas cambian el estado). */
import { test } from 'node:test'
import { corre, preparada } from './_marco.ts'
import { CAPA } from './_suite-capa.ts'

for (const k of CAPA) {
  test(`[${k.tipo}] ${k.nombre}`, async () => {
    const b = await preparada()
    try {
      const [r] = await corre(b.c, [k])
      if (!r!.ok) throw new Error(r!.error)
    } finally { await b.cierra() }
  })
}
