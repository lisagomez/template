/**
 * Contratos SLA como DATOS versionados y el reloj que mide cada incidencia contra ellos. El reloj es
 * la ÚNICA definición de «minutos de respuesta» y «minutos de resolución» por ticket: lo usan el
 * espacio de trabajo del consultor (el reloj corriendo, con sus tramos) y la carga de
 * `ss_sla_resultado`, de donde la capa semántica saca el cumplimiento. Ninguna superficie lo recalcula.
 *
 * Ninguna cifra es inventada: cada meta cita su fuente pública o queda en `null` («por decidir»). Los
 * créditos, las exclusiones y el texto legal los decide el laboratorio: aquí van en blanco, y la
 * plantilla del documento (`contratos/plantilla-contrato-sla.md`) también. El laboratorio no
 * compromete disponibilidad antes de GATE 3 y solo compromete lo que controla.
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

/** Una cifra que decide el laboratorio: mientras no la decida, `valor` es `null` y la pantalla lo dice. */
export interface PorDecidir<T> { readonly valor: T | null; readonly quienDecide: string }

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
  /** Qué se mide con este contrato (lo que la otra parte puede exigir). */
  readonly objeto: string
  /** Quién categoriza la prioridad (en N2–N3: el agente, y el cliente puede impugnar). */
  readonly categorizacion: string
  /** A quién se escala y cuándo (operativo, sin plazos inventados). */
  readonly escalamiento: ReadonlyArray<{ readonly a: string; readonly cuando: string }>
  readonly creditos: PorDecidir<{ readonly porcentaje: number; readonly tope: number }>
  readonly exclusiones: PorDecidir<readonly string[]>
  readonly disponibilidad: PorDecidir<number>
  /** D8 (PRP-012): los días que viven los originales tras la última resolución; `null`, no vencen (DP-4). */
  readonly retencionOriginalesDias: PorDecidir<number>
  /** D8: los días de gracia tras registrar la salida, para descargar el export; `null`, no se borra (DP-4). */
  readonly graciaSalidaDias: PorDecidir<number>
  /** De dónde sale cada cifra y cada cláusula que no es una meta. */
  readonly notas: readonly string[]
}

/** La fuente pública de las dos metas del laboratorio (consultada el 2026-10-04). */
export const FUENTE_SAP_ES =
  'SAP Enterprise Support Schedule (en, CA, v10-2018), §2.1.1 a y b: https://assets.cdn.sap.com/agreements/product-use-and-support-terms/sup/sap-enterprise-support-schedule-canada-english-v10-2018.pdf'

const LABORATORIO_DECIDE = 'el laboratorio (texto y cifra legales: no los fija un agente)'
const SIN_META = (motivo: string): MetaSla => ({ respuestaMin: null, resolucionMin: null, calendario: 'habil', fuente: motivo })
const NOTAS_CALENDARIO = 'calendario hábil: lunes a viernes 09:00–18:00 de la Ciudad de México; feriados: Ley Federal del Trabajo, art. 74 (los de 2026)'

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
    objeto: 'la atención de la consultora a las incidencias del cliente',
    categorizacion: 'un agente categoriza la prioridad (matriz ITIL de impacto × urgencia) y el cliente puede impugnarla; la resuelve su consultora',
    escalamiento: [
      { a: 'consultor de la consultora', cuando: 'toda incidencia, al recibirla' },
      { a: 'laboratorio (experto HIL)', cuando: 'sin regla en el grafo, o un plan que pide aprobación en la sala' },
    ],
    creditos: { valor: null, quienDecide: LABORATORIO_DECIDE },
    exclusiones: { valor: null, quienDecide: LABORATORIO_DECIDE },
    disponibilidad: { valor: null, quienDecide: 'no se compromete antes de GATE 3' },
    retencionOriginalesDias: { valor: null, quienDecide: 'el laboratorio con su asesoría legal (D8, DP-4)' },
    graciaSalidaDias: { valor: null, quienDecide: 'el laboratorio con su asesoría legal (D8, DP-4)' },
    notas: [
      'metas de REFERENCIA tomadas del soporte de SAP a sus licenciatarios, no comprometidas por el laboratorio',
      NOTAS_CALENDARIO,
      'cambio de prioridad: la meta de la prioridad vigente, contada desde la recepción (supuesto del laboratorio; la consultora puede pactar «desde el cambio»)',
      'resolución: sin meta hasta que la consultora la pacte; el reloj la mide igual',
      'el laboratorio ve lo que la consultora le escala; el cliente lo sabe por este contrato',
    ],
  }
}

