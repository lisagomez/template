/**
 * El DIA en una pantalla para el supervisor, y los AVISOS que le llegan dentro de la app:
 * el avance de la ronda por zona, lo atrasado, lo pendiente por confirmar con su antiguedad, los
 * lotes que ENTRARON HOY a rojo (o vencieron hoy), los conteos por conciliar, los hallazgos de
 * piso y las recomendaciones del agente sin decidir. Cada renglon dice donde se resuelve.
 *
 * Esta vista SI lleva cantidades: es del supervisor. El almacenista no la recibe.
 */
import { diasParaCaducar } from './fefo.js'
import { sumaDiasIso } from './fechas-impresas.js'
import type { EstadoAlmacen } from './modelo.js'
import { hallazgos } from './pieza-suelta.js'
import { antiguedad, revisionesAbiertas } from './revisiones.js'
import { recomendaciones } from './riesgo.js'
import { avanceDeRonda, estadoDeTareas, type RondaDia, type TareaConEstado } from './rondas.js'
import { categoriaPorId } from './semaforo.js'
import { ubicacionDe, zonaDe } from './ubicaciones.js'

export interface Aviso {
  readonly nivel: 'alto' | 'medio'
  readonly texto: string
  /** Donde se resuelve: ruta de la app. */
  readonly enlace: string
}

export interface DiaDelSitio {
  readonly sitio: string
  readonly fecha: string
  readonly ronda?: { readonly id: string; readonly avance: ReturnType<typeof avanceDeRonda>; readonly tareas: readonly TareaConEstado[] }
  readonly pendientes: readonly { readonly folio: string; readonly sku: string; readonly descripcion: string; readonly cajas: number; readonly antiguedad: string; readonly horas: number }[]
  readonly rojosHoy: readonly { readonly sku: string; readonly descripcion: string; readonly lote: string; readonly caducidad: string; readonly ubicacion: string; readonly cajas: number; readonly que: 'entró a rojo' | 'venció' }[]
  readonly conteos: readonly { readonly folio: string; readonly estado: string; readonly fuera: number; readonly ubicaciones: readonly string[] }[]
  readonly hallazgos: readonly { readonly seq: number; readonly fecha: string; readonly sku: string; readonly ubicacion: string; readonly leido: string; readonly foto: string }[]
  readonly recomendaciones: readonly { readonly lote: string; readonly texto: string; readonly fecha: string }[]
  readonly avisos: readonly Aviso[]
}

/** Lo que cruzo HOY el umbral de rojo (ayer no estaba en rojo) o vencio hoy. */
function rojosDeHoy(estado: EstadoAlmacen, sitio: string, hoy: string): DiaDelSitio['rojosHoy'] {
  return estado.existencias.filter((e) => e.sitio === sitio && e.cantidad > 0 && zonaDe(e) !== 'merma').flatMap((e) => {
    const cat = categoriaPorId(estado.configuracion.categorias, estado.articulos[e.sku]?.categoria)
    const dias = diasParaCaducar(e.caducidad, hoy)
    const que = dias === cat.retiroDias ? 'entró a rojo' as const : dias === -1 ? 'venció' as const : undefined
    return que ? [{ sku: e.sku, descripcion: estado.articulos[e.sku]?.descripcion ?? e.sku, lote: e.lote, caducidad: e.caducidad, ubicacion: ubicacionDe(zonaDe(e), e.posicion), cajas: e.cantidad, que }] : []
  })
}

function avisosDe(d: Omit<DiaDelSitio, 'avisos'>, horasPendiente: number): Aviso[] {
  const a: Aviso[] = []
  for (const t of d.ronda?.tareas.filter((x) => x.estado === 'atrasada') ?? []) a.push({ nivel: 'alto', texto: `Atrasada (${t.hasta}): ${t.instruccion}`, enlace: '/etiquetas/dia' })
  for (const p of d.pendientes.filter((x) => x.horas >= horasPendiente)) a.push({ nivel: 'medio', texto: `Caducidad por confirmar ${p.antiguedad}: ${p.descripcion} (folio ${p.folio})`, enlace: '/etiquetas/recibir' })
  for (const r of d.rojosHoy) a.push({ nivel: r.que === 'venció' ? 'alto' : 'medio', texto: `${r.que === 'venció' ? 'Venció hoy' : 'Entró hoy a rojo'}: ${r.descripcion} lote ${r.lote} en ${r.ubicacion}`, enlace: '/etiquetas/caducidades' })
  for (const h of d.hallazgos) a.push({ nivel: 'medio', texto: `Hallazgo en ${h.ubicacion}: ${h.sku} (${h.leido})`, enlace: '/etiquetas/dia' })
  for (const c of d.conteos.filter((x) => x.estado === 'por-aplicar')) a.push({ nivel: 'medio', texto: `Conteo ${c.folio} listo para conciliar y autorizar${c.fuera ? ` (${c.fuera} fuera de tolerancia)` : ''}`, enlace: '/etiquetas/conteo' })
  return a
}

/** El dia de un sitio. `hora` local `HH:MM`; `ahora` ISO para la antiguedad. */
export function diaDelSitio(estado: EstadoAlmacen, sitio: string, hoy: string, hora: string, ahora: string, ronda?: RondaDia, concilia?: (folio: string) => number): DiaDelSitio {
  const tareas = ronda ? estadoDeTareas(estado, ronda, hora) : undefined
  const pendientes = revisionesAbiertas(estado, sitio).map((r) => ({ folio: r.folio, sku: r.sku, descripcion: estado.articulos[r.sku]?.descripcion ?? r.sku, cajas: r.cajas, antiguedad: antiguedad(r.desde, ahora), horas: (Date.parse(ahora) - Date.parse(r.desde)) / 3_600_000 }))
  const conteos = (estado.conteos ?? []).filter((c) => c.sitio === sitio && ['contando', 'reconteo', 'por-aplicar'].includes(c.estado))
    .map((c) => ({ folio: c.folio, estado: c.estado, fuera: concilia ? concilia(c.folio) : 0, ubicaciones: c.ubicaciones ?? c.zonas.map((z) => ubicacionDe(z)) }))
  const hs = hallazgos(estado, sitio, sumaDiasIso(hoy, -7)).map((e) => {
    const leido = e.datos['leido'] as { fecha?: string; lote?: string } | undefined
    const fotos = e.datos['fotos'] as { completa?: string } | undefined
    return { seq: e.seq, fecha: e.fecha, sku: String(e.datos['sku'] ?? ''), ubicacion: String(e.datos['ubicacion'] ?? ''), leido: [leido?.fecha ? `leído ${leido.fecha}` : 'sin fecha legible', leido?.lote ? `lote ${leido.lote}` : ''].filter(Boolean).join(', '), foto: fotos?.completa ?? '' }
  })
  const recs = recomendaciones(estado, sitio).filter((r) => r.estado === 'pendiente').map((r) => ({ lote: r.evento.lote.lote, texto: String((r.evento.datos['recomendacion'] as { texto?: string } | undefined)?.texto ?? ''), fecha: r.evento.fecha }))
  const base = { sitio, fecha: hoy, ...(ronda && tareas ? { ronda: { id: ronda.id, avance: avanceDeRonda(tareas), tareas } } : {}), pendientes, rojosHoy: rojosDeHoy(estado, sitio, hoy), conteos, hallazgos: hs, recomendaciones: recs }
  return { ...base, avisos: avisosDe(base, 4) }
}
