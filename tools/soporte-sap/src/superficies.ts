/**
 * Las superficies del producto que muestran métricas: los tableros N1, N2 y N3, el estado del SLA,
 * los insumos del pricing y la respuesta del chat. TODAS leen el corte semántico con `leeMetrica` y
 * NINGUNA calcula: no suman, no promedian, no dividen (la prueba `semantica.ts` lo vigila en el código
 * y con un valor centinela). Si el corte no tiene el dato, la superficie dice «sin dato».
 */
import { leeMetrica, filasVisibles, SinAcceso, GRUPO_MINIMO, type Corte, type Lector, type Lectura } from './corte.js'
import type { ContratoSla } from './sla.js'

/** Lo que muestra cada tablero de operación. */
export const METRICAS_OPERACION = ['volumen', 'resueltas', 'mttr_horas', 'primera_respuesta_horas', 'resolucion_primer_contacto',
  'tasa_reapertura', 'backlog', 'cumplimiento_sla_respuesta', 'cumplimiento_sla_resolucion'] as const
export const METRICAS_INTERNAS = ['reuso_conocimiento', 'horas_consultor', 'horas_por_ticket', 'salud_cuenta'] as const
export const ETAPAS = ['alta', 'onboarding', 'adopcion', 'operacion', 'renovacion'] as const

export type Tarjeta = Lectura & { readonly nombre: string }

const tarjeta = (corte: Corte, lector: Lector, metrica: string, periodo: string, donde: Omit<Parameters<typeof leeMetrica>[2], 'metrica' | 'periodo'>): Tarjeta =>
  ({ nombre: metrica, ...leeMetrica(corte, lector, { metrica, periodo, ...donde }) })

/** N1 (superadministrador, experto): agregados del laboratorio, por consultora y por tamaño; nunca un cliente. */
export function tableroN1(corte: Corte, periodo: string) {
  const l: Lector = { nivel: 'N1' }
  // Las consultoras que el laboratorio ve EN ESE periodo: un grupo chico se suprime por mes (D14).
  const consultoras = [...new Set(filasVisibles(corte, l, 'volumen').filter((f) => f.alcance === 'consultora' && f.periodo === periodo).map((f) => f.consultora!))].sort()
  return {
    periodo,
    total: [...METRICAS_OPERACION, ...METRICAS_INTERNAS].map((m) => tarjeta(corte, l, m, periodo, { alcance: 'total' })),
    porConsultora: consultoras.map((c) => ({
      consultora: c,
      tarjetas: [...METRICAS_OPERACION, ...METRICAS_INTERNAS].map((m) => tarjeta(corte, l, m, periodo, { alcance: 'consultora', consultora: c })),
    })),
    porTamano: (['S', 'M', 'L'] as const).map((t) => ({ tamano: t, tarjetas: METRICAS_OPERACION.map((m) => tarjeta(corte, l, m, periodo, { alcance: 'tamano', tamano: t })) })),
    cartera: ETAPAS.map((e) => tarjeta(corte, l, 'clientes_en_cartera', periodo, { alcance: 'total', etapa: e })),
  }
}

/** N2 (consultora): lo suyo y cada cliente suyo, con su etapa, su salud y su riesgo de baja. */
export function tableroN2(corte: Corte, consultora: string, periodo: string) {
  const l: Lector = { nivel: 'N2', consultora }
  const clientes = [...new Set(filasVisibles(corte, l, 'volumen').filter((f) => f.alcance === 'cliente').map((f) => f.cliente!))].sort()
  const etapaDe = (cliente: string) => filasVisibles(corte, l, 'clientes_en_cartera')
    .find((f) => f.alcance === 'cliente' && f.cliente === cliente && f.periodo === periodo && f.valor !== null)?.etapa ?? null
  return {
    periodo, consultora,
    propio: [...METRICAS_OPERACION, ...METRICAS_INTERNAS, 'cobertura_mapeo'].map((m) => tarjeta(corte, l, m, periodo, { alcance: 'consultora', consultora })),
    cartera: ETAPAS.map((e) => tarjeta(corte, l, 'clientes_en_cartera', periodo, { alcance: 'consultora', consultora, etapa: e })),
    clientes: clientes.map((c) => ({
      cliente: c, etapa: etapaDe(c),
      tarjetas: [...METRICAS_OPERACION, ...METRICAS_INTERNAS, 'riesgo_de_baja'].map((m) => tarjeta(corte, l, m, periodo, { alcance: 'cliente', consultora, cliente: c })),
    })),
  }
}

