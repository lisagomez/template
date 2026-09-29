/**
 * La RONDA del dia: lo que hay que hacer hoy en un sitio, sacado de lo que ya sabe el sistema
 * (tablero FEFO, semaforo, bandeja de revisiones, recibo, agente y conteo ciclico), ordenada por el
 * RECORRIDO (recibo → racks del almacen en orden → piso → merma), no por tipo de tarea.
 *
 * - Se genera UNA vez por sitio y dia (determinista: el mismo estado da la misma ronda) y se
 *   guarda como foto del momento con la cabeza de la cadena en que se genero.
 * - Una tarea se cierra con el ESCANEO que la prueba (el lote correcto en la zona correcta): eso
 *   deja un evento TAREA_CERRADA en la cadena con el seudonimo de quien la cerro. No hay «hecho».
 * - Confirmar una revision y contar una ubicacion se cierran con SU evidencia (el RECIBIDO que
 *   resuelve la revision; las lecturas del conteo), sin un segundo escaneo.
 * - Si ya no aplica (el lote se vendio o se movio), se cierra sola y dice por que. Se calcula, no
 *   se escribe: no hay a quien atribuirle ese cierre.
 * - Las instrucciones NO llevan cantidades: las lee el almacenista.
 */
import { hashDe, idLote, type ClaveLote, type Evento } from './cadena.js'
import { cadenaDe } from './expediente.js'
import { tableroSitio, type FilaTablero } from './fefo.js'
import type { EstadoAlmacen, Existencia, Zona } from './modelo.js'
import { recomendaciones } from './riesgo.js'
import { revisionesAbiertas } from './revisiones.js'
import { eligeConteoCiclico } from './conteo-ciclico.js'
import { sumaDiasIso } from './fechas-impresas.js'
import { ubicacionDe, zonaDe } from './ubicaciones.js'

export type TipoTarea = 'retirar' | 'resurtir' | 'promover' | 'confirmar' | 'ubicar' | 'contar'

export interface Tarea {
  readonly id: string
  readonly tipo: TipoTarea
  /** Donde se hace (y donde se escanea para cerrarla). */
  readonly zona: Zona
  readonly ubicacion: string
  readonly sku?: string
  readonly descripcion?: string
  readonly lote?: ClaveLote
  /** retirar: a donde va el lote; resurtir/ubicar: de donde sale. */
  readonly destino?: Zona
  readonly origen?: string
  /** confirmar: el EN_REVISION pendiente. */
  readonly revision?: string
  /** contar: por que se eligio esta ubicacion. */
  readonly razones?: readonly string[]
  readonly instruccion: string
  /** Hora local limite, `HH:MM`: despues esta atrasada y escala al supervisor. */
  readonly hasta: string
  readonly orden: number
}

export interface RondaDia {
  readonly id: string
  readonly sitio: string
  readonly fecha: string
  readonly generada: string
  /** Cabeza de la cadena del sitio al generarla: la ronda dice de que estado salio. */
  readonly cabeza: { readonly seq: number; readonly hash: string }
  readonly tareas: readonly Tarea[]
}

/** Horas limite por tipo (propuesta; se ajustan por instalacion). */
export const LIMITES: Readonly<Record<TipoTarea, string>> = { retirar: '10:00', confirmar: '10:00', ubicar: '12:00', resurtir: '12:00', promover: '14:00', contar: '18:00' }
const PRIORIDAD: readonly TipoTarea[] = ['retirar', 'confirmar', 'ubicar', 'resurtir', 'promover', 'contar']
const ORDEN_ZONA: Readonly<Record<Zona, number>> = { recibo: 0, almacen: 1, piso: 2, merma: 3 }
const fecha = (iso: string) => iso.split('-').reverse().join('/')

type Borrador = Omit<Tarea, 'id' | 'orden' | 'hasta'>

function retiros(t: ReturnType<typeof tableroSitio>): Borrador[] {
  return t.anaquel.filter((f) => f.estado === 'vencido' || f.estado === 'retiro').map((f) => ({
    tipo: 'retirar' as const, zona: 'piso' as const, ubicacion: ubicacionDe('piso'), sku: f.existencia.sku, descripcion: f.descripcion, lote: loteDe(f.existencia),
    destino: f.estado === 'vencido' ? 'merma' as const : 'almacen' as const,
    instruccion: f.estado === 'vencido' ? `Retira del anaquel el lote ${f.existencia.lote} (vencido el ${fecha(f.existencia.caducidad)}): va a merma.` : `Retira del anaquel el lote ${f.existencia.lote} (rojo, caduca ${fecha(f.existencia.caducidad)}): sepáralo en almacén para liquidación, donación o merma.`,
  }))
}