/**
 * El contrato N1–N2 (laboratorio → consultora). El laboratorio solo compromete lo que controla: la
 * respuesta a lo que la consultora le escala. Sus metas quedan POR DECIDIR (no hay una referencia
 * pública para el servicio de un laboratorio a sus consultoras), y la disponibilidad de la plataforma
 * no se compromete antes de GATE 3.
 */
export function contratoN1N2DeLaboratorio(consultora: string, vigenteDesde: string): ContratoSla {
  const porDecidir = SIN_META('por decidir por el laboratorio: respuesta a escalamientos')
  return {
    id: `sla-n1-${consultora}`, version: 1, nivel: 'N1-N2', consultora, cliente: null, vigenteDesde,
    calendario: CALENDARIO_CDMX, cambioDePrioridad: 'desde_recepcion',
    metas: { P1: porDecidir, P2: porDecidir, P3: porDecidir, P4: porDecidir },
    objeto: 'la respuesta del laboratorio a lo que la consultora le escala (sandbox, sala y núcleo)',
    categorizacion: 'la prioridad del escalamiento es la de la incidencia escalada',
    escalamiento: [{ a: 'superadministrador del laboratorio', cuando: 'un escalamiento sin respuesta del experto' }],
    creditos: { valor: null, quienDecide: LABORATORIO_DECIDE },
    exclusiones: { valor: null, quienDecide: LABORATORIO_DECIDE },
    disponibilidad: { valor: null, quienDecide: 'no se compromete antes de GATE 3' },
    retencionOriginalesDias: { valor: null, quienDecide: 'el laboratorio con su asesoría legal (D8, DP-4)' },
    graciaSalidaDias: { valor: null, quienDecide: 'el laboratorio con su asesoría legal (D8, DP-4)' },
    notas: [
      'el laboratorio solo compromete lo que controla',
      NOTAS_CALENDARIO,
      'D13: se mide en la cadena de cada incidencia escalada, de la escalada a la primera decisión de una persona del laboratorio en la sala (respuestaDelLaboratorio); la cifra, hasta GATE 3',
      'un caso escalado sin plan no tiene reloj: el laboratorio lo atiende por el chat, que no registra una respuesta',
    ],
  }
}

/** Lo que hace una persona del laboratorio en la sala sobre un plan escalado: su respuesta para el contrato N1–N2 (D13). */
export const DECISIONES_DEL_LABORATORIO: readonly string[] = ['APROBADA', 'RECHAZADA', 'A_REVISION']

/**
 * D13: lo único que compromete el laboratorio en N1–N2, su respuesta a lo que la consultora le escala. Va de la escalada
 * (el evento de la consultora, a su nombre) a la primera decisión de una persona del laboratorio en la sala, con las
 * fechas que pone la base; sin respuesta, cuenta hasta `ahora`. Sin escalada, null. Son minutos continuos: el calendario
 * y la cifra los fija el laboratorio, hasta GATE 3.
 */
export function respuestaDelLaboratorio(eventos: ReadonlyArray<{ readonly tipo: string; readonly fecha: string }>, ahora: string):
  { readonly escaladaEn: string; readonly respondidaEn: string | null; readonly minutos: number } | null {
  const escalada = eventos.find((e) => e.tipo === 'ESCALADA')
  if (!escalada) return null
  const respuesta = eventos.find((e) => DECISIONES_DEL_LABORATORIO.includes(e.tipo) && e.fecha >= escalada.fecha)
  const hasta = respuesta?.fecha ?? ahora
  return { escaladaEn: escalada.fecha, respondidaEn: respuesta?.fecha ?? null, minutos: Math.max(0, Math.round((Date.parse(hasta) - Date.parse(escalada.fecha)) / 60_000)) }
}

/** Una versión nueva de un contrato: lo que cambia, desde cuándo. La anterior no se toca. */
export function nuevaVersion(c: ContratoSla, cambios: Partial<Omit<ContratoSla, 'id' | 'version' | 'nivel' | 'consultora' | 'cliente'>>, vigenteDesde: string): ContratoSla {
  if (Date.parse(vigenteDesde) <= Date.parse(c.vigenteDesde)) throw new Error('una versión nueva rige DESPUÉS de la anterior')
  return { ...c, ...cambios, version: c.version + 1, vigenteDesde }
}

