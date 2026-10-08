/**
 * El job que calcula el resultado de SLA de cada incidencia DESDE LA BASE (PRP-010 H-16). Lee la fecha de alta que
 * puso la base, los eventos de la cadena (que la base fecha y encadena, H-13) y el contrato N2–N3 vigente al
 * recibirla, y usa `relojSla`: la MISMA función que la app, así que no hay dos definiciones del reloj. Corre con el
 * rol de plataforma y el token de su tarea, y escribe solo en `ss_sla_resultado` de su consultora.
 *
 * Ausente no es cero: sin contrato válido o sin prioridad inicial NO inventa un resultado. Lo omite y dice por qué.
 */
import { relojSla, vigenteEn, type ContratoSla, type EventoSla, type TipoEventoSla, type ResultadoSla } from './sla.js'
import type { Prioridad } from './categoriza.js'
import type { Consulta } from './respaldo.js'

const TIPOS_DEL_RELOJ: ReadonlySet<string> = new Set<TipoEventoSla>(['PRIMERA_RESPUESTA', 'ESPERA_CLIENTE', 'RESPUESTA_CLIENTE', 'RESUELTA', 'REABIERTA', 'CERRADA', 'CAMBIO_PRIORIDAD'])
const PRIORIDADES: ReadonlySet<string> = new Set(['P1', 'P2', 'P3', 'P4'])
const ISO = (col: string) => `to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`

export interface EventoDeLaBase { readonly tipo: string; readonly fecha: string; readonly datos: Readonly<Record<string, unknown>> }
export interface Omitida { readonly incidencia: string; readonly motivo: string }
export interface CorridaSla { readonly calculadas: number; readonly omitidas: readonly Omitida[] }

/** Lo que el reloj necesita, tal como sale de la base: arranca en la fecha de alta y sigue los eventos del reloj. */
export function entradaDelReloj(alta: string, eventos: readonly EventoDeLaBase[]): { eventos: EventoSla[]; prioridadInicial: Prioridad | null } {
  const categorizada = eventos.find((e) => e.tipo === 'CATEGORIZADA')?.datos['prioridad']
  const reloj: EventoSla[] = [{ tipo: 'RECIBIDA', fecha: alta }]
  for (const e of eventos) {
    if (!TIPOS_DEL_RELOJ.has(e.tipo)) continue
    const prioridad = e.tipo === 'CAMBIO_PRIORIDAD' && PRIORIDADES.has(String(e.datos['prioridad'])) ? (String(e.datos['prioridad']) as Prioridad) : undefined
    reloj.push({ tipo: e.tipo as TipoEventoSla, fecha: e.fecha, ...(prioridad ? { prioridad } : {}) })
  }
  return { eventos: reloj, prioridadInicial: PRIORIDADES.has(String(categorizada)) ? (String(categorizada) as Prioridad) : null }
}

/** ¿Es un contrato que el reloj sabe medir? Uno a medias (`{}`) no da un resultado. */
function esContrato(c: unknown): c is ContratoSla {
  const k = c as Partial<ContratoSla> | null
  return !!k && typeof k.id === 'string' && typeof k.version === 'number' && k.nivel === 'N2-N3' && typeof k.vigenteDesde === 'string'
    && !!k.metas && ['P1', 'P2', 'P3', 'P4'].every((p) => k.metas![p as Prioridad] !== undefined) && !!k.calendario
}

export async function calculaResultadosSla(q: Consulta, consultora: string, corte: string): Promise<CorridaSla> {
  const incidencias = await q<{ id: string; cliente_id: string; alta: string }>(
    `select id, cliente_id, ${ISO('creada_en')} as alta from public.ss_incidencia where consultora_id = $1 order by creada_en`, [consultora])
  const omitidas: Omitida[] = []
  let calculadas = 0
  for (const i of incidencias) {
    const filas = await q<{ id: string; version: number; contenido: unknown }>(
      `select id, version, contenido from public.ss_contrato_sla where cliente_id = $1 and nivel = 'N2-N3'`, [i.cliente_id])
    const versiones = filas.filter((f) => esContrato(f.contenido) && f.contenido.id === f.id && f.contenido.version === f.version).map((f) => f.contenido as ContratoSla)
    const contrato = vigenteEn(versiones, i.alta)
    if (!contrato) { omitidas.push({ incidencia: i.id, motivo: 'sin contrato N2-N3 válido vigente al recibirla' }); continue }
    const eventos = await q<EventoDeLaBase>(`select tipo, ${ISO('fecha')} as fecha, datos from public.ss_evento where incidencia_id = $1 order by seq`, [i.id])
    const entrada = entradaDelReloj(i.alta, eventos)
    if (!entrada.prioridadInicial) { omitidas.push({ incidencia: i.id, motivo: 'sin prioridad inicial: falta el evento CATEGORIZADA' }); continue }
    await guarda(q, consultora, i, contrato, relojSla(entrada.eventos, entrada.prioridadInicial, contrato, corte))
    calculadas++
  }
  return { calculadas, omitidas }
}

async function guarda(q: Consulta, consultora: string, i: { id: string; cliente_id: string }, k: ContratoSla, r: ResultadoSla): Promise<void> {
  const min = (x: number | null) => (x === null ? null : Math.round(x))
  await q(`insert into public.ss_sla_resultado (incidencia_id, contrato_id, contrato_version, consultora_id, cliente_id, respuesta_min, resolucion_min,
      meta_respuesta_min, meta_resolucion_min, cumple_respuesta, cumple_resolucion, prioridad, estado, pausado_min, reabierta, espero_cliente, calculado_en)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())
    on conflict (incidencia_id, contrato_id, contrato_version) do update set respuesta_min = excluded.respuesta_min,
      resolucion_min = excluded.resolucion_min, meta_respuesta_min = excluded.meta_respuesta_min, meta_resolucion_min = excluded.meta_resolucion_min,
      cumple_respuesta = excluded.cumple_respuesta, cumple_resolucion = excluded.cumple_resolucion, prioridad = excluded.prioridad,
      estado = excluded.estado, pausado_min = excluded.pausado_min, reabierta = excluded.reabierta, espero_cliente = excluded.espero_cliente,
      calculado_en = excluded.calculado_en`,
  [i.id, k.id, k.version, consultora, i.cliente_id, min(r.respuestaMin), min(r.resolucionMin), r.metaRespuestaMin, r.metaResolucionMin,
    r.cumpleRespuesta, r.cumpleResolucion, r.prioridad, r.estado, Math.round(r.pausadoMin), r.reabierta, r.esperoCliente])
}