const loteDe = (e: Existencia): ClaveLote => ({ gtin: e.gtin, lote: e.lote, caducidad: e.caducidad })

/** Resurtir: hueco en el anaquel, o un lote en piso que vence DESPUES del primero del almacen (FEFO invertido). */
function resurtidos(estado: EstadoAlmacen, sitio: string, t: ReturnType<typeof tableroSitio>): Borrador[] {
  const enPiso = estado.existencias.filter((e) => e.sitio === sitio && zonaDe(e) === 'piso' && e.cantidad > 0)
  return t.resurtido.flatMap((g) => {
    const primero = g.lotes[0]
    if (!primero) return []
    const piso = enPiso.filter((e) => e.sku === g.sku)
    const invertido = piso.some((e) => e.caducidad > primero.existencia.caducidad)
    if (piso.length > 0 && !invertido) return []
    const e = primero.existencia
    return [{
      tipo: 'resurtir' as const, zona: 'piso' as const, ubicacion: ubicacionDe('piso'), sku: g.sku, descripcion: g.descripcion, lote: loteDe(e), origen: ubicacionDe(zonaDe(e), e.posicion),
      instruccion: `${piso.length === 0 ? 'Hueco en el anaquel' : 'En piso hay un lote que vence después'}: baja primero el lote ${e.lote} (caduca ${fecha(e.caducidad)}) desde ${ubicacionDe(zonaDe(e), e.posicion)}.`,
    }]
  })
}

function promociones(estado: EstadoAlmacen, sitio: string, t: ReturnType<typeof tableroSitio>): Borrador[] {
  const vistos = new Set<string>()
  const de = (f: FilaTablero): Borrador | undefined => {
    if (vistos.has(idLote(loteDe(f.existencia)))) return undefined
    vistos.add(idLote(loteDe(f.existencia)))
    return { tipo: 'promover', zona: 'piso', ubicacion: ubicacionDe('piso'), sku: f.existencia.sku, descripcion: f.descripcion, lote: loteDe(f.existencia), instruccion: `Pon el lote ${f.existencia.lote} (caduca ${fecha(f.existencia.caducidad)}) en exhibición de promoción.` }
  }
  const naranjas = t.porEstado.promocion.filter((f) => f.zona !== 'merma').map(de)
  const agente = recomendaciones(estado, sitio).filter((r) => r.estado === 'pendiente' && ['promocion', 'exhibicion'].includes(String((r.evento.datos['recomendacion'] as { accion?: string } | undefined)?.accion)))
    .map((r) => t.fefo.flatMap((g) => g.lotes).find((f) => idLote(loteDe(f.existencia)) === idLote(r.evento.lote))).filter((f): f is NonNullable<typeof f> => Boolean(f)).map(de)
  return [...naranjas, ...agente].filter((b): b is Borrador => Boolean(b))
}

/** Lo que lleva mas de `horas` en recibo (por la hora de su ultimo evento en la cadena). */
function porUbicar(estado: EstadoAlmacen, sitio: string, ahora: string, horas: number): Borrador[] {
  const cadena = cadenaDe(estado, sitio)
  const vistos = new Set<string>()
  return estado.existencias.filter((e) => e.sitio === sitio && zonaDe(e) === 'recibo' && e.cantidad > 0).flatMap((e) => {
    const k = idLote(loteDe(e))
    if (vistos.has(k)) return []
    vistos.add(k)
    const ultimo = [...cadena].reverse().find((ev) => idLote(ev.lote) === k)
    const h = ultimo ? (Date.parse(ahora) - Date.parse(ultimo.fecha)) / 3_600_000 : Infinity
    if (h < horas) return []
    return [{ tipo: 'ubicar' as const, zona: 'almacen' as const, ubicacion: ubicacionDe('almacen'), sku: e.sku, descripcion: estado.articulos[e.sku]?.descripcion ?? e.sku, lote: loteDe(e), origen: ubicacionDe('recibo'), instruccion: `Ubica en almacén el lote ${e.lote} (lleva ${Number.isFinite(h) ? `${Math.floor(h)} h` : 'tiempo'} en recibo).` }]
  })
}

function porConfirmar(estado: EstadoAlmacen, sitio: string): Borrador[] {
  return revisionesAbiertas(estado, sitio).map((r) => ({ tipo: 'confirmar' as const, zona: 'recibo' as const, ubicacion: ubicacionDe('recibo'), sku: r.sku, descripcion: estado.articulos[r.sku]?.descripcion ?? r.sku, revision: r.evento.hash, instruccion: `Confirma la caducidad pendiente (folio ${r.folio}): quien la registró.` }))
}

