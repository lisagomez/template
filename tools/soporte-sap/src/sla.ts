/**
 * Contratos SLA como DATOS versionados y el reloj que mide cada incidencia contra ellos. El reloj es
 * la ÚNICA definición de «minutos de respuesta» y «minutos de resolución» por ticket: lo usan el
 * espacio de trabajo del consultor (el reloj corriendo) y la carga de `ss_sla_resultado`, de donde la
 * capa semántica saca el cumplimiento. Ninguna superficie lo recalcula.
 *
 * Ninguna meta es inventada: cada una cita su fuente pública o queda en `null` («por decidir», la
 * fija la consultora con su cliente). El laboratorio no compromete disponibilidad antes de GATE 3.
 */
import { CALENDARIO_CDMX, continuo, minutosHabiles, type Calendario } from './calendario.js'
import type { Prioridad } from './categoriza.js'

export interface MetaSla {
  /** Minutos (hábiles o continuos, según `calendario`) hasta la primera respuesta; `null` = sin meta. */
  readonly respuestaMin: number | null
  readonly resolucionMin: number | null
  readonly calendario: 'habil' | 'continuo'
  readonly fuente: string
}

export interface ContratoSla {
  readonly id: string
  readonly version: number
  readonly nivel: 'N1-N2' | 'N2-N3'
  readonly consultora: string
  /** `null` en un contrato N1–N2 (laboratorio → consultora). */
  readonly cliente: string | null
  readonly vigenteDesde: string
  readonly calendario: Calendario
  /** Si la prioridad cambia: la meta nueva se cuenta desde la recepción o desde el cambio. */
  readonly cambioDePrioridad: 'desde_recepcion' | 'desde_el_cambio'
  readonly metas: Readonly<Record<Prioridad, MetaSla>>
  /** De dónde sale cada cifra y cada cláusula que no es una meta. */
  readonly notas: readonly string[]
}

/** La fuente pública de las dos metas del laboratorio (consultada el 2026-10-04). */
export const FUENTE_SAP_ES =
  'SAP Enterprise Support Schedule (en, CA, v10-2018), §2.1.1 a y b: https://assets.cdn.sap.com/agreements/product-use-and-support-terms/sup/sap-enterprise-support-schedule-canada-english-v10-2018.pdf'

const SIN_META = (motivo: string): MetaSla => ({ respuestaMin: null, resolucionMin: null, calendario: 'habil', fuente: motivo })

/**
 * El contrato N2–N3 del laboratorio. Toma como REFERENCIA las dos únicas metas que SAP publica para
 * su propio soporte (respuesta P1 en una hora, 24×7; respuesta P2 en cuatro horas en horario local);
 * no son una promesa del laboratorio ni de la consultora. La «acción correctiva» de P1 (§2.1.2) no es
 * una resolución y el laboratorio no la registra como evento: queda sin meta, igual que P3 y P4.
 */
export function contratoDeLaboratorio(consultora: string, cliente: string, vigenteDesde: string): ContratoSla {
  return {
    id: `sla-${cliente}`, version: 1, nivel: 'N2-N3', consultora, cliente, vigenteDesde,
    calendario: CALENDARIO_CDMX, cambioDePrioridad: 'desde_recepcion',
    metas: {
      P1: { respuestaMin: 60, resolucionMin: null, calendario: 'continuo', fuente: `${FUENTE_SAP_ES} (P1 «very high»: una hora, 24×7)` },
      P2: { respuestaMin: 240, resolucionMin: null, calendario: 'habil', fuente: `${FUENTE_SAP_ES} (P2 «high»: cuatro horas en horario local)` },
      P3: SIN_META('sin referencia pública: la fija la consultora con su cliente'),
      P4: SIN_META('sin referencia pública: la fija la consultora con su cliente'),
    },
    notas: [
      'metas de REFERENCIA tomadas del soporte de SAP a sus licenciatarios, no comprometidas por el laboratorio',
      'calendario hábil: lunes a viernes 09:00–18:00 de la Ciudad de México; feriados: Ley Federal del Trabajo, art. 74 (los de 2026)',
      'cambio de prioridad: la meta de la prioridad vigente, contada desde la recepción (supuesto del laboratorio; la consultora puede pactar «desde el cambio»)',
      'resolución: sin meta hasta que la consultora la pacte; el reloj la mide igual',
    ],
  }
}

export type TipoEventoSla = 'RECIBIDA' | 'PRIMERA_RESPUESTA' | 'ESPERA_CLIENTE' | 'RESPUESTA_CLIENTE' | 'RESUELTA' | 'REABIERTA' | 'CERRADA' | 'CAMBIO_PRIORIDAD'

