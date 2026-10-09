/**
 * Las ENTRADAS de la capa semántica en el laboratorio: lo que el job de métricas podría leer del
 * producto, ni una columna más (los mismos privilegios por columna de la propuesta de esquema: sin
 * títulos, descripciones, nombres ni motivos). Sale del corpus sintético, del reloj de SLA y del
 * mapeo + limpieza de los dos exportes sucios. Determinista: misma semilla, misma huella.
 */
import { createHash, createHmac } from 'node:crypto'
import { similitud, digitoVerificadorRfc, digitoVerificadorCurp } from '../../extractor-documental/dist/index.js'
import {
  generaCorpus, exporteSucio, proponeMapeo, apruebaMapeo, aplicaMapeo, limpia, relojSla, contratoDeLaboratorio, complejidadDe,
  CLIENTES, MATRIZ_LABORATORIO, type CorpusLab,
} from '../dist/index.js'

export type Valor = string | number | boolean | null
export interface Tabla { readonly columnas: readonly string[]; readonly filas: ReadonlyArray<readonly Valor[]> }

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
/** El importador seudonimiza con HMAC y su sal (PRP-010 H-32). Las semillas no guardan el asignado: la sal es del laboratorio. */
const seudonimiza = { sal: 'sal-del-laboratorio-semillas', hmac: (k: string, m: string) => createHmac('sha256', k).update(m).digest('hex') }
export const LABORATORIO = 'laboratorio'
/** El exporte de las herramientas viejas se importó al cierre del corpus (supuesto del laboratorio). */
export const FECHA_IMPORTACION = '2026-09-30T18:00:00.000Z'

/** `AAAA-MM-DD` → el instante de la medianoche UTC de ese día. */
const medianoche = (fecha: string): string => new Date(fecha).toISOString()

type EventoCorpus = CorpusLab['incidencias'][number]['eventos'][number]

function estadoAlCorte(ev: readonly EventoCorpus[]): string {
  const ultimo = ev.at(-1)?.tipo
  if (ultimo === 'CERRADA') return 'cerrada'
  if (ultimo === 'RESUELTA') return 'resuelta'
  if (ultimo === 'ESPERA_CLIENTE') return 'espera_cliente'
  if (ultimo === 'PRIMERA_RESPUESTA' || ultimo === 'RESPUESTA_CLIENTE' || ultimo === 'REABIERTA') return 'en_atencion'
  return 'nueva'
}

const primera = (ev: readonly EventoCorpus[], t: string) => ev.find((e) => e.tipo === t)?.fecha ?? null
const ultima = (ev: readonly EventoCorpus[], t: string) => [...ev].reverse().find((e) => e.tipo === t)?.fecha ?? null

function organizaciones(c: CorpusLab): Tabla {
  return {
    columnas: ['id', 'tipo', 'padre_id', 'creada_en', 'tamano', 'sistema', 'usuarios_sap'],
    filas: [
      [LABORATORIO, 'laboratorio', null, '2026-03-01T00:00:00.000Z', null, null, null],
      ...c.consultoras.map((k) => [k.id, 'consultora', LABORATORIO, medianoche(k.alta), null, null, null] as const),
      ...c.clientes.map((k) => [k.id, 'cliente', k.consultora, medianoche(k.alta), k.tamano, k.sistema, k.usuarios] as const),
    ],
  }
}