function porContar(estado: EstadoAlmacen, sitio: string, hoy: string, n: number): Borrador[] {
  return eligeConteoCiclico(estado, sitio, hoy, n).map((u) => ({ tipo: 'contar' as const, zona: u.zona, ubicacion: u.ubicacion, razones: u.razones, instruccion: `Cuenta a ciegas ${u.ubicacion}: ${u.razones.join('; ')}.` }))
}

/** Orden de recorrido: zona, y en el almacen, rack-nivel-posicion; dentro de la ubicacion, por prioridad. */
function recorrido(a: Borrador, b: Borrador): number {
  const ua = a.origen && (a.tipo === 'resurtir') ? a.origen : a.ubicacion
  const ub = b.origen && (b.tipo === 'resurtir') ? b.origen : b.ubicacion
  const za = a.tipo === 'resurtir' ? 1 : ORDEN_ZONA[a.zona]
  const zb = b.tipo === 'resurtir' ? 1 : ORDEN_ZONA[b.zona]
  return za - zb || ua.localeCompare(ub) || PRIORIDAD.indexOf(a.tipo) - PRIORIDAD.indexOf(b.tipo) || (a.lote?.caducidad ?? '').localeCompare(b.lote?.caducidad ?? '') || (a.sku ?? '').localeCompare(b.sku ?? '')
}

export interface OpcionesRonda { readonly ahora: string; readonly horasRecibo?: number; readonly ciclicas?: number }

/** Genera la ronda del dia de un sitio. Pura y determinista. */
export function generaRonda(estado: EstadoAlmacen, sitio: string, hoy: string, op: OpcionesRonda): RondaDia {
  const t = tableroSitio(estado, sitio, hoy)
  const borradores = [
    ...retiros(t), ...resurtidos(estado, sitio, t), ...promociones(estado, sitio, t),
    ...porUbicar(estado, sitio, op.ahora, op.horasRecibo ?? 4), ...porConfirmar(estado, sitio), ...porContar(estado, sitio, hoy, op.ciclicas ?? 3),
  ].sort(recorrido)
  const cab = cadenaDe(estado, sitio).at(-1)
  const tareas = borradores.map((b, i): Tarea => ({ ...b, id: `TAREA-${hashDe({ hoy, sitio, tipo: b.tipo, ubicacion: b.ubicacion, lote: b.lote ?? null, revision: b.revision ?? null }).slice(7, 17)}`, hasta: LIMITES[b.tipo], orden: i + 1 }))
  return { id: `RONDA-${sitio}-${hoy.replace(/-/g, '')}`, sitio, fecha: hoy, generada: op.ahora, cabeza: { seq: cab?.seq ?? 0, hash: cab?.hash ?? '' }, tareas }
}

export type EstadoTarea = 'pendiente' | 'hecha' | 'ya-no-aplica' | 'atrasada'

export interface TareaConEstado extends Tarea {
  readonly estado: EstadoTarea
  /** El evento que la cerro (o el que resolvio la revision). */
  readonly evidencia?: { readonly seq: number; readonly hash: string; readonly operador: string }
  readonly motivo?: string
}

const hayEn = (estado: EstadoAlmacen, sitio: string, l: ClaveLote, zonas: readonly Zona[]) =>
  estado.existencias.some((e) => e.sitio === sitio && e.cantidad > 0 && idLote(loteDe(e)) === idLote(l) && zonas.includes(zonaDe(e)))

function yaNoAplica(estado: EstadoAlmacen, sitio: string, t: Tarea, cadena: readonly Evento[]): string | undefined {
  if (t.tipo === 'retirar' && t.lote && !hayEn(estado, sitio, t.lote, ['piso'])) return 'el lote ya no está en piso (se vendió o se movió)'
  if (t.tipo === 'resurtir' && t.lote && !hayEn(estado, sitio, t.lote, ['almacen', 'recibo'])) return 'ya no quedan cajas de ese lote por bajar'
  if (t.tipo === 'ubicar' && t.lote && !hayEn(estado, sitio, t.lote, ['recibo'])) return 'ya no está en recibo'
  if (t.tipo === 'promover' && t.lote && !hayEn(estado, sitio, t.lote, ['piso', 'almacen', 'recibo'])) return 'ya no hay de ese lote'
  if (t.tipo === 'confirmar' && cadena.some((e) => e.tipo === 'RECHAZADO' && e.datos['revision'] === t.revision && e.datos['descartada'])) return 'la revisión se descartó'
  return undefined
}