export interface EventoSla { readonly tipo: TipoEventoSla; readonly fecha: string; readonly prioridad?: Prioridad }

export interface ResultadoSla {
  readonly prioridad: Prioridad
  readonly respuestaMin: number | null
  readonly resolucionMin: number | null
  readonly metaRespuestaMin: number | null
  readonly metaResolucionMin: number | null
  /** `null` = sin meta, o todavía en plazo. `false` en cuanto se pasa, aunque no haya respondido. */
  readonly cumpleRespuesta: boolean | null
  readonly cumpleResolucion: boolean | null
  readonly pausadoMin: number
  readonly estado: 'resuelta' | 'abierta'
  readonly reabierta: boolean
  readonly esperoCliente: boolean
}

const cumple = (min: number, meta: number | null, terminado: boolean): boolean | null =>
  meta === null ? null : min <= meta ? (terminado ? true : null) : false

/**
 * Mide una incidencia contra su contrato a la fecha `corte`. Reglas del reloj:
 * - arranca al RECIBIRLA, en el calendario de la meta (hábil o continuo): lo recibido fuera de
 *   horario empieza a contar al abrir;
 * - la espera del cliente lo PAUSA (de ESPERA_CLIENTE a RESPUESTA_CLIENTE) y solo pausa la resolución;
 * - una reapertura lo REANUDA desde la reapertura: el tiempo entre resolver y reabrir no cuenta;
 * - un cambio de prioridad aplica la meta nueva según `cambioDePrioridad` del contrato.
 */
export function relojSla(eventos: readonly EventoSla[], prioridadInicial: Prioridad, contrato: ContratoSla, corte: string): ResultadoSla {
  const ev = [...eventos].sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha))
  const recibida = ev.find((e) => e.tipo === 'RECIBIDA')
  if (!recibida) throw new Error('una incidencia sin RECIBIDA no tiene reloj')
  const cambios = ev.filter((e) => e.tipo === 'CAMBIO_PRIORIDAD' && e.prioridad)
  const ultimoCambio = cambios.at(-1)
  const prioridad = ultimoCambio?.prioridad ?? prioridadInicial
  const meta = contrato.metas[prioridad]
  const cal = meta.calendario === 'continuo' ? continuo(contrato.calendario) : contrato.calendario
  const t = (iso: string) => Date.parse(iso)
  const fin = t(corte)
  const desde = contrato.cambioDePrioridad === 'desde_el_cambio' && ultimoCambio ? t(ultimoCambio.fecha) : t(recibida.fecha)

  const respondida = ev.find((e) => e.tipo === 'PRIMERA_RESPUESTA')
  const respuestaMin = minutosHabiles(cal, desde, Math.max(desde, respondida ? t(respondida.fecha) : fin))

  let corriendoDesde: number | null = desde, total = 0, pausado = 0, pausaDesde: number | null = null, resuelta = false
  for (const e of ev) {
    const x = t(e.fecha)
    if (x < desde || x > fin) continue
    if (e.tipo === 'ESPERA_CLIENTE' && corriendoDesde !== null) { total += minutosHabiles(cal, corriendoDesde, x); corriendoDesde = null; pausaDesde = x }
    else if (e.tipo === 'RESPUESTA_CLIENTE' && pausaDesde !== null) { pausado += minutosHabiles(cal, pausaDesde, x); pausaDesde = null; if (!resuelta) corriendoDesde = x }
    else if (e.tipo === 'RESUELTA' && corriendoDesde !== null) { total += minutosHabiles(cal, corriendoDesde, x); corriendoDesde = null; resuelta = true }
    else if (e.tipo === 'REABIERTA') { resuelta = false; corriendoDesde = x }
  }
  if (corriendoDesde !== null) total += minutosHabiles(cal, corriendoDesde, fin)
  if (pausaDesde !== null) pausado += minutosHabiles(cal, pausaDesde, fin)

  return {
    prioridad, respuestaMin, resolucionMin: total,
    metaRespuestaMin: meta.respuestaMin, metaResolucionMin: meta.resolucionMin,
    cumpleRespuesta: cumple(respuestaMin, meta.respuestaMin, Boolean(respondida)),
    cumpleResolucion: cumple(total, meta.resolucionMin, resuelta),
    pausadoMin: pausado, estado: resuelta ? 'resuelta' : 'abierta',
    reabierta: ev.some((e) => e.tipo === 'REABIERTA'), esperoCliente: ev.some((e) => e.tipo === 'ESPERA_CLIENTE'),
  }
}