function incidencias(c: CorpusLab): { incidencia: Tabla; sla: Tabla; horas: Tabla } {
  const inc: Valor[][] = [], sla: Valor[][] = [], horas: Valor[][] = []
  for (const i of c.incidencias) {
    const ev = i.eventos
    const estado = estadoAlCorte(ev)
    const resuelta = estado === 'resuelta' || estado === 'cerrada' ? ultima(ev, 'RESUELTA') : null
    const cl = c.clientes.find((k) => k.id === i.cliente)!
    const contrato = contratoDeLaboratorio(i.consultora, i.cliente, cl.alta)
    const r = relojSla(ev, i.prioridad, contrato, c.corte)
    const regla = resuelta && i.reglaDeOrigen ? i.reglaDeOrigen : null
    const complejidad = complejidadDe(MATRIZ_LABORATORIO.find((e) => e.regla === i.reglaDeOrigen) ?? null)
    inc.push([i.id, i.consultora, i.cliente, i.sistema, i.modulo, i.prioridad, complejidad, regla, estado, i.creada, primera(ev, 'PRIMERA_RESPUESTA'), resuelta, ultima(ev, 'CERRADA')])
    sla.push([i.id, contrato.id, contrato.version, i.consultora, i.cliente, r.prioridad, r.respuestaMin, r.resolucionMin, r.metaRespuestaMin,
      r.metaResolucionMin, r.cumpleRespuesta, r.cumpleResolucion, r.estado, r.pausadoMin, r.reabierta, r.esperoCliente])
    if (i.minutosConsultor > 0) horas.push([i.consultora, i.cliente, i.id, i.minutosConsultor, (ev.at(-1)?.fecha ?? i.creada).slice(0, 10)])
  }
  return {
    incidencia: { columnas: ['id', 'consultora_id', 'cliente_id', 'sistema', 'modulo', 'prioridad', 'complejidad', 'regla_aplicada', 'estado', 'creada_en', 'primera_respuesta_en', 'resuelta_en', 'cerrada_en'], filas: inc },
    sla: { columnas: ['incidencia_id', 'contrato_id', 'contrato_version', 'consultora_id', 'cliente_id', 'prioridad', 'respuesta_min', 'resolucion_min', 'meta_respuesta_min', 'meta_resolucion_min', 'cumple_respuesta', 'cumple_resolucion', 'estado', 'pausado_min', 'reabierta', 'espero_cliente'], filas: sla },
    horas: { columnas: ['consultora_id', 'cliente_id', 'incidencia_id', 'minutos', 'fecha'], filas: horas },
  }
}

/** Mapeo aprobado por un humano y limpieza de los dos exportes: el resultado de cada fila, sin su contenido. */
function importacion(c: CorpusLab): Tabla {
  const filas: Valor[][] = []
  for (const consultora of ['andina', 'boreal'] as const) {
    const e = exporteSucio(c, consultora)
    const propuesta = proponeMapeo({ consultora, herramienta: e.herramienta, version: 1, columnas: e.columnas, muestras: e.filas, desfaseFechasMin: -360, similitud })
    const m = apruebaMapeo(propuesta, { tipo: 'humano', id: 'usr-experto' }, [])
    const l = limpia(aplicaMapeo(m, e.filas, seudonimiza), CLIENTES.filter((k) => k.consultora === consultora).map((k) => ({ id: k.id, nombre: k.nombre })))
    if (!l.cuenta.cuadra) throw new Error(`la cuenta de ${consultora} no cuadra`)
    const crudo = `crudo-${consultora}-${e.herramienta}`
    for (const x of l.limpias) filas.push([crudo, x.indice, consultora, x.incidencia.clienteId, e.herramienta, 1, 'limpia', FECHA_IMPORTACION])
    for (const x of l.revision) filas.push([crudo, x.indice, consultora, null, e.herramienta, 1, 'revision', FECHA_IMPORTACION])
    for (const x of l.descartadas) filas.push([crudo, x.indice, consultora, null, e.herramienta, 1, 'descartada', FECHA_IMPORTACION])
  }
  filas.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || Number(a[1]) - Number(b[1]))
  return { columnas: ['crudo_id', 'indice', 'consultora_id', 'cliente_id', 'herramienta', 'version_mapeo', 'resultado', 'decidido_en'], filas }
}

export interface Semillas { readonly tablas: Readonly<Record<string, Tabla>>; readonly huella: string; readonly corte: string }

/** Las cinco tablas de entrada y la huella que identifica al corte que salga de ellas. */
export function semillas(): Semillas {
  const c = generaCorpus({ rfc: digitoVerificadorRfc, curp: digitoVerificadorCurp })
  const { incidencia, sla, horas } = incidencias(c)
  const tablas = { ss_organizacion: organizaciones(c), ss_incidencia: incidencia, ss_sla_resultado: sla, ss_horas: horas, ss_importacion_fila: importacion(c) }
  return { tablas, huella: sha256(JSON.stringify(tablas)), corte: c.corte }
}

const celdaCsv = (v: Valor): string => {
  if (v === null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const aCsv = (t: Tabla): string => [t.columnas.join(','), ...t.filas.map((f) => f.map(celdaCsv).join(','))].join('\n') + '\n'
