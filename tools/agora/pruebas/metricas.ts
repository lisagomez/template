/** Fase 6 · la suite de metricas (cada comprobación sobre una base nueva: algunas cambian el estado). */
import { test } from 'node:test'
import { corre, preparada } from './_marco.ts'
import { METRICAS } from './_suite-metricas.ts'

for (const k of METRICAS) {
  test(`[${k.tipo}] ${k.nombre}`, async () => {
    const b = await preparada()
    try {
      const [r] = await corre(b.c, [k])
      if (!r!.ok) throw new Error(r!.error)
    } finally { await b.cierra() }
  })
}