/** La versión que regía en un instante (la incidencia se mide con el contrato vigente al recibirla). */
export function vigenteEn(versiones: readonly ContratoSla[], instante: string): ContratoSla | null {
  const t = Date.parse(instante)
  return [...versiones].filter((v) => Date.parse(v.vigenteDesde) <= t).sort((a, b) => b.version - a.version)[0] ?? null
}

export type TipoEventoSla = 'RECIBIDA' | 'PRIMERA_RESPUESTA' | 'ESPERA_CLIENTE' | 'RESPUESTA_CLIENTE' | 'RESUELTA' | 'REABIERTA' | 'CERRADA' | 'CAMBIO_PRIORIDAD'

export interface EventoSla { readonly tipo: TipoEventoSla; readonly fecha: string; readonly prioridad?: Prioridad }

/** Un tramo del reloj de resolución: la evidencia de por qué cuenta lo que cuenta. */
export interface Tramo {
  readonly desde: string
  readonly hasta: string
  readonly estado: 'corre' | 'pausa' | 'detenido'
  readonly minutos: number
  /** El evento que abrió el tramo. */
  readonly porque: TipoEventoSla
}

/**
 * La alerta interna de un reloj ABIERTO: al 80 % de la meta se escala (SUPUESTO del laboratorio:
 * es un aviso operativo para el consultor, no una cláusula del contrato); pasada la meta, vencida.
 */
export const ALERTA_AL = 0.8
export type Alerta = 'en_plazo' | 'escala' | 'vencida'

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
  readonly contrato: string
  readonly tramos: readonly Tramo[]
  /** Solo con meta y con el reloj todavía abierto; `null` si no hay meta o ya terminó. */
  readonly alertaRespuesta: Alerta | null
  readonly alertaResolucion: Alerta | null
  /** Un incumplimiento que ocurrió con una prioridad anterior: se queda aunque la prioridad cambie después (R3-02). */
  readonly incumplidaAntesDelCambio: boolean
}

const cumple = (min: number, meta: number | null, terminado: boolean): boolean | null =>
  meta === null ? null : min <= meta ? (terminado ? true : null) : false

const alerta = (min: number, meta: number | null, terminado: boolean): Alerta | null =>
  meta === null || terminado ? null : min > meta ? 'vencida' : min >= meta * ALERTA_AL ? 'escala' : 'en_plazo'

/**
 * Mide una incidencia contra su contrato a la fecha `corte`. Reglas del reloj:
 * - arranca al RECIBIRLA, en el calendario de la meta (hábil o continuo): lo recibido fuera de
 *   horario empieza a contar al abrir;
 * - la espera del cliente lo PAUSA (de ESPERA_CLIENTE a RESPUESTA_CLIENTE) y solo pausa la resolución;
 * - resolver lo DETIENE, también durante una pausa; una reapertura lo REANUDA desde la reapertura;
 * - un cambio de prioridad aplica la meta nueva según `cambioDePrioridad` del contrato, pero un incumplimiento que ya
 *   ocurrió con la prioridad anterior SE QUEDA: bajar la prioridad después de vencer la meta no lo borra (PRP-010,
 *   tercera revisión: R3-02).
 */
export function relojSla(eventos: readonly EventoSla[], prioridadInicial: Prioridad, contrato: ContratoSla, corte: string): ResultadoSla {
  const r = relojSinHistoria(eventos, prioridadInicial, contrato, corte)
  // Cada cambio de prioridad se mide con la prioridad que regía justo antes: si la meta ya estaba vencida, se queda.
  let respuestaVencida = false, resolucionVencida = false
  for (const c of eventos.filter((e) => e.tipo === 'CAMBIO_PRIORIDAD' && e.prioridad && Date.parse(e.fecha) <= Date.parse(corte))) {
    const previos = eventos.filter((e) => Date.parse(e.fecha) < Date.parse(c.fecha))
    if (!previos.some((e) => e.tipo === 'RECIBIDA')) continue
    const antes = relojSinHistoria(previos, prioridadInicial, contrato, c.fecha)
    respuestaVencida ||= antes.alertaRespuesta === 'vencida' || antes.cumpleRespuesta === false
    resolucionVencida ||= antes.alertaResolucion === 'vencida' || antes.cumpleResolucion === false
  }
  return {
    ...r,
    cumpleRespuesta: respuestaVencida ? false : r.cumpleRespuesta,
    cumpleResolucion: resolucionVencida ? false : r.cumpleResolucion,
    incumplidaAntesDelCambio: respuestaVencida || resolucionVencida,
  }
}