/** N3 (cliente): solo lo suyo y solo lo que la métrica declara visible al cliente. */
export function tableroN3(corte: Corte, consultora: string, cliente: string, periodo: string) {
  const l: Lector = { nivel: 'N3', consultora, cliente }
  const visibles = corte.metricas.filter((m) => m.visibleAlCliente && !m.auxiliar && m.nombre !== 'tiempo_al_primer_valor_dias').map((m) => m.nombre)
  return { periodo, cliente, tarjetas: visibles.map((m) => tarjeta(corte, l, m, periodo, { alcance: 'cliente', consultora, cliente })) }
}

/** El SLA de un contrato: metas del contrato (dato) y cumplimiento del corte (al grano del contrato). */
export function estadoSla(corte: Corte, lector: Lector, contrato: ContratoSla, periodo: string) {
  const donde = contrato.nivel === 'N2-N3'
    ? { alcance: 'cliente' as const, consultora: contrato.consultora, cliente: contrato.cliente! }
    : { alcance: 'consultora' as const, consultora: contrato.consultora }
  return {
    contrato: `${contrato.id} v${contrato.version}`, periodo, metas: contrato.metas, notas: contrato.notas,
    respuesta: tarjeta(corte, lector, 'cumplimiento_sla_respuesta', periodo, donde),
    resolucion: tarjeta(corte, lector, 'cumplimiento_sla_resolucion', periodo, donde),
    primeraRespuestaHoras: tarjeta(corte, lector, 'primera_respuesta_horas', periodo, donde),
    mttrHoras: tarjeta(corte, lector, 'mttr_horas', periodo, donde),
  }
}

/** Las variables del pricing salen del corte, nunca de una cuenta propia (el precio en sí es «por decidir»). */
export function insumosPricing(corte: Corte, lector: Lector, consultora: string, periodo: string, cliente?: string) {
  const donde = cliente ? { alcance: 'cliente' as const, consultora, cliente } : { alcance: 'consultora' as const, consultora }
  return {
    periodo, consultora, cliente: cliente ?? null,
    volumen: tarjeta(corte, lector, 'volumen', periodo, donde),
    horasConsultor: tarjeta(corte, lector, 'horas_consultor', periodo, donde),
    horasPorTicket: tarjeta(corte, lector, 'horas_por_ticket', periodo, donde),
    mttrHoras: tarjeta(corte, lector, 'mttr_horas', periodo, donde),
    cumplimientoSlaRespuesta: tarjeta(corte, lector, 'cumplimiento_sla_respuesta', periodo, donde),
    proporcionCritica: tarjeta(corte, lector, 'proporcion_critica', periodo, donde),
    proporcionCompleja: tarjeta(corte, lector, 'proporcion_compleja', periodo, donde),
    clientesEnCartera: cliente ? null : ETAPAS.map((e) => tarjeta(corte, lector, 'clientes_en_cartera', periodo, { alcance: 'consultora', consultora, etapa: e })),
  }
}

// --- El chat: una pregunta sobre una métrica se contesta con el corte y su fuente, o con «no lo sé» --

const MESES: Readonly<Record<string, string>> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06', julio: '07', agosto: '08',
  septiembre: '09', setiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
}

const sinAcentos = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')

