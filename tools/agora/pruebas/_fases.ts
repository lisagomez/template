/** El padrón de las suites por fase: cada fase con sus comprobaciones y sus sabotajes. Las que vienen se suman aquí. */
import type { Comprobacion, Sabotaje } from './_marco.ts'
import { NUCLEO, SABOTAJES_NUCLEO } from './_suite-nucleo.ts'
import { BUZON, SABOTAJES_BUZON } from './_suite-buzon.ts'
import { TABLERO, SABOTAJES_TABLERO } from './_suite-tablero.ts'
import { LIBRO, SABOTAJES_LIBRO } from './_suite-libro.ts'
import { CONTABILIDAD, SABOTAJES_CONTABILIDAD } from './_suite-contabilidad.ts'
import { COORDINADOR, SABOTAJES_COORDINADOR } from './_suite-coordinador.ts'
import { PUERTA, SABOTAJES_PUERTA } from './_suite-puerta.ts'
import { VIGIA, SABOTAJES_VIGIA } from './_suite-vigia.ts'
import { METRICAS, SABOTAJES_METRICAS } from './_suite-metricas.ts'

export const FASES: Record<string, { titulo: string; comprobaciones: Comprobacion[]; sabotajes: Sabotaje[] }> = {
  nucleo: { titulo: 'Fase 1 · núcleo de datos: aislamiento entre organizaciones y RLS forzada', comprobaciones: NUCLEO, sabotajes: SABOTAJES_NUCLEO },
  buzon: { titulo: 'Fase 2 · buzón: aprobar fuera de rol lo rechaza la base', comprobaciones: BUZON, sabotajes: SABOTAJES_BUZON },
  tablero: { titulo: 'Fase 3 · tablero: ningún agente edita directo', comprobaciones: TABLERO, sabotajes: SABOTAJES_TABLERO },
  libro: { titulo: 'Fase 4 · libro de costos: el cuadre y los 8 malos financieros', comprobaciones: LIBRO, sabotajes: SABOTAJES_LIBRO },
  contabilidad: { titulo: 'Fase 5 · paquete para Contabilidad: partida doble y contrato contable', comprobaciones: CONTABILIDAD, sabotajes: SABOTAJES_CONTABILIDAD },
  coordinador: { titulo: 'Fase 5 · coordinador: nada se aplica sin fila de aprobación', comprobaciones: COORDINADOR, sabotajes: SABOTAJES_COORDINADOR },
  puerta: { titulo: 'Fase 5 · la Puerta A2A (cerrada): sus comprobaciones y llamadas_tras_revocar = 0', comprobaciones: PUERTA, sabotajes: SABOTAJES_PUERTA },
  vigia: { titulo: 'Fase 6 · calendario y vigía: un reintento no duplica eventos', comprobaciones: VIGIA, sabotajes: SABOTAJES_VIGIA },
  metricas: { titulo: 'Fase 6 · métricas: cada cifra sale de una métrica y cuadra con el libro', comprobaciones: METRICAS, sabotajes: SABOTAJES_METRICAS },
}