function relojSinHistoria(eventos: readonly EventoSla[], prioridadInicial: Prioridad, contrato: ContratoSla, corte: string): ResultadoSla {
  const ev = [...eventos].sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha))
  const recibida = ev.find((e) => e.tipo === 'RECIBIDA')
  if (!recibida) throw new Error('una incidencia sin RECIBIDA no tiene reloj')
  const ultimoCambio = ev.filter((e) => e.tipo === 'CAMBIO_PRIORIDAD' && e.prioridad).at(-1)
  const prioridad = ultimoCambio?.prioridad ?? prioridadInicial
  const meta = contrato.metas[prioridad]
  const cal = meta.calendario === 'continuo' ? continuo(contrato.calendario) : contrato.calendario
  const t = (iso: string) => Date.parse(iso)
  const fin = t(corte)
  const desde = contrato.cambioDePrioridad === 'desde_el_cambio' && ultimoCambio ? t(ultimoCambio.fecha) : t(recibida.fecha)
  const iso = (x: number) => new Date(x).toISOString()

  const respondida = ev.find((e) => e.tipo === 'PRIMERA_RESPUESTA')
  const respuestaMin = minutosHabiles(cal, desde, Math.max(desde, respondida ? t(respondida.fecha) : fin))

  const tramos: Tramo[] = []
  let estado = 'corre' as Tramo['estado'], inicio = desde, porque: TipoEventoSla = ultimoCambio && contrato.cambioDePrioridad === 'desde_el_cambio' ? 'CAMBIO_PRIORIDAD' : 'RECIBIDA'
  // El tramo en curso se emite aunque dure cero: si el corte cae en el mismo milisegundo que el evento que lo abrió (la
  // vista se calcula justo después de la acción), sin él la pantalla no decía que el reloj se reanudó (PRP-010, fase 5).
  const cierra = (x: number, enCurso = false) => { if (x > inicio || (enCurso && x === inicio)) tramos.push({ desde: iso(inicio), hasta: iso(x), estado, minutos: minutosHabiles(cal, inicio, x), porque }) }
  const pasa = (x: number, nuevo: Tramo['estado'], e: TipoEventoSla) => { cierra(x); estado = nuevo; inicio = x; porque = e }
  for (const e of ev) {
    const x = t(e.fecha)
    if (x < desde || x > fin) continue
    if (e.tipo === 'ESPERA_CLIENTE' && estado === 'corre') pasa(x, 'pausa', e.tipo)
    else if (e.tipo === 'RESPUESTA_CLIENTE' && estado === 'pausa') pasa(x, 'corre', e.tipo)
    else if (e.tipo === 'RESUELTA' && estado !== 'detenido') pasa(x, 'detenido', e.tipo)
    else if (e.tipo === 'REABIERTA' && estado === 'detenido') pasa(x, 'corre', e.tipo)
  }
  if (estado !== 'detenido') cierra(fin, true)
  const suma = (s: Tramo['estado']) => tramos.filter((x) => x.estado === s).reduce((a, x) => a + x.minutos, 0)
  const resuelta = estado === 'detenido'
  const total = suma('corre')

  return {
    prioridad, respuestaMin, resolucionMin: total,
    metaRespuestaMin: meta.respuestaMin, metaResolucionMin: meta.resolucionMin,
    cumpleRespuesta: cumple(respuestaMin, meta.respuestaMin, Boolean(respondida)),
    cumpleResolucion: cumple(total, meta.resolucionMin, resuelta),
    pausadoMin: suma('pausa'), estado: resuelta ? 'resuelta' : 'abierta',
    reabierta: ev.some((e) => e.tipo === 'REABIERTA'), esperoCliente: ev.some((e) => e.tipo === 'ESPERA_CLIENTE'),
    contrato: `${contrato.id} v${contrato.version}`, tramos,
    alertaRespuesta: alerta(respuestaMin, meta.respuestaMin, Boolean(respondida)),
    alertaResolucion: alerta(total, meta.resolucionMin, resuelta),
    incumplidaAntesDelCambio: false,
  }
}