/** Sinónimos con los que alguien nombra una métrica en el chat (además de su etiqueta y su nombre). */
const SINONIMOS: Readonly<Record<string, readonly string[]>> = {
  mttr_horas: ['mttr', 'tiempo medio de resolucion', 'tiempo de resolucion'],
  primera_respuesta_horas: ['primera respuesta', 'tiempo de respuesta'],
  cumplimiento_sla_respuesta: ['sla de respuesta', 'cumplimiento de sla', 'cumplimiento del sla'],
  cumplimiento_sla_resolucion: ['sla de resolucion'],
  resolucion_primer_contacto: ['primer contacto', 'fcr'],
  backlog: ['backlog', 'pendientes', 'abiertas'],
  volumen: ['volumen', 'cuantas incidencias', 'cuantos tickets'],
  salud_cuenta: ['salud'],
  riesgo_de_baja: ['riesgo de baja', 'churn'],
  horas_por_ticket: ['horas por ticket', 'horas por incidencia'],
  horas_consultor: ['horas de consultor', 'horas trabajadas'],
  reuso_conocimiento: ['reuso', 'solucion conocida'],
  tasa_reapertura: ['reapertura', 'reabiertas'],
}

export interface RespuestaChat { readonly tipo: 'valor' | 'no_lo_se'; readonly texto: string; readonly valor: number | null; readonly fuente: string | null }

/**
 * Contesta una pregunta del chat del HIL sobre una métrica. `entidades` son los nombres que el lector
 * puede mencionar (id → nombre visible). El texto de la pregunta es DATO: no se ejecuta nada de él.
 */
export function respondeMetrica(corte: Corte, lector: Lector, pregunta: string, entidades: Readonly<Record<string, { tipo: 'consultora' | 'cliente'; nombre: string; consultora?: string }>>): RespuestaChat {
  const p = sinAcentos(pregunta)
  const metrica = Object.entries(SINONIMOS).find(([, ss]) => ss.some((s) => p.includes(s)))?.[0]
    ?? corte.metricas.find((m) => !m.auxiliar && (p.includes(sinAcentos(m.etiqueta)) || p.includes(m.nombre)))?.nombre
  const mes = Object.entries(MESES).find(([n]) => p.includes(n))
  const anio = p.match(/\b(20\d{2})\b/)?.[1] ?? corte.corte.slice(0, 4)
  const periodo = p.match(/\b(20\d{2}-\d{2})\b/)?.[1] ?? (mes ? `${anio}-${mes[1]}` : null)
  const ent = Object.entries(entidades).find(([id, e]) => p.includes(sinAcentos(e.nombre)) || p.includes(id))
  const noSe = (por: string): RespuestaChat => ({ tipo: 'no_lo_se', texto: `No lo sé: ${por}. No respondo sin una fuente.`, valor: null, fuente: null })
  if (!metrica) return noSe('no reconozco una métrica del catálogo en la pregunta')
  if (!periodo) return noSe('falta el periodo (un mes y su año)')
  const donde = !ent
    ? (lector.nivel === 'N1' ? { alcance: 'total' as const } : lector.nivel === 'N2' ? { alcance: 'consultora' as const, consultora: lector.consultora } : { alcance: 'cliente' as const, consultora: lector.consultora, cliente: lector.cliente })
    : ent[1].tipo === 'consultora' ? { alcance: 'consultora' as const, consultora: ent[0] } : { alcance: 'cliente' as const, consultora: ent[1].consultora, cliente: ent[0] }
  try {
    const r = leeMetrica(corte, lector, { metrica, periodo, ...donde })
    if (r.suprimida) return noSe(`el laboratorio no ve ese agregado: su grupo tiene menos de ${GRUPO_MINIMO} clientes, o se despejaría restando (D14)`)
    if (r.valor === null) return noSe(`la capa semántica no tiene dato de ${r.metrica.etiqueta} para ${periodo}`)
    return { tipo: 'valor', texto: `${r.metrica.etiqueta} (${periodo}): ${r.valor} ${r.metrica.unidad ?? ''}`.trim(), valor: r.valor, fuente: r.fuente }
  } catch (e) {
    if (e instanceof SinAcceso) return noSe('eso no está en lo que tu nivel puede ver')
    throw e
  }
}
