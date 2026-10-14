/**
 * El agente como Forward Deployed Engineer: el playbook por consultora y su Agent Card.
 *
 * El FDE vive con la consultora: recibe su histórico, lo mapea y limpia, configura el workspace,
 * arma soluciones a medida, mide el impacto y devuelve al núcleo lo que sirve a todas. Propone; el
 * HIL aprueba. No toca los sistemas del cliente. Lo que hizo a medida y lo que propuso al núcleo
 * queda registrado: esa frontera es la que la corrida B usa para el concepto «producto».
 */

export type EtapaFde = 'onboarding' | 'mapeo_limpieza' | 'configuracion' | 'solucion_a_medida' | 'impacto' | 'vuelta_al_nucleo'

export interface DefinicionEtapa {
  readonly etapa: EtapaFde
  readonly capacidad: string
  readonly queHace: string
  /** Lo que el HIL aprueba en esta etapa, o null si no hay aprobación (solo se registra). */
  readonly apruebaHil: string | null
  readonly registro: string
}

export const PLAYBOOK_FDE: readonly DefinicionEtapa[] = [
  { etapa: 'onboarding', capacidad: 'fde-recibe-historico', queHace: 'recibe el histórico de tickets de la consultora', apruebaHil: null, registro: 'crudo inmutable con su huella' },
  { etapa: 'mapeo_limpieza', capacidad: 'fde-propone-mapeo', queHace: 'propone el mapeo al esquema contextual y limpia', apruebaHil: 'el mapeo, versionado', registro: 'entrada = mapeadas + revisión + descartadas' },
  { etapa: 'configuracion', capacidad: 'fde-configura-workspace', queHace: 'arma el workspace: clientes, contratos y categorías', apruebaHil: 'la configuración', registro: 'versión del workspace' },
  { etapa: 'solucion_a_medida', capacidad: 'fde-propone-solucion', queHace: 'reglas, CLIs y flujos para lo recurrente de esa consultora', apruebaHil: 'cada propuesta', registro: 'a medida' },
  { etapa: 'impacto', capacidad: 'fde-mide-impacto', queHace: 'mide el impacto con la capa semántica', apruebaHil: null, registro: 'impacto con su fórmula' },
  { etapa: 'vuelta_al_nucleo', capacidad: 'fde-propone-al-nucleo', queHace: 'propone al sandbox lo que sirve a todas las consultoras', apruebaHil: 'la propuesta al núcleo', registro: 'al núcleo' },
] as const

export type Alcance = 'a_medida' | 'nucleo'

export interface TrabajoFde {
  readonly consultora: string
  readonly etapa: EtapaFde
  readonly alcance: Alcance
  readonly que: string
  /** Por qué es a medida o por qué sirve a todas: sin motivo no se registra. */
  readonly motivo: string
  readonly estado: 'propuesto' | 'aprobado' | 'rechazado'
}

export interface RegistroFde {
  readonly trabajos: readonly TrabajoFde[]
}

export const registroVacio = (): RegistroFde => ({ trabajos: [] })

/** Agrega un trabajo. La vuelta al núcleo siempre es «nucleo»; la solución a medida, «a_medida». */
export function registra(r: RegistroFde, t: Omit<TrabajoFde, 'estado'>): RegistroFde {
  if (!t.motivo.trim()) throw new Error('un trabajo del FDE sin motivo no se registra')
  if (t.etapa === 'vuelta_al_nucleo' && t.alcance !== 'nucleo') throw new Error('la vuelta al núcleo es alcance «nucleo»')
  if (t.etapa === 'solucion_a_medida' && t.alcance !== 'a_medida') throw new Error('una solución a medida es alcance «a_medida»')
  return { trabajos: [...r.trabajos, { ...t, estado: 'propuesto' }] }
}

/** El HIL decide. El FDE no puede: `quien` es el humano que aprueba y debe venir de la sesión. */
export function decide(r: RegistroFde, indice: number, decision: 'aprobado' | 'rechazado', quien: { tipo: 'humano' | 'agente' }): RegistroFde {
  if (quien.tipo !== 'humano') throw new Error('solo un humano decide sobre lo que propone el FDE')
  const t = r.trabajos[indice]
  if (!t) throw new Error(`no hay trabajo ${indice}`)
  if (t.estado !== 'propuesto') throw new Error('ya está decidido')
  return { trabajos: r.trabajos.map((x, i) => (i === indice ? { ...x, estado: decision } : x)) }
}

/** Lo que quedó a medida y lo que se propuso al núcleo, por consultora. */
export function fronteraNucleo(r: RegistroFde): Record<string, { aMedida: string[]; alNucleo: string[] }> {
  const out: Record<string, { aMedida: string[]; alNucleo: string[] }> = {}
  for (const t of r.trabajos) {
    const c = (out[t.consultora] ??= { aMedida: [], alNucleo: [] })
    ;(t.alcance === 'a_medida' ? c.aMedida : c.alNucleo).push(`${t.que} (${t.estado})`)
  }
  return out
}

/** Las fronteras negativas, literales: lo que la Agent Card dice que el agente NO hace. */
export const FRONTERAS_NEGATIVAS = [
  'no aprueba: ninguna aprobación la escribe un agente',
  'no toca los sistemas SAP del cliente: trabaja con lo que la consultora entrega y con el simulador',
  'no da el veredicto de una regla: lo da el motor determinista del grafo',
  'no se cambia solo: su automejora sale como propuesta (CDC)',
  'no saca documentos del perímetro: OCR local',
] as const

export interface HabilidadCard {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly tags: readonly string[]
}

export const DESCRIPCION_FDE = `Forward Deployed Engineer de Soporte SAP. ${FRONTERAS_NEGATIVAS.join('; ')}.`

/**
 * Las habilidades de la Agent Card: una por etapa del playbook. La tarjeta la arma la app con los
 * tipos del SDK A2A pineado (como `src/features/a2a/tarjeta.ts`); el núcleo no importa el SDK.
 */
export function habilidadesFde(): HabilidadCard[] {
  return PLAYBOOK_FDE.map((e) => ({
    id: e.capacidad,
    name: e.queHace,
    description: `${e.queHace}. Aprueba el HIL: ${e.apruebaHil ?? 'nada (se registra)'}.`,
    tags: ['fde', e.etapa],
  }))
}
