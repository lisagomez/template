/**
 * Limpieza y enriquecimiento del histórico de una consultora, después del mapeo. El crudo es
 * inmutable: nada aquí lo cambia, y cada valor limpio o enriquecido dice de dónde salió (su
 * original, la regla y la fuente). Toda fila de entrada termina limpia, en revisión o descartada con
 * motivo: la cuenta cierra.
 *
 *   · Limpieza: tickets de prueba y duplicados (por id de origen o por cliente + título + minuto
 *     de alta) se descartan con el id que los absorbe; el cliente se resuelve contra el catálogo de la
 *     consultora (exacto, sin adivinar: lo que no casa va a revisión); espacios y módulo por
 *     transacción.
 *   · Enriquecimiento: prioridad del categorizador ITIL (se SUGIERE: la de la consultora no se pisa),
 *     categoría y regla del grafo con su fuente, y el contrato SLA aplicable.
 */
import { categoriza, transaccionDe } from './categoriza.js'
import { consultaMatriz, type EntradaMatriz, type MotorReglas } from './matriz.js'
import type { IncidenciaCanonica, ResultadoMapeo } from './mapeo.js'
import type { Sistema } from './simulador.js'

export interface Rastro {
  readonly campo: string
  readonly original: string | null
  readonly valor: string | null
  readonly regla: string
  readonly fuente: string
}

export interface IncidenciaLimpia extends IncidenciaCanonica {
  readonly clienteId: string
}

export interface ResultadoLimpieza {
  readonly limpias: ReadonlyArray<{ readonly indice: number; readonly incidencia: IncidenciaLimpia; readonly rastro: readonly Rastro[] }>
  readonly revision: ReadonlyArray<{ readonly indice: number; readonly motivos: readonly string[] }>
  readonly descartadas: ReadonlyArray<{ readonly indice: number; readonly motivo: string }>
  readonly cuenta: { readonly entrada: number; readonly limpias: number; readonly revision: number; readonly descartadas: number; readonly cuadra: boolean }
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()
const sinRazonSocial = (s: string) => norm(s).replace(/\s*(s a de c v|s de r l de c v|s a p i de c v|sa de cv)\s*$/, '').trim()
const DIEZ_MIN = 10 * 60_000

function claveCercana(i: IncidenciaCanonica): string {
  return `${norm(i.cliente)}|${norm(i.titulo)}|${Math.floor(Date.parse(i.creada) / DIEZ_MIN)}`
}

/** Limpia lo mapeado. `catalogo` son los clientes de la consultora (id y nombre). */
export function limpia(m: ResultadoMapeo, catalogo: ReadonlyArray<{ id: string; nombre: string }>): ResultadoLimpieza {
  const vistosId = new Map<string, number>()
  const vistosCerca = new Map<string, number>()
  const limpias: Array<ResultadoLimpieza['limpias'][number]> = []
  const revision: Array<ResultadoLimpieza['revision'][number]> = m.revision.map((r) => ({ indice: r.indice, motivos: r.motivos }))
  const descartadas: Array<ResultadoLimpieza['descartadas'][number]> = []
  const porNombre = new Map(catalogo.map((c) => [sinRazonSocial(c.nombre), c.id]))
  for (const { indice, incidencia: i, procedencia } of m.mapeadas) {
    if (/^(prueba|test)\b/i.test(i.titulo.trim())) { descartadas.push({ indice, motivo: 'ticket de prueba' }); continue }
    const previo = vistosId.get(i.idOrigen) ?? vistosCerca.get(claveCercana(i))
    if (previo !== undefined) { descartadas.push({ indice, motivo: `duplicado de la fila ${previo} (${i.idOrigen})` }); continue }
    vistosId.set(i.idOrigen, indice)
    vistosCerca.set(claveCercana(i), indice)
    const clienteId = porNombre.get(sinRazonSocial(i.cliente))
    if (!clienteId) { revision.push({ indice, motivos: [`cliente no reconocido en el catálogo: «${i.cliente}»`] }); continue }
    const rastro: Rastro[] = procedencia.map((p) => ({ campo: p.campo, original: p.original, valor: p.valor, regla: p.regla, fuente: `columna ${p.columna}` }))
    rastro.push({ campo: 'clienteId', original: i.cliente, valor: clienteId, regla: 'catálogo de clientes (exacto, sin razón social)', fuente: 'workspace de la consultora' })
    const titulo = i.titulo.replace(/\s+/g, ' ').trim()
    if (titulo !== i.titulo) rastro.push({ campo: 'titulo', original: i.titulo, valor: titulo, regla: 'espacios', fuente: 'limpieza' })
    const transaccion = i.transaccion ?? transaccionDe(`${i.titulo} ${i.descripcion}`)
    if (transaccion && !i.transaccion) rastro.push({ campo: 'transaccion', original: null, valor: transaccion, regla: 'transacción leída del texto', fuente: 'categorizador' })
    limpias.push({ indice, rastro, incidencia: { ...i, titulo, transaccion, clienteId } })
  }
  const entrada = m.cuenta.entrada
  return { limpias, revision, descartadas, cuenta: { entrada, limpias: limpias.length, revision: revision.length, descartadas: descartadas.length, cuadra: limpias.length + revision.length + descartadas.length === entrada } }
}

export interface IncidenciaEnriquecida extends IncidenciaLimpia {
  readonly prioridadSugerida: string
  readonly discrepanciaPrioridad: boolean
  readonly categoria: string | null
  readonly regla: string | null
  readonly contratoSla: string | null
}

export interface ContextoEnriquecimiento {
  readonly motor: MotorReglas
  readonly matriz: readonly EntradaMatriz[]
  readonly sistemaDe: (clienteId: string) => Sistema
  readonly contratoDe: (clienteId: string) => string | null
}

/** Enriquece lo limpio. Cada campo nuevo deja su rastro con la regla y la fuente. */
export function enriquece(r: ResultadoLimpieza, ctx: ContextoEnriquecimiento): Array<{ indice: number; incidencia: IncidenciaEnriquecida; rastro: Rastro[] }> {
  return r.limpias.map(({ indice, incidencia: i, rastro }) => {
    const texto = `${i.titulo}\n${i.descripcion}`
    const c = categoriza(texto)
    const m = consultaMatriz(ctx.motor, ctx.matriz, texto, ctx.sistemaDe(i.clienteId))
    const regla = m.tipo === 'sin_solucion' ? null : m.entrada.regla
    const contrato = ctx.contratoDe(i.clienteId)
    const extra: Rastro[] = [
      { campo: 'prioridadSugerida', original: i.prioridad, valor: c.prioridad, regla: 'matriz ITIL de impacto × urgencia', fuente: c.razones.join('; ') },
      { campo: 'regla', original: null, valor: regla, regla: m.tipo, fuente: m.tipo === 'sin_solucion' ? m.razon : m.fuente.cita },
      { campo: 'contratoSla', original: null, valor: contrato, regla: 'contrato N2–N3 vigente del cliente', fuente: 'contratos versionados' },
    ]
    return {
      indice, rastro: [...rastro, ...extra],
      incidencia: { ...i, prioridadSugerida: c.prioridad, discrepanciaPrioridad: i.prioridad !== null && i.prioridad !== c.prioridad, categoria: m.tipo === 'sin_solucion' ? null : m.entrada.categoria, regla, contratoSla: contrato },
    }
  })
}
