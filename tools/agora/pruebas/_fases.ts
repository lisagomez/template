/** El padrón de las suites por fase: cada fase con sus comprobaciones y sus sabotajes. Las que vienen se suman aquí. */
import type { Comprobacion, Sabotaje } from './_marco.ts'
import { NUCLEO, SABOTAJES_NUCLEO } from './_suite-nucleo.ts'
import { BUZON, SABOTAJES_BUZON } from './_suite-buzon.ts'

export const FASES: Record<string, { titulo: string; comprobaciones: Comprobacion[]; sabotajes: Sabotaje[] }> = {
  nucleo: { titulo: 'Fase 1 · núcleo de datos: aislamiento entre organizaciones y RLS forzada', comprobaciones: NUCLEO, sabotajes: SABOTAJES_NUCLEO },
  buzon: { titulo: 'Fase 2 · buzón: aprobar fuera de rol lo rechaza la base', comprobaciones: BUZON, sabotajes: SABOTAJES_BUZON },
}