function evidenciaDe(estado: EstadoAlmacen, t: Tarea, ronda: RondaDia, cadena: readonly Evento[]): Evento | undefined {
  if (t.tipo === 'confirmar') return cadena.find((e) => (e.tipo === 'RECIBIDO' || e.tipo === 'RECHAZADO') && e.datos['revision'] === t.revision && !e.datos['descartada'])
  if (t.tipo === 'contar') return undefined
  // Un cierre cuya accion se DESHIZO (CORRECCION con `deshace`) ya no cuenta: la tarea se reabre.
  const deshechos = new Set(cadena.filter((e) => e.tipo === 'CORRECCION' && e.datos['deshace'] === true).map((e) => String(e.datos['corrige'])))
  return [...cadena].reverse().find((e) => e.tipo === 'TAREA_CERRADA' && e.datos['tarea'] === t.id && e.datos['ronda'] === ronda.id && !deshechos.has(String(e.datos['accion'] ?? '')))
}

/** ¿La ubicacion ya se conto en un conteo ciclico de hoy (ronda 1 cerrada con lecturas ahi)? */
function contada(estado: EstadoAlmacen, ronda: RondaDia, t: Tarea): { folio: string; operador: string } | undefined {
  const c = (estado.conteos ?? []).find((x) => x.sitio === ronda.sitio && x.abierto.slice(0, 10) >= ronda.fecha && x.ubicaciones?.includes(t.ubicacion) && x.estado !== 'contando' && x.estado !== 'cancelado'
    && x.lecturas.some((l) => l.ronda === 1 && ubicacionDe(l.zona, l.posicion) === t.ubicacion))
  const l = c?.lecturas.find((y) => ubicacionDe(y.zona, y.posicion) === t.ubicacion)
  return c && l ? { folio: c.folio, operador: l.operador } : undefined
}

/** El estado de cada tarea, calculado de la cadena y del inventario (`hora` local `HH:MM`). */
export function estadoDeTareas(estado: EstadoAlmacen, ronda: RondaDia, hora: string): TareaConEstado[] {
  const cadena = cadenaDe(estado, ronda.sitio)
  return ronda.tareas.map((t) => {
    const ev = evidenciaDe(estado, t, ronda, cadena)
    if (ev) return { ...t, estado: 'hecha' as const, evidencia: { seq: ev.seq, hash: ev.hash, operador: ev.operador } }
    const c = t.tipo === 'contar' ? contada(estado, ronda, t) : undefined
    if (c) return { ...t, estado: 'hecha' as const, motivo: `contada en el conteo ${c.folio}`, evidencia: { seq: 0, hash: c.folio, operador: c.operador } }
    const motivo = yaNoAplica(estado, ronda.sitio, t, cadena)
    if (motivo) return { ...t, estado: 'ya-no-aplica' as const, motivo }
    return { ...t, estado: hora > t.hasta ? 'atrasada' as const : 'pendiente' as const }
  })
}

/** La ronda vigente de un sitio para hoy, si ya se genero. */
export const rondaDe = (estado: EstadoAlmacen, sitio: string, hoy: string): RondaDia | undefined => (estado.rondas ?? []).find((r) => r.sitio === sitio && r.fecha === hoy)

/** Guarda la ronda de hoy si no existe (una por sitio y dia). */
export function aseguraRonda(estado: EstadoAlmacen, sitio: string, hoy: string, op: OpcionesRonda): { estado: EstadoAlmacen; ronda: RondaDia; nueva: boolean } {
  const previa = rondaDe(estado, sitio, hoy)
  if (previa) return { estado, ronda: previa, nueva: false }
  const ronda = generaRonda(estado, sitio, hoy, op)
  // Se guardan las de los ultimos 31 dias: una ronda vieja ya no dice nada que no diga la cadena.
  const desde = sumaDiasIso(hoy, -31)
  return { estado: { ...estado, version: estado.version + 1, rondas: [...(estado.rondas ?? []).filter((r) => r.fecha >= desde), ronda] }, ronda, nueva: true }
}

/** Avance por zona: total, hechas, que ya no aplican y atrasadas. */
export function avanceDeRonda(tareas: readonly TareaConEstado[]): { zona: Zona; total: number; hechas: number; yaNoAplica: number; atrasadas: number; porcentaje: number }[] {
  const zonas = [...new Set(tareas.map((t) => t.zona))].sort((a, b) => ORDEN_ZONA[a] - ORDEN_ZONA[b])
  return zonas.map((zona) => {
    const ts = tareas.filter((t) => t.zona === zona)
    const hechas = ts.filter((t) => t.estado === 'hecha').length
    const yaNoAplica = ts.filter((t) => t.estado === 'ya-no-aplica').length
    const total = ts.length
    return { zona, total, hechas, yaNoAplica, atrasadas: ts.filter((t) => t.estado === 'atrasada').length, porcentaje: total ? Math.round(((hechas + yaNoAplica) / total) * 100) : 100 }
  })
}
